const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const nextAppDir = path.join(projectRoot, 'next-app');

// Target directories and files for admin dashboard & testing
const targets = [
  path.join(nextAppDir, 'src', 'app', 'admin'),
  path.join(nextAppDir, 'src', 'app', 'api', 'admin'),
  path.join(nextAppDir, 'src', 'lib', 'admin'),
  path.join(nextAppDir, 'src', 'lib', 'services', 'adminClient.ts'),
  path.join(nextAppDir, 'tests', 'api', 'admin_metrics.test.ts'),
  path.join(nextAppDir, 'tests', 'api', 'admin_auth.test.ts'),
  path.join(nextAppDir, 'tests', 'api', 'admin_users.test.ts'),
  path.join(nextAppDir, 'tests', 'api', 'admin_payments.test.ts'),
  path.join(nextAppDir, 'tests', 'api', 'admin_logs.test.ts'),
  path.join(nextAppDir, 'tests', 'api', 'admin_crud.test.ts'),
  path.join(nextAppDir, 'tests', 'admin_client.test.ts'),
  path.join(nextAppDir, 'tests', 'admin_guard.test.ts'),
  path.join(projectRoot, 'supabase', 'migrations', '20261109_admin_dashboard_backend.sql'),
];

function getAllFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  let results = [];
  const list = fs.readdirSync(targetPath);
  for (const item of list) {
    const fullPath = path.join(targetPath, item);
    const itemStat = fs.statSync(fullPath);
    if (itemStat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else if (itemStat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx') || item.endsWith('.css') || item.endsWith('.sql'))) {
      results.push(fullPath);
    }
  }
  return results;
}

let allFiles = [];
for (const t of targets) {
  allFiles = allFiles.concat(getAllFiles(t));
}
allFiles = Array.from(new Set(allFiles));

console.log(`Auditing ${allFiles.length} files...`);

// Emoji regex
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}]/u;

// Tautology regexes
const tautologyPatterns = [
  /expect\s*\(\s*true\s*\)\s*\.\s*toBe\s*\(\s*true\s*\)/i,
  /expect\s*\(\s*false\s*\)\s*\.\s*toBe\s*\(\s*false\s*\)/i,
  /expect\s*\(\s*1\s*\)\s*\.\s*toBe\s*\(\s*1\s*\)/i,
  /expect\s*\(\s*0\s*\)\s*\.\s*toBe\s*\(\s*0\s*\)/i,
  /expect\s*\(\s*(['"`])(.*?)\1\s*\)\s*\.\s*toBe\s*\(\s*\1\2\1\s*\)/i,
  /expect\s*\(\s*(\w+)\s*\)\s*\.\s*toBe\s*\(\s*\1\s*\)/i,
];

// ESLint / TS suppression patterns
const suppressionPatterns = [
  /eslint-disable/,
  /@ts-ignore/,
  /@ts-nocheck/,
];

let emojiViolations = [];
let tautologyViolations = [];
let suppressionViolations = [];
let explicitAnyViolations = [];

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Check Emoji
    if (emojiRegex.test(line)) {
      emojiViolations.push({ file: relPath, lineNum, text: line.trim() });
    }

    // Check Tautologies in tests
    if (file.includes('test')) {
      for (const pattern of tautologyPatterns) {
        if (pattern.test(line)) {
          tautologyViolations.push({ file: relPath, lineNum, text: line.trim() });
        }
      }
    }

    // Check suppressions in production code
    if (!file.includes('test') && !file.endsWith('.sql')) {
      for (const sup of suppressionPatterns) {
        if (sup.test(line)) {
          suppressionViolations.push({ file: relPath, lineNum, text: line.trim() });
        }
      }

      // Check explicit any in src/app/api/admin and src/lib/admin
      if ((file.includes('src/app/api/admin') || file.includes('src/lib/admin')) && /\bas\s+any\b|:\s*any\b/.test(line)) {
        explicitAnyViolations.push({ file: relPath, lineNum, text: line.trim() });
      }
    }
  });
}

console.log('\n--- SCAN RESULTS ---');
console.log(`Total files scanned: ${allFiles.length}`);
console.log(`Emoji violations: ${emojiViolations.length}`);
if (emojiViolations.length > 0) {
  console.log(JSON.stringify(emojiViolations, null, 2));
}

console.log(`Tautology violations: ${tautologyViolations.length}`);
if (tautologyViolations.length > 0) {
  console.log(JSON.stringify(tautologyViolations, null, 2));
}

console.log(`Suppression violations (eslint-disable, @ts-ignore): ${suppressionViolations.length}`);
if (suppressionViolations.length > 0) {
  console.log(JSON.stringify(suppressionViolations, null, 2));
}

console.log(`Explicit any violations in admin code: ${explicitAnyViolations.length}`);
if (explicitAnyViolations.length > 0) {
  console.log(JSON.stringify(explicitAnyViolations, null, 2));
}
