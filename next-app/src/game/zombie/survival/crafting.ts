import type { SkillId, SkillSet } from './skills';
import { SKILLS } from './skills';
import type { StructureKind } from './structures';
import type { ItemDefId } from './types';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — CRAFTING (pure)
// Each recipe lists materials (used up), tools (kept, any one of each
// group), a skill level, whether it needs a workbench, how long it
// takes, and what it makes: items, or a structure you then place in the
// world. Most recipes are known from the start; some are learned from
// recipe magazines. Crafting trains the recipe's skill.
// ============================================================

export type MagazineId = 'metalwork' | 'electronics' | 'tailoring';

export const MAGAZINES: Record<MagazineId, { name: string; description: string }> = {
  metalwork: { name: 'Metalwork Magazine', description: 'Teaches metal walls and pipe weapons.' },
  electronics: { name: 'Electronics Magazine', description: 'Teaches how to build a noise maker.' },
  tailoring: { name: 'Sewing Magazine', description: 'Teaches how to sew a bag from rags.' },
};

export type RecipeCategory = 'Carpentry' | 'Metalworking' | 'Electrical' | 'Tailoring' | 'Medical' | 'Cooking' | 'Outdoors';

export type RecipeId =
  | 'tear_rags'
  | 'rag_bandage'
  | 'splint'
  | 'sew_bag'
  | 'plank_club'
  | 'crate'
  | 'workbench'
  | 'fence'
  | 'wood_wall'
  | 'wood_door'
  | 'metal_sheet'
  | 'metal_pipe'
  | 'metal_wall'
  | 'dismantle_radio'
  | 'noise_maker'
  | 'boil_water'
  | 'cook_meat'
  | 'make_soup'
  | 'campfire'
  | 'rain_collector'
  | 'place_generator'
  | 'farm_plot'
  | 'snare_trap'
  | 'fishing_rod'
  | 'stone_campfire'
  | 'cook_fish'
  | 'butcher'
  | 'vegetable_stew'
  | 'salad';

export interface Recipe {
  id: RecipeId;
  name: string;
  category: RecipeCategory;
  icon: IconName;
  description: string;
  /** Used up. `alt`: other items that count the same (any fish, any small animal). */
  inputs: RecipeInput[];
  /** Kept; each group needs any one of its tools. */
  tools: ItemDefId[][];
  skill?: { id: SkillId; level: number };
  workbench?: boolean;
  /** Needs a working stove or a burning campfire close by (cooking). */
  heat?: boolean;
  seconds: number;
  /** Items made, or a structure to place. */
  output: { items: { def: ItemDefId; qty: number }[] } | { structure: StructureKind };
  /** XP for the recipe's skill when it's done. */
  xp: { skill: SkillId; amount: number };
  /** Must be learned from this magazine first. */
  magazine?: MagazineId;
}

export interface RecipeInput {
  def: ItemDefId;
  qty: number;
  alt?: ItemDefId[];
}

const HAMMER: ItemDefId[] = ['weapon:hammer'];
const FISH: ItemDefId[] = ['fish_perch', 'fish_carp', 'fish_catfish'];
const GAME: ItemDefId[] = ['dead_squirrel', 'dead_bird', 'dead_rat'];

