import type { AmmoType, WeaponId } from '../weapons';
import type { ConsumableId, GearId, ItemCategory, ItemDef, SkillBookId } from './types';
import { SKILLS, SKILL_BOOKS, SKILL_IDS } from './skills';
import { MAGAZINES, type MagazineId } from './crafting';

// ============================================================
// ZOMBIE MODE — ITEM DATABASE (gear + descriptions)
// Consumables live in inventory.ts (they have effects); this file holds
// the wearables, tools, materials and other gear, the one-line
// descriptions shown when you inspect anything, and the category groups
// the inventory screen sorts by.
// Gear that a later system will use (materials for building, seeds for
// farming, vehicle parts) is still real: it has weight, stacks, can be
// carried, stored, dropped and traded between containers.
// ============================================================

export const CONSUMABLE_DESCRIPTIONS: Record<ConsumableId, string> = {
  canned_beans: 'Filling and keeps forever. Bland.',
  chips: 'Salty and cheering, but they make you thirsty.',
  apple: 'A little food and a little water.',
  bread: 'Solid, filling food.',
  water_bottle: 'Clean drinking water.',
  soda: 'Sugar and fizz: a quick lift.',
  energy_drink: 'Restores stamina, keeps you awake and pushes you harder for a while.',
  coffee: 'Wakes you up.',
  bandage: 'Stops a bleeding wound and lets it heal. Change it when it gets dirty.',
  disinfectant: "Cleans every wound so it won't fester.",
  painkillers: 'Dulls the pain for a couple of minutes.',
  splint: 'Sets a broken bone so it can heal.',
  book: 'A good read. Cures boredom and lifts your mood.',
  magazine: 'A quick flick through. Takes the edge off boredom.',
  tomato: 'Fresh from the vine.',
  carrot: 'Crunchy. Keeps for a good while.',
  potato: 'Better cooked. Keeps for weeks.',
  cabbage: 'Filling and watery.',
  berries: 'Sweet wild berries. They spoil quickly.',
  mushrooms: 'Wild mushrooms you picked. These ones are safe.',
  herbs: 'Chew them into a poultice: cleans your wounds.',
  fish_minnow: 'A handful of tiny fish. Cook them first.',
  fish_perch: 'A decent fish. Cook it first.',
  fish_carp: 'A big carp. Cook it first.',
  fish_catfish: 'A heavy catfish. Cook it first.',
  cooked_fish: 'Flaky, hot and filling.',
  vegetable_stew: 'The best meal around: food, water and warmth.',
  salad: 'Fresh and cheering.',
  tainted_water: 'Straight from a toilet tank or a rain barrel. Boil it first, or it will make you ill.',
  raw_meat: 'Cook it. Eaten raw it can make you sick. Spoils fast.',
  cooked_meat: 'Hot, filling and good for morale.',
  hot_soup: 'Food, water and warmth in one bowl.',
  noise_maker: 'Use it to drop it at your feet: after a few seconds it buzzes loudly for half a minute.',
  'mag:metalwork': MAGAZINES.metalwork.description + ' You keep the magazine.',
  'mag:electronics': MAGAZINES.electronics.description + ' You keep the magazine.',
  'mag:tailoring': MAGAZINES.tailoring.description + ' You keep the magazine.',
};

export const MAGAZINE_IDS: readonly MagazineId[] = ['metalwork', 'electronics', 'tailoring'];

export const WEAPON_DESCRIPTIONS: Record<WeaponId, string> = {
  fists: 'Better than nothing.',
  axe: 'Heavy, sharp, reliable. A sprinting swing hits very hard.',
  bat: 'Knocks zombies flat. Wears out quicker than metal.',
  crowbar: 'Almost indestructible.',
  pipe: 'Long reach and a good knockdown.',
  hammer: 'Light and quick.',
  knife: 'Fast, cheap on stamina, often finds a weak spot. Breaks easily.',
  plank: "A bit of wood. Won't last long.",
  pistol: 'Reliable sidearm. Loud.',
  shotgun: 'Devastating up close. Very loud.',
  m16: 'Accurate automatic rifle. Very loud.',
  ak47: 'Hard-hitting automatic rifle. Very loud.',
  mg: 'A wall of lead. Heavy, slow to reload, deafening.',
};

export const AMMO_DESCRIPTION = (name: string) => `${name}. Goes straight into your ammo pouch.`;

const gear = (id: GearId, name: string, icon: ItemDef['icon'], category: ItemCategory, weight: number, maxStack: number, description: string, equip?: ItemDef['equip']): ItemDef =>
  equip ? { id, name, icon, category, weight, maxStack, description, equip } : { id, name, icon, category, weight, maxStack, description };

