import { CompanionEmote, CompanionMood, CompanionSpecies } from './types';

/**
 * Hand-written proactive lines. Most unprompted chatter comes from here so the
 * companion feels alive without spending AI quota. `{owner}`, `{zone}` and
 * `{name}` are filled in by `fillLine`.
 */
export type CompanionEventType =
  | 'greet'
  | 'welcome_back'
  | 'zone_enter'
  | 'friend_nearby'
  | 'wake_up'
  | 'fall_asleep'
  | 'long_session'
  | 'late_night'
  | 'tapped'
  | 'guide_arrived'
  | 'reminder_due';

export interface LineTemplate {
  text: string;
  emote?: CompanionEmote;
  mood?: CompanionMood;
}

const COMMON: Record<CompanionEventType, LineTemplate[]> = {
  greet: [
    { text: 'Hey {owner}! Where are we off to?', emote: 'exclaim', mood: 'excited' },
    { text: 'There you are, {owner}!', emote: 'heart', mood: 'happy' },
    { text: 'Ready when you are, {owner}.', mood: 'happy' },
  ],
  welcome_back: [
    { text: '{owner}! I missed you. Where were you?', emote: 'heart', mood: 'excited' },
    { text: 'You\'re back! I kept your spot warm.', emote: 'heart', mood: 'happy' },
  ],
  zone_enter: [
    { text: 'Ooh, {zone}.', emote: 'sparkle', mood: 'curious' },
    { text: '{zone}! I like it here.', mood: 'happy' },
    { text: 'Welcome to {zone}, tour guide mode on.', emote: 'sparkle', mood: 'curious' },
  ],
  friend_nearby: [
    { text: 'Psst, {name} is right there. Say hi?', emote: 'exclaim', mood: 'excited' },
    { text: 'Is that {name}? Wave!', emote: 'exclaim', mood: 'happy' },
  ],
  wake_up: [
    { text: '*yawn* Oh! You\'re back.', emote: 'exclaim', mood: 'happy' },
    { text: 'Wha—? I wasn\'t sleeping. Okay, a little.', mood: 'sleepy' },
  ],
  fall_asleep: [
    { text: 'Gonna rest my eyes for a sec...', emote: 'zzz', mood: 'sleepy' },
  ],
  long_session: [
    { text: 'We\'ve been out a while, {owner}. Water break?', emote: 'question', mood: 'calm' },
    { text: 'Quick stretch? I\'ll guard the spot.', mood: 'calm' },
  ],
  late_night: [
    { text: 'It\'s getting late, {owner}... I\'m yawning for both of us.', emote: 'zzz', mood: 'sleepy' },
  ],
  tapped: [
    { text: 'Hehe, that tickles!', emote: 'laugh', mood: 'happy' },
    { text: 'Need something? Open chat and tell me.', emote: 'question', mood: 'curious' },
    { text: 'Boop received.', emote: 'heart', mood: 'happy' },
  ],
  guide_arrived: [
    { text: 'Here we are, {zone}!', emote: 'sparkle', mood: 'proud' },
    { text: 'Ta-da! {zone}.', emote: 'sparkle', mood: 'proud' },
  ],
  reminder_due: [{ text: 'Hey {owner}, you asked me to remind you: {name}', emote: 'exclaim', mood: 'curious' }],
};

