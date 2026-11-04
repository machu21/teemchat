import { Camera, DEFAULT_ZOOM, SURVIVAL_ZOOM_LIMITS } from './camera';
import { checkAABB, Rect, WallIndex } from './collision';
import { PlayerEntity } from './entities/player';
import { RemotePlayerEntity } from './entities/remotePlayer';
import { CompanionEntity } from './entities/companion';
import { FurnitureEntity, FurnitureType } from './entities/furniture';
import { createPreRenderedWorldMap } from './map/worldMap';
import { getCurrentZone } from './map/zones';
import { getBoundaryWallsForMap, getBuildingsForMap, getDefaultPropsForMap, getMapConfig, getMapSize } from './map/mapRegistry';
import { ChunkedMapRenderer } from './map/chunkedMap';
import {
  BuildingDefinition,
  StairLink,
  UpperLevel,
  easeOutCubic,
  findLevelAt,
  findNearestDoor,
  findStairAt,
  floorIndex,
  getStairLinks,
  getBuildingWalls,
  getFloors,
  resolveBuildingAt,
  stepRoofProgress,
} from './map/buildings';
import { WorldSyncService } from '@/lib/services/worldSync';
import { CompanionModel } from '@/lib/models/chat';
import type { CompanionEmote, CompanionMood } from '@/lib/companion/types';
import { SpaceModel } from '@/lib/models/space';
import { SpaceService } from '@/lib/services/spaces';
import { ZombieHud, ZombieMode } from './zombie/zombieMode';
import { DoorActionType, ZombieSyncService } from '@/lib/services/zombieSync';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from './zombie/weapons';
import type { Entrance } from './zombie/entrances';
import type { ConsumableId } from './zombie/survival/types';
import { ControlAction, DEFAULT_BINDINGS, KeyBindings, actionForCode } from '@/lib/settings/controls';

export interface DoorPrompt {
  buildingId: string;
  name: string;
  icon: string;
  color: string;
  action: 'enter' | 'exit';
  occupants: number;
}

export interface FloorInfo {
  buildingId: string;
  buildingName: string;
  color: string;
  currentLevelId: string | null;
  floors: { levelId: string | null; label: string; occupants: number }[];
}

const ROOF_LIFT_OFFSET = 6;
/** Survival jump: airtime (s), peak sprite lift (px), extra airtime allowed to clear an obstacle. */
const JUMP_SECONDS = 0.45;
const JUMP_HEIGHT = 14;
const JUMP_HANG_SECONDS = 0.35;
const LANDING_NOISE_RADIUS = 4;
/** Mouse aim is dropped after the mouse rests this long (ms). */
const AIM_IDLE_MS = 2500;
/** Low props you can hop over mid-jump (trees, lamp posts, fountains stay solid). */
const JUMPABLE_FURNITURE: ReadonlySet<FurnitureType> = new Set<FurnitureType>(['logBench', 'flowerPatch', 'berryBush', 'woodenSign']);
const INTERIOR_DIM_ALPHA = 0.35;
const LEVEL_VOID_COLOR = '#12121A';
/** Extra world px drawn around an upper floor so name tags near its walls aren't clipped. */
const LEVEL_CLIP_MARGIN = 24;

// Iris wipe used for floor changes (ms)
const IRIS_CLOSE_MS = 260;
const IRIS_HOLD_MS = 80;
const IRIS_OPEN_MS = 280;
const IRIS_REDUCED_MS = 75;

interface IrisTransition {
  phase: 'closing' | 'hold' | 'opening';
  elapsed: number;
  /** World-space centres for the closing and opening circles. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  stair: StairLink;
}

export class WorldGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera = new Camera();

  player: PlayerEntity;
  remoteAvatars: Map<string, RemotePlayerEntity> = new Map();
  companion: CompanionEntity | null = null;
  /** Other players' companions (passive, render-only). Keyed like remoteAvatars. */
  remoteCompanions: Map<string, CompanionEntity> = new Map();
  furniture: FurnitureEntity[] = [];

  private preRenderedMap: HTMLCanvasElement | null = null;
  /** Streams the ground layer for large maps (null for single pre-render maps). */
  private chunkedMap: ChunkedMapRenderer | null = null;
  /** Outdoor world size of this space's map. */
  private mapSize: { w: number; h: number };
  /** Map draws doors/windows itself (Zombie Survival city). */
  private renderEntrance: ((ctx: CanvasRenderingContext2D, e: Entrance) => void) | undefined;
  private hasEntrances: boolean = false;
  private syncService: WorldSyncService | null = null;
  private space: SpaceModel;
  private boundaryWalls: Rect[] = [];
  private wallIndex: WallIndex;
  /** Jumpable obstacles (fences, cars…): solid unless airborne. */
  private lowWallIndex: WallIndex;
  /** Survival jump: seconds into the current jump, or -1 when on the ground. */
  private jumpT: number = -1;

  private keysDown: Set<string> = new Set();
  /** Player key bindings (Controls settings). */
  private bindings: KeyBindings = DEFAULT_BINDINGS;
  /** Touch sprint button held (hold mode). */
  private touchSprintHeld = false;
  private joystickInput: { x: number; y: number } = { x: 0, y: 0 };
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private animFrameId: number | null = null;

  // Stored listener references for clean memory teardown
  private onKeyDownBound: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUpBound: ((e: KeyboardEvent) => void) | null = null;
  private onPointerAimBound: ((e: PointerEvent) => void) | null = null;
  private onPointerLeaveBound: (() => void) | null = null;
  private onBlurBound: (() => void) | null = null;
  /** Last mouse-aim update (ms); aim falls back to movement after AIM_IDLE_MS. */
  private lastAimAt: number = 0;
  private onCanvasClickBound: ((e: MouseEvent) => void) | null = null;
  private onWheelBound: ((e: WheelEvent) => void) | null = null;
  private onTouchStartBound: ((e: TouchEvent) => void) | null = null;
  private onTouchMoveBound: ((e: TouchEvent) => void) | null = null;
  private onTouchEndBound: ((e: TouchEvent) => void) | null = null;
  private initialPinchDistance: number | null = null;
  private initialPinchZoom: number = 1.25;

  // Build mode
  buildModeEnabled: boolean = false;
  selectedFurniture: FurnitureType | null = null;

  private currentZoneName: string = '';
  private lastProximityCheckTime: number = 0;

  // Enterable buildings (roof-lift interiors)
  private buildings: BuildingDefinition[] = [];
  private roofLayers: Map<string, HTMLCanvasElement> = new Map();
  private roofProgress: Map<string, number> = new Map();
  private insideBuildingId: string | null = null;
  private dimBuildingId: string | null = null;
  private doorPrompt: DoorPrompt | null = null;
  private doorPulse: number = 0;
  private reducedMotion: boolean = false;

  // Multi-storey: upper floors, stairs + iris wipe
  private levelLayers: Map<string, HTMLCanvasElement> = new Map();
  private currentLevel: { building: BuildingDefinition; level: UpperLevel } | null = null;
  private iris: IrisTransition | null = null;
  private stairArmed: boolean = true;
  /** Staircase the player is auto-walking to via the floor selector (others are ignored meanwhile). */
  private stairGoal: StairLink | null = null;
  private floorInfoKey: string = '';
  private lastFloorInfoCheck: number = 0;

