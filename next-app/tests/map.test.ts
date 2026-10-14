import { describe, it, expect, vi } from 'vitest';
import { createPreRenderedWorldMap } from '../src/game/map/worldMap';
import { FurnitureEntity, FurnitureType } from '../src/game/entities/furniture';
import { MAP_WIDTH, MAP_HEIGHT } from '../src/game/collision';

describe('World Map & Pixel Art Graphics', () => {
  it('creates pre-rendered world map canvas with full dimensions', () => {
    const fillRectMock = vi.fn();
    const mockCtx = {
      imageSmoothingEnabled: true,
      fillStyle: '',
      fillRect: fillRectMock,
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 40 }),
      fillText: vi.fn(),
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => mockCtx,
    } as unknown as HTMLCanvasElement;

    (globalThis as unknown as { document: { createElement: (tag: string) => HTMLCanvasElement } }).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return mockCanvas;
        }
        return {} as HTMLCanvasElement;
      },
    };

    const canvas = createPreRenderedWorldMap();
    expect(canvas.width).toBe(MAP_WIDTH);
    expect(canvas.height).toBe(MAP_HEIGHT);
    expect(fillRectMock).toHaveBeenCalled();
  });

  it('renders all 12 furniture pixel art entities without errors', () => {
    const types: FurnitureType[] = [
      'pineTree',
      'berryBush',
      'flowerPatch',
      'tallGrass',
      'campfire',
      'tent',
      'logBench',
      'woodenSign',
      'boulder',
      'stoneWell',
      'streetLantern',
      'woodenFence',
    ];

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    for (const t of types) {
      const entity = new FurnitureEntity(`test-${t}`, t, 100, 100);
      expect(entity.getSize().w).toBeGreaterThan(0);
      expect(entity.getSize().h).toBeGreaterThan(0);
      entity.render(mockCtx);
    }
  });
});
