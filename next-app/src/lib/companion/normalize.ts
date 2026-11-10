import {
  COMPANION_ACTION_TYPES,
  COMPANION_EMOTES,
  COMPANION_MOODS,
  CompanionAction,
  CompanionEmote,
  CompanionMood,
  CompanionProfile,
  CompanionReply,
  CompanionSpecies,
  CompanionTraits,
  DEFAULT_TRAITS,
  WorldContext,
} from './types';

/** Legacy `companion_type` values in the schema map onto the four sprite species. */
const SPECIES_ALIASES: Record<string, CompanionSpecies> = {
  cat: 'cat',
  cyber_cat: 'cat',
  robot: 'robot',
  bot: 'robot',
  dog: 'dog',
  retro_dog: 'dog',
  wisp: 'wisp',
  mystic_wisp: 'wisp',
};

export function normalizeSpecies(value: unknown): CompanionSpecies {
  if (typeof value !== 'string') return 'cat';
  return SPECIES_ALIASES[value.toLowerCase()] ?? 'cat';
}

export function normalizeMood(value: unknown, fallback: CompanionMood = 'happy'): CompanionMood {
  return typeof value === 'string' && (COMPANION_MOODS as readonly string[]).includes(value)
    ? (value as CompanionMood)
    : fallback;
}

export function normalizeEmote(value: unknown): CompanionEmote {
  return typeof value === 'string' && (COMPANION_EMOTES as readonly string[]).includes(value)
    ? (value as CompanionEmote)
    : 'none';
}

const clamp01 = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;

export function normalizeTraits(value: unknown): CompanionTraits {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof CompanionTraits, unknown>>;
  return {
    playful: clamp01(v.playful, DEFAULT_TRAITS.playful),
    curious: clamp01(v.curious, DEFAULT_TRAITS.curious),
    sassy: clamp01(v.sassy, DEFAULT_TRAITS.sassy),
    calm: clamp01(v.calm, DEFAULT_TRAITS.calm),
  };
}

/** Strip control chars / newlines and cap length so a value can sit on one prompt line. */
export function oneLine(value: unknown, max = 120): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Row from `ai_companions` → CompanionProfile. */
export function companionFromRow(row: Record<string, unknown>): CompanionProfile {
  const tour = row.tour_progress && typeof row.tour_progress === 'object' ? row.tour_progress : {};
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: oneLine(row.name, 32) || 'Pixel Cat',
    persona: oneLine(row.persona, 400),
    species: normalizeSpecies(row.companion_type),
    avatarStyle: oneLine(row.avatar_style, 32) || 'default',
    traits: normalizeTraits(row.traits),
    mood: normalizeMood(row.mood),
    bondXp: typeof row.bond_xp === 'number' ? Math.max(0, Math.floor(row.bond_xp)) : 0,
    nicknameForOwner: oneLine(row.nickname_for_owner, 32) || null,
    lastSeenOwnerAt: typeof row.last_seen_owner_at === 'string' ? row.last_seen_owner_at : null,
    tourProgress: Object.fromEntries(
      Object.entries(tour as Record<string, unknown>).map(([k, v]) => [k, Boolean(v)])
    ),
  };
}

