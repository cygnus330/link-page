#!/usr/bin/env node

/**
 * Zero-Data Bundle Audit & Regex Verification Script
 *
 * Scans static distribution bundles (dist/) and frontend source files
 * to verify that 0% sensitive personal data (names, nicknames, bios,
 * URLs, emails) exists in client-side code.
 *
 * Usage:
 *   node scripts/verify-zero-data.js [--target <path>] [--strict] [--quiet]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Authoritative list of sensitive keywords and patterns
export const SENSITIVE_PATTERNS = [
  { name: 'Profile Name', pattern: /Junhyeok\s+Choi/i, severity: 'CRITICAL' },
  { name: 'Profile Nickname (cygnus330)', pattern: /cygnus330/i, severity: 'CRITICAL' },
  { name: 'Profile Nickname (염화은)', pattern: /염화은/i, severity: 'CRITICAL' },
  { name: 'Profile Nickname (자몽라임소다)', pattern: /자몽라임소다/i, severity: 'CRITICAL' },
  { name: 'Profile Bio (바이브코더)', pattern: /바이브코더/i, severity: 'HIGH' },
  { name: 'Profile Bio (약대생)', pattern: /약대생/i, severity: 'HIGH' },
  { name: 'Personal Blog URL', pattern: /blog\.naver\.com\/choigriaffe/i, severity: 'CRITICAL' },
  { name: 'Personal Blog Handle', pattern: /choigriaffe/i, severity: 'CRITICAL' },
  { name: 'Personal GitHub Handle URL', pattern: /github\.com\/cygnus330/i, severity: 'CRITICAL' },
  { name: 'Personal Instagram Handle URL', pattern: /instagram\.com\/cygnus330/i, severity: 'CRITICAL' },
  { name: 'Personal Website Domain', pattern: /lmsoda\.moe/i, severity: 'CRITICAL' },
  { name: 'Primary Email', pattern: /choigriaffe@naver\.com/i, severity: 'CRITICAL' },
  { name: 'University Email', pattern: /jhc405@skku\.edu/i, severity: 'CRITICAL' },
  { name: 'Generic Email Address Regex', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, severity: 'HIGH' }
];

// File extensions to scan
const SCANNABLE_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.jsx', '.ts', '.tsx', '.json', '.css', '.map']);

/**
 * Scan a single string content for sensitive patterns
 * @param {string} content - Raw file content
 * @param {string} filePath - Path to file for reporting
 * @returns {Array<{patternName: string, severity: string, match: string, line: number, column: number}>}
 */
export function scanContent(content, filePath = 'unknown') {
  const violations = [];
  const lines = content.split('\n');

  for (const { name, pattern, severity } of SENSITIVE_PATTERNS) {
    // Clone regex with global flag for match all
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match;
      while ((match = regex.exec(line)) !== null) {
        // Exclude test files, audit scripts, documentation, and mock data if explicitly running on source
        violations.push({
          file: filePath,
          patternName: name,
          severity,
          match: match[0],
          line: lineIndex + 1,
          column: match.index + 1,
          snippet: line.trim()
        });
      }
    }
  }

  return violations;
}

/**
 * Recursively collect scannable files from directory
 * @param {string} dirPath 
 * @param {string[]} excludes
 * @returns {string[]}
 */
export function collectFiles(dirPath, excludes = ['node_modules', '.git', '.agents']) {
  const files = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const stats = fs.statSync(dirPath);
  if (stats.isFile()) {
    const ext = path.extname(dirPath).toLowerCase();
    if (SCANNABLE_EXTENSIONS.has(ext)) {
      files.push(dirPath);
    }
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (excludes.includes(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, excludes));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SCANNABLE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Run audit on target path
 * @param {string} targetPath 
 * @returns {{ filesScanned: number, totalViolations: number, violations: Array, passed: boolean }}
 */
export function runZeroDataAudit(targetPath = path.join(PROJECT_ROOT, 'dist')) {
  if (!fs.existsSync(targetPath)) {
    // If target directory doesn't exist, return empty with warning
    return {
      targetPath,
      exists: false,
      filesScanned: 0,
      totalViolations: 0,
      violations: [],
      passed: true,
      warning: `Target path "${targetPath}" does not exist. (Has build run?)`
    };
  }

  const filesToScan = collectFiles(targetPath);

  const allViolations = [];

  for (const file of filesToScan) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const fileViolations = scanContent(content, path.relative(PROJECT_ROOT, file));
      allViolations.push(...fileViolations);
    } catch (err) {
      console.error(`[WARN] Could not read file ${file}:`, err.message);
    }
  }

  return {
    targetPath: path.relative(PROJECT_ROOT, targetPath),
    exists: true,
    filesScanned: filesToScan.length,
    totalViolations: allViolations.length,
    violations: allViolations,
    passed: allViolations.length === 0
  };
}

// CLI Execution Support
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  let target = path.join(PROJECT_ROOT, 'dist');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) {
      target = path.resolve(PROJECT_ROOT, args[i + 1]);
      i++;
    } else if (args[i] === '--src') {
      target = path.join(PROJECT_ROOT, 'src');
    }
  }

  console.log('='.repeat(70));
  console.log('🔒 Zero-Data Static Bundle Audit Scanner');
  console.log('='.repeat(70));
  console.log(`Target Path: ${path.relative(PROJECT_ROOT, target)}`);
  console.log(`Scanned Patterns: ${SENSITIVE_PATTERNS.length} sensitive definitions`);
  console.log('-'.repeat(70));

  const result = runZeroDataAudit(target);

  if (!result.exists) {
    console.log(`⚠️  ${result.warning}`);
    console.log('ℹ️  Run `npm run build` first before auditing production bundle.');
    process.exit(0);
  }

  console.log(`Files Analyzed: ${result.filesScanned}`);
  console.log(`Total Violations: ${result.totalViolations}`);
  console.log('-'.repeat(70));

  if (result.passed) {
    console.log('✅ ZERO DATA AUDIT PASSED: 0% sensitive personal information detected.');
    console.log('='.repeat(70));
    process.exit(0);
  } else {
    console.error('❌ ZERO DATA AUDIT FAILED: Sensitive personal information discovered:');
    result.violations.forEach((v, idx) => {
      console.error(`  ${idx + 1}. [${v.severity}] ${v.patternName} in ${v.file}:${v.line}:${v.column}`);
      console.error(`     Match: "${v.match}"`);
      console.error(`     Context: ${v.snippet}`);
    });
    console.log('='.repeat(70));
    process.exit(1);
  }
}
