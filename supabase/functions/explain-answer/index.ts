import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { questionTitle, options, studentAnswerId, correctAnswerId } = await req.json();
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    const correct = options?.find((o: any) => o.id === correctAnswerId);
    const chosen = options?.find((o: any) => o.id === studentAnswerId);
    const isCorrect = studentAnswerId === correctAnswerId;

    const prompt = `You are a LET (Licensure Examination for Teachers) review tutor. Explain this question to a student in 3-5 short sentences. Be warm, pedagogical, reference the underlying concept.

Question: ${questionTitle}
Choices:
${options?.map((o: any) => `${o.id}. ${o.text}`).join('\n')}
Correct answer: ${correct?.id}. ${correct?.text}
Student answered: ${chosen ? `${chosen.id}. ${chosen.text}` : 'No answer'}
Student was ${isCorrect ? 'correct' : 'incorrect'}.

${isCorrect ? 'Reinforce why this is right and add one deeper insight.' : 'Gently explain the misconception, then teach the correct reasoning.'}`;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded, try again shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (res.status === 402) return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI gateway ${res.status}`);
    }
    const data = await res.json();
    const explanation = data.choices?.[0]?.message?.content ?? 'No explanation generated.';

    return new Response(JSON.stringify({ success: true, explanation }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('explain-answer error', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
