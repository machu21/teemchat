import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseCompanionReply, stripEmoji } from '@/lib/companion/normalize';
import { toIconName } from '@/lib/icons';

// ============================================================
// NO EMOJI (see CLAUDE.md → "No emoji")
// The app uses line icons (src/lib/icons → <AppIcon /> / drawIcon()) instead
// of emoji or symbol glyphs. This scans every source file (comments
// stripped) and fails with the offending lines.
// ============================================================

/**
 * Banned: emoji (Extended_Pictographic, except ©®™), the emoji variation
 * selector, and symbol glyphs used as icons — arrows, geometric shapes
 * (▶ ◀ ●), misc symbols & dingbats (★ ♥ ♪ ✓ ✕), media controls (⏸ ⏹).
 * Allowed: ordinary typography such as · • … — – ×.
 */
const BANNED =
  /(?![©®™])\p{Extended_Pictographic}|️|[←-⇿⌀-⏿■-◿☀-➿⟰-⟿⤀-⥿⬀-⯿]/u;

const ROOT = path.resolve(__dirname, '../src');
const EXTENSIONS = /\.(tsx?|css)$/;

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')) // keep line numbers
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (EXTENSIONS.test(e.name) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

describe('no emoji in the app', () => {
  it('source files use icons, not emoji or symbol glyphs', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        const m = BANNED.exec(line);
        if (m) offenders.push(`${path.relative(ROOT, file).split(path.sep).join('/')}:${i + 1}  ${JSON.stringify(m[0])}  ${line.trim().slice(0, 90)}`);
      });
    }
    expect(offenders, `Use <AppIcon name="…" /> or drawIcon() instead:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the guard catches emoji and icon symbols but allows typography', () => {
    for (const bad of ['\u{1F9DF}', '☀', '→', '▶', '✓', '★', '⏸', '\u{1F44B}']) expect(BANNED.test(bad), bad).toBe(true);
    for (const ok of ['·', '•', '…', '—', '×', '©', 'abc']) expect(BANNED.test(ok), ok).toBe(false);
  });

  it('companion replies are stripped of emoji, keeping code indentation', () => {
    expect(stripEmoji('Hi \u{1F44B} there!')).toBe('Hi there!');
    expect(stripEmoji('\u{1F468}‍\u{1F4BB} Coding time ❤️')).toBe('Coding time');
    expect(stripEmoji('if (a) {\n    go();\n}')).toBe('if (a) {\n    go();\n}');
    expect(parseCompanionReply('{"text":"Nice \u{1F525}","mood":"happy"}', 'happy').text).toBe('Nice');
  });

  it('legacy emoji stored as squad icons map to icon names', () => {
    expect(toIconName('\u{1F680}')).toBe('rocket');
    expect(toIconName('rocket')).toBe('rocket');
    expect(toIconName(null, 'users')).toBe('users');
    expect(toIconName('not-an-icon')).toBe('logo');
  });
});
