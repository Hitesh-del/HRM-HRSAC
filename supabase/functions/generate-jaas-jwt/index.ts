import { corsHeaders } from '../_shared/cors.ts';

// ─── JaaS App ID (tenant) ────────────────────────────────────────────────────
const JAAS_APP_ID = 'vpaas-magic-cookie-e56e5d9cf4614f6d9c53f9d4aa25920d';

// ─── PEM helpers ─────────────────────────────────────────────────────────────

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Strip PEM header/footer and all whitespace, then base64-decode
  const b64 = pem
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── JWT helpers (no external deps — use Web Crypto only) ────────────────────

function base64urlEncode(data: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = new Uint8Array(data);
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function signRS256(payload: unknown, privateKeyPem: string, kid: string): Promise<string> {
  // Import the private key
  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const encodedHeader  = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput   = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64urlEncode(signature)}`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Read secrets ──────────────────────────────────────────────────────────
    const apiKeyId     = Deno.env.get('JAAS_API_KEY_ID');
    const privateKeyPem = Deno.env.get('JAAS_PRIVATE_KEY');

    // ── Graceful no-JWT fallback ──────────────────────────────────────────────
    // If JAAS_PRIVATE_KEY is not yet configured (only public key provided, or
    // credentials not set), return token: null so the modal falls back to
    // anonymous / no-JWT mode rather than blocking with an error overlay.
    // NOTE: JAAS_PRIVATE_KEY must be the RSA *private* key (PKCS#1 or PKCS#8),
    // starting with "-----BEGIN RSA PRIVATE KEY-----" or "-----BEGIN PRIVATE KEY-----".
    // The public key ("-----BEGIN PUBLIC KEY-----") cannot sign JWTs.
    if (!apiKeyId || !privateKeyPem) {
      console.warn('[generate-jaas-jwt] JAAS_API_KEY_ID or JAAS_PRIVATE_KEY not set — returning null token (no-JWT mode)');
      return new Response(
        JSON.stringify({ token: null, mode: 'anonymous' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Detect if the user accidentally provided the PUBLIC key instead of the private key
    if (
      privateKeyPem.includes('-----BEGIN PUBLIC KEY-----') ||
      privateKeyPem.includes('-----BEGIN RSA PUBLIC KEY-----')
    ) {
      console.warn('[generate-jaas-jwt] JAAS_PRIVATE_KEY contains a PUBLIC key — falling back to no-JWT mode. Please set the RSA private key.');
      return new Response(
        JSON.stringify({ token: null, mode: 'anonymous', warning: 'JAAS_PRIVATE_KEY is a public key. Please provide the RSA private key to enable authenticated meetings.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Parse request body ────────────────────────────────────────────────────
    const body = await req.json() as {
      userId:      string;
      displayName: string;
      email:       string;
      roomName:    string;
      isModerator: boolean;
    };

    const { userId, displayName, email, roomName, isModerator } = body;

    if (!userId || !displayName || !roomName) {
      return new Response(
        JSON.stringify({ error: 'userId, displayName, and roomName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Build JWT payload ─────────────────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss:  'chat',
      aud:  'jitsi',
      iat:  now,
      nbf:  now - 10,        // allow 10s clock skew
      exp:  now + 7200,      // 2-hour token lifetime
      room: '*',             // wildcard — valid for any room in this tenant
      sub:  JAAS_APP_ID,
      context: {
        user: {
          id:        userId,
          name:      displayName,
          email:     email || '',
          moderator: String(isModerator),   // JaaS expects string "true"/"false"
          avatar:    '',
        },
        features: {
          recording:      'false',
          livestreaming:  'false',
          'outbound-call':'false',
          transcription:  'false',
        },
      },
    };

    console.log('[generate-jaas-jwt] Signing JWT for user:', userId, 'room:', roomName, 'moderator:', isModerator);

    // ── Diagnostic: verify the key looks like a private key ──────────────────
    const keyPreview = privateKeyPem.slice(0, 60).replace(/\n/g, ' ');
    console.log('[generate-jaas-jwt] Private key preview (first 60 chars):', keyPreview);
    if (privateKeyPem.includes('PUBLIC KEY')) {
      console.error('[generate-jaas-jwt] WRONG KEY TYPE: JAAS_PRIVATE_KEY contains a PUBLIC key!');
    } else if (privateKeyPem.includes('RSA PRIVATE KEY') || privateKeyPem.includes('PRIVATE KEY')) {
      console.log('[generate-jaas-jwt] Key type: PRIVATE ✓');
    }

    // ── Diagnostic: kid format check ─────────────────────────────────────────
    // kid must be <APP_ID>/<SHORT_KEY_ID> where SHORT_KEY_ID is the short
    // alphanumeric ID shown in the JaaS dashboard → API Keys page, e.g. "abc12345ef".
    // If apiKeyId equals the App ID (vpaas-magic-cookie-...), the kid will be
    // "<APP_ID>/<APP_ID>" which JaaS cannot resolve to a registered public key.
    const kid = `${JAAS_APP_ID}/${apiKeyId}`;
    const kidLooksWrong = apiKeyId === JAAS_APP_ID || apiKeyId.startsWith('vpaas-magic-cookie-');
    if (kidLooksWrong) {
      console.warn('[generate-jaas-jwt] WARNING: JAAS_API_KEY_ID appears to be the App ID, not the Key ID!');
      console.warn('[generate-jaas-jwt] kid will be:', kid);
      console.warn('[generate-jaas-jwt] Expected kid format: <APP_ID>/<SHORT_KEY_ID> e.g. vpaas-magic-cookie-.../abc123ef');
      console.warn('[generate-jaas-jwt] Fix: Go to jaas.8x8.vc → API Keys → copy the short Key ID (NOT the App ID)');
      console.warn('[generate-jaas-jwt] Set that short Key ID as the JAAS_API_KEY_ID secret.');
    } else {
      console.log('[generate-jaas-jwt] kid:', kid, '✓');
    }
    const token = await signRS256(payload, privateKeyPem, kid);

    return new Response(
      JSON.stringify({ token, kidWarning: kidLooksWrong ? 'JAAS_API_KEY_ID appears to be the App ID — set the short Key ID from jaas.8x8.vc → API Keys instead.' : null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-jaas-jwt] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
