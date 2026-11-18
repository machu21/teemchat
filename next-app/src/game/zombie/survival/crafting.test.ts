import { describe, expect, it } from 'vitest';
import { RECIPES, RECIPE_ORDER, craftSeconds, recipeStatus, structureOf, type CraftContext } from './crafting';
import { STRUCTURES, STRUCTURE_KINDS, builtEntrance, placeBlock } from './structures';
import { freshSkills } from './skills';
import { ITEM_DEFS } from './inventory';
import type { ItemDefId } from './types';
import { applyEntranceAction, entranceBlocksMovement, entranceBlocksSight, isBarrier } from '../entrances';
import { TILE_OPAQUE, TILE_SOLID, createTileGrid, setEntrance, setWall } from '../grid';
import { ZombieSim } from '../zombieSim';

const nameOf = (d: ItemDefId) => ITEM_DEFS[d].name;
const ctx = (have: Partial<Record<string, number>>, over: Partial<CraftContext> = {}): CraftContext => ({
  count: (d) => have[d] ?? 0,
  skills: freshSkills(),
  known: new Set(),
  nearWorkbench: false,
  ...over,
});

describe('recipes', () => {
  it('every recipe names real items and tools', () => {
    for (const id of RECIPE_ORDER) {
      const r = RECIPES[id];
      for (const i of r.inputs) expect(ITEM_DEFS[i.def]).toBeDefined();
      for (const g of r.tools) for (const t of g) expect(ITEM_DEFS[t]).toBeDefined();
      if ('items' in r.output) for (const o of r.output.items) expect(ITEM_DEFS[o.def]).toBeDefined();
      else expect(STRUCTURES[r.output.structure]).toBeDefined();
    }
  });

  it('lists what is missing: materials, tools, skill, workbench, a magazine', () => {
    const wall = RECIPES.wood_wall;
    const none = recipeStatus(wall, ctx({}), nameOf);
    expect(none.ok).toBe(false);
    expect(none.missing).toEqual(['Planks 0/3', 'Nails 0/6', 'Hammer', 'Carpentry 2']);
    const skilled = { ...freshSkills(), carpentry: { level: 2, xp: 0 } };
    expect(recipeStatus(wall, ctx({ planks: 3, nails: 6, 'weapon:hammer': 1 }, { skills: skilled }), nameOf).ok).toBe(true);
    expect(recipeStatus(RECIPES.metal_sheet, ctx({ scrap_metal: 3, blowtorch: 1 }), nameOf).missing).toEqual(['A workbench nearby']);
    const noise = recipeStatus(RECIPES.noise_maker, ctx({}), nameOf);
    expect(noise.known).toBe(false);
    expect(noise.missing[0]).toMatch(/Electronics Magazine/);
    expect(recipeStatus(RECIPES.tear_rags, ctx({ hoodie: 1 }), nameOf).ok).toBe(true);
  });

  it('skill and a workbench make crafting quicker', () => {
    const r = RECIPES.dismantle_radio;
    const slow = craftSeconds(r, freshSkills(), false);
    const fast = craftSeconds(r, { ...freshSkills(), electrical: { level: 10, xp: 0 } }, true);
    expect(fast).toBeLessThan(slow * 0.5);
    expect(structureOf(RECIPES.crate)).toBe('crate');
    expect(structureOf(RECIPES.rag_bandage)).toBeNull();
  });
});

describe('structures on the grid', () => {
  it('walls block movement and sight; fences only movement; neither opens or takes planks', () => {
    const wall = builtEntrance('wood_wall', 3, 3);
    const fence = builtEntrance('fence', 4, 3);
    expect(isBarrier(wall) && isBarrier(fence)).toBe(true);
    expect(entranceBlocksMovement(wall) && entranceBlocksSight(wall)).toBe(true);
    expect(entranceBlocksMovement(fence)).toBe(true);
    expect(entranceBlocksSight(fence)).toBe(false);
    for (const type of ['toggle', 'lock', 'addPlank'] as const) expect(applyEntranceAction(wall, { type })).toBe(wall);
    const smashed = applyEntranceAction(fence, { type: 'damage', amount: 100 });
    expect(smashed.state).toBe('broken');
    expect(entranceBlocksMovement(smashed)).toBe(false);
    const g = createTileGrid(10, 10, 16);
    setEntrance(g, wall);
    expect(g.flags[3 * 10 + 3] & TILE_SOLID).toBeTruthy();
    expect(g.flags[3 * 10 + 3] & TILE_OPAQUE).toBeTruthy();
    expect(builtEntrance('wood_door', 1, 1)).toMatchObject({ kind: 'door', built: 'wood_door', hp: STRUCTURES.wood_door.hp });
    // Append-only wire order: walls … workbench, then the Phase 6 utilities
    expect(STRUCTURE_KINDS.slice(0, 6)).toEqual(['wood_wall', 'metal_wall', 'fence', 'wood_door', 'crate', 'workbench']);
    expect(STRUCTURE_KINDS.slice(6)).toEqual(['generator', 'rain_collector', 'campfire', 'farm_plot', 'snare_trap']);
  });

  it('can only build on open floor: not walls, map doors, stairs or people; rubble is fine', () => {
    const g = createTileGrid(10, 10, 16);
    setWall(g, 2, 2);
    expect(placeBlock(g, 2, 2, [])).toBe('solid');
    expect(placeBlock(g, 20, 2, [])).toBe('outOfMap');
    setEntrance(g, { id: 'map:door', kind: 'door', col: 5, row: 5, state: 'open', planks: 0, hp: 100 });
    expect(placeBlock(g, 5, 5, [])).toBe('solid');
    setEntrance(g, { ...builtEntrance('wood_wall', 6, 6), state: 'broken', hp: 0 });
    expect(placeBlock(g, 6, 6, [])).toBeNull();
    g.portalOut.set(7 * 10 + 7, 0);
    expect(placeBlock(g, 7, 7, [])).toBe('stairs');
    expect(placeBlock(g, 1, 1, [{ x: 24, y: 24 }])).toBe('occupied');
    expect(placeBlock(g, 1, 1, [{ x: 100, y: 100 }])).toBeNull();
  });

  it('zombies batter a wall in their way down and come through', () => {
    // A corridor (row 5) walled on both sides, with a built wall across it
    const g = createTileGrid(20, 11, 16);
    for (let c = 0; c < 20; c++) {
      setWall(g, c, 4);
      setWall(g, c, 6);
    }
    setEntrance(g, builtEntrance('wood_wall', 10, 5));
    const sim = new ZombieSim(g, { x: 0, y: 0, w: 320, h: 176 }, 3);
    const z = sim.add(6 * 16 + 8, 5 * 16 + 8);
    const p = { id: 'p', x: 14 * 16 + 8, y: 5 * 16 + 8 };
    // It heard the player: chase via the flow field
    z.state = 'chase';
    z.targetId = 'p';
    z.timer = 999;
    let broke = -1;
    for (let t = 0; t < 40 && broke < 0; t += 0.05) {
      sim.tick(0.05, [p], [{ x: p.x, y: p.y, radius: 20 }]);
      z.timer = 999;
      if (g.entrances.get(5 * 20 + 10)?.state === 'broken') broke = t;
    }
    expect(broke).toBeGreaterThan(5); // 150 hp at 15 a blow takes a while
    for (let t = 0; t < 5; t += 0.05) sim.tick(0.05, [p], []);
    expect(z.x).toBeGreaterThan(10 * 16 + 8);
  });
});