export const GEAR_DEFS: Record<GearId, ItemDef> = {
  // Clothing: warmth (°C felt) and a chance that a zombie hit on the covered parts leaves no wound
  winter_jacket: gear('winter_jacket', 'Winter Jacket', 'shirt', 'clothing', 1.5, 1, 'Very warm. Thick enough to turn some scratches.', { slot: 'outer', insulation: 8, protection: 0.2 }),
  leather_jacket: gear('leather_jacket', 'Leather Jacket', 'shirt', 'clothing', 1.8, 1, 'Warm, and tough enough to stop a lot of bites.', { slot: 'outer', insulation: 5, protection: 0.4 }),
  hoodie: gear('hoodie', 'Hoodie', 'shirt', 'clothing', 0.6, 1, 'A bit of warmth. Little protection.', { slot: 'outer', insulation: 3, protection: 0.08 }),
  work_gloves: gear('work_gloves', 'Work Gloves', 'hand', 'clothing', 0.2, 1, 'Protect your hands from scratches and bites.', { slot: 'hands', insulation: 1, protection: 0.35 }),
  // Bags: worn on the back, they add carry capacity
  school_bag: gear('school_bag', 'School Bag', 'backpack', 'bag', 0.6, 1, 'Wear it to carry 6 kg more.', { slot: 'back', capacityKg: 6 }),
  duffel_bag: gear('duffel_bag', 'Duffel Bag', 'backpack', 'bag', 0.9, 1, 'Wear it to carry 9 kg more.', { slot: 'back', capacityKg: 9 }),
  hiking_bag: gear('hiking_bag', 'Hiking Bag', 'backpack', 'bag', 1.2, 1, 'Wear it to carry 13 kg more.', { slot: 'back', capacityKg: 13 }),
  // Tools
  screwdriver: gear('screwdriver', 'Screwdriver', 'screwdriver', 'tool', 0.2, 1, 'For taking things apart.'),
  saw: gear('saw', 'Saw', 'saw', 'tool', 0.8, 1, 'Cuts wood.'),
  wrench: gear('wrench', 'Wrench', 'wrench', 'tool', 0.9, 1, 'For bolts and pipes.'),
  // Construction materials
  nails: gear('nails', 'Nails', 'package', 'material', 0.01, 100, 'A handful of nails.'),
  duct_tape: gear('duct_tape', 'Duct Tape', 'tape', 'material', 0.2, 5, 'Fixes nearly anything for a while.'),
  scrap_metal: gear('scrap_metal', 'Scrap Metal', 'boxes', 'material', 1, 10, 'Bent sheet metal and offcuts.'),
  // Electronics
  battery: gear('battery', 'Battery', 'battery', 'electronics', 0.1, 10, 'A AA battery.'),
  radio: gear('radio', 'Radio', 'radio', 'electronics', 0.8, 1, 'A portable radio. Silent without batteries and a broadcast.'),
  // Farming
  tomato_seeds: gear('tomato_seeds', 'Tomato Seeds', 'sprout', 'farming', 0.05, 20, 'A packet of tomato seeds.'),
  carrot_seeds: gear('carrot_seeds', 'Carrot Seeds', 'carrot', 'farming', 0.05, 20, 'A packet of carrot seeds.'),
  // Vehicle parts
  gas_can: gear('gas_can', 'Gas Can', 'fuel', 'vehicle', 1, 1, 'An empty jerry can.'),
  car_battery: gear('car_battery', 'Car Battery', 'battery', 'vehicle', 12, 1, 'Fit it to a car with a wrench. Its condition is its charge.'),
  spare_tire: gear('spare_tire', 'Spare Tire', 'tire', 'vehicle', 9, 1, 'Fit it to a car with a wrench. Heavy and awkward to carry.'),
  // Misc
  lighter: gear('lighter', 'Lighter', 'flame', 'misc', 0.05, 1, 'Makes fire.'),
  rope: gear('rope', 'Rope', 'rope', 'misc', 0.6, 3, 'A coil of rope.'),
  thread: gear('thread', 'Thread', 'tape', 'material', 0.02, 10, 'A spool of thread. Mends worn clothes (Tailoring).'),
  planks: gear('planks', 'Planks', 'plank', 'material', 1, 10, 'Wooden planks. Board up doors and windows, or build with them.'),
  rags: gear('rags', 'Rags', 'shirt', 'material', 0.1, 20, 'Torn cloth. Bandages, splints and sewing.'),
  metal_sheet: gear('metal_sheet', 'Metal Sheet', 'shield', 'material', 2, 5, 'A welded sheet of metal for building.'),
  electronics_scrap: gear('electronics_scrap', 'Electronics Scrap', 'radio', 'electronics', 0.2, 10, 'Circuit boards and wire.'),
  blowtorch: gear('blowtorch', 'Blowtorch', 'flame', 'tool', 1, 1, 'Welds metal.'),
  empty_bottle: gear('empty_bottle', 'Empty Bottle', 'glassWater', 'misc', 0.05, 6, 'Fill it at a tap while the water still runs, or from a toilet or rain barrel (boil that).'),
  gas_can_full: gear('gas_can_full', 'Gas Can (Full)', 'fuel', 'vehicle', 5, 1, 'Fuel for a generator (and later, vehicles). Fill an empty can at a working gas pump.'),
  potato_seeds: gear('potato_seeds', 'Potato Seeds', 'sprout', 'farming', 0.05, 20, 'Seed potatoes for a farm plot.'),
  cabbage_seeds: gear('cabbage_seeds', 'Cabbage Seeds', 'sprout', 'farming', 0.05, 20, 'A packet of cabbage seeds.'),
  shovel: gear('shovel', 'Shovel', 'shovel', 'tool', 1.5, 1, 'Digs farm plots (crafting, Outdoors).'),
  fishing_rod: gear('fishing_rod', 'Fishing Rod', 'fishingHook', 'tool', 0.6, 1, 'Cast it at water. Bait (worms, berries…) improves your odds.'),
  worms: gear('worms', 'Worms', 'worm', 'misc', 0.02, 20, 'Bait for fishing and traps. Dig them up while foraging.'),
  branch: gear('branch', 'Branch', 'branch', 'material', 0.4, 10, 'A sturdy stick: traps, rods, campfires.'),
  stone: gear('stone', 'Stone', 'stone', 'material', 0.5, 10, 'Ring a campfire with them.'),
  dead_rabbit: gear('dead_rabbit', 'Dead Rabbit', 'rabbit', 'food', 1.2, 1, 'Butcher it with a knife for meat.'),
  dead_squirrel: gear('dead_squirrel', 'Dead Squirrel', 'squirrel', 'food', 0.5, 2, 'Butcher it with a knife for meat.'),
  dead_bird: gear('dead_bird', 'Dead Bird', 'bird', 'food', 0.3, 2, 'Butcher it with a knife for meat.'),
  dead_rat: gear('dead_rat', 'Dead Rat', 'rat', 'food', 0.3, 2, 'Butcher it with a knife. Desperate times.'),
  generator: gear('generator', 'Generator', 'generator', 'electronics', 25, 1, 'Very heavy. Set it down (crafting, Electrical 1) to power the area around it. Runs on fuel and makes a lot of noise.'),
};