  // Zombie mode: FOV + fog of war, zombies, health, melee (null when off)
  private zombieMode: ZombieMode | null = null;
  private zombieNet: ZombieSyncService | null = null;
  private lastMoveInput: { x: number; y: number } = { x: 0, y: 0 };
  /** Survival zoom preferences (camera zoom units); indoors defaults to 180 %. */
  private survivalZoom = { outside: DEFAULT_ZOOM, inside: DEFAULT_ZOOM * 1.8 };
  onZombieHud?: (hud: ZombieHud | null) => void;

  onCompanionTap?: () => void;
  /** Companion woke up because the owner moved again after being AFK. */
  onCompanionWake?: () => void;
  /** Companion fell asleep (owner AFK). */
  onCompanionSleep?: () => void;
  onDoorPromptChanged?: (prompt: DoorPrompt | null) => void;
  /** Called every frame while a door prompt is visible, with its screen-space anchor. */
  onDoorPromptMove?: (screenX: number, screenY: number) => void;
  onFloorChanged?: (info: FloorInfo | null) => void;
  onZoneChanged?: (zoneName: string) => void;
  onZoomChanged?: (zoom: number) => void;
  onProximityChanged?: (distances: Map<string, number>) => void;
  onRemotePlayerTap?: (player: {
    userId: string;
    displayName: string;
    avatarConfig: PlayerEntity['avatarConfig'];
    x: number;
    y: number;
  }) => void;

  constructor(params: {
    canvas: HTMLCanvasElement;
    initialX: number;
    initialY: number;
    displayName: string;
    avatarConfig: PlayerEntity['avatarConfig'];
    space: SpaceModel;
    syncService?: WorldSyncService;
  }) {
    this.canvas = params.canvas;
    this.ctx = params.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.space = params.space;
    this.syncService = params.syncService || null;
    this.boundaryWalls = getBoundaryWallsForMap(params.space.mapTheme);
    this.buildings = getBuildingsForMap(params.space.mapTheme);
    this.boundaryWalls = [...this.boundaryWalls, ...getBuildingWalls(this.buildings)];
    this.wallIndex = new WallIndex(this.boundaryWalls);
    this.lowWallIndex = new WallIndex(getMapConfig(params.space.mapTheme).lowWalls ?? []);
    this.mapSize = getMapSize(params.space.mapTheme);
    const mapConfig = getMapConfig(params.space.mapTheme);
    this.renderEntrance = mapConfig.renderEntrance;
    this.hasEntrances = (mapConfig.entrances?.length ?? 0) > 0;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.player = new PlayerEntity(
      params.initialX,
      params.initialY,
      params.displayName,
      params.avatarConfig
    );
    this.player.mapTheme = params.space.mapTheme || 'village';

    this.initDefaultProps();
    this.setupInputs();
  }

  setSyncService(sync: WorldSyncService | null) {
    const changed = sync !== this.syncService;
    this.syncService = sync;
    if (changed && this.zombieMode) this.connectZombieNet();
  }

  /** Toggles Zomboid-style survival: vision cone, fog of war and zombies. */
  setZombieMode(enabled: boolean) {
    if (enabled === !!this.zombieMode) return;
    if (enabled) {
      this.zombieMode = new ZombieMode(
        getBoundaryWallsForMap(this.space.mapTheme),
        this.buildings,
        this.mapSize.w,
        this.mapSize.h,
        undefined,
        getMapConfig(this.space.mapTheme).entrances ?? [],
        getMapConfig(this.space.mapTheme).lowWalls ?? [],
        getMapConfig(this.space.mapTheme).loot ?? []
      );
      this.zombieMode.onHudChanged = (hud) => this.onZombieHud?.(hud);
      this.connectZombieNet();
      this.applyZoomLimits(SURVIVAL_ZOOM_LIMITS.min, SURVIVAL_ZOOM_LIMITS.max);
      this.survivalZoom.outside = this.camera.zoom;
    } else {
      this.disconnectZombieNet();
      this.zombieMode?.dispose();
      this.zombieMode = null;
      this.onZombieHud?.(null);
      this.applyZoomLimits();
    }
  }

  /**
   * Survival: indoors and outdoors each remember their own zoom, and the camera
   * eases between them as you cross a threshold, so interiors fill the screen.
   */
  private updateSurvivalZoom(dt: number) {
    if (!this.zombieMode) return;
    const target = this.insideBuildingId ? this.survivalZoom.inside : this.survivalZoom.outside;
    const current = this.camera.zoom;
    const diff = target - current;
    if (Math.abs(diff) < 0.005) return;
    const step = this.reducedMotion || Math.abs(diff) < 0.015 ? diff : diff * Math.min(1, dt * 6);
    const next = this.camera.setZoom(current + (Math.abs(step) < 0.01 ? Math.sign(diff) * 0.01 : step));
    if (Math.round(next * 20) !== Math.round(current * 20) || next === target) this.onZoomChanged?.(next);
  }

  /** Manual zoom in survival updates the preference for where the player is now. */
  private rememberSurvivalZoom() {
    if (!this.zombieMode) return;
    if (this.insideBuildingId) this.survivalZoom.inside = this.camera.zoom;
    else this.survivalZoom.outside = this.camera.zoom;
  }

  /** Walls, closed doors/windows, and — unless mid-jump — low obstacles. */
  private blocksMove(box: Rect, airborne: boolean): boolean {
    return (
      this.wallIndex.hits(box) ||
      !!this.zombieMode?.isBlocked(box) ||
      (!airborne && this.lowWallIndex.hits(box))
    );
  }

  /** Survival hop over fences, cars and bins (Space / jump button). */
  jump(): boolean {
    if (!this.zombieMode || this.jumpT >= 0 || this.zombieMode.isDead() || this.iris) return false;
    this.jumpT = 0;
    return true;
  }

  /** Advances the jump arc; a landing on top of an obstacle is postponed until clear. */
  private updateJump(dt: number) {
    if (this.jumpT < 0) return;
    this.jumpT += dt;
    if (this.jumpT < JUMP_SECONDS) {
      this.player.jumpHeight = Math.sin((Math.PI * this.jumpT) / JUMP_SECONDS) * JUMP_HEIGHT;
      return;
    }
    const box = this.playerHitbox(this.player.x, this.player.y);
    if (this.lowWallIndex.hits(box) && this.jumpT < JUMP_SECONDS + JUMP_HANG_SECONDS) {
      this.player.jumpHeight = 2; // still clearing the fence/car
      return;
    }
    this.jumpT = -1;
    this.player.jumpHeight = 0;
    this.zombieMode?.emitNoise({ x: this.player.x + 16, y: this.player.y + 28, radius: LANDING_NOISE_RADIUS });
  }

  /**
   * Feet collider for a player top-left position. Survival uses a slimmer box
   * (12 × 10 around the feet) so 2-tile doorways and furniture gaps feel natural;
   * social maps keep the original 16 × 16.
   */
  private playerHitbox(x: number, y: number): Rect {
    return this.zombieMode ? { x: x + 10, y: y + 20, w: 12, h: 10 } : { x: x + 8, y: y + 16, w: 16, h: 16 };
  }

