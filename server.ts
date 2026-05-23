import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

async function callAI(body: any) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured');
  const res = await fetch(AI_GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: DEFAULT_MODEL, ...body }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`AI gateway ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function normalizeAnswer(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string, b: string) {
  const aTokens = new Set(normalizeAnswer(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeAnswer(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function deterministicGrade({ studentAnswer, expectedAnswer = '', acceptedAnswers = [] }: any) {
  const normalizedStudent = normalizeAnswer(studentAnswer);
  const candidates = [expectedAnswer, ...acceptedAnswers].filter(Boolean);
  const bestSimilarity = candidates.reduce((best, answer) => Math.max(best, tokenSimilarity(normalizedStudent, answer)), 0);
  const exact = candidates.some((answer) => normalizeAnswer(answer) === normalizedStudent);
  const score = exact ? 100 : bestSimilarity >= 0.85 ? 90 : bestSimilarity >= 0.65 ? 75 : bestSimilarity >= 0.45 ? 50 : 0;
  return {
    score,
    isCorrect: score >= 70,
    feedback: score >= 70
      ? 'Accepted. Minor wording or spelling differences are okay when the meaning is correct.'
      : 'Review the reading and try to include the key idea more clearly.',
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || Number(process.argv[process.argv.indexOf('--port') + 1]) || 8080;

  app.use(express.json({ limit: '2mb' }));

  // AI question drafting (structured output via tool calling)
  app.post('/api/draft-questions', async (req: any, res: any) => {
    try {
      const { topic, difficulty = 'Average', count = 5 } = req.body || {};
      if (!topic) return res.status(400).json({ success: false, error: 'topic required' });

      const data = await callAI({
        messages: [
          { role: 'system', content: 'You are an expert item writer for the Philippine Licensure Examination for Teachers (LET). Generate high-quality, board-exam-grade multiple choice questions.' },
          { role: 'user', content: `Generate ${count} ${difficulty} difficulty LET questions about: ${topic}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_questions',
            description: 'Return generated LET questions',
            parameters: {
              type: 'object',
              properties: {
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      stem: { type: 'string' },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                            text: { type: 'string' },
                          },
                          required: ['id', 'text'],
                          additionalProperties: false,
                        },
                      },
                      correctOptionId: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                      explanation: { type: 'string' },
                    },
                    required: ['stem', 'options', 'correctOptionId', 'explanation'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['questions'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_questions' } },
      });

      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall ? JSON.parse(toolCall.function.arguments) : { questions: [] };
      res.json({ success: true, questions: args.questions });
    } catch (error: any) {
      console.error('draft-questions error:', error);
      const status = error.status === 429 || error.status === 402 ? error.status : 500;
      const msg = error.status === 429 ? 'Rate limit exceeded, try again shortly.'
        : error.status === 402 ? 'AI credits exhausted.'
        : error.message;
      res.status(status).json({ success: false, error: msg });
    }
  });

  // AI explanation tutor
  app.post('/api/explain-answer', async (req: any, res: any) => {
    try {
      const { questionTitle, options = [], studentAnswerId, correctAnswerId } = req.body || {};
      const studentOpt = options.find((o: any) => o.id === studentAnswerId);
      const correctOpt = options.find((o: any) => o.id === correctAnswerId);
      const isCorrect = studentAnswerId === correctAnswerId;

      const prompt = `You are an encouraging LET (Licensure Examination for Teachers) tutor.
Question: "${questionTitle}"
Options:
${options.map((o: any) => `${o.id}: ${o.text}`).join('\n')}
Correct answer: ${correctAnswerId} (${correctOpt?.text || ''})
Student answered: ${studentAnswerId ?? 'nothing'} (${studentOpt?.text || ''})

${isCorrect
  ? 'Reinforce why the correct answer is right and add one deeper teaching insight.'
  : 'Gently explain the misconception in the student\'s answer, then teach why the correct answer is right.'}
Keep the explanation under 4 short sentences. Pedagogical, warm, no markdown.`;

      const data = await callAI({
        messages: [{ role: 'user', content: prompt }],
      });
      const explanation = data.choices?.[0]?.message?.content ?? 'No explanation generated.';
      res.json({ success: true, explanation });
    } catch (error: any) {
      console.error('explain-answer error:', error);
      const status = error.status === 429 || error.status === 402 ? error.status : 500;
      const msg = error.status === 429 ? 'Rate limit exceeded, try again shortly.'
        : error.status === 402 ? 'AI credits exhausted.'
        : error.message;
      res.status(status).json({ success: false, error: msg });
    }
  });

  app.post('/api/grade-answer', async (req: any, res: any) => {
    const { question, studentAnswer, expectedAnswer, acceptedAnswers = [], textbookContext = '', strict = false } = req.body || {};
    if (!question || studentAnswer == null) return res.status(400).json({ success: false, error: 'question and studentAnswer required' });

    try {
      const data = await callAI({
        messages: [
          {
            role: 'system',
            content: 'You grade LET review answers. Be fair with spelling and grammar. Award credit when meaning matches the expected idea. Do not hallucinate beyond the supplied textbook context.',
          },
          {
            role: 'user',
            content: `Question: ${question.stem || question}\nType: ${question.type || 'short_answer'}\nExpected answer: ${expectedAnswer || question.expectedAnswer || ''}\nAccepted answers: ${JSON.stringify(acceptedAnswers || question.acceptedAnswers || [])}\nStudent answer: ${studentAnswer}\nTextbook context: ${String(textbookContext).slice(0, 2500)}\nStrict final exam mode: ${strict ? 'yes' : 'no'}\nReturn a fair score from 0-100 and brief feedback.`,
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_grade',
            description: 'Return answer grade',
            parameters: {
              type: 'object',
              properties: {
                score: { type: 'number' },
                isCorrect: { type: 'boolean' },
                feedback: { type: 'string' },
              },
              required: ['score', 'isCorrect', 'feedback'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_grade' } },
      });
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const grade = toolCall ? JSON.parse(toolCall.function.arguments) : deterministicGrade({ studentAnswer, expectedAnswer, acceptedAnswers });
      res.json({ success: true, ...grade });
    } catch (error: any) {
      console.error('grade-answer fallback:', error.message);
      res.json({ success: true, ...deterministicGrade({ studentAnswer, expectedAnswer: expectedAnswer || question.expectedAnswer, acceptedAnswers: acceptedAnswers || question.acceptedAnswers }) });
    }
  });

  app.post('/api/generate-module-exam', async (req: any, res: any) => {
    const { moduleTitle, textbookContext = '', count = 4 } = req.body || {};
    if (!moduleTitle && !textbookContext) return res.status(400).json({ success: false, error: 'moduleTitle or textbookContext required' });

    try {
      const data = await callAI({
        messages: [
          { role: 'system', content: 'Create fresh LET-style module exam questions grounded only in the provided textbook context. Mix multiple choice, true/false, enumeration, and short answer when appropriate.' },
          { role: 'user', content: `Module: ${moduleTitle}\nTextbook context:\n${String(textbookContext).slice(0, 5000)}\nGenerate ${count} fresh questions. Do not reuse exact prior wording.` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_exam',
            description: 'Return module exam questions',
            parameters: {
              type: 'object',
              properties: {
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      stem: { type: 'string' },
                      type: { type: 'string', enum: ['multiple_choice', 'true_false', 'enumeration', 'short_answer', 'essay'] },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: { id: { type: 'string' }, text: { type: 'string' } },
                          required: ['id', 'text'],
                          additionalProperties: false,
                        },
                      },
                      correctOptionId: { type: 'string' },
                      acceptedAnswers: { type: 'array', items: { type: 'string' } },
                      expectedAnswer: { type: 'string' },
                      explanation: { type: 'string' },
                    },
                    required: ['id', 'stem', 'type', 'options', 'correctOptionId', 'explanation'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['questions'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_exam' } },
      });
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall ? JSON.parse(toolCall.function.arguments) : { questions: [] };
      res.json({ success: true, questions: args.questions });
    } catch (error: any) {
      console.error('generate-module-exam error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Adaptive learning: compute weak skills & suggested next topics from a learner profile
  app.post('/api/adaptive-recommend', async (req: any, res: any) => {
    try {
      const { mastery = {}, recentAttempts = [], goals = '' } = req.body || {};
      const data = await callAI({
        messages: [
          { role: 'system', content: 'You are an adaptive learning engine for LET review. Given a learner mastery map and recent attempt history, recommend the next 3-5 topics to study and why.' },
          { role: 'user', content: `Mastery map: ${JSON.stringify(mastery)}\nRecent attempts: ${JSON.stringify(recentAttempts).slice(0, 4000)}\nGoals: ${goals}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_plan',
            description: 'Return adaptive study plan',
            parameters: {
              type: 'object',
              properties: {
                weaknesses: { type: 'array', items: { type: 'string' } },
                strengths: { type: 'array', items: { type: 'string' } },
                recommendations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      topic: { type: 'string' },
                      reason: { type: 'string' },
                      priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                    },
                    required: ['topic', 'reason', 'priority'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['weaknesses', 'strengths', 'recommendations'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_plan' } },
      });
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;
      res.json({ success: true, plan: args });
    } catch (error: any) {
      console.error('adaptive-recommend error:', error);
      const status = error.status === 429 || error.status === 402 ? error.status : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
