/**
 * Tier 3: Cross-Feature Combinations Test Suite
 *
 * Covers:
 * 1. Theme Toggle During Active Verification (Race Condition Resistance)
 * 2. Error Recovery & Retry Workflow with Theme Synchronicity
 * 3. Rapid Burst Requests & Concurrency Handling
 * 4. Token Expiration -> Auto Reset -> Fresh Verification
 * 5. Lifecycle Transition State Persistence
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mockSiteverify,
  executeApiRequest,
  SimulatedLinkPageClient,
  CLOUDFLARE_TEST_KEYS
} from './helpers/test-environment.js';

test.describe('Tier 3 - Cross-Feature Combinations', () => {
  test.beforeEach(() => {
    mockSiteverify.reset();
  });

  test('TC-T3-01: Theme toggle during active verification maintains correct final state and DOM theme', async () => {
    const client = new SimulatedLinkPageClient('light');
    client.mountTurnstileWidget();

    // Start verification in background
    const verifyPromise = client.verifyToken('valid-token-t301');

    // User toggles theme while verification is in flight
    client.toggleTheme();
    assert.strictEqual(client.theme, 'dark');
    assert.strictEqual(client.dom.bodyAttributes['data-theme'], 'dark');

    // Await verification completion
    const result = await verifyPromise;
    assert.strictEqual(result.ok, true);
    assert.strictEqual(client.status, 'SUCCESS');
    // Ensure final state retains the toggled dark theme
    assert.strictEqual(client.theme, 'dark');
    assert.strictEqual(client.dom.bodyAttributes['data-theme'], 'dark');
  });

  test('TC-T3-02: Verification failure -> Theme toggle -> Successful retry flow', async () => {
    const client = new SimulatedLinkPageClient('light');
    client.mountTurnstileWidget();

    // 1. Initial attempt fails
    const failRes = await client.verifyToken('invalid-token-t302');
    assert.strictEqual(failRes.ok, false);
    assert.strictEqual(client.status, 'ERROR');

    // 2. User toggles theme while viewing error message
    client.toggleTheme();
    assert.strictEqual(client.theme, 'dark');

    // 3. User clicks Retry
    client.retry();
    assert.strictEqual(client.status, 'CHALLENGING');
    assert.strictEqual(client.errorMessage, null);

    // 4. Second attempt succeeds with valid token
    const successRes = await client.verifyToken('valid-token-t302-retry');
    assert.strictEqual(successRes.ok, true);
    assert.strictEqual(client.status, 'SUCCESS');
    assert.strictEqual(client.theme, 'dark');
    assert.ok(client.profile !== null);
  });

  test('TC-T3-03: Rapid multiple theme toggles do not corrupt widget state or DOM', () => {
    const client = new SimulatedLinkPageClient('light');
    const widget = client.mountTurnstileWidget();

    // Rapidly toggle 5 times
    client.toggleTheme(); // dark
    client.toggleTheme(); // light
    client.toggleTheme(); // dark
    client.toggleTheme(); // light
    client.toggleTheme(); // dark

    assert.strictEqual(client.theme, 'dark');
    assert.strictEqual(widget.theme, 'dark');
    assert.strictEqual(client.dom.bodyAttributes['data-theme'], 'dark');
  });

  test('TC-T3-04: Rapid burst requests with distinct tokens process independently', async () => {
    const tokens = ['burst-token-1', 'burst-token-2', 'burst-token-3', 'burst-token-4', 'burst-token-5'];

    const promises = tokens.map(token => executeApiRequest({
      method: 'POST',
      body: { token }
    }));

    const responses = await Promise.all(promises);

    for (const res of responses) {
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.profile);
    }
  });

  test('TC-T3-05: Token expiration callback resets challenge without user page refresh', async () => {
    const client = new SimulatedLinkPageClient('light');
    let expireHandled = false;

    client.mountTurnstileWidget({
      'expired-callback': () => {
        expireHandled = true;
        client.status = 'CHALLENGING';
      }
    });

    // Trigger widget expiration event
    client.turnstileWidget.triggerExpire();

    assert.ok(expireHandled, 'Expiration callback was not called');
    assert.strictEqual(client.status, 'CHALLENGING');
  });

  test('TC-T3-06: Transient server outage followed by recovery', async () => {
    const client = new SimulatedLinkPageClient('dark');
    client.mountTurnstileWidget();

    // 1. Simulate server error
    mockSiteverify.simulateServerError(true);
    const failRes = await client.verifyToken('valid-token-temp-fail');
    assert.strictEqual(failRes.ok, false);
    assert.strictEqual(client.status, 'ERROR');

    // 2. Server recovers
    mockSiteverify.simulateServerError(false);
    client.retry();

    // 3. Verify succeeds
    const successRes = await client.verifyToken('valid-token-recovered');
    assert.strictEqual(successRes.ok, true);
    assert.strictEqual(client.status, 'SUCCESS');
  });
});