  private applyZoomLimits(min?: number, max?: number) {
    const before = this.camera.zoom;
    const updated = this.camera.setZoomLimits(min, max);
    if (updated !== before) {
      this.followCamera();
      this.onZoomChanged?.(updated);
    }
  }

  /** Shares the horde with everyone else in zombie mode in this space (solo when offline). */
  private connectZombieNet() {
    this.disconnectZombieNet();
    const sync = this.syncService;
    if (!this.zombieMode || !sync) return;
    this.zombieNet = new ZombieSyncService({ spaceId: sync.spaceId, clientInstanceId: sync.clientInstanceId });
    this.zombieMode.attachNet(this.zombieNet);
    this.zombieNet.connect();
  }

  private disconnectZombieNet() {
    this.zombieNet?.disconnect();
    this.zombieNet = null;
  }

  isZombieMode(): boolean {
    return !!this.zombieMode;
  }

  /**
   * Door/window action in zombie mode (E open/close, L lock, B board up,
   * Shift+B pull a plank, or the HUD chip). 'lockToggle' locks or unlocks.
   */
  zombieDoorAction(action: DoorActionType | 'lockToggle'): boolean {
    if (!this.zombieMode) return false;
    if (action === 'lockToggle') {
      return this.zombieMode.doorAction('lock') || this.zombieMode.doorAction('unlock');
    }
    return this.zombieMode.doorAction(action);
  }

  /** Melee swing in zombie mode (F / Space / dock action button). */
  zombieAttack(): boolean {
    if (!this.zombieMode) return false;
    this.zombieMode.attack();
    return true;
  }

  /** Fire button held / released (auto weapons keep firing while held). */
  zombieTrigger(down: boolean) {
    this.zombieMode?.setTrigger(down);
  }

  zombieReload(): boolean {
    return !!this.zombieMode?.reload();
  }

  zombieSelectWeapon(id: WeaponId): boolean {
    return !!this.zombieMode?.selectWeapon(id);
  }

  /** Sprint toggle for touch (desktop holds Shift). Returns the new state. */
  zombieToggleSprint(): boolean {
    return !!this.zombieMode?.toggleSprint();
  }

  /** Sprint while the touch button is held (hold mode). */
  zombieSprintHold(down: boolean) {
    this.touchSprintHeld = down;
  }

  /** Applies Controls settings; keys held under the old bindings are released. */
  setKeyBindings(bindings: KeyBindings) {
    this.bindings = bindings;
    this.keysDown.clear();
    this.zombieMode?.setTrigger(false);
  }

  /** True while any key bound to `action` is held. */
  private held(action: ControlAction): boolean {
    const [a, b] = this.bindings[action];
    return (!!a && this.keysDown.has(a)) || (!!b && this.keysDown.has(b));
  }

  /** Eat / drink / use a supply (C picks what you need most). */
  zombieUseSupply(id?: ConsumableId): boolean {
    return !!this.zombieMode?.useSupply(id);
  }

  zombieCycleWeapon(dir: 1 | -1 = 1) {
    this.zombieMode?.cycleWeapon(dir);
  }