export const RECIPES: Record<RecipeId, Recipe> = {
  tear_rags: {
    id: 'tear_rags', name: 'Rip into rags', category: 'Tailoring', icon: 'shirt', description: 'Tear a hoodie into rags.',
    inputs: [{ def: 'hoodie', qty: 1 }], tools: [], seconds: 2, output: { items: [{ def: 'rags', qty: 4 }] }, xp: { skill: 'tailoring', amount: 2 },
  },
  rag_bandage: {
    id: 'rag_bandage', name: 'Rag bandage', category: 'Medical', icon: 'bandage', description: 'Fold rags into a bandage.',
    inputs: [{ def: 'rags', qty: 2 }], tools: [], seconds: 2, output: { items: [{ def: 'bandage', qty: 1 }] }, xp: { skill: 'firstAid', amount: 2 },
  },
  splint: {
    id: 'splint', name: 'Splint', category: 'Medical', icon: 'bone', description: 'Bind a plank with rags into a splint.',
    inputs: [{ def: 'planks', qty: 1 }, { def: 'rags', qty: 2 }], tools: [], skill: { id: 'firstAid', level: 1 }, seconds: 3, output: { items: [{ def: 'splint', qty: 1 }] }, xp: { skill: 'firstAid', amount: 4 },
  },
  sew_bag: {
    id: 'sew_bag', name: 'Sewn bag', category: 'Tailoring', icon: 'backpack', description: 'Sew rags into a school bag.',
    inputs: [{ def: 'rags', qty: 6 }, { def: 'thread', qty: 2 }], tools: [], skill: { id: 'tailoring', level: 2 }, seconds: 8, output: { items: [{ def: 'school_bag', qty: 1 }] }, xp: { skill: 'tailoring', amount: 12 }, magazine: 'tailoring',
  },
  plank_club: {
    id: 'plank_club', name: 'Plank club', category: 'Carpentry', icon: 'plank', description: 'Saw a plank into something to hit with.',
    inputs: [{ def: 'planks', qty: 1 }], tools: [['saw']], seconds: 3, output: { items: [{ def: 'weapon:plank', qty: 1 }] }, xp: { skill: 'carpentry', amount: 3 },
  },
  crate: {
    id: 'crate', name: 'Wooden crate', category: 'Carpentry', icon: 'package', description: 'Storage that stays where you put it.',
    inputs: [{ def: 'planks', qty: 3 }, { def: 'nails', qty: 4 }], tools: [HAMMER], skill: { id: 'carpentry', level: 1 }, seconds: 0, output: { structure: 'crate' }, xp: { skill: 'carpentry', amount: 10 },
  },
  workbench: {
    id: 'workbench', name: 'Workbench', category: 'Carpentry', icon: 'hammer', description: 'Craft faster nearby. Metalwork needs one.',
    inputs: [{ def: 'planks', qty: 5 }, { def: 'nails', qty: 8 }], tools: [HAMMER, ['saw']], skill: { id: 'carpentry', level: 2 }, seconds: 0, output: { structure: 'workbench' }, xp: { skill: 'carpentry', amount: 15 },
  },
  fence: {
    id: 'fence', name: 'Fence', category: 'Carpentry', icon: 'fence', description: 'Stops zombies, not sight. Weak.',
    inputs: [{ def: 'planks', qty: 2 }, { def: 'nails', qty: 4 }], tools: [HAMMER], skill: { id: 'carpentry', level: 1 }, seconds: 0, output: { structure: 'fence' }, xp: { skill: 'carpentry', amount: 8 },
  },
  wood_wall: {
    id: 'wood_wall', name: 'Wooden wall', category: 'Carpentry', icon: 'wall', description: 'Blocks movement and sight. Zombies can batter it down.',
    inputs: [{ def: 'planks', qty: 3 }, { def: 'nails', qty: 6 }], tools: [HAMMER], skill: { id: 'carpentry', level: 2 }, seconds: 0, output: { structure: 'wood_wall' }, xp: { skill: 'carpentry', amount: 12 },
  },
  wood_door: {
    id: 'wood_door', name: 'Wooden door', category: 'Carpentry', icon: 'door', description: 'A door you can open, lock and board up.',
    inputs: [{ def: 'planks', qty: 4 }, { def: 'nails', qty: 8 }], tools: [HAMMER, ['screwdriver']], skill: { id: 'carpentry', level: 3 }, seconds: 0, output: { structure: 'wood_door' }, xp: { skill: 'carpentry', amount: 15 },
  },
  metal_sheet: {
    id: 'metal_sheet', name: 'Metal sheet', category: 'Metalworking', icon: 'shield', description: 'Weld scrap into a flat sheet.',
    inputs: [{ def: 'scrap_metal', qty: 3 }], tools: [['blowtorch']], workbench: true, seconds: 6, output: { items: [{ def: 'metal_sheet', qty: 1 }] }, xp: { skill: 'metalworking', amount: 8 },
  },
  metal_pipe: {
    id: 'metal_pipe', name: 'Metal pipe', category: 'Metalworking', icon: 'pipe', description: 'Weld a sturdy pipe to fight with.',
    inputs: [{ def: 'scrap_metal', qty: 2 }], tools: [['blowtorch']], workbench: true, skill: { id: 'metalworking', level: 1 }, seconds: 6, output: { items: [{ def: 'weapon:pipe', qty: 1 }] }, xp: { skill: 'metalworking', amount: 8 }, magazine: 'metalwork',
  },
  metal_wall: {
    id: 'metal_wall', name: 'Metal wall', category: 'Metalworking', icon: 'shield', description: 'Almost three times as tough as wood.',
    inputs: [{ def: 'metal_sheet', qty: 2 }, { def: 'scrap_metal', qty: 2 }], tools: [['blowtorch']], skill: { id: 'metalworking', level: 2 }, seconds: 0, output: { structure: 'metal_wall' }, xp: { skill: 'metalworking', amount: 20 }, magazine: 'metalwork',
  },
  dismantle_radio: {
    id: 'dismantle_radio', name: 'Take apart a radio', category: 'Electrical', icon: 'radio', description: 'Salvage parts and a battery.',
    inputs: [{ def: 'radio', qty: 1 }], tools: [['screwdriver']], seconds: 4, output: { items: [{ def: 'electronics_scrap', qty: 2 }, { def: 'battery', qty: 1 }] }, xp: { skill: 'electrical', amount: 6 },
  },
  noise_maker: {
    id: 'noise_maker', name: 'Noise maker', category: 'Electrical', icon: 'bellRing', description: 'A loud timed buzzer: drop it to pull zombies away.',
    inputs: [{ def: 'electronics_scrap', qty: 1 }, { def: 'battery', qty: 1 }, { def: 'duct_tape', qty: 1 }], tools: [['screwdriver']], skill: { id: 'electrical', level: 1 }, seconds: 5, output: { items: [{ def: 'noise_maker', qty: 1 }] }, xp: { skill: 'electrical', amount: 10 }, magazine: 'electronics',
  },
  // Phase 6: cooking needs heat (a stove with power, or a campfire)
  boil_water: {
    id: 'boil_water', name: 'Boil water', category: 'Cooking', icon: 'glassWater', description: 'Boil tainted water until it is safe to drink.',
    inputs: [{ def: 'tainted_water', qty: 1 }], tools: [], heat: true, seconds: 4, output: { items: [{ def: 'water_bottle', qty: 1 }] }, xp: { skill: 'cooking', amount: 3 },
  },
  cook_meat: {
    id: 'cook_meat', name: 'Cook meat', category: 'Cooking', icon: 'meat', description: 'Fry raw meat so it is safe and filling.',
    inputs: [{ def: 'raw_meat', qty: 1 }], tools: [], heat: true, seconds: 5, output: { items: [{ def: 'cooked_meat', qty: 1 }] }, xp: { skill: 'cooking', amount: 5 },
  },
  make_soup: {
    id: 'make_soup', name: 'Hot soup', category: 'Cooking', icon: 'soup', description: 'Beans and water into a warming soup. You keep the bottle.',
    inputs: [{ def: 'canned_beans', qty: 1 }, { def: 'water_bottle', qty: 1 }], tools: [], heat: true, skill: { id: 'cooking', level: 1 }, seconds: 6,
    output: { items: [{ def: 'hot_soup', qty: 1 }, { def: 'empty_bottle', qty: 1 }] }, xp: { skill: 'cooking', amount: 8 },
  },
  campfire: {
    id: 'campfire', name: 'Campfire', category: 'Cooking', icon: 'campfire', description: 'Light, warmth and somewhere to cook. Burns out; rain puts it out faster.',
    inputs: [{ def: 'planks', qty: 2 }], tools: [['lighter']], seconds: 0, output: { structure: 'campfire' }, xp: { skill: 'cooking', amount: 2 },
  },
  rain_collector: {
    id: 'rain_collector', name: 'Rain collector', category: 'Carpentry', icon: 'barrel', description: 'Catches rain outdoors. Boil what you collect.',
    inputs: [{ def: 'planks', qty: 3 }, { def: 'nails', qty: 4 }, { def: 'rags', qty: 2 }], tools: [HAMMER], skill: { id: 'carpentry', level: 2 }, seconds: 0,
    output: { structure: 'rain_collector' }, xp: { skill: 'carpentry', amount: 12 },
  },
  place_generator: {
    id: 'place_generator', name: 'Set up generator', category: 'Electrical', icon: 'generator', description: 'Wire a generator to power stoves, fuel pumps, lamps and alarms nearby.',
    inputs: [{ def: 'generator', qty: 1 }], tools: [['screwdriver']], skill: { id: 'electrical', level: 1 }, seconds: 0,
    output: { structure: 'generator' }, xp: { skill: 'electrical', amount: 12 },
  },
  // Phase 7: food production
  farm_plot: {
    id: 'farm_plot', name: 'Farm plot', category: 'Outdoors', icon: 'shovel', description: 'Dig a plot in grass or dirt outdoors. Plant seeds, keep it watered.',
    inputs: [], tools: [['shovel']], seconds: 0, output: { structure: 'farm_plot' }, xp: { skill: 'farming', amount: 4 },
  },
  snare_trap: {
    id: 'snare_trap', name: 'Snare trap', category: 'Outdoors', icon: 'rabbit', description: 'Set it on grass and leave it. Bait doubles your chances.',
    inputs: [{ def: 'branch', qty: 2 }, { def: 'thread', qty: 1, alt: ['rope'] }], tools: [], seconds: 0, output: { structure: 'snare_trap' }, xp: { skill: 'trapping', amount: 6 },
  },
  fishing_rod: {
    id: 'fishing_rod', name: 'Fishing rod', category: 'Outdoors', icon: 'fishingHook', description: 'A stick, a line and a bent nail.',
    inputs: [{ def: 'branch', qty: 1, alt: ['planks'] }, { def: 'thread', qty: 2 }, { def: 'nails', qty: 1 }], tools: [], seconds: 5,
    output: { items: [{ def: 'fishing_rod', qty: 1 }] }, xp: { skill: 'fishing', amount: 4 },
  },
  stone_campfire: {
    id: 'stone_campfire', name: 'Stone campfire', category: 'Outdoors', icon: 'campfire', description: 'A fire from foraged branches in a ring of stones.',
    inputs: [{ def: 'branch', qty: 3 }, { def: 'stone', qty: 3 }], tools: [['lighter']], seconds: 0, output: { structure: 'campfire' }, xp: { skill: 'foraging', amount: 2 },
  },
  cook_fish: {
    id: 'cook_fish', name: 'Cook fish', category: 'Cooking', icon: 'fish', description: 'Any fish (bar minnows) over the heat.',
    inputs: [{ def: 'fish_perch', qty: 1, alt: FISH.slice(1) }], tools: [], heat: true, seconds: 5, output: { items: [{ def: 'cooked_fish', qty: 1 }] }, xp: { skill: 'cooking', amount: 5 },
  },
  butcher: {
    id: 'butcher', name: 'Butcher', category: 'Cooking', icon: 'knife', description: 'Skin and cut up a trapped animal.',
    inputs: [{ def: 'dead_rabbit', qty: 1, alt: GAME }], tools: [['weapon:knife', 'weapon:axe']], seconds: 4, output: { items: [{ def: 'raw_meat', qty: 2 }] }, xp: { skill: 'trapping', amount: 3 },
  },
  vegetable_stew: {
    id: 'vegetable_stew', name: 'Vegetable stew', category: 'Cooking', icon: 'cookingPot', description: 'Carrot, potato and water. You keep the bottle.',
    inputs: [{ def: 'carrot', qty: 1 }, { def: 'potato', qty: 1 }, { def: 'water_bottle', qty: 1 }], tools: [], heat: true, skill: { id: 'cooking', level: 1 }, seconds: 6,
    output: { items: [{ def: 'vegetable_stew', qty: 1 }, { def: 'empty_bottle', qty: 1 }] }, xp: { skill: 'cooking', amount: 10 },
  },
  salad: {
    id: 'salad', name: 'Salad', category: 'Cooking', icon: 'cabbage', description: 'Tomato and cabbage, no fire needed.',
    inputs: [{ def: 'tomato', qty: 1 }, { def: 'cabbage', qty: 1 }], tools: [], seconds: 3, output: { items: [{ def: 'salad', qty: 1 }] }, xp: { skill: 'cooking', amount: 4 },
  },
};

