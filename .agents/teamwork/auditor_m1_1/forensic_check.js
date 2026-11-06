const fs = require('fs');
const path = require('path');

const rootDir = 'c:/Users/ACER.DESKTOP-FLMICGU/Documents/antigravity/clever-carson';
const files = [
  'next-app/src/lib/services/adminClient.ts',
  'next-app/src/app/admin/admin.module.css',
  'next-app/src/app/admin/components/AdminIcons.tsx',
  'next-app/src/app/admin/components/AdminNav.tsx',
  'next-app/src/app/admin/components/OverviewTab.tsx',
  'next-app/src/app/admin/components/UsersTab.tsx',
  'next-app/src/app/admin/components/PaymentsTab.tsx',
  'next-app/src/app/admin/components/LogsTab.tsx',
  'next-app/src/app/admin/components/CrudTab.tsx',
  'next-app/src/app/admin/page.tsx',
  'next-app/tests/admin_client.test.ts',
  'next-app/tests/admin_guard.test.ts'
];

console.log('====================================================');
console.log('CHECK 1: EMOJI DETECTION (STRICT ZERO-EMOJI AUDIT)');
console.log('====================================================');
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}]/u;

let emojiFailures = 0;
for (const relPath of files) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[MISSING] ${relPath}`);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  let found = 0;
  lines.forEach((line, idx) => {
    const match = line.match(emojiRegex);
    if (match) {
      console.log(`[FAIL] Emoji detected in ${relPath}:${idx + 1} -> '${match[0]}' in: ${line.trim()}`);
      found++;
      emojiFailures++;
    }
  });
  if (found === 0) {
    console.log(`[PASS] Zero emojis in ${relPath}`);
  }
}
console.log(`Summary: ${emojiFailures} total emoji violations found.\n`);

console.log('====================================================');
console.log('CHECK 2: HARDCODED TEST TAUTOLOGIES & EMPTY ASSERTIONS');
console.log('====================================================');
const testFiles = ['next-app/tests/admin_client.test.ts', 'next-app/tests/admin_guard.test.ts'];
const tautologyPatterns = [
  /expect\s*\(\s*true\s*\)\s*\.\s*toBe\s*\(\s*true\s*\)/i,
  /expect\s*\(\s*false\s*\)\s*\.\s*toBe\s*\(\s*false\s*\)/i,
  /expect\s*\(\s*1\s*\)\s*\.\s*toBe\s*\(\s*1\s*\)/i,
  /expect\s*\(\s*0\s*\)\s*\.\s*toBe\s*\(\s*0\s*\)/i,
  /expect\s*\(\s*["'][\w\s]+["']\s*\)\s*\.\s*toBe\s*\(\s*["']\1["']\s*\)/i,
];

let tautologyFailures = 0;
for (const relPath of testFiles) {
  const fullPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  let found = 0;
  lines.forEach((line, idx) => {
    for (const pat of tautologyPatterns) {
      if (pat.test(line)) {
        console.log(`[FAIL] Tautology cheat in ${relPath}:${idx + 1} -> ${line.trim()}`);
        found++;
        tautologyFailures++;
      }
    }
  });
  if (found === 0) {
    console.log(`[PASS] No tautological cheats in ${relPath}`);
  }
}
console.log(`Summary: ${tautologyFailures} tautology violations found.\n`);

console.log('====================================================');
console.log('CHECK 3: RUNTIME PRODUCTION MOCK / DUMMY LEAKAGE');
console.log('====================================================');
const runtimeFiles = files.filter(f => !f.startsWith('next-app/tests/'));
const mockKeywords = [
  'mockData',
  'dummyData',
  'fakeData',
  'testData',
  'hardcoded',
  'placeholderData',
  'stubData',
  'mockResponse',
  'dummyResponse',
];

let mockLeakageCount = 0;
for (const relPath of runtimeFiles) {
  const fullPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  let found = 0;
  lines.forEach((line, idx) => {
    for (const kw of mockKeywords) {
      if (line.includes(kw)) {
        console.log(`[FLAG] ${relPath}:${idx + 1} contains '${kw}': ${line.trim()}`);
        found++;
        mockLeakageCount++;
      }
    }
  });
  if (found === 0) {
    console.log(`[PASS] No mock/dummy keywords in ${relPath}`);
  }
}
console.log(`Summary: ${mockLeakageCount} mock/dummy keyword occurrences found in runtime code.\n`);

console.log('====================================================');
console.log('CHECK 4: PRE-POPULATED RESULT ARTIFACTS IN WORKSPACE');
console.log('====================================================');
const artifactDirs = ['next-app'];
let staleArtifacts = 0;
function scanArtifacts(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanArtifacts(full);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.log') || entry.name.includes('test-result') || entry.name.includes('attestation')) {
        console.log(`[FLAG] Stale/pre-populated artifact detected: ${full}`);
        staleArtifacts++;
      }
    }
  }
}
scanArtifacts(path.join(rootDir, 'next-app'));
console.log(`Summary: ${staleArtifacts} pre-populated test artifacts detected.\n`);

console.log('====================================================');
console.log('CHECK 5: NON-ASCII CHARACTER ANALYSIS');
console.log('====================================================');
let nonAsciiCount = 0;
for (const relPath of files) {
  const fullPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const ch of line) {
      const code = ch.codePointAt(0);
      if (code > 127) {
        console.log(`Non-ASCII: ${relPath}:${idx + 1} -> '${ch}' (U+${code.toString(16).toUpperCase().padStart(4, '0')})`);
        nonAsciiCount++;
      }
    }
  });
}
console.log(`Summary: ${nonAsciiCount} total non-ASCII characters found.\n`);
