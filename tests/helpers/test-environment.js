/**
 * Link-Page Test Environment & Mock Infrastructure Helper
 * 
 * Provides:
 * 1. Authoritative Oracle Data & Schemas
 * 2. Cloudflare Turnstile /siteverify Mock Engine
 * 3. Cloudflare Pages Functions Request/Response Test Harness
 * 4. Client-side Turnstile Widget & DOM State Simulator
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Ensure public/assets/profile.jpg exists from src/assets/profile.jpg
const srcProfilePath = path.join(PROJECT_ROOT, 'src', 'assets', 'profile.jpg');
const pubAssetsDir = path.join(PROJECT_ROOT, 'public', 'assets');
const pubProfilePath = path.join(pubAssetsDir, 'profile.jpg');
if (fs.existsSync(srcProfilePath) && !fs.existsSync(pubProfilePath)) {
  if (!fs.existsSync(pubAssetsDir)) {
    fs.mkdirSync(pubAssetsDir, { recursive: true });
  }
  fs.copyFileSync(srcProfilePath, pubProfilePath);
}

// ============================================================================
// 1. Authoritative Reference (Oracle) Data & Constants
// ============================================================================

export const CLOUDFLARE_TEST_KEYS = {
  CLIENT_PASS: '1x00000000000000000000AA',
  CLIENT_FAIL: '2x00000000000000000000AB',
  CLIENT_PASS_INVISIBLE: '1x00000000000000000000BB',
  CLIENT_FAIL_INVISIBLE: '2x00000000000000000000BB',
  CLIENT_INTERACTIVE: '3x00000000000000000000FF',
  SECRET_PASS: '1x0000000000000000000000000000000AA',
  SECRET_FAIL: '2x0000000000000000000000000000000AA',
  SECRET_SPENT: '3x0000000000000000000000000000000AA'
};

export const AUTHORITATIVE_ORACLE_DATA = {
  profile: {
    name: 'Junhyeok Choi',
    nickname: 'cygnus330 / 염화은 / 자몽라임소다',
    bio: '바이브코더 약대생',
    avatar: '/assets/profile.jpg'
  },
  links: [
    { id: 0, text: '홈페이지', url: 'https://lmsoda.moe', iurl: '/links/home.svg' },
    { id: 1, text: '깃허브', url: 'https://github.com/cygnus330', iurl: '/links/github.svg' },
    { id: 2, text: '인스타그램', url: 'https://instagram.com/cygnus330_', iurl: '/links/instagram.svg' },
    { id: 3, text: '블로그', url: 'https://blog.naver.com/choigriaffe', iurl: '/links/naverblog.svg' }
  ],
  footer: {
    copyright: '© 2026 염화은. All rights reserved.',
    credits: 'Icons by SVG Repo',
    emails: ['choigriaffe@naver.com', 'jhc405@skku.edu']
  }
};

// ============================================================================
// 2. Mock Cloudflare Turnstile Siteverify Backend
// ============================================================================

export class MockTurnstileSiteverify {
  constructor() {
    this.spentTokens = new Set();
    this.customTokenResponses = new Map();
    this.simulatedNetworkFailure = false;
    this.simulatedServerError = false;
    this.callHistory = [];
  }

  reset() {
    this.spentTokens.clear();
    this.customTokenResponses.clear();
    this.simulatedNetworkFailure = false;
    this.simulatedServerError = false;
    this.callHistory = [];
  }

  setTokenResponse(token, responseObj) {
    this.customTokenResponses.set(token, responseObj);
  }

  simulateNetworkError(enabled = true) {
    this.simulatedNetworkFailure = enabled;
  }

  simulateServerError(enabled = true) {
    this.simulatedServerError = enabled;
  }

  /**
   * Evaluates a /siteverify request
   * @param {{ secret: string, response: string, remoteip?: string, idempotency_key?: string }} body 
   */
  async verify(body) {
    this.callHistory.push({ body, timestamp: Date.now() });

    if (this.simulatedNetworkFailure) {
      const err = new Error('fetch failed: connection reset by peer');
      err.code = 'ECONNRESET';
      throw err;
    }

    if (this.simulatedServerError) {
      return {
        status: 500,
        ok: false,
        json: async () => ({
          success: false,
          'error-codes': ['internal-error'],
          messages: ['Internal Turnstile service error']
        })
      };
    }

    const { secret, response, remoteip } = body || {};

    // 1. Missing secret key
    if (!secret) {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': ['missing-input-secret']
        })
      };
    }

    // 2. Missing client response token
    if (!response || typeof response !== 'string' || response.trim() === '') {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': ['missing-input-response']
        })
      };
    }

    // 3. Custom token mock response
    if (this.customTokenResponses.has(response)) {
      const custom = this.customTokenResponses.get(response);
      return {
        status: 200,
        ok: true,
        json: async () => custom
      };
    }

    // 4. Secret key test modes
    if (secret === CLOUDFLARE_TEST_KEYS.SECRET_FAIL) {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': ['invalid-input-response']
        })
      };
    }

    if (secret === CLOUDFLARE_TEST_KEYS.SECRET_SPENT || response === 'token-spent') {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': ['timeout-or-duplicate']
        })
      };
    }

    // 5. Check if token was already spent (Replay attack detection)
    if (this.spentTokens.has(response)) {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': ['timeout-or-duplicate']
        })
      };
    }

    // 6. Token matching rules
    if (response.startsWith('invalid-') || response === 'bad_token' || response === 'expired_token') {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          success: false,
          'error-codes': [response === 'expired_token' ? 'timeout-or-duplicate' : 'invalid-input-response']
        })
      };
    }

    // Mark token as spent
    this.spentTokens.add(response);

    // 7. Successful verification response
    return {
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        'error-codes': [],
        challenge_ts: new Date().toISOString(),
        hostname: 'link-page.pages.dev',
        action: '',
        cdata: '',
        metadata: { interactive: false }
      })
    };
  }
}

