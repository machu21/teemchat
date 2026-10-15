import { describe, it, expect, vi } from 'vitest';
import { createPreRenderedWorldMap } from '../src/game/map/worldMap';
import { FurnitureEntity, FurnitureType } from '../src/game/entities/furniture';
import { MAP_WIDTH, MAP_HEIGHT } from '../src/game/collision';
import { renderPixelAvatar, shadeHexColor } from '../src/game/render/avatar';
import { defaultAvatarConfig } from '../src/lib/models/avatar';

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

  it('renders all 12 original furniture pixel art entities without errors', () => {
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

  it('renders new modern lounge & hangout pixel art furniture without errors', () => {
    const loungeTypes: FurnitureType[] = [
      'pingPongTable',
      'blueSofa',
      'armchair',
      'coffeeTable',
      'pottedPlant',
      'beanBagRed',
      'beanBagBlue',
      'beanBagYellow',
      'bookshelf',
      'vendingMachine',
      'officePrinter',
      'wallTv',
      'floorLamp',
    ];

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    for (const t of loungeTypes) {
      const entity = new FurnitureEntity(`test-${t}`, t, 100, 100);
      expect(entity.getSize().w).toBeGreaterThan(0);
      expect(entity.getSize().h).toBeGreaterThan(0);
      entity.render(mockCtx);
    }
  });

  it('renders 4-direction pixel avatar with walking cycles and accessories', () => {
    const fillRectMock = vi.fn();
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      fillStyle: '',
      fillRect: fillRectMock,
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D;

    const directions = ['down', 'up', 'left', 'right'] as const;
    for (const dir of directions) {
      for (let frame = 0; frame < 4; frame++) {
        renderPixelAvatar(mockCtx, defaultAvatarConfig, 36, dir, frame);
        expect(fillRectMock).toHaveBeenCalled();
      }
    }
  });

  it('shadeHexColor generates valid lighter and darker hex shades', () => {
    const base = '#3B82F6';
    const lighter = shadeHexColor(base, 20);
    const darker = shadeHexColor(base, -20);
    expect(lighter).toMatch(/^#[0-9a-f]{6}$/i);
    expect(darker).toMatch(/^#[0-9a-f]{6}$/i);
    expect(lighter).not.toBe(base);
    expect(darker).not.toBe(base);
  });

  it('renders all 6 distinct map templates onto canvas without errors', async () => {
    const { getAllMapConfigs } = await import('../src/game/map/mapRegistry');
    const configs = getAllMapConfigs();
    expect(configs.length).toBe(6);

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

    for (const config of configs) {
      fillRectMock.mockClear();
      const canvas = createPreRenderedWorldMap(config.id);
      expect(canvas.width).toBe(MAP_WIDTH);
      expect(canvas.height).toBe(MAP_HEIGHT);
      expect(fillRectMock).toHaveBeenCalled();
      expect(config.zones.length).toBeGreaterThanOrEqual(5);
      expect(config.highlights.length).toBeGreaterThanOrEqual(4);
      expect(config.defaultSpawn.x).toBeGreaterThan(0);
      expect(config.defaultSpawn.y).toBeGreaterThan(0);
    }
  });

  it('validates all 6 map theme configs have complete metadata for responsive MapSelector UI', async () => {
    const { getAllMapConfigs } = await import('../src/game/map/mapRegistry');
    const configs = getAllMapConfigs();
    expect(configs).toHaveLength(6);

    const categories = new Set(configs.map((c) => c.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);

    for (const config of configs) {
      expect(config.id).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.tagline).toBeTruthy();
      expect(config.category).toBeTruthy();
      expect(config.icon).toBeTruthy();
      expect(config.previewGradient).toContain('gradient');
      expect(config.description.length).toBeGreaterThan(15);
      expect(config.highlights.length).toBeGreaterThanOrEqual(4);
    }
  });
});


