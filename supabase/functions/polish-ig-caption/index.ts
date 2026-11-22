// Supabase Edge Function: polish-ig-caption
// Optional $0-tier AI caption polish using Gemini Flash (set GEMINI_API_KEY in Supabase secrets).
// Strictly privacy-safe: accepts ONLY trip destination, dates, routes & memory stories (zero spend data).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'AI caption key not configured' }),
        { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const {
      tripTitle,
      destinationCity,
      destinationCountry,
      flagEmoji,
      startDate,
      endDate,
      tone = 'aesthetic',
      includeHashtags = true,
      includeWatermarkTag = true,
      memories = [],
      routes = [],
      totalMiles = 0,
    } = body ?? {};

    const toneGuide: Record<string, string> = {
      aesthetic: 'short, poetic, lowercase-friendly, warm and aesthetic (2-4 concise lines)',
      storyteller: 'warm, heartfelt, vivid travel journal storytelling (3-5 lines)',
      fun: 'playful, upbeat, witty, joyful vacation energy (2-4 punchy lines)',
      stats: 'proud travel recap highlighting flight routes, miles flown, and highlights cleanly',
    };

    const prompt = [
      `Write ONE ready-to-post Instagram travel caption in a ${toneGuide[tone] ?? toneGuide.aesthetic} style.`,
      `Trip: ${tripTitle} (${destinationCity}, ${destinationCountry} ${flagEmoji || ''}), ${startDate} to ${endDate}.`,
      routes.length ? `Flight routes: ${routes.join(', ')} (${totalMiles} miles total).` : '',
      memories.length
        ? `Curated memories:\n${memories
            .map(
              (m: { title?: string; placeName?: string; note?: string; moodSticker?: string }) =>
                `- ${m.title || ''} (${m.placeName || ''}): ${m.note || ''} [${m.moodSticker || ''}]`
            )
            .join('\n')}`
        : '',
      includeHashtags
        ? `End with 5-7 natural travel hashtags${includeWatermarkTag ? ' including #wanderledger' : ''}.`
        : 'Do NOT include any hashtags.',
      'Return ONLY the final Instagram caption text—no quotes around the whole message, no markdown fences, no commentary.',
    ]
      .filter(Boolean)
      .join('\n');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 280,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Upstream AI request failed' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const data = await geminiRes.json();
    const caption = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!caption) {
      return new Response(
        JSON.stringify({ error: 'Empty AI response' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ caption }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
