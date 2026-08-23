/**
 * Tier 2: Boundary & Corner Cases Test Suite
 *
 * Covers:
 * 1. Token Value Boundaries (Empty, Whitespace, Null, Types)
 * 2. Payload Structure Anomalies (Malformed JSON, Non-JSON, Huge Bodies)
 * 3. Adversarial & Injection Payloads (XSS, SQLi, Unicode, Emojis, Control Chars)
 * 4. Network & Backend Error Resilience (Siteverify 500, Connection Reset, Timeouts)
 * 5. Replay Attack & Token Expiration Detection
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mockSiteverify,
  executeApiRequest,
  CLOUDFLARE_TEST_KEYS
} from './helpers/test-environment.js';

test.describe('Tier 2 - Boundary & Corner Cases', () => {
  test.beforeEach(() => {
    mockSiteverify.reset();
  });

  // ==========================================================================
  // 1. Token Value Boundaries
  // ==========================================================================
  test('TC-T2-01: Empty string token yields HTTP 400 Bad Request', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: '' }
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.error, /Missing Turnstile verification token/i);
  });

  test('TC-T2-02: Whitespace-only token yields HTTP 400 Bad Request', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: '     ' }
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.error, /Missing Turnstile verification token/i);
  });

  test('TC-T2-03: Null or undefined token property yields HTTP 400 Bad Request', async () => {
    const resNull = await executeApiRequest({
      method: 'POST',
      body: { token: null }
    });
    assert.strictEqual(resNull.status, 400);

    const resUndef = await executeApiRequest({
      method: 'POST',
      body: { otherField: '123' }
    });
    assert.strictEqual(resUndef.status, 400);
  });

  test('TC-T2-04: Non-string token types (number, boolean, object, array) yield HTTP 400', async () => {
    const invalidTypes = [12345, true, false, { id: 1 }, ['token1', 'token2']];
    for (const val of invalidTypes) {
      const res = await executeApiRequest({
        method: 'POST',
        body: { token: val }
      });
      assert.strictEqual(res.status, 400, `Expected 400 for token type ${typeof val}`);
    }
  });

  // ==========================================================================
  // 2. Payload Structure Anomalies
  // ==========================================================================
  test('TC-T2-05: Empty request body yields HTTP 400 without crashing server', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: ''
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  test('TC-T2-06: Malformed JSON syntax yields HTTP 400 Bad Request', async () => {
    const malformedStrings = [
      '{"token": "unclosed-quote',
      '{ token: invalid_json }',
      '{"token": "test",,,}',
      '<!DOCTYPE html><html><body>Not JSON</body></html>'
    ];

    for (const raw of malformedStrings) {
      const res = await executeApiRequest({
        method: 'POST',
        body: raw,
        headers: { 'Content-Type': 'application/json' }
      });
      assert.strictEqual(res.status, 400, `Expected 400 for malformed string: ${raw}`);
    }
  });

  test('TC-T2-07: Huge request body (>100KB payload) does not crash or leak data', async () => {
    const hugePadding = 'A'.repeat(128 * 1024); // 128 KB
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'invalid-huge-token', padding: hugePadding }
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // ==========================================================================
  // 3. Adversarial & Injection Payloads
  // ==========================================================================
  test('TC-T2-08: Token with XSS payload string is safely rejected without injection', async () => {
    const xssToken = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: xssToken }
    });
    assert.ok(res.status === 401 || res.status === 400);
    const text = await res.text();
    assert.ok(!text.includes('<script>'), 'Response should not reflect raw unescaped script tag');
  });

  test('TC-T2-09: Token with SQL injection string is safely rejected', async () => {
    const sqliToken = "' OR '1'='1' -- ; DROP TABLE users; --";
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: sqliToken }
    });
    assert.ok(res.status === 401 || res.status === 400);
  });

  test('TC-T2-10: Token containing Korean Unicode, emojis, and special symbols', async () => {
    const unicodeToken = '토큰_✨_🔒_한글테스트_#@!$%^&*()';
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: unicodeToken }
    });
    assert.ok(res.status === 401 || res.status === 200 || res.status === 400);
  });

  // ==========================================================================
  // 4. Network & Backend Error Resilience
  // ==========================================================================
  test('TC-T2-11: Siteverify simulated 500 error returns HTTP 401 or HTTP 500 safely', async () => {
    mockSiteverify.simulateServerError(true);
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'any-token' }
    });
    assert.ok(res.status === 401 || res.status === 500);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.profile, undefined);
  });

  test('TC-T2-12: Siteverify simulated network reset returns HTTP 500 gracefully without unhandled crash', async () => {
    mockSiteverify.simulateNetworkError(true);
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'any-token' }
    });
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.error, /Internal server error/i);
  });

  // ==========================================================================
  // 5. Replay Attack & Token Expiration Detection
  // ==========================================================================
  test('TC-T2-13: Replay attack (reusing same token) is rejected on second attempt', async () => {
    const replayToken = 'single-use-token-replay-test';

    // First attempt -> Success
    const firstRes = await executeApiRequest({
      method: 'POST',
      body: { token: replayToken }
    });
    assert.strictEqual(firstRes.status, 200);
    const firstBody = await firstRes.json();
    assert.strictEqual(firstBody.success, true);

    // Second attempt -> Replay Rejection
    const secondRes = await executeApiRequest({
      method: 'POST',
      body: { token: replayToken }
    });
    assert.strictEqual(secondRes.status, 401);
    const secondBody = await secondRes.json();
    assert.strictEqual(secondBody.success, false);
    assert.match(secondBody.error, /verification failed/i);
  });

  test('TC-T2-14: Expired token (timeout-or-duplicate) returns HTTP 401', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'expired_token' }
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.errorCodes.includes('timeout-or-duplicate'));
  });

  test('TC-T2-15: Unsupported HTTP headers (e.g. text/plain content type) with JSON text', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: JSON.stringify({ token: 'valid-plain-token' }),
      headers: { 'Content-Type': 'text/plain' }
    });
    // System should either accept parseable text or reject gracefully with 400
    assert.ok(res.status === 200 || res.status === 400);
  });
});
