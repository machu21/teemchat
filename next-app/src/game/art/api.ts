// Core pixel art API contracts based on Habblaud specification
// 1 tile = 16px. Top-down 3/4 perspective.

export const TILE = 16;

export type Dir = 'down' | 'up' | 'left' | 'right';

export type Pose =
  | 'stand'
  | 'walk'
  | 'run'
  | 'sit'
  | 'type'
  | 'sleep'
  | 'drink'
  | 'use'
  | 'raise_hand'
  | 'talk'
  | 'stretch'
  | 'read'
  | 'play'
  | 'wait'
  | 'cheer'
  | 'laugh'
  | 'game'
  | 'rps'
  | 'groom'
  | 'sulk';

export type HeldItem =
  | 'none'
  | 'coffee'
  | 'water'
  | 'papers'
  | 'laptop'
  | 'book'
  | 'box'
  | 'paddle'
  | 'popcorn'
  | 'controller'
  | 'rock'
  | 'paper'
  | 'scissors'
  | 'phone'
  | 'lipstick'
  | 'comb';

export type HairStyle =
  | 'short'
  | 'buzz'
  | 'spiky'
  | 'side_part'
  | 'curly'
  | 'afro'
  | 'bob'
  | 'long'
  | 'ponytail'
  | 'bun'
  | 'pigtails'
  | 'mohawk'
  | 'bald'
  | 'wavy';

export type TopStyle = 'tshirt' | 'hoodie' | 'shirt_tie' | 'sweater' | 'jacket' | 'blouse' | 'polo';

export type Accessory =
  | 'none'
  | 'glasses'
  | 'sunglasses'
  | 'headphones'
  | 'cap'
  | 'beanie'
  | 'earrings'
  | 'bow';

export type FacialHair = 'none' | 'stubble' | 'beard' | 'mustache' | 'goatee';
export type BottomStyle = 'pants' | 'shorts' | 'skirt';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  eyes: string;
  top: string;
  topAccent: string;
  topStyle: TopStyle;
  bottom: string;
  shoes: string;
  accessory: Accessory;
  accessoryColor: string;
  lanyard: string | null;
  look: 'f' | 'm';
  facialHair?: FacialHair;
  bottomStyle?: BottomStyle;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SpriteRectName = 'screen' | 'board' | 'glass' | 'face' | 'tv' | 'sign' | 'art' | 'glow' | 'screen2';

export interface Sprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
  rects?: Partial<Record<SpriteRectName, Rect>>;
}

export interface CharacterFrameRequest {
  appearance: Appearance;
  dir: Dir;
  pose: Pose;
  frame: number;
  held?: HeldItem;
  seated?: boolean;
  costume?: 'santa' | 'witch' | 'pumpkin' | 'vampire';
}

export type FloorKind =
  | 'carpet'
  | 'wood'
  | 'tile_check'
  | 'tile_white'
  | 'concrete'
  | 'marble'
  | 'grass'
  | 'sidewalk'
  | 'street';

export type WallPattern = 'plain' | 'stripes' | 'tiles' | 'wood_panel' | 'brick' | 'glass' | 'marble';

export interface WallStyle {
  base: string;
  trim?: string;
  pattern?: WallPattern;
  exterior?: boolean;
}

export interface Doorway {
  x: number;
  w: number;
}

export type ScreenMode =
  | 'off'
  | 'standby'
  | 'idle'
  | 'code'
  | 'terminal'
  | 'browser'
  | 'search'
  | 'chat'
  | 'docs'
  | 'tasks'
  | 'alert'
  | 'progress'
  | 'show'
  | 'game';

export type FurnitureKind =
  | 'desk'
  | 'desk_back'
  | 'office_chair_front'
  | 'office_chair'
  | 'bookshelf'
  | 'filing_cabinet'
  | 'printer'
  | 'trash_bin'
  | 'plant_small'
  | 'plant_tall'
  | 'glass_partition'
  | 'binder_shelf'
  | 'meeting_table'
  | 'stool'
  | 'floor_lamp'
  | 'water_cooler'
  | 'whiteboard'
  | 'window'
  | 'clock'
  | 'poster'
  | 'painting'
  | 'tv'
  | 'light_switch'
  | 'elevator'
  | 'door_frame'
  | 'sign'
  | 'mirror'
  | 'shelf_wall'
  | 'counter'
  | 'counter_sink'
  | 'coffee_machine'
  | 'microwave'
  | 'fridge'
  | 'vending_machine'
  | 'cafe_table'
  | 'cafe_chair'
  | 'sofa'
  | 'armchair'
  | 'coffee_table'
  | 'pingpong_table'
  | 'beanbag'
  | 'arcade'
  | 'toilet_stall'
  | 'sink'
  | 'reception_desk'
  | 'bench';

export interface FurnitureDef {
  mount: 'floor' | 'wall';
  footprint: { w: number; h: number };
  blocks: boolean;
  seat?: boolean;
  variants?: readonly string[];
  states?: number;
}

export const FURNITURE: Readonly<Record<FurnitureKind, FurnitureDef>> = {
  desk: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['wood', 'white', 'dark'] },
  desk_back: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['wood', 'white', 'dark'] },
  office_chair_front: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['black', 'blue', 'red', 'green', 'gray'] },
  office_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['black', 'blue', 'red', 'green', 'gray'] },
  bookshelf: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  filing_cabinet: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  printer: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  trash_bin: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  plant_small: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['fern', 'succulent', 'flower'] },
  plant_tall: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['palm', 'ficus', 'monstera', 'bonsai'] },
  glass_partition: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['h', 'v', 'end'] },
  binder_shelf: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  meeting_table: { mount: 'floor', footprint: { w: 3, h: 2 }, blocks: true },
  stool: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true },
  floor_lamp: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  water_cooler: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  whiteboard: { mount: 'wall', footprint: { w: 3, h: 0 }, blocks: false },
  window: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  clock: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false },
  poster: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false, variants: ['code', 'coffee', 'rocket', 'cat', 'bug', 'ship_it'] },
  painting: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  tv: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  light_switch: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false, variants: ['on', 'off'] },
  elevator: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false, states: 5 },
  door_frame: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  sign: { mount: 'wall', footprint: { w: 3, h: 0 }, blocks: false },
  mirror: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false },
  shelf_wall: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  counter: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['plain', 'drawers'] },
  counter_sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  coffee_machine: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, states: 2 },
  microwave: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  fridge: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  vending_machine: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  cafe_table: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  cafe_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  sofa: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: false, seat: true, variants: ['down', 'up'] },
  armchair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  coffee_table: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  pingpong_table: { mount: 'floor', footprint: { w: 3, h: 2 }, blocks: true },
  beanbag: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['red', 'blue', 'yellow', 'green'] },
  arcade: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  toilet_stall: { mount: 'floor', footprint: { w: 2, h: 2 }, blocks: true, states: 2 },
  sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  reception_desk: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: true },
  bench: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: false, seat: true },
};

