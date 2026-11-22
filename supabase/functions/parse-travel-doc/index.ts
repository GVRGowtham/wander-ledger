// Supabase Edge Function: parse-travel-doc
// Optional Phase-2 AI cleanup for messy, multi-column, or foreign-language travel receipts,
// hotel folios, and flight booking confirmations using Gemini Flash JSON mode ($0 free tier).
//
// Deploy:
//   supabase secrets set GEMINI_API_KEY=...
//   supabase functions deploy parse-travel-doc

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: 'AI document parser not configured on server' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const rawText = String(body.rawText ?? '').slice(0, 6000).trim();
    const defaultCurrency = String(body.defaultCurrency ?? 'USD').slice(0, 3).toUpperCase();
    const preferredKind = body.preferredKind ? String(body.preferredKind) : '';

    if (rawText.length < 8) {
      return new Response(JSON.stringify({ error: 'Empty OCR text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = [
      'You are an accurate travel document parser. Extract structured JSON from the OCR text below.',
      preferredKind
        ? `The user indicated this document is a "${preferredKind}".`
        : 'Determine whether kind is "flight", "transport" (train/bus/ferry/car rental), "hotel", or "receipt".',
      'Return ONLY valid JSON matching ONE of these schemas:',
      '- For flight: {"kind":"flight","airlineCode":"2-char","flightNumber":"e.g. LX 38","originIata":"3-char","destIata":"3-char","flightDate":"YYYY-MM-DD","pnr":"","seat":"","cabinClass":"Economy","passengerName":"Traveler","ticketAmount":0,"ticketCurrency":"USD"}',
      '- For transport: {"kind":"transport","mode":"train|bus|ferry|rental_car","operatorName":"","origin":"","destination":"","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","referenceCode":"","seatOrVehicle":"","totalAmount":0,"currency":"USD"}',
      '- For hotel: {"kind":"hotel","hotelName":"","confirmationCode":"","checkIn":"YYYY-MM-DD","checkOut":"YYYY-MM-DD","nights":1,"totalAmount":0,"currency":"USD","address":"","cityHint":""}',
      '- For receipt: {"kind":"receipt","merchant":"","amount":0,"currency":"USD","date":"YYYY-MM-DD","category":"dining|lodging|transit|flights|fuel|activities|shopping|other"}',
      `Use defaultCurrency "${defaultCurrency}" only if no currency appears in the text.`,
      'Use grand total / total paid (tax inclusive) for amounts.',
      'OCR TEXT:',
      rawText,
    ].join('\n');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
        geminiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 360,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      return new Response(JSON.stringify({ error: 'Upstream AI request failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiJson = await geminiRes.json();
    const textOut: string =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    const parsed = JSON.parse(textOut);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
