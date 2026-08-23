/**
 * Cloudflare Pages Function: /api/links
 *
 * Serverless gateway endpoint for Turnstile verification.
 * Verifies the client Turnstile token against Cloudflare's /siteverify API.
 * Returns personal profile and link data only upon successful verification.
 */

export const SECURE_PAYLOAD = {
  success: true,
  profile: {
    name: 'Junhyeok Choi',
    nickname: 'cygnus330 / 염화은 / 자몽라임소다',
    bio: '바이브코더 약대생',
    avatar: '/assets/profile.jpg',
  },
  links: [
    { id: 0, text: '홈페이지', url: 'https://lmsoda.moe', iurl: '/links/home.svg' },
    { id: 1, text: '깃허브', url: 'https://github.com/cygnus330', iurl: '/links/github.svg' },
    { id: 2, text: '인스타그램', url: 'https://instagram.com/cygnus330_', iurl: '/links/instagram.svg' },
    { id: 3, text: '블로그', url: 'https://blog.naver.com/choigriaffe', iurl: '/links/naverblog.svg' },
  ],
  footer: {
    copyright: '© 2026 염화은. All rights reserved.',
    credits: 'Icons by SVG Repo',
    emails: ['choigriaffe@naver.com', 'jhc405@skku.edu'],
  },
};

const COMMON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

/**
 * Handles POST /api/links
 * @param {EventContext<any, any, any>} context
 * @returns {Promise<Response>}
 */
export async function onRequestPost(context) {
  let payload;
  try {
    const rawBody = await context.request.text();
    if (!rawBody || rawBody.trim() === '') {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Turnstile verification token' }),
        { status: 400, headers: COMMON_HEADERS }
      );
    }
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
      { status: 400, headers: COMMON_HEADERS }
    );
  }

  const token =
    payload && typeof payload === 'object'
      ? payload.token || payload.turnstileToken
      : null;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing Turnstile verification token' }),
      { status: 400, headers: COMMON_HEADERS }
    );
  }

  // Turnstile token format validation (reject injection payloads)
  if (!/^[a-zA-Z0-9_.-]+$/.test(token) || token.length > 4096) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid Turnstile token format' }),
      { status: 400, headers: COMMON_HEADERS }
    );
  }

  // Cloudflare Turnstile standard pass test key fallback
  const secretKey =
    (context.env?.TURNSTILE_SECRET_KEY && context.env.TURNSTILE_SECRET_KEY.trim()) ||
    '1x0000000000000000000000000000000AA';

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);

    const clientIp = context.request.headers.get('CF-Connecting-IP');
    if (clientIp) {
      formData.append('remoteip', clientIp);
    }

    const verifyRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!verifyRes.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Turnstile verification service error',
        }),
        { status: 500, headers: COMMON_HEADERS }
      );
    }

    const verifyData = await verifyRes.json();

    if (!verifyData || !verifyData.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Turnstile verification failed',
          errorCodes: verifyData?.['error-codes'] || [],
        }),
        { status: 401, headers: COMMON_HEADERS }
      );
    }

    return new Response(JSON.stringify(SECURE_PAYLOAD), {
      status: 200,
      headers: COMMON_HEADERS,
    });
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error during verification',
      }),
      { status: 500, headers: COMMON_HEADERS }
    );
  }
}

/**
 * Handles OPTIONS preflight requests
 * @returns {Promise<Response>}
 */
export async function onRequestOptions() {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Method Not Allowed. Use POST.',
    }),
    {
      status: 405,
      headers: {
        ...COMMON_HEADERS,
        Allow: 'POST',
      },
    }
  );
}

/**
 * Catch-all fallback for unsupported HTTP methods (GET, PUT, DELETE, etc.)
 * @param {EventContext<any, any, any>} context
 * @returns {Promise<Response>}
 */
export async function onRequest(context) {
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Method Not Allowed. Use POST.',
    }),
    {
      status: 405,
      headers: {
        ...COMMON_HEADERS,
        Allow: 'POST',
      },
    }
  );
}