export const RECIPE_ORDER: readonly RecipeId[] = Object.keys(RECIPES) as RecipeId[];
export const RECIPE_CATEGORIES: readonly RecipeCategory[] = ['Carpentry', 'Metalworking', 'Electrical', 'Tailoring', 'Medical', 'Cooking', 'Outdoors'];

/** How many of a recipe input you have (its alternatives count too). */
export function inputCount(i: RecipeInput, count: (def: ItemDefId) => number): number {
  let n = count(i.def);
  for (const a of i.alt ?? []) n += count(a);
  return n;
}

export interface CraftContext {
  /** How many of an item you have (bag stacks, plus 1 for each weapon you carry). */
  count: (def: ItemDefId) => number;
  skills: SkillSet;
  known: ReadonlySet<RecipeId>;
  nearWorkbench: boolean;
  /** A working stove or burning campfire within reach. */
  nearHeat?: boolean;
}

export interface RecipeStatus {
  known: boolean;
  /** Everything stopping you right now (empty = you can make it). */
  missing: string[];
  ok: boolean;
}

/** Display name for any item id (passed in so this module stays free of the item database). */
export type NameOf = (def: ItemDefId) => string;

export function recipeStatus(r: Recipe, ctx: CraftContext, nameOf: NameOf): RecipeStatus {
  const known = !r.magazine || ctx.known.has(r.id);
  const missing: string[] = [];
  if (!known) missing.push(`Read the ${MAGAZINES[r.magazine!].name}`);
  for (const i of r.inputs) {
    const have = inputCount(i, ctx.count);
    if (have < i.qty) missing.push(`${nameOf(i.def)}${i.alt?.length ? ' (or similar)' : ''} ${have}/${i.qty}`);
  }
  for (const group of r.tools) {
    if (!group.some((t) => ctx.count(t) > 0)) missing.push(group.map(nameOf).join(' or '));
  }
  if (r.skill && ctx.skills[r.skill.id].level < r.skill.level) missing.push(`${SKILLS[r.skill.id].label} ${r.skill.level}`);
  if (r.workbench && !ctx.nearWorkbench) missing.push('A workbench nearby');
  if (r.heat && !ctx.nearHeat) missing.push('A working stove or campfire');
  return { known, missing, ok: missing.length === 0 };
}

/** Seconds to craft: the recipe's skill speeds it up, a workbench more so. */
export function craftSeconds(r: Recipe, skills: SkillSet, nearWorkbench: boolean, base = r.seconds): number {
  const lvl = skills[r.xp.skill].level;
  return base * (1.2 - 0.04 * lvl) * (nearWorkbench ? 0.6 : 1);
}

/** Is it a structure recipe? */
export function structureOf(r: Recipe): StructureKind | null {
  return 'structure' in r.output ? r.output.structure : null;
}
