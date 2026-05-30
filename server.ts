import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { createServer as createViteServer } from 'vite';
import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';

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

function localRewriteText(text = '', mode = 'proofread') {
  const replacements: Record<string, string> = {
    '\\bi\\b': 'I',
    '\\bteh\\b': 'the',
    '\\brecieve\\b': 'receive',
    '\\bseperate\\b': 'separate',
    '\\bdefinately\\b': 'definitely',
    '\\bwich\\b': 'which',
    '\\bwritting\\b': 'writing',
    '\\bgrammer\\b': 'grammar',
    '\\bassesment\\b': 'assessment',
    '\\bintructor\\b': 'instructor',
    '\\bstudnet\\b': 'student',
    '\\bmodulee\\b': 'module',
  };
  let output = String(text)
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])([^\s\n])/g, '$1 $2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  Object.entries(replacements).forEach(([pattern, replacement]) => {
    output = output.replace(new RegExp(pattern, 'gi'), replacement);
  });

  output = output.replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);

  if (mode === 'paraphrase') {
    const sentences = output.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 1) {
      output = sentences.map((sentence, index) => {
        if (index === 0) return sentence;
        if (/^(this|these|it|they)\b/i.test(sentence)) return sentence;
        return sentence;
      }).join(' ');
    }
  }

  return output || text;
}

type SourceChunk = {
  id: string;
  sourcePage?: number;
  sourceSlide?: number;
  sourcePart?: string;
  text: string;
  sourceTextSnippet: string;
};

type ServerExamQuestion = {
  id: string;
  stem: string;
  options: Array<{ id: string; text: string; originalId?: string }>;
  correctOptionId: string;
  originalCorrectOptionId?: string;
  categoryId?: string;
  topicId?: string;
  skillIds?: string[];
  competencyId?: string;
  difficulty?: string;
  explanation?: string;
  rationalization?: string;
  wrongChoiceExplanations?: Record<string, string>;
  misconceptionTags?: string[];
  relatedModuleId?: string;
  moduleId?: string;
  specialization?: string;
  familyId?: string;
  optionOrder?: Array<{ shownId: string; originalId: string }>;
  exposureRank?: number;
};

type ServerExamBlueprint = {
  id?: string;
  title?: string;
  questionCount?: number;
  timeLimitMinutes?: number;
  categoryDistribution?: Record<string, number>;
  sectionDistribution?: Record<string, number>;
  difficultyMix?: Record<string, number>;
  passingScore?: number;
};

type ServerExposurePolicy = {
  seenQuestionIds?: string[];
  seenFamilyIds?: string[];
  recentQuestionIds?: string[];
  recentFamilyIds?: string[];
};

function decodeBase64File(fileData = '') {
  const clean = String(fileData).replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(clean, 'base64');
}

