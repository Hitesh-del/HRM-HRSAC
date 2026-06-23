import { corsHeaders } from '../_shared/cors.ts';

const DAILY_BASE = 'https://api.daily.co/v1';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('DAILY_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'DAILY_API_KEY secret is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { roomId } = await req.json() as { roomId: string };
    if (!roomId) {
      return new Response(
        JSON.stringify({ error: 'roomId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Sanitise: Daily.co room names must be alphanumeric + hyphens, max 126 chars
    const sanitisedName = roomId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 126);

    const authHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // ── Try to get existing room ─────────────────────────────────────────────
    const getRes = await fetch(`${DAILY_BASE}/rooms/${sanitisedName}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (getRes.ok) {
      const room = await getRes.json() as { url: string; name: string };
      console.log('[create-daily-room] Room already exists:', room.name);
      return new Response(
        JSON.stringify({ url: room.url, name: room.name }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Room not found — create it ───────────────────────────────────────────
    if (getRes.status === 404) {
      const createRes = await fetch(`${DAILY_BASE}/rooms`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: sanitisedName,
          properties: {
            enable_prejoin_ui:  false,   // skip pre-join lobby
            enable_knocking:    false,   // no knocking
            start_video_off:    true,    // camera off by default
            start_audio_off:    false,   // mic on by default
            enable_chat:        true,
            enable_screenshare: true,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24 hours
          },
        }),
      });

      if (!createRes.ok) {
        const errBody = await createRes.text();
        console.error('[create-daily-room] Create failed:', errBody);
        return new Response(
          JSON.stringify({ error: `Daily.co room creation failed: ${errBody}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const room = await createRes.json() as { url: string; name: string };
      console.log('[create-daily-room] Room created:', room.name, '→', room.url);
      return new Response(
        JSON.stringify({ url: room.url, name: room.name }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Unexpected error from Daily.co ───────────────────────────────────────
    const errBody = await getRes.text();
    return new Response(
      JSON.stringify({ error: `Daily.co API error ${getRes.status}: ${errBody}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-daily-room] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