/** A few species-flavoured extras mixed into the common pool. */
const SPECIES_EXTRAS: Partial<Record<CompanionSpecies, Partial<Record<CompanionEventType, LineTemplate[]>>>> = {
  cat: {
    greet: [{ text: 'Mrrp! Hi {owner}.', emote: 'heart', mood: 'happy' }],
    tapped: [{ text: 'Purrrr.', emote: 'heart', mood: 'happy' }],
    zone_enter: [{ text: '{zone}... any sunny spots for a nap?', mood: 'curious' }],
  },
  robot: {
    greet: [{ text: 'Beep! Owner detected: {owner}.', emote: 'exclaim', mood: 'excited' }],
    tapped: [{ text: 'Beep boop. Systems happy.', emote: 'music', mood: 'happy' }],
    zone_enter: [{ text: 'Scanning {zone}... verdict: cool.', emote: 'sparkle', mood: 'curious' }],
  },
  dog: {
    greet: [{ text: '{owner}!! Best day ever!', emote: 'heart', mood: 'excited' }],
    tapped: [{ text: '*wags tail*', emote: 'heart', mood: 'excited' }],
    zone_enter: [{ text: 'New smells in {zone}!', emote: 'exclaim', mood: 'excited' }],
  },
  wisp: {
    greet: [{ text: 'Hello, {owner}. The air feels brighter.', emote: 'sparkle', mood: 'calm' }],
    tapped: [{ text: '*glows softly*', emote: 'sparkle', mood: 'calm' }],
    zone_enter: [{ text: '{zone} hums with a quiet magic.', emote: 'sparkle', mood: 'calm' }],
  },
};

/** Zombie Survival replacements: tense and tactical instead of cozy. */
const SURVIVAL: Partial<Record<CompanionEventType, LineTemplate[]>> = {
  greet: [
    { text: "Stay close, {owner}. Something's moving out there.", emote: 'exclaim', mood: 'worried' },
    { text: "Okay {owner}, eyes open. Let's find a building to hole up in.", mood: 'worried' },
  ],
  welcome_back: [{ text: "You made it back! I kept watch the whole time.", emote: 'heart', mood: 'worried' }],
  zone_enter: [
    { text: "{zone}... quiet. Too quiet.", emote: 'question', mood: 'worried' },
    { text: "Careful in {zone}. Check the corners.", emote: 'exclaim', mood: 'worried' },
    { text: "{zone}. Look for supplies, then keep moving.", mood: 'curious' },
  ],
  friend_nearby: [{ text: "{name} is close! Stick together, safer in a group.", emote: 'exclaim', mood: 'excited' }],
  wake_up: [{ text: "Huh! Still alive? Good. Let's move.", emote: 'exclaim', mood: 'worried' }],
  fall_asleep: [{ text: "I'll just... rest my eyes. Wake me if they come.", emote: 'zzz', mood: 'sleepy' }],
  tapped: [
    { text: "Shh! Noise brings them.", emote: 'exclaim', mood: 'worried' },
    { text: "I've got your back.", emote: 'heart', mood: 'proud' },
  ],
  long_session: [{ text: "We've survived a long time. Quick break while it's calm?", mood: 'calm' }],
  late_night: [{ text: "Dark out there AND it's late for real. Spooky combo.", emote: 'zzz', mood: 'worried' }],
  guide_arrived: [{ text: "Made it to {zone}. Barricade up?", emote: 'sparkle', mood: 'proud' }],
};

export function getLinePool(species: CompanionSpecies, event: CompanionEventType, survival = false): LineTemplate[] {
  if (survival && SURVIVAL[event]) return SURVIVAL[event] as LineTemplate[];
  return [...COMMON[event], ...(SPECIES_EXTRAS[species]?.[event] ?? [])];
}

export function fillLine(text: string, vars: { owner?: string; zone?: string; name?: string }): string {
  return text
    .replace(/\{owner\}/g, vars.owner || 'friend')
    .replace(/\{zone\}/g, vars.zone || 'here')
    .replace(/\{name\}/g, vars.name || 'someone');
}

/** Pick a line, avoiding an immediate repeat of the previous pick. */
export function pickLine(
  species: CompanionSpecies,
  event: CompanionEventType,
  vars: { owner?: string; zone?: string; name?: string },
  random: () => number = Math.random,
  avoid?: string,
  survival = false
): LineTemplate {
  const pool = getLinePool(species, event, survival);
  let choice = pool[Math.floor(random() * pool.length) % pool.length];
  if (pool.length > 1 && avoid && choice.text === avoid) {
    choice = pool[(pool.indexOf(choice) + 1) % pool.length];
  }
  return { ...choice, text: fillLine(choice.text, vars) };
}
