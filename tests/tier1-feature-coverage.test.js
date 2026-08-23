/**
 * Tier 1: Feature Coverage Test Suite (>= 5 tests per feature)
 *
 * Covers:
 * 1. Zero-Data Bundle Presence & Scanner Validation (5 tests)
 * 2. Serverless API Route & HTTP Method Restriction (5 tests)
 * 3. Turnstile Siteverify Integration & Token Validation (5 tests)
 * 4. Gateway UI Lifecycle & State Machine (5 tests)
 * 5. Real-Time Theme Synchronization (5 tests)
 * 6. 100% UI/UX Data Contract Preservation (5 tests)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanContent,
  SENSITIVE_PATTERNS
} from '../scripts/verify-zero-data.js';
import {
  mockSiteverify,
  executeApiRequest,
  SimulatedLinkPageClient,
  CLOUDFLARE_TEST_KEYS,
  AUTHORITATIVE_ORACLE_DATA
} from './helpers/test-environment.js';

// ============================================================================
// Feature 1: Zero-Data Frontend Bundle Scanner & Keyword Isolation
// ============================================================================
test.describe('Tier 1 - Feature 1: Zero-Data Bundle Scanner & Isolation', () => {
  test('TC-T1-F1-01: Scanner detects full name "Junhyeok Choi" in arbitrary text', () => {
    const snippet = '<h1 className="profile-name">Junhyeok Choi</h1>';
    const violations = scanContent(snippet, 'test-chunk.js');
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].patternName, 'Profile Name');
    assert.strictEqual(violations[0].match, 'Junhyeok Choi');
  });

  test('TC-T1-F1-02: Scanner detects Korean nicknames and bio strings', () => {
    const snippet = 'const bio = "바이브코더 약대생"; const nick = "cygnus330 / 염화은 / 자몽라임소다";';
    const violations = scanContent(snippet, 'test-chunk.js');
    assert.ok(violations.length >= 4, `Expected >= 4 violations, got ${violations.length}`);
    const names = violations.map(v => v.patternName);
    assert.ok(names.includes('Profile Nickname (cygnus330)'));
    assert.ok(names.includes('Profile Nickname (염화은)'));
    assert.ok(names.includes('Profile Nickname (자몽라임소다)'));
    assert.ok(names.includes('Profile Bio (바이브코더)'));
  });

  test('TC-T1-F1-03: Scanner detects personal URLs (naver blog, github, instagram, personal domain)', () => {
    const snippet = `
      const u1 = "https://blog.naver.com/choigriaffe";
      const u2 = "https://github.com/cygnus330";
      const u3 = "https://instagram.com/cygnus330_";
      const u4 = "https://lmsoda.moe";
    `;
    const violations = scanContent(snippet, 'test-urls.js');
    assert.ok(violations.length >= 4, `Expected >= 4 violations, got ${violations.length}`);
  });

  test('TC-T1-F1-04: Scanner detects raw email addresses and mailto links via email regex', () => {
    const snippet = '<a href="mailto:choigriaffe@naver.com">choigriaffe@naver.com</a> <span>jhc405@skku.edu</span>';
    const violations = scanContent(snippet, 'test-emails.js');
    assert.ok(violations.length >= 2, `Expected >= 2 violations, got ${violations.length}`);
  });

  test('TC-T1-F1-05: Clean UI shell without sensitive keywords yields 0 violations', () => {
    const cleanSnippet = `
      import React, { useState } from 'react';
      export function AppShell() {
        return (
          <div className="gateway-container">
            <div id="cf-turnstile-widget" />
            <p>보안 인증을 진행해주세요</p>
          </div>
        );
      }
    `;
    const violations = scanContent(cleanSnippet, 'clean-app.js');
    assert.strictEqual(violations.length, 0, 'Clean shell must have zero violations');
  });
});

// ============================================================================
// Feature 2: Pages Functions Route & HTTP Method Restriction
// ============================================================================
test.describe('Tier 1 - Feature 2: Serverless Route & HTTP Method Restriction', () => {
  test('TC-T1-F2-01: Direct GET /api/links returns HTTP 405 Method Not Allowed', async () => {
    const res = await executeApiRequest({ method: 'GET' });
    assert.strictEqual(res.status, 405);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.error, /Method Not Allowed/i);
    assert.strictEqual(res.headers.get('Allow'), 'POST');
  });

  test('TC-T1-F2-02: Direct PUT /api/links returns HTTP 405 Method Not Allowed', async () => {
    const res = await executeApiRequest({ method: 'PUT', body: { token: 'sample-token' } });
    assert.strictEqual(res.status, 405);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  test('TC-T1-F2-03: Direct DELETE /api/links returns HTTP 405 Method Not Allowed', async () => {
    const res = await executeApiRequest({ method: 'DELETE' });
    assert.strictEqual(res.status, 405);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  test('TC-T1-F2-04: Direct OPTIONS /api/links returns HTTP 405 Method Not Allowed', async () => {
    const res = await executeApiRequest({ method: 'OPTIONS' });
    assert.strictEqual(res.status, 405);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  test('TC-T1-F2-05: Non-POST requests never leak profile or link payloads', async () => {
    const methods = ['GET', 'PUT', 'DELETE', 'OPTIONS'];
    for (const method of methods) {
      const res = await executeApiRequest({ method });
      const text = await res.text();
      assert.ok(!text.includes('Junhyeok Choi'), `Method ${method} leaked profile name`);
      assert.ok(!text.includes('choigriaffe@naver.com'), `Method ${method} leaked email`);
      assert.ok(!text.includes('lmsoda.moe'), `Method ${method} leaked link URL`);
    }
  });
});

// ============================================================================
// Feature 3: Turnstile Siteverify Integration & Token Validation
// ============================================================================
test.describe('Tier 1 - Feature 3: Turnstile Siteverify Integration', () => {
  test.beforeEach(() => {
    mockSiteverify.reset();
  });

  test('TC-T1-F3-01: Valid token with correct secret key returns HTTP 200 and success true', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'valid-test-token-123' },
      env: { TURNSTILE_SECRET_KEY: CLOUDFLARE_TEST_KEYS.SECRET_PASS }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.profile, 'Expected profile in response');
    assert.ok(Array.isArray(body.links), 'Expected links array in response');
  });

  test('TC-T1-F3-02: Invalid token returns HTTP 401 Unauthorized', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'invalid-token-xyz' },
      env: { TURNSTILE_SECRET_KEY: CLOUDFLARE_TEST_KEYS.SECRET_PASS }
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.error, /Turnstile verification failed/i);
    assert.strictEqual(body.profile, undefined);
  });

  test('TC-T1-F3-03: Missing token in request payload returns HTTP 400 Bad Request', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: {},
      env: { TURNSTILE_SECRET_KEY: CLOUDFLARE_TEST_KEYS.SECRET_PASS }
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.error, /Missing Turnstile verification token/i);
  });

  test('TC-T1-F3-04: Cloudflare failure test secret key (2x000...00AA) returns HTTP 401', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'any-token' },
      env: { TURNSTILE_SECRET_KEY: CLOUDFLARE_TEST_KEYS.SECRET_FAIL }
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  test('TC-T1-F3-05: Verified response includes Cache-Control no-store headers', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'valid-cache-check-token' }
    });
    assert.strictEqual(res.status, 200);
    const cacheControl = res.headers.get('Cache-Control');
    assert.ok(cacheControl, 'Cache-Control header missing');
    assert.match(cacheControl, /no-store/i);
    assert.match(cacheControl, /no-cache/i);
  });
});

// ============================================================================
// Feature 4: Gateway UI Lifecycle & State Machine
// ============================================================================
test.describe('Tier 1 - Feature 4: Gateway UI Lifecycle & State Machine', () => {
  test.beforeEach(() => {
    mockSiteverify.reset();
  });

  test('TC-T1-F4-01: Client initial state starts at IDLE / CHALLENGING with no data loaded', () => {
    const client = new SimulatedLinkPageClient('light');
    assert.strictEqual(client.status, 'IDLE');
    assert.strictEqual(client.profile, null);
    assert.strictEqual(client.links.length, 0);
    assert.strictEqual(client.footer, null);
  });

  test('TC-T1-F4-02: Turnstile widget mounts with explicit sitekey and initial theme', () => {
    const client = new SimulatedLinkPageClient('dark');
    const widget = client.mountTurnstileWidget({
      sitekey: CLOUDFLARE_TEST_KEYS.CLIENT_PASS,
      theme: 'dark'
    });
    assert.strictEqual(client.status, 'CHALLENGING');
    assert.strictEqual(widget.theme, 'dark');
    assert.strictEqual(widget.sitekey, CLOUDFLARE_TEST_KEYS.CLIENT_PASS);
  });

  test('TC-T1-F4-03: Widget solve callback triggers token verification and transitions to VERIFYING', async () => {
    const client = new SimulatedLinkPageClient('light');
    let solveHandled = false;
    client.mountTurnstileWidget({
      callback: async (token) => {
        solveHandled = true;
        await client.verifyToken(token);
      }
    });

    await client.turnstileWidget.solve('valid-token-f403');
    assert.ok(solveHandled, 'Widget solve callback was not executed');
    assert.strictEqual(client.status, 'SUCCESS');
  });

  test('TC-T1-F4-04: Successful verification transitions to SUCCESS and cleans up widget', async () => {
    const client = new SimulatedLinkPageClient('light');
    client.mountTurnstileWidget();
    const result = await client.verifyToken('valid-token-f404');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(client.status, 'SUCCESS');
    assert.strictEqual(client.turnstileWidget.removed, true);
    assert.ok(client.profile !== null);
  });

  test('TC-T1-F4-05: Verification failure transitions state to ERROR and records error message', async () => {
    const client = new SimulatedLinkPageClient('light');
    client.mountTurnstileWidget();
    const result = await client.verifyToken('invalid-token-f405');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(client.status, 'ERROR');
    assert.ok(client.errorMessage !== null);
    assert.strictEqual(client.profile, null);
  });
});

// ============================================================================
// Feature 5: Real-Time Theme Synchronization
// ============================================================================
test.describe('Tier 1 - Feature 5: Real-Time Theme Synchronization', () => {
  test('TC-T1-F5-01: Client initial theme is reflected on DOM data-theme attribute', () => {
    const clientLight = new SimulatedLinkPageClient('light');
    assert.strictEqual(clientLight.dom.bodyAttributes['data-theme'], 'light');

    const clientDark = new SimulatedLinkPageClient('dark');
    assert.strictEqual(clientDark.dom.bodyAttributes['data-theme'], 'dark');
  });

  test('TC-T1-F5-02: Toggling theme from light to dark updates DOM and state', () => {
    const client = new SimulatedLinkPageClient('light');
    client.toggleTheme();
    assert.strictEqual(client.theme, 'dark');
    assert.strictEqual(client.dom.bodyAttributes['data-theme'], 'dark');
  });

  test('TC-T1-F5-03: Toggling theme from dark to light updates DOM and state', () => {
    const client = new SimulatedLinkPageClient('dark');
    client.toggleTheme();
    assert.strictEqual(client.theme, 'light');
    assert.strictEqual(client.dom.bodyAttributes['data-theme'], 'light');
  });

  test('TC-T1-F5-04: Turnstile widget receives updated theme option upon theme toggle', () => {
    const client = new SimulatedLinkPageClient('light');
    const widget = client.mountTurnstileWidget({ theme: 'light' });
    assert.strictEqual(widget.theme, 'light');

    client.toggleTheme();
    assert.strictEqual(widget.theme, 'dark');
  });

  test('TC-T1-F5-05: Theme state remains intact when transitioning from LOCKED to UNLOCKED', async () => {
    mockSiteverify.reset();
    const client = new SimulatedLinkPageClient('dark');
    client.mountTurnstileWidget();
    await client.verifyToken('valid-token-f505');
    assert.strictEqual(client.status, 'SUCCESS');
    assert.strictEqual(client.theme, 'dark');
    assert.strictEqual(client.dom.bodyAttributes['data-theme'], 'dark');
  });
});

// ============================================================================
// Feature 6: 100% UI/UX Data Contract Preservation
// ============================================================================
test.describe('Tier 1 - Feature 6: 100% UI/UX Data Contract Preservation', () => {
  test.beforeEach(() => {
    mockSiteverify.reset();
  });

  test('TC-T1-F6-01: Profile data contains exact name, nickname, bio, and avatar fields', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'valid-token-f601' }
    });
    const body = await res.json();
    assert.strictEqual(body.profile.name, AUTHORITATIVE_ORACLE_DATA.profile.name);
    assert.strictEqual(body.profile.nickname, AUTHORITATIVE_ORACLE_DATA.profile.nickname);
    assert.strictEqual(body.profile.bio, AUTHORITATIVE_ORACLE_DATA.profile.bio);
    assert.ok(body.profile.avatar || body.profile.profileImage);
  });

  test('TC-T1-F6-02: Links array contains exactly 4 link objects with unique sequential IDs', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'valid-token-f602' }
    });
    const body = await res.json();
    assert.strictEqual(body.links.length, 4);
    const ids = body.links.map(l => l.id);
    assert.deepStrictEqual(ids, [0, 1, 2, 3]);
  });

  test('TC-T1-F6-03: Link URLs and labels match official destinations in exact order', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'valid-token-f603' }
    });
    const body = await res.json();
    const expected = AUTHORITATIVE_ORACLE_DATA.links;

    for (let i = 0; i < 4; i++) {
      assert.strictEqual(body.links[i].text, expected[i].text);
      assert.strictEqual(body.links[i].url, expected[i].url);
      assert.strictEqual(body.links[i].iurl, expected[i].iurl);
    }
  });

  test('TC-T1-F6-04: Footer contains copyright, credits, and email contacts', async () => {
    const res = await executeApiRequest({
      method: 'POST',
      body: { token: 'valid-token-f604' }
    });
    const body = await res.json();
    assert.strictEqual(body.footer.copyright, AUTHORITATIVE_ORACLE_DATA.footer.copyright);
    assert.ok(body.footer.credits);
    assert.ok(body.footer.emails);
  });

  test('TC-T1-F6-05: Unlocked client state holds full profile, links, and footer structures', async () => {
    const client = new SimulatedLinkPageClient('light');
    client.mountTurnstileWidget();
    const res = await client.verifyToken('valid-token-f605');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(client.profile.name, 'Junhyeok Choi');
    assert.strictEqual(client.links.length, 4);
    assert.ok(client.footer.emails.length >= 2);
  });
});
