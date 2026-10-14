import { MAP_WIDTH, MAP_HEIGHT, WALL_THICK } from '../collision';

export interface ZoneInfo {
  name: string;
  tag: string;
  color: string;
}

export function getCurrentZone(x: number, y: number): ZoneInfo {
  if (x >= 1290) {
    return { name: 'Crystal Bay Beach', tag: '🏖️ Coastal Bay', color: '#38BDF8' };
  }
  if (y <= 400 && x >= 600) {
    return { name: 'Whispering Woods', tag: '🌲 Woods', color: '#10B981' };
  }
  if (x >= 710 && x <= 826 && y >= 660 && y <= 745) {
    return { name: 'River Crossing Bridge', tag: '🌉 Bridge', color: '#D97706' };
  }
  if (y >= 700 && x <= 600) {
    return { name: 'Adventure Camp', tag: '🔥 Campfire', color: '#F59E0B' };
  }
  return { name: 'Verdant Village', tag: '🏡 Village Plaza', color: '#8B5CF6' };
}

export function isPositionInWater(x: number, y: number): boolean {
  // Bridge deck:
  if (x >= 710 && x <= 826 && y >= 660 && y <= 745) return false;
  // Pier:
  if (x >= 1290 && x <= 1590 && y >= 458 && y <= 534) return false;

  // River stream:
  if (x >= 730 && x <= 806 && y >= 414 && y <= MAP_HEIGHT) {
    return true;
  }
  // Crystal Bay ocean / surf:
  if (x >= 1392 && x <= MAP_WIDTH - WALL_THICK) {
    return true;
  }
  return false;
}