  getPlayerPosition(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  setPlayerPosition(x: number, y: number) {
    this.player.x = x;
    this.player.y = y;
  }

  teleportTo(x: number, y: number, zoneName?: string) {
    this.player.x = x;
    this.player.y = y;
    this.player.clearTargetDestination();
    this.followCamera();

    if (zoneName) {
      this.player.speechBubble = `✨ Teleported to ${zoneName}!`;
      this.player.speechExpiresAt = Date.now() + 3500;
    }

    if (this.syncService) {
      this.syncService.broadcastMovement(
        this.player.x,
        this.player.y,
        this.player.direction,
        false,
        true
      );
    }

    const zName = this.getZoneName(x, y);
    this.currentZoneName = zName;
    if (this.onZoneChanged) {
      this.onZoneChanged(zName);
    }
  }

  /** Zone label for a position; upper floors report "Building · 2F". */
  private getZoneName(x: number, y: number): string {
    const hit = findLevelAt(this.buildings, x, y);
    if (hit) return `${hit.building.name} · ${hit.level.label}`;
    return getCurrentZone(x, y, this.space.mapTheme).name;
  }

  /** Camera follow clamped to the current upper floor when upstairs, otherwise the outdoor map. */
  private followCamera() {
    this.currentLevel = findLevelAt(this.buildings, this.player.x + 16, this.player.y + 28);
    this.camera.follow(
      this.player.x,
      this.player.y,
      this.canvas.width,
      this.canvas.height,
      this.currentLevel?.level.bounds ?? { x: 0, y: 0, w: this.mapSize.w, h: this.mapSize.h }
    );
  }

  private initDefaultProps() {
    const props = getDefaultPropsForMap(this.space.mapTheme);
    let idx = 1;
    for (const p of props) {
      this.furniture.push(new FurnitureEntity(`prop-${idx++}`, p.type, p.x, p.y));
    }
  }

  async loadCloudObjects() {
    if (!this.space.id) return;
    const objs = await SpaceService.fetchWorldObjects(this.space.id);
    for (const obj of objs) {
      this.furniture.push(
        new FurnitureEntity(obj.id, obj.objectType as FurnitureType, obj.x, obj.y)
      );
    }
  }

  setCompanion(comp: CompanionModel | null) {
    if (!comp) {
      this.companion = null;
      return;
    }
    if (this.companion && this.companion.companion.id === comp.id) {
      // Same companion with new name / mood / species: keep position and state
      this.companion.setModel(comp);
      return;
    }
    this.companion = new CompanionEntity(this.player.x - 24, this.player.y - 16, comp);
    this.companion.onWake = () => this.onCompanionWake?.();
    this.companion.onSleep = () => this.onCompanionSleep?.();
  }

  /** Show a companion speech bubble / emote (no-op without a companion). */
  companionSay(text: string, emote?: CompanionEmote, mood?: CompanionMood, ms?: number) {
    if (!this.companion) return;
    if (text) this.companion.say(text, ms);
    this.companion.react(emote, mood);
  }

  /** Have the companion lead the player to a world position. */
  companionGuideTo(x: number, y: number, name: string, onArrive?: () => void) {
    this.companion?.guideTo(x, y, name, onArrive);
  }

  setJoystickInput(x: number, y: number) {
    this.joystickInput = { x, y };
    if (x !== 0 || y !== 0) {
      this.player.clearTargetDestination();
    }
  }

  start() {
    // Large maps stream their ground layer in chunks; small maps keep one pre-render
    const config = getMapConfig(this.space.mapTheme);
    if (config.renderChunk) {
      this.chunkedMap = new ChunkedMapRenderer(config.renderChunk, this.mapSize.w, this.mapSize.h);
    } else {
      this.preRenderedMap = createPreRenderedWorldMap(this.space.mapTheme);
    }
    this.roofLayers.clear();
    this.levelLayers.clear();
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private loop = (currentTime: number) => {
    if (!this.isRunning) return;
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.updateIris(dt);
    const inputFrozen =
      (!!this.iris && this.iris.phase !== 'opening') || !!this.zombieMode?.isDead();

    // 1. Calculate Movement Vector
    let dx = 0;
    let dy = 0;
    this.zombieMode?.setSprint(this.held('sprint') || this.touchSprintHeld);
    const speed = (this.player.isSwimming ? 110 : 160) * (this.zombieMode?.moveMultiplier() ?? 1);
    // Mouse aim goes stale when the mouse rests: fall back to aiming where you walk
    if (this.zombieMode && this.lastAimAt && performance.now() - this.lastAimAt > AIM_IDLE_MS) {
      this.zombieMode.setAim(null);
      this.lastAimAt = 0;
    }

    // Keyboard Input
    if (this.held('moveUp')) dy -= 1;
    if (this.held('moveDown')) dy += 1;
    if (this.held('moveLeft')) dx -= 1;
    if (this.held('moveRight')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      this.player.clearTargetDestination();
    }

    // Touch Virtual Joystick
    if (this.joystickInput.x !== 0 || this.joystickInput.y !== 0) {
      dx = this.joystickInput.x;
      dy = this.joystickInput.y;
      this.player.clearTargetDestination();
    }

    // Tap-to-move / Click-to-move navigation (PC mouse click or mobile touch)
    if (dx === 0 && dy === 0 && this.player.targetDestination) {
      const tdx = this.player.targetDestination.x - this.player.x;
      const tdy = this.player.targetDestination.y - this.player.y;
      const tdist = Math.hypot(tdx, tdy);

      if (tdist < 4) {
        this.player.clearTargetDestination();
      } else {
        dx = tdx / tdist;
        dy = tdy / tdist;
      }
    }

    if (inputFrozen) {
      dx = 0;
      dy = 0;
    }

    const isMoving = dx !== 0 || dy !== 0;
    this.lastMoveInput.x = dx;
    this.lastMoveInput.y = dy;
    if (isMoving) {
      // If a saved position overlaps a collider, let the player walk free instead of sticking
      const currentHitbox = this.playerHitbox(this.player.x, this.player.y);
      const airborne = this.jumpT >= 0;
      const stuck =
        this.wallIndex.hits(currentHitbox) ||
        !!this.zombieMode?.isBlocked(currentHitbox) ||
        (!airborne && this.lowWallIndex.hits(currentHitbox));

      const len = Math.hypot(dx, dy);
      const nx = (dx / len) * speed * dt;
      const ny = (dy / len) * speed * dt;

      // Desired position with collision slide support
      let targetX = this.player.x + nx;
      let targetY = this.player.y + ny;

      // Collision Check X
      const playerHitboxX = this.playerHitbox(targetX, this.player.y);
      let collidesX = !stuck && this.blocksMove(playerHitboxX, airborne);
      if (!collidesX) {
        for (const furn of this.furniture) {
          if (airborne && JUMPABLE_FURNITURE.has(furn.type)) continue;
          const hb = furn.getHitbox();
          if (hb && checkAABB(playerHitboxX, hb)) {
            collidesX = true;
            break;
          }
        }
      }
      if (collidesX) targetX = this.player.x;

      // Collision Check Y
      const playerHitboxY = this.playerHitbox(targetX, targetY);
      let collidesY = !stuck && this.blocksMove(playerHitboxY, airborne);
      if (!collidesY) {
        for (const furn of this.furniture) {
          if (airborne && JUMPABLE_FURNITURE.has(furn.type)) continue;
          const hb = furn.getHitbox();
          if (hb && checkAABB(playerHitboxY, hb)) {
            collidesY = true;
            break;
          }
        }
      }
      if (collidesY) targetY = this.player.y;

      // If obstructed while walking to a tap target, cancel target destination to avoid getting stuck
      if (this.player.targetDestination && collidesX && collidesY) {
        this.player.clearTargetDestination();
      }

      this.player.x = targetX;
      this.player.y = targetY;

      // Directional Facing
      if (Math.abs(dx) > Math.abs(dy)) {
        this.player.direction = dx > 0 ? 'right' : 'left';
      } else {
        this.player.direction = dy > 0 ? 'down' : 'up';
      }
    }

    const prevMoving = this.player.isMoving;
    this.player.isMoving = isMoving;
    this.player.update(dt);

    // Check map zone
    const zoneName = this.getZoneName(this.player.x + 16, this.player.y + 20);
    if (zoneName !== this.currentZoneName) {
      this.currentZoneName = zoneName;
      if (this.onZoneChanged) {
        this.onZoneChanged(zoneName);
      }
    }

    // Broadcast movement to peers
    if (isMoving || prevMoving) {
      this.syncService?.broadcastMovement(
        this.player.x,
        this.player.y,
        this.player.direction,
        isMoving,
        prevMoving && !isMoving
      );
    }

    // 2. Update Companion
    if (this.companion) {
      this.companion.update(dt, this.player.x, this.player.y);
    }

    // 3. Update Remote Avatars
    if (this.syncService) {
      const peers = this.syncService.getRemotePlayers();
      const peerDistances = new Map<string, number>();

      for (const [id, state] of peers.entries()) {
        let avatar = this.remoteAvatars.get(id);
        if (!avatar) {
          avatar = new RemotePlayerEntity(
            id,
            state.displayName,
            state.avatarConfig,
            state.x,
            state.y
          );
          avatar.mapTheme = this.space.mapTheme || 'village';
          avatar.userId = state.userId || id;
          this.remoteAvatars.set(id, avatar);
        } else {
          avatar.userId = state.userId || avatar.userId || id;
          avatar.displayName = state.displayName;
          avatar.avatarConfig = state.avatarConfig;
          avatar.updateState({
            x: state.x,
            y: state.y,
            direction: state.direction,
            isMoving: state.isMoving,
            speechBubble: state.speechBubble,
            speechExpiresAt: state.speechExpiresAt,
          });
        }
        avatar.update(dt);

        // Passive companion that follows this remote player
        if (state.companion) {
          let rc = this.remoteCompanions.get(id);
          const model: CompanionModel = {
            id: `remote-${id}`,
            userId: state.userId || id,
            name: state.companion.name,
            persona: '',
            companionType: state.companion.species,
            species: state.companion.species,
            avatarStyle: 'default',
            learnedContext: {},
            isActive: true,
          };
          if (!rc) {
            rc = new CompanionEntity(avatar.x + 28, avatar.y + 6, model, { passive: true });
            this.remoteCompanions.set(id, rc);
          } else if (rc.companion.name !== model.name || rc.species !== model.species) {
            rc.setModel(model);
          }
          rc.update(dt, avatar.x, avatar.y);
        } else if (this.remoteCompanions.has(id)) {
          this.remoteCompanions.delete(id);
        }

        const dist = Math.hypot(avatar.x - this.player.x, avatar.y - this.player.y);
        peerDistances.set(id, dist);
      }

      for (const id of this.remoteAvatars.keys()) {
        if (!peers.has(id)) {
          this.remoteAvatars.delete(id);
          this.remoteCompanions.delete(id);
        }
      }

      const now = performance.now();
      if (this.onProximityChanged && now - this.lastProximityCheckTime >= 150) {
        this.lastProximityCheckTime = now;
        this.onProximityChanged(peerDistances);
      }
    }

    this.updateJump(dt);

    // 4. Update Camera (survival eases zoom in when you step inside a building)
    this.updateSurvivalZoom(dt);
    this.followCamera();

    // 5. Enterable buildings: roof lift + door prompt
    this.updateBuildings(dt);

    // 6. Zombie mode: vision, zombie AI, bites, respawn
    if (this.zombieMode) {
      // Zombies hunt only players who are also in zombie mode (keyed by clientInstanceId)
      const others = [];
      const peers = this.syncService?.getRemotePlayers();
      for (const [id, r] of this.remoteAvatars) {
        const state = peers?.get(id);
        const clientId = state?.clientId ?? id;
        if (this.zombieNet && !this.zombieNet.isMember(clientId)) continue;
        others.push({ id: clientId, x: r.x + 16, y: r.y + 28, moving: !!state?.isMoving });
      }
      const outcome = this.zombieMode.update(dt, {
        feetX: this.player.x + 16,
        feetY: this.player.y + 28,
        moveX: this.lastMoveInput.x,
        moveY: this.lastMoveInput.y,
        insideBuildingId: this.insideBuildingId,
        others,
      });
      if (outcome === 'respawn') {
        const spawn = getMapConfig(this.space.mapTheme).defaultSpawn;
        this.teleportTo(spawn.x, spawn.y);
        this.player.speechBubble = '🧟 You were bitten… back at spawn';
        this.player.speechExpiresAt = Date.now() + 3500;
      }
    }
  }

  /** Roof layer, rendered the first time the building is on screen (cities have too many to pre-render). */
  private getRoofLayer(b: BuildingDefinition): HTMLCanvasElement | null {
    const cached = this.roofLayers.get(b.id);
    if (cached) return cached;
    const layer = document.createElement('canvas');
    layer.width = b.footprint.w;
    layer.height = b.footprint.h;
    const lctx = layer.getContext('2d');
    if (!lctx) return null;
    lctx.imageSmoothingEnabled = false;
    lctx.scale(2, 2);
    b.renderRoof(lctx, b.footprint.w / 2, b.footprint.h / 2);
    this.roofLayers.set(b.id, layer);
    return layer;
  }

  /** Upper-floor layer, rendered on first visit. */
  private getLevelLayer(level: UpperLevel): HTMLCanvasElement | null {
    const cached = this.levelLayers.get(level.id);
    if (cached) return cached;
    const layer = document.createElement('canvas');
    layer.width = level.bounds.w;
    layer.height = level.bounds.h;
    const lctx = layer.getContext('2d');
    if (!lctx) return null;
    lctx.imageSmoothingEnabled = false;
    lctx.scale(2, 2);
    level.render(lctx, level.bounds.w / 2, level.bounds.h / 2);
    this.levelLayers.set(level.id, layer);
    return layer;
  }

  private updateBuildings(dt: number) {
    if (this.buildings.length === 0) return;

    const feetX = this.player.x + 16;
    const feetY = this.player.y + 28;
    // Upstairs counts as inside the building (keeps its roof lifted for the trip back down)
    this.insideBuildingId = this.currentLevel
      ? this.currentLevel.building.id
      : resolveBuildingAt(this.buildings, this.insideBuildingId, feetX, feetY);
    if (this.insideBuildingId) this.dimBuildingId = this.insideBuildingId;
    this.doorPulse += dt * 4;

    // Stairs: walking onto a trigger starts the iris wipe; re-arm once the feet leave it
    let stairHit = this.iris ? null : findStairAt(this.buildings, feetX, feetY);
    // Auto-walking to a chosen staircase: ignore any other flight on the way
    // (a floor's up and down stairs can sit side by side in one stairwell)
    if (this.stairGoal && !this.player.targetDestination) this.stairGoal = null;
    if (stairHit && this.stairGoal && stairHit.stair !== this.stairGoal) stairHit = null;
    if (stairHit && this.stairArmed) {
      this.stairGoal = null;
      this.startIris(stairHit.stair);
    }
    if (!this.iris) this.stairArmed = !stairHit;

    this.updateFloorInfo();

    for (const b of this.buildings) {
      const current = this.roofProgress.get(b.id) ?? 0;
      const next = stepRoofProgress(current, b.id === this.insideBuildingId, dt * 1000, this.reducedMotion);
      this.roofProgress.set(b.id, next);
    }
    if (!this.insideBuildingId && this.dimBuildingId && (this.roofProgress.get(this.dimBuildingId) ?? 0) === 0) {
      this.dimBuildingId = null;
    }

    // Door prompt: Enter from outside, Exit only for the building you are in.
    // Maps with real doors (Zombie Survival) use E on the door itself instead.
    const door = this.hasEntrances ? null : findNearestDoor(this.buildings, feetX, feetY);
    let prompt: DoorPrompt | null = null;
    if (door && !this.iris && (!this.insideBuildingId || door.id === this.insideBuildingId)) {
      let occupants = 0;
      for (const r of this.remoteAvatars.values()) {
        const fx = r.x + 16;
        const fy = r.y + 28;
        const f = door.footprint;
        if (fx >= f.x && fx <= f.x + f.w && fy >= f.y && fy <= f.y + f.h) occupants++;
      }
      prompt = {
        buildingId: door.id,
        name: door.name,
        icon: door.icon,
        color: door.color,
        action: this.insideBuildingId ? 'exit' : 'enter',
        occupants,
      };
    }

    const prev = this.doorPrompt;
    const changed =
      prev?.buildingId !== prompt?.buildingId ||
      prev?.action !== prompt?.action ||
      prev?.occupants !== prompt?.occupants;
    this.doorPrompt = prompt;
    if (changed && this.onDoorPromptChanged) {
      this.onDoorPromptChanged(prompt);
    }

    if (prompt && door) {
      if (this.onDoorPromptMove) {
        const d = door.door.rect;
        // Enter: anchor above the door. Exit: anchor below it so the chip clears the avatar.
        const anchorY = prompt.action === 'enter' ? d.y - 6 : d.y + d.h + 6;
        this.onDoorPromptMove(
          (d.x + d.w / 2 - this.camera.x) * this.camera.zoom,
          (anchorY - this.camera.y) * this.camera.zoom
        );
      }
    }
  }

  /** Auto-walks the player through the door of the current prompt (E key / action button / chip tap). */
  activateDoor(): boolean {
    const prompt = this.doorPrompt;
    if (!prompt) return false;
    const building = this.buildings.find((b) => b.id === prompt.buildingId);
    if (!building) return false;
    const target = prompt.action === 'enter' ? building.door.insideSpawn : building.door.outsideSpawn;
    this.player.setTargetDestination(target.x, target.y);
    return true;
  }

  getDoorPrompt(): DoorPrompt | null {
    return this.doorPrompt;
  }

  /** Auto-walks the player to the stairs that lead to another floor of the current building. */
  goToFloor(levelId: string | null): boolean {
    const building = this.buildings.find((b) => b.id === this.insideBuildingId);
    if (!building || this.iris) return false;
    const currentId = this.currentLevel?.level.id ?? null;
    if (currentId === levelId) return false;
    // One flight at a time: head up or down toward the target; arriving re-targets via the selector
    const goingUp = floorIndex(building, levelId) > floorIndex(building, currentId);
    const stair = this.currentLevel
      ? goingUp
        ? this.currentLevel.level.stairsUp
        : this.currentLevel.level.stairs
      : building.groundStairs;
    if (!stair) return false;
    const r = stair.rect;
    this.player.setTargetDestination(r.x + r.w / 2 - 16, r.y + r.h / 2 - 28);
    this.stairGoal = stair;
    return true;
  }

  /** Emits the floor selector model while inside a multi-storey building (throttled). */
  private updateFloorInfo() {
    const now = performance.now();
    if (now - this.lastFloorInfoCheck < 200) return;
    this.lastFloorInfoCheck = now;

    const building = this.buildings.find((b) => b.id === this.insideBuildingId);
    let info: FloorInfo | null = null;
    if (building && building.levels && building.levels.length > 0) {
      const counts = new Map<string | null, number>();
      const f = building.footprint;
      for (const r of this.remoteAvatars.values()) {
        const fx = r.x + 16;
        const fy = r.y + 28;
        const lvl = findLevelAt([building], fx, fy);
        if (lvl) {
          counts.set(lvl.level.id, (counts.get(lvl.level.id) ?? 0) + 1);
        } else if (fx >= f.x && fx <= f.x + f.w && fy >= f.y && fy <= f.y + f.h) {
          counts.set(null, (counts.get(null) ?? 0) + 1);
        }
      }
      info = {
        buildingId: building.id,
        buildingName: building.name,
        color: building.color,
        currentLevelId: this.currentLevel?.level.id ?? null,
        floors: getFloors(building).map((fl) => ({ ...fl, occupants: counts.get(fl.levelId) ?? 0 })),
      };
    }

    const key = info ? JSON.stringify(info) : '';
    if (key === this.floorInfoKey) return;
    this.floorInfoKey = key;
    if (this.onFloorChanged) this.onFloorChanged(info);
  }

  private irisDurations() {
    return this.reducedMotion
      ? { close: IRIS_REDUCED_MS, hold: 0, open: IRIS_REDUCED_MS }
      : { close: IRIS_CLOSE_MS, hold: IRIS_HOLD_MS, open: IRIS_OPEN_MS };
  }

  private startIris(stair: StairLink) {
    this.stairArmed = false;
    this.player.clearTargetDestination();
    const r = stair.rect;
    this.iris = {
      phase: 'closing',
      elapsed: 0,
      from: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
      to: { x: stair.arrival.x + 16, y: stair.arrival.y + 20 },
      stair,
    };
  }

  private updateIris(dt: number) {
    const iris = this.iris;
    if (!iris) return;
    iris.elapsed += dt * 1000;
    const d = this.irisDurations();
    if (iris.phase === 'closing' && iris.elapsed >= d.close) {
      this.swapFloor(iris.stair);
      iris.phase = 'hold';
      iris.elapsed = 0;
    }
    if (iris.phase === 'hold' && iris.elapsed >= d.hold) {
      iris.phase = 'opening';
      iris.elapsed = 0;
    }
    if (iris.phase === 'opening' && iris.elapsed >= d.open) {
      this.iris = null;
    }
  }

  /** Moves the player to the other floor while the screen is covered. */
  private swapFloor(stair: StairLink) {
    this.player.x = stair.arrival.x;
    this.player.y = stair.arrival.y;
    this.player.clearTargetDestination();
    this.followCamera();
    this.syncService?.broadcastMovement(this.player.x, this.player.y, this.player.direction, false, true);
  }

  private render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;

    const onLevel = this.currentLevel?.level ?? null;
    if (onLevel) {
      this.ctx.fillStyle = LEVEL_VOID_COLOR;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.save();
    this.ctx.scale(this.camera.zoom, this.camera.zoom);
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw the upper floor (clipped so neighbouring floors never show) or the outdoor map
    if (onLevel) {
      const b = onLevel.bounds;
      const m = LEVEL_CLIP_MARGIN;
      this.ctx.beginPath();
      this.ctx.rect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2);
      this.ctx.clip();
      const layer = this.getLevelLayer(onLevel);
      if (layer) this.ctx.drawImage(layer, b.x, b.y);
    } else if (this.chunkedMap) {
      this.chunkedMap.draw(this.ctx, {
        x: this.camera.x,
        y: this.camera.y,
        w: this.canvas.width / this.camera.zoom,
        h: this.canvas.height / this.camera.zoom,
      });
    } else if (this.preRenderedMap) {
      this.ctx.drawImage(this.preRenderedMap, 0, 0);
    }

    // 2. Performance: Viewport Culling Bounds
    const viewLeft = this.camera.x - 48;
    const viewTop = this.camera.y - 48;
    const viewRight = this.camera.x + this.canvas.width / this.camera.zoom + 48;
    const viewBottom = this.camera.y + this.canvas.height / this.camera.zoom + 48;

    // Doors and windows in their live state (drawn per frame so chunks stay cached)
    if (this.zombieMode && this.renderEntrance) {
      const draw = this.renderEntrance;
      this.zombieMode.forEachEntranceIn(viewLeft, viewTop, viewRight, viewBottom, (e) => draw(this.ctx, e));
    }

    // 3. Collect Visible Depth-Sorted Entities (Y-sorting for 2.5D visual accuracy)
    type Renderable = { y: number; draw: () => void };
    const renderList: Renderable[] = [];

    // Furniture with Viewport Culling
    for (const f of this.furniture) {
      const size = f.getSize();
      if (
        f.x + size.w >= viewLeft &&
        f.x <= viewRight &&
        f.y + size.h >= viewTop &&
        f.y <= viewBottom
      ) {
        renderList.push({ y: f.y + 16, draw: () => f.render(this.ctx) });
      }
    }

    // Remote Players with Viewport Culling
    for (const r of this.remoteAvatars.values()) {
      if (
        r.x + 36 >= viewLeft &&
        r.x <= viewRight &&
        r.y + 40 >= viewTop &&
        r.y <= viewBottom
      ) {
        renderList.push({ y: r.y + 30, draw: () => r.render(this.ctx) });
      }
    }

    // Other players' companions
    for (const rc of this.remoteCompanions.values()) {
      if (rc.x + 40 >= viewLeft && rc.x - 40 <= viewRight && rc.y + 40 >= viewTop && rc.y - 40 <= viewBottom) {
        renderList.push({ y: rc.y + 20, draw: () => rc.render(this.ctx) });
      }
    }

    // Companion
    if (this.companion) {
      renderList.push({ y: this.companion.y + 20, draw: () => this.companion?.render(this.ctx) });
    }

    // Local Player
    renderList.push({ y: this.player.y + 30, draw: () => this.player.render(this.ctx) });

    // Building roofs: depth-sorted by footprint bottom so avatars in front of a
    // building draw over its façade and avatars inside are hidden under the roof
    for (const b of onLevel ? [] : this.buildings) {
      const lift = easeOutCubic(this.roofProgress.get(b.id) ?? 0);
      if (lift >= 1) continue;
      const f = b.footprint;
      if (f.x + f.w < viewLeft || f.x > viewRight || f.y + f.h < viewTop || f.y > viewBottom) continue;
      const layer = this.getRoofLayer(b);
      if (!layer) continue;
      renderList.push({
        y: f.y + f.h,
        draw: () => {
          this.ctx.save();
          this.ctx.globalAlpha = 1 - lift;
          const offsetY = this.reducedMotion ? 0 : -ROOF_LIFT_OFFSET * lift;
          this.ctx.drawImage(layer, f.x, f.y + offsetY);
          this.ctx.restore();
        },
      });
    }

    // Zombies the player can see or sense (hidden ones are never drawn)
    if (this.zombieMode) {
      renderList.push(
        ...this.zombieMode.collectRenderables(this.ctx, {
          left: viewLeft,
          top: viewTop,
          right: viewRight,
          bottom: viewBottom,
        })
      );
    }

    // Sort by bottom Y
    renderList.sort((a, b) => a.y - b.y);

    for (const r of renderList) {
      r.draw();
    }

    this.zombieMode?.renderWorld(this.ctx);

    if (!onLevel) {
      this.renderInteriorDim(viewLeft, viewTop, viewRight, viewBottom);
      this.renderDoorHighlight();
    }
    this.renderStairHighlight();

    this.ctx.restore();

    this.zombieMode?.renderScreen(this.ctx, this.canvas.width, this.canvas.height);
    this.renderIris();
  }

  /** Gentle pulse on stairs near the player so they read as interactive. */
  private renderStairHighlight() {
    if (this.iris) return;
    const feetX = this.player.x + 16;
    const feetY = this.player.y + 28;
    for (const b of this.buildings) {
      for (const stair of getStairLinks(b)) {
        const r = stair.rect;
        const dist = Math.hypot(feetX - (r.x + r.w / 2), feetY - (r.y + r.h / 2));
        if (dist > 72) continue;
        const pulse = this.reducedMotion ? 0.5 : 0.35 + 0.3 * Math.sin(this.doorPulse);
        this.ctx.save();
        this.ctx.globalAlpha = pulse;
        this.ctx.strokeStyle = '#FDE047';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        this.ctx.restore();
      }
    }
  }

  /** Screen-space iris wipe for floor changes (plain fade when reduced motion is on). */
  private renderIris() {
    const iris = this.iris;
    if (!iris) return;
    const d = this.irisDurations();
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Coverage: 0 = fully open, 1 = fully closed
    let cover = 1;
    if (iris.phase === 'closing') cover = Math.min(1, iris.elapsed / Math.max(1, d.close));
    if (iris.phase === 'opening') cover = 1 - Math.min(1, iris.elapsed / Math.max(1, d.open));
    const center = iris.phase === 'closing' ? iris.from : iris.to;

    this.ctx.save();
    this.ctx.fillStyle = LEVEL_VOID_COLOR;
    if (this.reducedMotion) {
      this.ctx.globalAlpha = cover;
      this.ctx.fillRect(0, 0, w, h);
    } else {
      const sx = (center.x - this.camera.x) * this.camera.zoom;
      const sy = (center.y - this.camera.y) * this.camera.zoom;
      const maxR = Math.hypot(Math.max(sx, w - sx), Math.max(sy, h - sy));
      // Ease in while closing, ease out while opening
      const open = iris.phase === 'opening' ? easeOutCubic(1 - cover) : 1 - cover * cover;
      const radius = maxR * open;
      this.ctx.beginPath();
      this.ctx.rect(0, 0, w, h);
      if (radius > 0.5) this.ctx.arc(sx, sy, radius, 0, Math.PI * 2, true);
      this.ctx.fill('evenodd');
    }
    this.ctx.restore();
  }

  /** Dims everything outside the building the player is in, so focus moves indoors. */
  private renderInteriorDim(left: number, top: number, right: number, bottom: number) {
    if (!this.dimBuildingId) return;
    const building = this.buildings.find((b) => b.id === this.dimBuildingId);
    if (!building) return;
    const alpha = INTERIOR_DIM_ALPHA * easeOutCubic(this.roofProgress.get(building.id) ?? 0);
    if (alpha <= 0) return;

    const f = building.footprint;
    this.ctx.save();
    this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    this.ctx.fillRect(left, top, right - left, f.y - top);
    this.ctx.fillRect(left, f.y + f.h, right - left, bottom - (f.y + f.h));
    this.ctx.fillRect(left, f.y, f.x - left, f.h);
    this.ctx.fillRect(f.x + f.w, f.y, right - (f.x + f.w), f.h);
    this.ctx.restore();
  }

  /** Pulsing door-mat outline while the Enter/Exit prompt is showing. */
  private renderDoorHighlight() {
    const prompt = this.doorPrompt;
    if (!prompt) return;
    const building = this.buildings.find((b) => b.id === prompt.buildingId);
    if (!building) return;
    const d = building.door.rect;
    const pulse = this.reducedMotion ? 0.6 : 0.45 + 0.35 * Math.sin(this.doorPulse);
    this.ctx.save();
    this.ctx.globalAlpha = pulse;
    this.ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
    this.ctx.fillRect(d.x, d.y, d.w, d.h);
    this.ctx.strokeStyle = '#FDE047';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
    this.ctx.restore();
  }

  placeFurnitureAtScreen(screenX: number, screenY: number) {
    if (!this.selectedFurniture) return;
    const worldX = screenX / this.camera.zoom + this.camera.x - 16;
    const worldY = screenY / this.camera.zoom + this.camera.y - 16;

    const newObj = new FurnitureEntity(
      `obj-${Date.now()}`,
      this.selectedFurniture,
      Math.floor(worldX),
      Math.floor(worldY)
    );
    this.furniture.push(newObj);

    if (this.space.id) {
      SpaceService.saveWorldObject({
        spaceId: this.space.id,
        objectType: this.selectedFurniture,
        x: newObj.x,
        y: newObj.y,
        rotation: 0,
        properties: {},
      }).then();
    }
  }

  setZoom(newZoom: number): number {
    const updated = this.camera.setZoom(newZoom);
    this.rememberSurvivalZoom();
    this.followCamera();
    if (this.onZoomChanged) this.onZoomChanged(updated);
    return updated;
  }

  zoomIn(step?: number): number {
    const updated = this.camera.zoomIn(step);
    this.rememberSurvivalZoom();
    this.followCamera();
    if (this.onZoomChanged) this.onZoomChanged(updated);
    return updated;
  }

  zoomOut(step?: number): number {
    const updated = this.camera.zoomOut(step);
    this.rememberSurvivalZoom();
    this.followCamera();
    if (this.onZoomChanged) this.onZoomChanged(updated);
    return updated;
  }

  resetZoom(): number {
    const updated = this.camera.resetZoom();
    this.rememberSurvivalZoom();
    this.followCamera();
    if (this.onZoomChanged) this.onZoomChanged(updated);
    return updated;
  }

  private setupInputs() {
    this.onKeyDownBound = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (!isInputFocused) {
        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
          e.preventDefault();
          this.zoomIn();
          return;
        }
        if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          this.zoomOut();
          return;
        }
        if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.resetZoom();
          return;
        }
        const bound = actionForCode(this.bindings, e.code);
        // Zombie mode: doors/windows in reach take interact/lock/board before the building Enter/Exit prompt
        if (this.zombieMode && !e.repeat) {
          const action =
            bound === 'interact'
              ? 'toggle'
              : bound === 'lock'
                ? 'lockToggle'
                : bound === 'barricade'
                  ? e.shiftKey
                    ? 'removePlank'
                    : 'addPlank'
                  : null;
          if (action && this.zombieDoorAction(action)) {
            e.preventDefault();
            return;
          }
        }
        if (bound === 'interact' && !e.repeat && this.doorPrompt) {
          e.preventDefault();
          this.activateDoor();
          return;
        }
        if (this.zombieMode) {
          if (bound === 'fire') {
            e.preventDefault();
            if (!e.repeat) this.zombieMode.setTrigger(true);
            return;
          }
          if (bound === 'reload' && !e.repeat) {
            e.preventDefault();
            this.zombieMode.reload();
            return;
          }
          if (bound === 'nextWeapon' && !e.repeat) {
            e.preventDefault();
            this.zombieMode.cycleWeapon(e.shiftKey ? -1 : 1);
            return;
          }
          if (bound === 'useSupply' && !e.repeat) {
            e.preventDefault();
            this.zombieMode.useSupply();
            return;
          }
          const slot = /^Digit([1-6])$/.exec(e.code);
          if (slot && !e.repeat) {
            const id = WEAPON_ORDER.find((w) => WEAPONS[w].slot === Number(slot[1]));
            if (id && this.zombieMode.selectWeapon(id)) {
              e.preventDefault();
              return;
            }
          }
        }
        if (bound === 'jump' && !e.repeat && this.zombieMode) {
          e.preventDefault();
          this.jump();
          return;
        }
      }

      this.keysDown.add(e.code);
      this.player.clearTargetDestination();
    };

    this.onKeyUpBound = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
      if (actionForCode(this.bindings, e.code) === 'fire') this.zombieMode?.setTrigger(false);
    };

    // Survival: the mouse aims (and turns the vision cone) while it's over the canvas
    this.onPointerAimBound = (e: PointerEvent) => {
      if (!this.zombieMode || e.pointerType === 'touch') return;
      const rect = this.canvas.getBoundingClientRect();
      const wx = (e.clientX - rect.left) / this.camera.zoom + this.camera.x;
      const wy = (e.clientY - rect.top) / this.camera.zoom + this.camera.y;
      this.zombieMode.setAim(Math.atan2(wy - (this.player.y + 16), wx - (this.player.x + 16)));
      this.lastAimAt = performance.now();
    };
    this.onPointerLeaveBound = () => {
      this.zombieMode?.setAim(null);
      this.lastAimAt = 0;
    };
    // Released keys are lost when the window blurs: never leave an automatic weapon firing
    this.onBlurBound = () => {
      this.zombieMode?.setTrigger(false);
      this.keysDown.clear();
      this.touchSprintHeld = false;
    };
    window.addEventListener('blur', this.onBlurBound);
    this.canvas.addEventListener('pointermove', this.onPointerAimBound);
    this.canvas.addEventListener('pointerleave', this.onPointerLeaveBound);

    this.onWheelBound = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      this.setZoom(this.camera.zoom + delta);
    };

    this.onTouchStartBound = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.initialPinchDistance = Math.hypot(dx, dy);
        this.initialPinchZoom = this.camera.zoom;
        this.player.clearTargetDestination();
      }
    };

    this.onTouchMoveBound = (e: TouchEvent) => {
      if (e.touches.length === 2 && this.initialPinchDistance !== null && this.initialPinchDistance > 0) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        const scale = currentDist / this.initialPinchDistance;
        this.setZoom(this.initialPinchZoom * scale);
      }
    };

    this.onTouchEndBound = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        this.initialPinchDistance = null;
      }
    };

    this.onCanvasClickBound = (e: MouseEvent | PointerEvent) => {
      if (this.initialPinchDistance !== null) return;
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // 1. Companion Tap Hit-test
      if (
        this.companion &&
        this.companion.isPointInside(clickX, clickY, this.camera.x, this.camera.y, this.camera.zoom)
      ) {
        if (this.onCompanionTap) this.onCompanionTap();
        return;
      }

      // 2. Remote Player Hit-test (Profile Card / Add Friend)
      const worldClickX = clickX / this.camera.zoom + this.camera.x;
      const worldClickY = clickY / this.camera.zoom + this.camera.y;

      for (const [id, avatar] of this.remoteAvatars.entries()) {
        const dx = worldClickX - (avatar.x + 16);
        const dy = worldClickY - (avatar.y + 20);
        if (Math.hypot(dx, dy) < 28) {
          if (this.onRemotePlayerTap) {
            this.onRemotePlayerTap({
              userId: avatar.userId || id,
              displayName: avatar.displayName,
              avatarConfig: avatar.avatarConfig,
              x: avatar.x,
              y: avatar.y,
            });
            return;
          }
        }
      }

      // 3. Build Mode Placement
      if (this.buildModeEnabled && this.selectedFurniture) {
        this.placeFurnitureAtScreen(clickX, clickY);
        return;
      }

      // 4. Tap-to-Move / Click-to-Move Navigation
      const worldX = clickX / this.camera.zoom + this.camera.x - 16;
      const worldY = clickY / this.camera.zoom + this.camera.y - 20;
      this.player.setTargetDestination(worldX, worldY);
    };

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    this.canvas.addEventListener('pointerdown', this.onCanvasClickBound);
    this.canvas.addEventListener('wheel', this.onWheelBound, { passive: false });
    this.canvas.addEventListener('touchstart', this.onTouchStartBound, { passive: true });
    this.canvas.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEndBound);
    this.canvas.addEventListener('touchcancel', this.onTouchEndBound);
  }

  dispose() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.disconnectZombieNet();
    this.zombieMode?.dispose();
    this.zombieMode = null;
    this.chunkedMap?.dispose();
    this.chunkedMap = null;

    if (this.onKeyDownBound) {
      window.removeEventListener('keydown', this.onKeyDownBound);
      this.onKeyDownBound = null;
    }
    if (this.onKeyUpBound) {
      window.removeEventListener('keyup', this.onKeyUpBound);
      this.onKeyUpBound = null;
    }
    if (this.onPointerAimBound) {
      this.canvas.removeEventListener('pointermove', this.onPointerAimBound);
      this.onPointerAimBound = null;
    }
    if (this.onPointerLeaveBound) {
      this.canvas.removeEventListener('pointerleave', this.onPointerLeaveBound);
      this.onPointerLeaveBound = null;
    }
    if (this.onBlurBound) {
      window.removeEventListener('blur', this.onBlurBound);
      this.onBlurBound = null;
    }
    if (this.onCanvasClickBound) {
      this.canvas.removeEventListener('pointerdown', this.onCanvasClickBound);
      this.onCanvasClickBound = null;
    }
    if (this.onWheelBound) {
      this.canvas.removeEventListener('wheel', this.onWheelBound);
      this.onWheelBound = null;
    }
    if (this.onTouchStartBound) {
      this.canvas.removeEventListener('touchstart', this.onTouchStartBound);
      this.onTouchStartBound = null;
    }
    if (this.onTouchMoveBound) {
      this.canvas.removeEventListener('touchmove', this.onTouchMoveBound);
      this.onTouchMoveBound = null;
    }
    if (this.onTouchEndBound) {
      this.canvas.removeEventListener('touchend', this.onTouchEndBound);
      this.canvas.removeEventListener('touchcancel', this.onTouchEndBound);
      this.onTouchEndBound = null;
    }
  }
}