/** "Carpentry Vol. 1" … for every skill: read to learn that skill much faster for a while. */
export const SKILL_BOOK_DEFS = Object.fromEntries(
  SKILL_IDS.flatMap((skill) =>
    ([1, 2] as const).map((volume) => {
      const id = `book:${skill}:${volume}` as SkillBookId;
      const b = SKILL_BOOKS[volume];
      const def: ItemDef = {
        id,
        name: `${SKILLS[skill].label} Vol. ${volume}`,
        icon: 'bookText',
        category: 'literature',
        weight: 0.6,
        maxStack: 1,
        useSeconds: 4,
        description: `Read it to learn ${SKILLS[skill].label} ×${b.mul} faster from level ${b.from} to ${b.to + 1}. You keep the book.`,
        consume: { skillBook: { skill, volume } },
      };
      return [id, def];
    })
  )
) as Record<SkillBookId, ItemDef>;

/** Inventory screen groups, in display order (several categories can share one). */
export const CATEGORY_GROUPS: { label: string; categories: ItemCategory[] }[] = [
  { label: 'Food', categories: ['food'] },
  { label: 'Drinks', categories: ['drink', 'stimulant'] },
  { label: 'Medical', categories: ['medical'] },
  { label: 'Weapons', categories: ['weapon'] },
  { label: 'Ammunition', categories: ['ammo'] },
  { label: 'Clothing & bags', categories: ['clothing', 'bag'] },
  { label: 'Tools', categories: ['tool'] },
  { label: 'Building materials', categories: ['material'] },
  { label: 'Electronics', categories: ['electronics'] },
  { label: 'Farming', categories: ['farming'] },
  { label: 'Vehicle parts', categories: ['vehicle'] },
  { label: 'Books & misc', categories: ['literature', 'misc'] },
];

export const CATEGORY_ORDER: Record<ItemCategory, number> = Object.fromEntries(
  CATEGORY_GROUPS.flatMap((g, i) => g.categories.map((c) => [c, i]))
) as Record<ItemCategory, number>;

export type AmmoId = `ammo:${AmmoType}`;
