// ============================================================
// ZOMBIE CITY — HAND-TUNING HOOKS
// The city uses one fixed seed, so specific blocks and lots can be pinned
// or replaced here without touching the generator. Keys:
//   block: `b{bi}_{bj}` (see layout.ts blockId)
//   lot:   `b{bi}_{bj}:{lotIndex}` (lot order: north row west→east, then south row)
// ============================================================

import type { BuildingKind, CityDistrict } from './templates';

export interface BlockOverride {
  /** Replace the district picked by layout.ts. */
  district?: CityDistrict;
  /** Turn the whole block into one landmark building. */
  landmark?: BuildingKind;
  /** Force (true) or remove (false) the service alley. */
  alley?: boolean;
  /** Leave every lot empty (vacant ground / parking). */
  vacant?: boolean;
}

export interface LotOverride {
  kind?: BuildingKind;
  /** Exact floor count (clamped to 1..4). */
  floors?: number;
  name?: string;
  /** Leave this lot empty. */
  skip?: boolean;
  /** Force the front door state. */
  locked?: boolean;
}

export const BLOCK_OVERRIDES: Record<string, BlockOverride> = {
  // Vacant lot on the edge of the suburbs: open ground for fights / loot drops.
  b0_4: { vacant: true },
};

export const LOT_OVERRIDES: Record<string, LotOverride> = {
  // Guarantee the essentials exist on Market Street regardless of RNG.
  'b3_3:1': { kind: 'grocery', floors: 1, name: 'FreshMart Grocery' },
  'b2_3:2': { kind: 'pharmacy', floors: 2, name: 'Cross Pharmacy' },
  'b5_1:0': { kind: 'pharmacy', floors: 1, name: 'Wellness Drugstore' },
  // Corner shops in the commercial district (the suburbs get theirs by rule in cityPlan)
  'b1_2:0': { kind: 'convenience', floors: 1, name: 'Market Mini-Mart' },
  'b3_0:1': { kind: 'convenience', floors: 1, name: 'Downtown Express' },
  // A safe-feeling house next to the park: never locked.
  'b3_4:0': { locked: false },
};