/** Client-supplied world snapshot → bounded, single-line values only. */
export function normalizeWorldContext(value: unknown): WorldContext {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const names = (list: unknown) =>
    Array.isArray(list) ? list.map((n) => oneLine(n, 24)).filter(Boolean).slice(0, 6) : undefined;
  const time = typeof v.localTime === 'string' && /^\d{1,2}:\d{2}$/.test(v.localTime) ? v.localTime : undefined;
  const day = typeof v.localDay === 'number' && v.localDay >= 0 && v.localDay <= 6 ? Math.floor(v.localDay) : undefined;
  const secs =
    typeof v.sessionSeconds === 'number' && Number.isFinite(v.sessionSeconds)
      ? Math.min(Math.max(0, Math.floor(v.sessionSeconds)), 86400)
      : undefined;
  const places = Array.isArray(v.places)
    ? v.places
        .map((p) => {
          const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
          return { id: oneLine(o.id, 32), name: oneLine(o.name, 48) };
        })
        .filter((p) => p.id && p.name)
        .slice(0, 16)
    : undefined;
  return {
    mapName: oneLine(v.mapName, 48) || undefined,
    mode: v.mode === 'zombie' ? 'zombie' : v.mode === 'social' ? 'social' : undefined,
    places: places && places.length ? places : undefined,
    zone: oneLine(v.zone, 48) || undefined,
    activity: oneLine(v.activity, 32) || undefined,
    nearbyNames: names(v.nearbyNames),
    onlineFriendNames: names(v.onlineFriendNames),
    localTime: time,
    localDay: day,
    sessionSeconds: secs,
  };
}

function normalizeAction(value: unknown): CompanionAction | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== 'string' || !(COMPANION_ACTION_TYPES as readonly string[]).includes(v.type)) return null;
  const action: CompanionAction = { type: v.type as CompanionAction['type'] };
  const target = oneLine(v.target, 140);
  if (target) action.target = target;
  if (typeof v.minutes === 'number' && Number.isFinite(v.minutes)) {
    action.minutes = Math.min(Math.max(1, Math.round(v.minutes)), 60 * 24 * 7);
  }
  return action;
}

export function normalizeActions(value: unknown): CompanionAction[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAction).filter((a): a is CompanionAction => a !== null).slice(0, 2);
}

/**
 * Attempt to extract the "text" field from truncated or unclosed JSON.
 */
function extractPartialText(raw: string): string | null {
  const match = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (match && match[1]) {
    try {
      return JSON.parse(`"${match[1]}"`);
    } catch {
      return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    }
  }
  return null;
}

// An emoji sequence (with skin tones / ZWJ joins), a flag letter or a stray variation selector, plus one space before it
const EMOJI_SEQUENCE =
  / ?(?:(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*|[\u{1F1E6}-\u{1F1FF}]|\uFE0F)/gu;

/** The app uses its own icons (no emoji), so strip any the model sends anyway. Keeps other whitespace (code indentation). */
export function stripEmoji(s: string): string {
  return s.replace(EMOJI_SEQUENCE, '').trim();
}

/**
 * Parse the model's JSON reply. Recovers gracefully from truncated or
 * unclosed JSON so raw JSON syntax is never displayed to the user.
 */
export function parseCompanionReply(raw: string | undefined | null, fallbackMood: CompanionMood): CompanionReply {
  const text = stripEmoji(raw ?? '');
  const defaultMessage = "I'm right beside you! Let's explore together!";
  if (!text) {
    return {
      text: defaultMessage,
      mood: fallbackMood,
      emote: 'none',
      actions: [],
    };
  }

  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

  // 1. Try normal JSON parsing between the first { and last }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      const reply = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      if (reply) {
        return {
          text: reply.slice(0, 4000),
          mood: normalizeMood(parsed.mood, fallbackMood),
          emote: normalizeEmote(parsed.emote),
          actions: normalizeActions(parsed.actions),
        };
      }
    } catch {
      // Fall through to salvage partial text or clean fallback
    }
  }

  // 2. Salvage partial text if JSON was cut off mid-stream
  const partial = extractPartialText(cleaned);
  if (partial && partial.trim()) {
    return {
      text: partial.trim().slice(0, 4000),
      mood: fallbackMood,
      emote: 'none',
      actions: [],
    };
  }

  // 3. If raw text itself is not JSON, use it directly; otherwise use friendly default
  const looksLikeJson = /^\s*\{/.test(cleaned);
  return {
    text: (!looksLikeJson && text) ? text : defaultMessage,
    mood: fallbackMood,
    emote: 'none',
    actions: [],
  };
}
