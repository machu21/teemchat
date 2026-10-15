import { getMapConfig } from './mapRegistry';

export interface ZoneInfo {
  name: string;
  tag: string;
  color: string;
}

export function getCurrentZone(x: number, y: number, mapTheme?: string | null): ZoneInfo {
  return getMapConfig(mapTheme).getCurrentZone(x, y);
}

export function isPositionInWater(x: number, y: number, mapTheme?: string | null): boolean {
  return getMapConfig(mapTheme).isPositionInWater(x, y);
}