function cleanExtractedText(text = '') {
  return String(text)
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripXml(value = '') {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text: string, sourceDocumentId: string, preferredSourcePart = 'document') {
  const clean = cleanExtractedText(text);
  const paragraphs = clean.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: SourceChunk[] = [];
  let buffer = '';

  paragraphs.forEach((paragraph) => {
    if ((buffer + '\n\n' + paragraph).length > 1500 && buffer.trim()) {
      chunks.push({
        id: `${sourceDocumentId}-chunk-${chunks.length + 1}`,
        sourcePart: preferredSourcePart,
        text: buffer.trim(),
        sourceTextSnippet: buffer.trim().slice(0, 320),
      });
      buffer = paragraph;
      return;
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  });

  if (buffer.trim()) {
    chunks.push({
      id: `${sourceDocumentId}-chunk-${chunks.length + 1}`,
      sourcePart: preferredSourcePart,
      text: buffer.trim(),
      sourceTextSnippet: buffer.trim().slice(0, 320),
    });
  }

  return chunks.length ? chunks : [{
    id: `${sourceDocumentId}-chunk-1`,
    sourcePart: preferredSourcePart,
    text: clean.slice(0, 1500),
    sourceTextSnippet: clean.slice(0, 320),
  }];
}

function computeExtractionConfidence(text: string, fileName: string) {
  const clean = cleanExtractedText(text);
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  const suspiciousSymbols = (clean.match(/[�□■]/g) || []).length;
  const warnings: string[] = [];

  if (wordCount < 80) warnings.push('Very little text was extracted. The document may be scanned or image-heavy.');
  if (suspiciousSymbols > 5) warnings.push('Some extracted characters look corrupted. Review the source carefully.');
  if (/\.pdf$/i.test(fileName) && wordCount < 150) warnings.push('PDF extraction may need OCR if the source is scanned.');

  const confidence = warnings.length === 0 && wordCount > 250
    ? 'high'
    : wordCount > 80
      ? 'medium'
      : 'needs_review';
  return { confidence, reviewRequired: confidence !== 'high', warnings, wordCount };
}

async function extractPdf(buffer: Buffer, sourceDocumentId: string) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const chunks = result.pages.flatMap((page: any) => {
      const text = cleanExtractedText(page.text || '');
      if (!text) return [];
      return chunkText(text, `${sourceDocumentId}-p${page.num}`, `Page ${page.num}`).map((chunk, index) => ({
        ...chunk,
        id: `${sourceDocumentId}-page-${page.num}-chunk-${index + 1}`,
        sourcePage: page.num,
      }));
    });
    return {
      text: cleanExtractedText(result.text),
      chunks,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer, sourceDocumentId: string) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('Unable to read DOCX document.xml');
  const paragraphs = [...documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => stripXml(match[0]))
    .filter(Boolean);
  const text = cleanExtractedText(paragraphs.join('\n\n'));
  return {
    text,
    chunks: chunkText(text, sourceDocumentId, 'DOCX body'),
  };
}

async function extractPptx(buffer: Buffer, sourceDocumentId: string) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));
  const chunks: SourceChunk[] = [];
  const slideTexts: string[] = [];

  for (const slideFile of slideFiles) {
    const slideNumber = Number(slideFile.match(/slide(\d+)\.xml/)?.[1] || chunks.length + 1);
    const xml = await zip.file(slideFile)?.async('string');
    const text = cleanExtractedText(stripXml(xml || ''));
    if (!text) continue;
    slideTexts.push(`Slide ${slideNumber}\n${text}`);
    chunks.push({
      id: `${sourceDocumentId}-slide-${slideNumber}`,
      sourceSlide: slideNumber,
      sourcePart: `Slide ${slideNumber}`,
      text,
      sourceTextSnippet: text.slice(0, 320),
    });
  }

  return {
    text: cleanExtractedText(slideTexts.join('\n\n')),
    chunks,
  };
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

function serverShuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function getServerDistributionTargets(distribution: Record<string, number> | undefined, count: number) {
  const entries = Object.entries(distribution || {})
    .map(([key, value]) => [key, Math.max(0, Number(value) || 0)] as const)
    .filter(([, value]) => value > 0);
  if (!entries.length || count <= 0) return [] as Array<{ key: string; count: number }>;

  const totalWeight = entries.reduce((sum, [, value]) => sum + value, 0);
  const rows = entries.map(([key, value]) => {
    const exact = (value / totalWeight) * count;
    return { key, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let assigned = rows.reduce((sum, row) => sum + row.count, 0);
  [...rows].sort((a, b) => b.remainder - a.remainder).forEach((row) => {
    if (assigned >= count) return;
    row.count += 1;
    assigned += 1;
  });
  return rows.filter((row) => row.count > 0).map(({ key, count: target }) => ({ key, count: target }));
}

function takeServerDifficultyMix(pool: ServerExamQuestion[], targetCount: number, difficultyMix?: Record<string, number>) {
  if (!difficultyMix || Object.keys(difficultyMix).length === 0) return serverShuffle(pool).slice(0, targetCount);
  const selected: ServerExamQuestion[] = [];
  const selectedIds = new Set<string>();
  getServerDistributionTargets(difficultyMix, targetCount).forEach(({ key, count }) => {
    serverShuffle(pool.filter((question) => (
      !selectedIds.has(question.id) &&
      String(question.difficulty || 'medium').toLowerCase() === key.toLowerCase()
    ))).slice(0, count).forEach((question) => {
      selected.push(question);
      selectedIds.add(question.id);
    });
  });
  if (selected.length < targetCount) {
    serverShuffle(pool.filter((question) => !selectedIds.has(question.id))).slice(0, targetCount - selected.length).forEach((question) => {
      selected.push(question);
      selectedIds.add(question.id);
    });
  }
  return selected;
}

function getServerQuestionFamilyId(question: ServerExamQuestion) {
  return String(question.familyId || question.id || '');
}

function normalizeServerStringSet(items: any) {
  return new Set((Array.isArray(items) ? items : []).map((item) => String(item || '')).filter(Boolean));
}

function hasServerBlueprintCoverage(pool: ServerExamQuestion[], blueprint: ServerExamBlueprint, count: number, categoryId: string | null, requireFullCount: boolean) {
  if (!requireFullCount) return pool.length > 0;
  if (pool.length < count) return false;
  const categoryDistribution = blueprint.categoryDistribution || blueprint.sectionDistribution || {};
  const categoryTargets = categoryId ? [] : getServerDistributionTargets(categoryDistribution, count);
  return categoryTargets.every(({ key, count: target }) => pool.filter((question) => question.categoryId === key).length >= target);
}

function shuffleServerOptions(question: ServerExamQuestion) {
  const originalOptions = question.options || [];
  const shuffledOptions = serverShuffle(originalOptions);
  const mappedOptions = shuffledOptions.map((option, index) => ({
    id: String.fromCharCode(65 + index),
    text: option.text,
    originalId: option.originalId || option.id,
  }));
  const correctOptionId = mappedOptions.find((option) => option.originalId === question.correctOptionId)?.id || question.correctOptionId;
  const wrongChoiceExplanations = Object.fromEntries(mappedOptions
    .filter((option) => option.id !== correctOptionId)
    .map((option) => [
      option.id,
      question.wrongChoiceExplanations?.[option.originalId] || question.wrongChoiceExplanations?.[option.id] || '',
    ]));

  return {
    ...question,
    originalCorrectOptionId: question.correctOptionId,
    correctOptionId,
    options: mappedOptions,
    optionOrder: mappedOptions.map((option) => ({ shownId: option.id, originalId: option.originalId })),
    wrongChoiceExplanations,
  };
}

function selectServerExamQuestions(filteredPool: ServerExamQuestion[], blueprint: ServerExamBlueprint, categoryId: string | null, requireFullCount: boolean) {
  const count = Math.max(1, Number(blueprint.questionCount || (requireFullCount ? 100 : 20)));
  if (requireFullCount && filteredPool.length < count) {
    throw new Error(`This assessment needs ${count} approved questions, but only ${filteredPool.length} are available.`);
  }
  if (filteredPool.length === 0) throw new Error('No approved questions are available for this assessment yet.');

  const selected: ServerExamQuestion[] = [];
  const selectedIds = new Set<string>();
  const categoryDistribution = blueprint.categoryDistribution || blueprint.sectionDistribution || {};
  const categoryTargets = categoryId ? [] : getServerDistributionTargets(categoryDistribution, count);

  categoryTargets.forEach(({ key, count: target }) => {
    const categoryPool = filteredPool.filter((question) => question.categoryId === key && !selectedIds.has(question.id));
    if (requireFullCount && categoryPool.length < target) {
      throw new Error(`This assessment needs ${target} approved questions for ${key}, but only ${categoryPool.length} are available.`);
    }
    takeServerDifficultyMix(categoryPool, target, blueprint.difficultyMix).forEach((question) => {
      selected.push(question);
      selectedIds.add(question.id);
    });
  });

  if (selected.length < count) {
    takeServerDifficultyMix(filteredPool.filter((question) => !selectedIds.has(question.id)), count - selected.length, blueprint.difficultyMix)
      .forEach((question) => {
        selected.push(question);
        selectedIds.add(question.id);
      });
  }

  if (requireFullCount && selected.length < count) {
    throw new Error(`This assessment needs ${count} approved questions, but only ${selected.length} could be selected from the configured blueprint.`);
  }

  return serverShuffle(selected).slice(0, requireFullCount ? count : Math.min(count, selected.length)).map(shuffleServerOptions);
}

function pickServerExamQuestions(
  pool: ServerExamQuestion[],
  blueprint: ServerExamBlueprint,
  categoryId: string | null,
  requireFullCount: boolean,
  exposurePolicy: ServerExposurePolicy = {},
) {
  const count = Math.max(1, Number(blueprint.questionCount || (requireFullCount ? 100 : 20)));
  const filteredPool = categoryId ? pool.filter((question) => question.categoryId === categoryId) : pool;
  if (filteredPool.length === 0) throw new Error('No approved questions are available for this assessment yet.');

  const seenQuestionIds = normalizeServerStringSet(exposurePolicy.seenQuestionIds);
  const seenFamilyIds = normalizeServerStringSet(exposurePolicy.seenFamilyIds);
  const recentQuestionIds = normalizeServerStringSet(exposurePolicy.recentQuestionIds);
  const recentFamilyIds = normalizeServerStringSet(exposurePolicy.recentFamilyIds);
  const candidatePools = [
    {
      reason: 'excluded_recent_questions_and_families',
      pool: filteredPool.filter((question) => !recentQuestionIds.has(question.id) && !recentFamilyIds.has(getServerQuestionFamilyId(question))),
    },
    {
      reason: 'excluded_seen_exact_questions',
      pool: filteredPool.filter((question) => !seenQuestionIds.has(question.id)),
    },
    {
      reason: 'excluded_seen_families',
      pool: filteredPool.filter((question) => !seenFamilyIds.has(getServerQuestionFamilyId(question))),
    },
    {
      reason: 'fallback_reuse_allowed',
      pool: filteredPool,
    },
  ];

  const selectedCandidate = candidatePools.find((candidate) => (
    hasServerBlueprintCoverage(candidate.pool, blueprint, count, categoryId, requireFullCount)
  )) || candidatePools[candidatePools.length - 1];
  const selectedQuestions = selectServerExamQuestions(selectedCandidate.pool, blueprint, categoryId, requireFullCount);
  return {
    questions: selectedQuestions.map((question, index) => ({ ...question, exposureRank: index + 1 })),
    exposurePolicy: {
      selectionReason: selectedCandidate.reason,
      avoidedRecentQuestionCount: recentQuestionIds.size,
      avoidedRecentFamilyCount: recentFamilyIds.size,
      seenQuestionCount: seenQuestionIds.size,
      seenFamilyCount: seenFamilyIds.size,
      reusedBecausePoolWasSmall: selectedCandidate.reason === 'fallback_reuse_allowed',
    },
  };
}

function compileServerExamResult({ attemptId, startedAtMillis, expiresAtMillis, answers = {}, questions = [], warningLogs = [], reason = 'submitted' }: any) {
  const now = Date.now();
  const normalizedReason = now >= Number(expiresAtMillis || 0) && reason !== 'submitted' ? 'time_expired' : reason;
  const statusByReason: Record<string, string> = {
    submitted: 'submitted',
    time_expired: 'auto_submitted_time_expired',
    warnings: 'auto_submitted_warnings',
    idle: 'auto_submitted_idle',
    offline: 'auto_submitted_offline',
    refresh: 'flagged_for_review',
    forceful_interruption: 'flagged_for_review',
  };
  const answerRecords = (questions as ServerExamQuestion[]).map((question, index) => {
    const selectedOptionId = String(answers[question.id] || '');
    const isUnanswered = !selectedOptionId;
    const isCorrect = Boolean(selectedOptionId) && selectedOptionId === question.correctOptionId;
    return {
      questionId: question.id,
      questionNumber: index + 1,
      selectedOptionId,
      correctOptionId: question.correctOptionId || '',
      originalCorrectOptionId: question.originalCorrectOptionId || question.correctOptionId || '',
      isCorrect,
      isUnanswered,
      categoryId: question.categoryId || '',
      topicId: question.topicId || '',
      skillIds: question.skillIds || [],
      competencyId: question.competencyId || '',
      difficulty: question.difficulty || 'medium',
      stem: question.stem,
      options: question.options || [],
      explanation: question.explanation || '',
      rationalization: question.rationalization || question.explanation || '',
      wrongChoiceExplanations: question.wrongChoiceExplanations || {},
      misconceptionTags: question.misconceptionTags || [],
      relatedModuleId: question.relatedModuleId || question.moduleId || '',
      familyId: question.familyId || '',
      optionOrder: question.optionOrder || [],
    };
  });
  const correctCount = answerRecords.filter((answer) => answer.isCorrect).length;
  const unansweredCount = answerRecords.filter((answer) => answer.isUnanswered).length;
  const categoryBreakdown = answerRecords.reduce<Record<string, { total: number; correct: number; scorePercent: number }>>((acc, answer) => {
    const key = answer.categoryId || 'uncategorized';
    acc[key] = acc[key] || { total: 0, correct: 0, scorePercent: 0 };
    acc[key].total += 1;
    if (answer.isCorrect) acc[key].correct += 1;
    acc[key].scorePercent = Math.round((acc[key].correct / acc[key].total) * 100);
    return acc;
  }, {});
  const scorePercent = answerRecords.length ? Math.round((correctCount / answerRecords.length) * 100) : 0;
  return {
    attemptId,
    status: statusByReason[normalizedReason] || 'flagged_for_review',
    scorePercent,
    totalQuestions: answerRecords.length,
    correctCount,
    wrongCount: answerRecords.length - correctCount,
    unansweredCount,
    answeredCount: answerRecords.length - unansweredCount,
    timeUsedSeconds: startedAtMillis ? Math.max(0, Math.round((now - Number(startedAtMillis)) / 1000)) : 0,
    categoryBreakdown,
    answers: answerRecords,
    warningLogs,
    serverFinalizedAtMillis: now,
    endedReason: normalizedReason,
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || Number(process.argv[process.argv.indexOf('--port') + 1]) || 8080;

  app.use(express.json({ limit: '28mb' }));

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

  app.post('/api/extract-document', async (req: any, res: any) => {
    try {
      const { fileName = 'uploaded-document', fileType = '', fileData = '' } = req.body || {};
      if (!fileData) return res.status(400).json({ success: false, error: 'fileData required' });
      const lowerName = String(fileName).toLowerCase();
      const sourceDocumentId = `src-${Date.now()}-${String(fileName).replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}`;
      const buffer = decodeBase64File(fileData);
      const mimeOrName = `${fileType} ${lowerName}`;

      let extracted: { text: string; chunks: SourceChunk[] };
      if (mimeOrName.includes('pdf') || lowerName.endsWith('.pdf')) {
        extracted = await extractPdf(buffer, sourceDocumentId);
      } else if (lowerName.endsWith('.docx') || mimeOrName.includes('wordprocessingml')) {
        extracted = await extractDocx(buffer, sourceDocumentId);
      } else if (lowerName.endsWith('.pptx') || mimeOrName.includes('presentationml')) {
        extracted = await extractPptx(buffer, sourceDocumentId);
      } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || mimeOrName.includes('text/')) {
        const text = cleanExtractedText(buffer.toString('utf8'));
        extracted = { text, chunks: chunkText(text, sourceDocumentId, 'Text file') };
      } else {
        return res.status(400).json({ success: false, error: 'Unsupported file type. Use PDF, DOCX, PPTX, TXT, or Markdown.' });
      }

      const quality = computeExtractionConfidence(extracted.text, lowerName);
      const chunks = extracted.chunks.slice(0, 40).map((chunk, index) => ({
        ...chunk,
        id: chunk.id || `${sourceDocumentId}-chunk-${index + 1}`,
        text: cleanExtractedText(chunk.text).slice(0, 1800),
        sourceTextSnippet: cleanExtractedText(chunk.sourceTextSnippet || chunk.text).slice(0, 320),
      }));

      res.json({
        success: true,
        document: {
          sourceDocumentId,
          fileName,
          fileType,
          extractedText: cleanExtractedText(extracted.text).slice(0, 18000),
          chunks,
          confidence: quality.confidence,
          reviewRequired: quality.reviewRequired,
          warnings: quality.warnings,
          wordCount: quality.wordCount,
        },
      });
    } catch (error: any) {
      console.error('extract-document error:', error.message);
      res.status(500).json({ success: false, error: error.message || 'Unable to extract document text' });
    }
  });

  app.post('/api/course-builder', async (req: any, res: any) => {
    const { topic = '', sourceText = '', sourceDocument = null, sourceChunks = [], subject = 'LET Review', partCount = 2 } = req.body || {};
    if (!String(topic || sourceText).trim()) return res.status(400).json({ success: false, error: 'topic or sourceText required' });

    try {
      const data = await callAI({
        messages: [
          {
            role: 'system',
            content: 'You are an expert LET instructional designer. Turn instructor content into an editable learning journey. Keep all generated material grounded in the supplied topic/content.',
          },
          {
            role: 'user',
            content: `Subject: ${subject}
Topic/instruction: ${topic}
Source document metadata:
${sourceDocument ? JSON.stringify({
  sourceDocumentId: sourceDocument.sourceDocumentId,
  fileName: sourceDocument.fileName,
  confidence: sourceDocument.confidence,
  reviewRequired: sourceDocument.reviewRequired,
  warnings: sourceDocument.warnings || [],
}).slice(0, 1200) : 'No uploaded document'}

Source content with chunk/page labels:
${(Array.isArray(sourceChunks) && sourceChunks.length
  ? sourceChunks.map((chunk: any, index: number) => `[chunk ${index + 1}${chunk.sourcePage ? ` page ${chunk.sourcePage}` : ''}${chunk.sourceSlide ? ` slide ${chunk.sourceSlide}` : ''}] ${chunk.text}`).join('\n\n')
  : String(sourceText)).slice(0, 9000)}

Create a concise module with ${Math.max(2, Math.min(Number(partCount) || 2, 5))} ordered parts. Include objectives, textbook-style sections, mini quizzes, activities where useful, final exam questions, competencies, prerequisite topic suggestions, and an exam blueprint. For every part, keep sourceDocumentId, sourcePage or sourceSlide when known, sourceTextSnippet, and aiConfidence. If the extraction confidence is medium or needs_review, mark aiConfidence as needs_review where the source is unclear.`,
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_course_module',
            description: 'Return an editable learning journey module draft',
            parameters: {
              type: 'object',
              properties: {
                module: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    prerequisiteTopics: { type: 'array', items: { type: 'string' } },
                    competencies: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          label: { type: 'string' },
                          description: { type: 'string' },
                        },
                        required: ['id', 'label', 'description'],
                        additionalProperties: false,
                      },
                    },
                    examBlueprint: {
                      type: 'object',
                      properties: {
                        questionCount: { type: 'number' },
                        sectionDistribution: { type: 'object', additionalProperties: { type: 'number' } },
                        competencyDistribution: { type: 'object', additionalProperties: { type: 'number' } },
                        difficultyMix: {
                          type: 'object',
                          properties: {
                            easy: { type: 'number' },
                            medium: { type: 'number' },
                            hard: { type: 'number' },
                          },
                          required: ['easy', 'medium', 'hard'],
                          additionalProperties: false,
                        },
                      },
                      required: ['questionCount', 'sectionDistribution', 'competencyDistribution', 'difficultyMix'],
                      additionalProperties: false,
                    },
                    parts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          objective: { type: 'string' },
                          textbookSection: {
                            type: 'object',
                            properties: {
                              title: { type: 'string' },
                              body: { type: 'string' },
                              estimatedReadMinutes: { type: 'number' },
                              sourceDocumentId: { type: 'string' },
                              sourcePage: { type: 'number' },
                              sourceSlide: { type: 'number' },
                              sourceTextSnippet: { type: 'string' },
                              aiConfidence: { type: 'string', enum: ['high', 'medium', 'needs_review'] },
                            },
                            required: ['title', 'body', 'estimatedReadMinutes', 'sourceTextSnippet', 'aiConfidence'],
                            additionalProperties: false,
                          },
                          lessonBlocks: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                type: { type: 'string', enum: ['heading', 'text', 'callout'] },
                                content: { type: 'string' },
                              },
                              required: ['type', 'content'],
                              additionalProperties: false,
                            },
                          },
                          miniQuiz: { type: 'array', items: { $ref: '#/$defs/question' } },
                          activity: {
                            type: 'object',
                            properties: {
                              title: { type: 'string' },
                              prompt: { type: 'string' },
                            },
                            required: ['title', 'prompt'],
                            additionalProperties: false,
                          },
                        },
                        required: ['id', 'title', 'objective', 'textbookSection', 'lessonBlocks', 'miniQuiz'],
                        additionalProperties: false,
                      },
                    },
                    finalExam: { type: 'array', items: { $ref: '#/$defs/question' } },
                  },
                  required: ['title', 'description', 'prerequisiteTopics', 'competencies', 'examBlueprint', 'parts', 'finalExam'],
                  additionalProperties: false,
                },
              },
              required: ['module'],
              additionalProperties: false,
              $defs: {
                question: {
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
                    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                    competencyId: { type: 'string' },
                  },
                  required: ['id', 'stem', 'type', 'options', 'correctOptionId', 'explanation', 'difficulty', 'competencyId'],
                  additionalProperties: false,
                },
              },
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_course_module' } },
      });
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;
      res.json({ success: true, module: args?.module });
    } catch (error: any) {
      console.error('course-builder error:', error.message);
      res.status(500).json({ success: false, error: error.message });
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

  app.post('/api/exam/start', (req: any, res: any) => {
    try {
      const {
        blueprint = {},
        questionPool = [],
        categoryId = null,
        isFullMock = false,
        requireFullCount = false,
        assessmentMode = 'practice',
        userTrack = '',
        exposurePolicy = {},
      } = req.body || {};

      const cleanPool = (Array.isArray(questionPool) ? questionPool : [])
        .map((question: any) => ({
          ...question,
          id: String(question.id || ''),
          stem: String(question.stem || ''),
          options: Array.isArray(question.options) ? question.options : [],
          correctOptionId: String(question.correctOptionId || ''),
          skillIds: Array.isArray(question.skillIds) ? question.skillIds : [],
        }))
        .filter((question: ServerExamQuestion) => question.id && question.stem && question.correctOptionId && question.options.length >= 2)
        .filter((question: ServerExamQuestion) => {
          if (!isFullMock || !userTrack) return true;
          return !question.specialization || question.specialization === userTrack || ['gened', 'profed'].includes(question.categoryId || '');
        });

      const { questions: selectedQuestions, exposurePolicy: resolvedExposurePolicy } = pickServerExamQuestions(
        cleanPool,
        blueprint,
        categoryId,
        Boolean(isFullMock || requireFullCount),
        exposurePolicy,
      );
      const startedAtMillis = Date.now();
      const durationMinutes = Math.max(1, Number(blueprint.timeLimitMinutes || (isFullMock ? 180 : 30)));
      const expiresAtMillis = startedAtMillis + durationMinutes * 60 * 1000;
      const attemptId = `exam_${startedAtMillis}_${randomUUID().slice(0, 8)}`;

      res.json({
        success: true,
        attemptId,
        assessmentMode,
        serverNowMillis: startedAtMillis,
        startedAtMillis,
        expiresAtMillis,
        durationSeconds: durationMinutes * 60,
        questions: selectedQuestions,
        exposurePolicy: resolvedExposurePolicy,
        blueprintSnapshot: {
          id: blueprint.id || '',
          title: blueprint.title || '',
          questionCount: selectedQuestions.length,
          timeLimitMinutes: durationMinutes,
          passingScore: blueprint.passingScore ?? (isFullMock ? 75 : 70),
          categoryDistribution: blueprint.categoryDistribution || blueprint.sectionDistribution || {},
          difficultyMix: blueprint.difficultyMix || {},
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Unable to start exam attempt.' });
    }
  });

  app.post('/api/exam/finalize', (req: any, res: any) => {
    try {
      const { attemptId, questions = [] } = req.body || {};
      if (!attemptId) return res.status(400).json({ success: false, error: 'attemptId required' });
      if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ success: false, error: 'questions required' });
      res.json({ success: true, result: compileServerExamResult(req.body) });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Unable to finalize exam attempt.' });
    }
  });

  app.post('/api/rewrite-text', async (req: any, res: any) => {
    const { text = '', mode = 'proofread', instruction = '' } = req.body || {};
    if (!String(text).trim()) return res.status(400).json({ success: false, error: 'text required' });

    try {
      const data = await callAI({
        messages: [
          {
            role: 'system',
            content: 'You help instructors improve LET learning materials. Preserve facts, keep the text student-friendly, and do not add unsupported claims.',
          },
          {
            role: 'user',
            content: `Task: ${mode === 'paraphrase' ? 'Paraphrase for clarity while preserving meaning' : 'Proofread grammar, spelling, and clarity'}.\nInstructor note: ${instruction || 'No extra note'}\nText:\n${String(text).slice(0, 5000)}`,
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_rewrite',
            description: 'Return improved text',
            parameters: {
              type: 'object',
              properties: {
                text: { type: 'string' },
              },
              required: ['text'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_rewrite' } },
      });
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall ? JSON.parse(toolCall.function.arguments) : { text };
      res.json({ success: true, text: args.text || text });
    } catch (error: any) {
      console.error('rewrite-text error:', error.message);
      res.json({
        success: true,
        text: localRewriteText(text, mode),
        fallback: true,
        warning: 'AI rewrite service unavailable; local cleanup was applied.',
      });
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
