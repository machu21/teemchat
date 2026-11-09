/**
 * Lightweight, whole-word profanity filter for chat, speech bubbles, DMs and names.
 *
 * Matching is per word (so "class", "assess" or "Scunthorpe" pass), after undoing
 * common evasions: leetspeak (sh1t, @ss), inner punctuation (f.u.c.k), stretched
 * letters (fuuuck) and letters spaced out across words (f u c k).
 */

const BASE_WORDS = [
  'anal', 'anus', 'arse', 'arsehole', 'ass', 'asshat', 'asshole', 'bastard', 'bitch', 'bollocks',
  'boner', 'boob', 'boobs', 'bullshit', 'butthole', 'clit', 'cock', 'cocksucker', 'cum', 'cunt',
  'dick', 'dickhead', 'dildo', 'douche', 'douchebag', 'dyke', 'fag', 'faggot', 'fck', 'fuck',
  'fucker', 'fuckface', 'fuckhead', 'fucking', 'fuckin', 'fuk', 'bitchy', 'pissy', 'cumming', 'goddamn', 'handjob', 'jackass', 'jizz', 'kike',
  'milf', 'motherfucker', 'nigga', 'nigger', 'nude', 'nudes', 'orgasm', 'penis', 'piss', 'porn',
  'porno', 'prick', 'pussy', 'rape', 'rapist', 'retard', 'retarded', 'schlong', 'sex', 'sexy',
  'shit', 'shithead', 'shitty', 'slut', 'spic', 'stfu', 'tits', 'titties', 'twat', 'vagina',
  'wank', 'wanker', 'whore', 'wtf', 'kys',
];

// Kept short on purpose: 'y', 'er' or 'in' would catch "cocky", "cocker", "cumin".
const SUFFIXES = ['', 's', 'es', 'ed', 'ing'];

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '€': 'e',
};

const BAD = new Set(BASE_WORDS);

function isBadCore(word: string): boolean {
  if (word.length < 2) return false;
  for (const suffix of SUFFIXES) {
    if (suffix && !word.endsWith(suffix)) continue;
    const stem = suffix ? word.slice(0, -suffix.length) : word;
    // "es" only after s/sh/ch/x ("asses", "bitches") so "spices" stays clean.
    if (suffix === 'es' && !/(s|sh|ch|x)$/.test(stem)) continue;
    if (stem.length >= 2 && BAD.has(stem)) return true;
  }
  return false;
}

/** Lowercase, undo leetspeak and drop everything that is not a letter. */
export function normalizeWord(raw: string): string {
  // Edge punctuation ("shit!", "(ass)") is not leetspeak; inner symbols ("sh!t", "a$$") are.
  const trimmed = raw.replace(/^[^a-z0-9@$]+|[^a-z0-9@$]+$/gi, '');
  let out = '';
  for (const ch of trimmed.toLowerCase()) {
    const mapped = LEET[ch] ?? ch;
    if (/[a-z]/.test(mapped)) out += mapped;
  }
  return out;
}

function isBadWord(raw: string): boolean {
  const word = normalizeWord(raw);
  if (!word) return false;
  if (isBadCore(word)) return true;
  // Stretched letters: try runs of 3+ collapsed to two, then any run collapsed to one.
  const two = word.replace(/(.)\1{2,}/g, '$1$1');
  if (two !== word && isBadCore(two)) return true;
  const one = word.replace(/(.)\1+/g, '$1');
  if (one !== word && isBadCore(one)) return true;
  return false;
}

const MASK = '★';

function mask(token: string): string {
  return token.replace(/[^\s]/g, MASK);
}

/** True when the text contains a filtered word. */
export function containsProfanity(text: string): boolean {
  return filterText(text) !== text;
}

/** Replaces filtered words with ★ characters, keeping whitespace and layout intact. */
export function filterText(text: string): string {
  if (!text) return text;
  // Split into alternating [word, whitespace, word, ...] so layout is preserved.
  const parts = text.split(/(\s+)/);
  const out = parts.slice();

  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i] && isBadWord(parts[i])) out[i] = mask(parts[i]);
  }

  // Letters spaced across words: "f u c k" / "s h i t". Look at runs of 1-char words.
  let i = 0;
  while (i < parts.length) {
    if (parts[i] && normalizeWord(parts[i]).length === 1 && parts[i].length <= 2) {
      let j = i;
      let joined = '';
      while (j < parts.length && parts[j] && normalizeWord(parts[j]).length === 1 && parts[j].length <= 2) {
        joined += normalizeWord(parts[j]);
        j += 2;
      }
      if (j - i >= 6 && isBadWord(joined)) {
        for (let k = i; k < j; k += 2) out[k] = mask(parts[k]);
      }
      i = j;
    } else {
      i += 2;
    }
  }

  return out.join('');
}
