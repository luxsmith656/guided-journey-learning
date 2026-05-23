import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { topic, difficulty = 'Average', count = 5 } = await req.json();
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    const systemPrompt = `You are an expert item writer for the Philippine Licensure Examination for Teachers (LET). Generate high-quality, board-exam-grade multiple choice questions with 4 options (A-D), one correct answer, and a concise pedagogical explanation. Match the requested difficulty.`;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate ${count} ${difficulty} difficulty questions on: ${topic}` },
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
      }),
    });

    if (!res.ok) {
      if (res.status === 429) return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded, try again shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (res.status === 402) return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const t = await res.text();
      throw new Error(`AI gateway ${res.status}: ${t}`);
    }
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : { questions: [] };

    return new Response(JSON.stringify({ success: true, questions: args.questions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('draft-questions error', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
