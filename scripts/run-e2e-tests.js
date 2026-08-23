#!/usr/bin/env node

/**
 * Link-Page E2E Test Suite Runner
 *
 * Runs Tier 1 through Tier 4 test suites and executes Zero-Data Bundle Audit.
 *
 * Usage:
 *   node scripts/run-e2e-tests.js
 */

import { run } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spec } from 'node:test/reporters';
import { runZeroDataAudit } from './verify-zero-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const TEST_FILES = [
  path.join(PROJECT_ROOT, 'tests', 'tier1-feature-coverage.test.js'),
  path.join(PROJECT_ROOT, 'tests', 'tier2-boundary-corner.test.js'),
  path.join(PROJECT_ROOT, 'tests', 'tier3-cross-feature.test.js'),
  path.join(PROJECT_ROOT, 'tests', 'tier4-real-world-journey.test.js')
];

async function main() {
  console.log('='.repeat(75));
  console.log('🧪 LINK-PAGE COMPREHENSIVE E2E TEST SUITE RUNNER');
  console.log('='.repeat(75));
  console.log(`Test Files: ${TEST_FILES.length} suites (Tiers 1-4)`);
  console.log('-'.repeat(75));

  let hasFailures = false;
  let testCount = 0;
  let passCount = 0;
  let failCount = 0;

  const stream = run({
    files: TEST_FILES,
    concurrency: 1
  });

  stream.on('test:pass', () => {
    testCount++;
    passCount++;
  });

  stream.on('test:fail', () => {
    testCount++;
    failCount++;
    hasFailures = true;
  });

  // Pipe output through spec reporter
  stream.compose(new spec()).pipe(process.stdout);

  await new Promise((resolve) => {
    stream.on('end', resolve);
  });

  console.log('\n' + '='.repeat(75));
  console.log('🔒 EXECUTING ZERO-DATA BUNDLE AUDIT CHECK');
  console.log('='.repeat(75));

  const auditResult = runZeroDataAudit(path.join(PROJECT_ROOT, 'dist'));
  if (!auditResult.exists) {
    console.log(`ℹ️  Dist directory not yet generated. (Run \`npm run build\` for full bundle scan).`);
    console.log(`   Scanner verified regex catalog (${auditResult.totalViolations} violations).`);
  } else {
    console.log(`Audited ${auditResult.filesScanned} distribution files.`);
    if (!auditResult.passed) {
      console.error(`❌ Zero-data audit discovered ${auditResult.totalViolations} sensitive keyword leaks!`);
      hasFailures = true;
    } else {
      console.log(`✅ Zero-data audit passed: 0% sensitive data in dist.`);
    }
  }

  console.log('\n' + '='.repeat(75));
  console.log('📊 FINAL TEST EXECUTION SUMMARY');
  console.log('='.repeat(75));
  console.log(`Total Tests Run : ${testCount}`);
  console.log(`Passed Tests    : ${passCount}`);
  console.log(`Failed Tests    : ${failCount}`);
  console.log(`Zero-Data Audit : ${auditResult.passed ? 'PASSED' : 'FAILED'}`);
  console.log('='.repeat(75));

  if (hasFailures || failCount > 0) {
    console.error('\n❌ E2E TEST SUITE FAILED.\n');
    process.exit(1);
  } else {
    console.log('\n✅ ALL E2E TESTS AND AUDITS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
