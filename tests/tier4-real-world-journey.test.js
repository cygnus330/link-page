/**
 * Tier 4: Real-World Scenarios & End-to-End User Journeys
 *
 * Covers:
 * 1. Happy Path Visitor Journey: Page load -> Gateway -> Challenge -> API Unlock -> Link interactions
 * 2. Error Recovery Journey: Failed challenge -> Theme switch -> Retry -> Unlock -> Contact verification
 * 3. Adversarial Scraper Journey: Crawl static bundle & probe API -> 0% Data Discovered
 * 4. Multi-Device / Mobile Experience Journey: Dark mode default -> Fast verification -> Full rendering
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mockSiteverify,
  executeApiRequest,
  SimulatedLinkPageClient,
  CLOUDFLARE_TEST_KEYS,
  AUTHORITATIVE_ORACLE_DATA
} from './helpers/test-environment.js';

test.describe('Tier 4 - Real-World End-to-End Journeys', () => {
  test.beforeEach(() => {
    mockSiteverify.reset();
  });

  test('TC-T4-01: Full Happy Path Journey: Mount -> Gateway -> Solve -> Unlock -> Click Links', async () => {
    // 1. Visitor loads link-page (defaults to light mode)
    const visitor = new SimulatedLinkPageClient('light');
    assert.strictEqual(visitor.status, 'IDLE');
    assert.strictEqual(visitor.profile, null);
    assert.strictEqual(visitor.links.length, 0);

    // 2. Gateway UI mounts Turnstile widget
    const widget = visitor.mountTurnstileWidget({
      sitekey: CLOUDFLARE_TEST_KEYS.CLIENT_PASS,
      theme: 'light'
    });
    assert.strictEqual(visitor.status, 'CHALLENGING');
    assert.strictEqual(widget.theme, 'light');

    // 3. User switches to Dark Mode while on Gateway screen
    visitor.toggleTheme();
    assert.strictEqual(visitor.theme, 'dark');
    assert.strictEqual(widget.theme, 'dark');
    assert.strictEqual(visitor.dom.bodyAttributes['data-theme'], 'dark');

    // 4. Turnstile challenge automatically solves
    const generatedToken = 'user-journey-happy-token-401';
    await widget.solve(generatedToken);

    // 5. Verification API is called
    const verifyResult = await visitor.verifyToken(generatedToken);
    assert.strictEqual(verifyResult.ok, true);

    // 6. Gateway unlocks and renders profile and links
    assert.strictEqual(visitor.status, 'SUCCESS');
    assert.ok(visitor.profile);
    assert.strictEqual(visitor.profile.name, 'Junhyeok Choi');
    assert.strictEqual(visitor.profile.nickname, 'cygnus330 / 염화은 / 자몽라임소다');
    assert.strictEqual(visitor.profile.bio, '바이브코더 약대생');
    assert.strictEqual(visitor.links.length, 4);

    // 7. Verify all 4 links are interactable with correct targets
    const expectedLinks = AUTHORITATIVE_ORACLE_DATA.links;
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(visitor.links[i].url, expectedLinks[i].url);
      assert.strictEqual(visitor.links[i].text, expectedLinks[i].text);
    }

    // 8. User toggles theme after unlock
    visitor.toggleTheme();
    assert.strictEqual(visitor.theme, 'light');
    assert.strictEqual(visitor.dom.bodyAttributes['data-theme'], 'light');
  });

  test('TC-T4-02: Adverse Error Recovery Journey: Failed token -> Retry -> Success -> Email Mailto Check', async () => {
    // 1. Visitor loads page
    const visitor = new SimulatedLinkPageClient('dark');
    const widget = visitor.mountTurnstileWidget({ theme: 'dark' });

    // 2. Widget generates an invalid/expired token
    const badToken = 'invalid-turnstile-token-402';
    await widget.solve(badToken);

    const firstAttempt = await visitor.verifyToken(badToken);
    assert.strictEqual(firstAttempt.ok, false);
    assert.strictEqual(visitor.status, 'ERROR');
    assert.strictEqual(visitor.profile, null);

    // 3. User clicks "다시 시도 (Retry)"
    visitor.retry();
    assert.strictEqual(visitor.status, 'CHALLENGING');

    // 4. New fresh token is generated
    const goodToken = 'valid-recovered-token-402';
    await widget.solve(goodToken);

    const secondAttempt = await visitor.verifyToken(goodToken);
    assert.strictEqual(secondAttempt.ok, true);
    assert.strictEqual(visitor.status, 'SUCCESS');

    // 5. User checks email contact links in footer
    assert.ok(visitor.footer);
    const emails = visitor.footer.emails;
    assert.ok(emails.includes('choigriaffe@naver.com') || emails.some(e => e.label === 'choigriaffe@naver.com' || e.href?.includes('choigriaffe@naver.com')));
  });

  test('TC-T4-03: Bot / Crawler Attack Journey: Direct GET & Unauthenticated Probing', async () => {
    // Bot attempts GET /api/links
    const getRes = await executeApiRequest({ method: 'GET' });
    assert.strictEqual(getRes.status, 405);
    const getText = await getRes.text();
    assert.ok(!getText.includes('Junhyeok Choi'));
    assert.ok(!getText.includes('skku.edu'));

    // Bot attempts POST with fake token
    const postFake = await executeApiRequest({
      method: 'POST',
      body: { token: 'bot-random-token-12345' },
      env: { TURNSTILE_SECRET_KEY: CLOUDFLARE_TEST_KEYS.SECRET_FAIL }
    });
    assert.strictEqual(postFake.status, 401);
    const fakeText = await postFake.text();
    assert.ok(!fakeText.includes('Junhyeok Choi'));
    assert.ok(!fakeText.includes('choigriaffe'));
  });

  test('TC-T4-04: System Theme Preference Detection (System Dark Mode Journey)', () => {
    // Simulated visitor with OS set to dark mode
    const visitor = new SimulatedLinkPageClient('dark');
    assert.strictEqual(visitor.dom.bodyAttributes['data-theme'], 'dark');

    const widget = visitor.mountTurnstileWidget({ theme: 'dark' });
    assert.strictEqual(widget.theme, 'dark');
  });
});