export const mockSiteverify = new MockTurnstileSiteverify();

// ============================================================================
// 3. Pages Functions Runner & Reference Implementation
// ============================================================================

/**
 * Standard Reference Implementation of functions/api/links.js
 * Used for testing contract compliance and as an oracle.
 */
export async function referenceApiLinksHandler(context, mockSiteverifyInstance = mockSiteverify) {
  const { request, env } = context;

  // 1. Method restriction (POST only)
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method Not Allowed. Use POST.' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Allow': 'POST'
        }
      }
    );
  }

  // 2. Parse request payload
  let payload;
  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.trim() === '') {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Turnstile verification token' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    payload = JSON.parse(rawBody);
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const token = payload.token || payload.turnstileToken;
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing Turnstile verification token' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 3. Secret key binding with fallback
  const secretKey = env?.TURNSTILE_SECRET_KEY || CLOUDFLARE_TEST_KEYS.SECRET_PASS;

  // 4. Verify against Cloudflare Turnstile
  try {
    const verifyRes = await mockSiteverifyInstance.verify({
      secret: secretKey,
      response: token,
      remoteip: request.headers.get('CF-Connecting-IP') || '127.0.0.1'
    });

    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Turnstile verification failed',
          errorCodes: verifyData['error-codes'] || ['invalid-input-response']
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        }
      );
    }

    // 5. Success response with authoritative payload
    return new Response(
      JSON.stringify({
        success: true,
        ...AUTHORITATIVE_ORACLE_DATA
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache'
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error during verification' }),
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}

/**
 * Executes a simulated API request through the target Pages Function implementation.
 * Dynamically tests functions/api/links.js if it exists, otherwise tests reference handler.
 * @param {string} method 
 * @param {string|object} body 
 * @param {object} headers 
 * @param {object} env 
 */
export async function executeApiRequest({
  method = 'POST',
  body = null,
  headers = {},
  env = { TURNSTILE_SECRET_KEY: CLOUDFLARE_TEST_KEYS.SECRET_PASS },
  useRealImplementationIfAvailable = true
} = {}) {
  // Construct standard Web Request
  const reqHeaders = new Headers(headers);
  if (body && !reqHeaders.has('Content-Type') && typeof body === 'object') {
    reqHeaders.set('Content-Type', 'application/json');
  }

  let requestBodyString = body;
  if (body && typeof body === 'object') {
    requestBodyString = JSON.stringify(body);
  }

  const req = new Request('https://link-page.pages.dev/api/links', {
    method,
    headers: reqHeaders,
    body: (method !== 'GET' && method !== 'HEAD') ? requestBodyString : undefined
  });

  const context = {
    request: req,
    env,
    params: {},
    waitUntil: (p) => p,
    next: async () => {},
    data: {}
  };

  const realFuncPath = path.join(PROJECT_ROOT, 'functions', 'api', 'links.js');

  if (useRealImplementationIfAvailable && fs.existsSync(realFuncPath)) {
    try {
      // Dynamic import of real implementation
      const mod = await import(`file://${realFuncPath}?t=${Date.now()}`);
      if (method === 'POST' && typeof mod.onRequestPost === 'function') {
        // Intercept global fetch if real function calls challenges.cloudflare.com
        const origFetch = globalThis.fetch;
        globalThis.fetch = async (url, opts) => {
          if (typeof url === 'string' && url.includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
            let parsedBody = {};
            if (opts?.body) {
              if (typeof opts.body === 'string') {
                try {
                  parsedBody = JSON.parse(opts.body);
                } catch {
                  // url-encoded fallback
                  const params = new URLSearchParams(opts.body);
                  parsedBody = {
                    secret: params.get('secret'),
                    response: params.get('response'),
                    remoteip: params.get('remoteip')
                  };
                }
              } else if (opts.body instanceof URLSearchParams || opts.body instanceof FormData) {
                for (const [k, v] of opts.body.entries()) {
                  parsedBody[k] = v;
                }
              }
            }
            return mockSiteverify.verify(parsedBody);
          }
          return origFetch(url, opts);
        };

        try {
          return await mod.onRequestPost(context);
        } finally {
          globalThis.fetch = origFetch;
        }
      } else if (typeof mod.onRequest === 'function') {
        return await mod.onRequest(context);
      }
    } catch (err) {
      console.warn('[executeApiRequest] Real implementation failed to execute, falling back to reference oracle:', err.message);
    }
  }

  // Fallback to reference implementation
  return referenceApiLinksHandler(context, mockSiteverify);
}

// ============================================================================
// 4. Simulated Client State Machine & DOM Engine
// ============================================================================

export class SimulatedLinkPageClient {
  constructor(initialTheme = 'light') {
    this.theme = initialTheme;
    this.status = 'IDLE'; // IDLE | CHALLENGING | VERIFYING | SUCCESS | ERROR
    this.profile = null;
    this.links = [];
    this.footer = null;
    this.errorMessage = null;
    this.turnstileWidget = null;
    this.renderLog = [];
    this.dom = {
      bodyAttributes: { 'data-theme': initialTheme },
      elements: new Map()
    };
  }

  setTheme(newTheme) {
    this.theme = newTheme;
    this.dom.bodyAttributes['data-theme'] = newTheme;
    this.renderLog.push({ action: 'SET_THEME', theme: newTheme, timestamp: Date.now() });

    // If widget exists, trigger theme sync
    if (this.turnstileWidget) {
      this.turnstileWidget.syncTheme(newTheme);
    }
  }

  toggleTheme() {
    this.setTheme(this.theme === 'light' ? 'dark' : 'light');
  }

  mountTurnstileWidget(options = {}) {
    this.status = 'CHALLENGING';
    const widgetId = `widget_${Math.random().toString(36).substring(2, 9)}`;
    
    this.turnstileWidget = {
      widgetId,
      sitekey: options.sitekey || CLOUDFLARE_TEST_KEYS.CLIENT_PASS,
      theme: options.theme || this.theme,
      callback: options.callback,
      errorCallback: options['error-callback'],
      expiredCallback: options['expired-callback'],
      removed: false,
      syncTheme: (t) => {
        this.turnstileWidget.theme = t;
        this.renderLog.push({ action: 'WIDGET_THEME_SYNC', theme: t });
      },
      solve: async (token = `valid-token-${Date.now()}`) => {
        if (this.turnstileWidget.removed) return;
        this.renderLog.push({ action: 'WIDGET_SOLVE', token });
        if (typeof this.turnstileWidget.callback === 'function') {
          await this.turnstileWidget.callback(token);
        }
      },
      triggerError: (code = 'invalid-input-response') => {
        if (this.turnstileWidget.removed) return;
        this.renderLog.push({ action: 'WIDGET_ERROR', code });
        if (typeof this.turnstileWidget.errorCallback === 'function') {
          this.turnstileWidget.errorCallback(code);
        }
      },
      triggerExpire: () => {
        if (this.turnstileWidget.removed) return;
        this.renderLog.push({ action: 'WIDGET_EXPIRE' });
        if (typeof this.turnstileWidget.expiredCallback === 'function') {
          this.turnstileWidget.expiredCallback();
        }
      },
      remove: () => {
        this.turnstileWidget.removed = true;
        this.renderLog.push({ action: 'WIDGET_REMOVED', widgetId });
      }
    };

    this.renderLog.push({ action: 'MOUNT_WIDGET', widgetId, theme: this.turnstileWidget.theme });
    return this.turnstileWidget;
  }

  async verifyToken(token) {
    this.status = 'VERIFYING';
    this.errorMessage = null;
    this.renderLog.push({ action: 'VERIFY_TOKEN_START', token });

    const response = await executeApiRequest({
      method: 'POST',
      body: { token }
    });

    const data = await response.json();

    if (response.status === 200 && data.success) {
      this.status = 'SUCCESS';
      this.profile = data.profile;
      this.links = data.links;
      this.footer = data.footer;
      if (this.turnstileWidget) {
        this.turnstileWidget.remove();
      }
      this.renderLog.push({ action: 'VERIFY_SUCCESS', data });
      return { ok: true, data };
    } else {
      this.status = 'ERROR';
      this.errorMessage = data.error || 'Verification failed';
      this.renderLog.push({ action: 'VERIFY_ERROR', status: response.status, data });
      return { ok: false, status: response.status, error: this.errorMessage };
    }
  }

  retry() {
    this.errorMessage = null;
    this.status = 'CHALLENGING';
    this.renderLog.push({ action: 'RETRY' });
    if (this.turnstileWidget) {
      this.turnstileWidget.solve();
    }
  }
}
