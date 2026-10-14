import { Camera } from './camera';
import { BOUNDARY_WALLS, checkAABB } from './collision';
import { PlayerEntity } from './entities/player';
import { RemotePlayerEntity } from './entities/remotePlayer';
import { CompanionEntity } from './entities/companion';
import { FurnitureEntity, FurnitureType } from './entities/furniture';
import { createPreRenderedWorldMap } from './map/worldMap';
import { WorldSyncService } from '@/lib/services/worldSync';
import { CompanionModel } from '@/lib/models/chat';
import { SpaceModel } from '@/lib/models/space';
import { SpaceService } from '@/lib/services/spaces';

export class WorldGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera = new Camera();

  player: PlayerEntity;
  remoteAvatars: Map<string, RemotePlayerEntity> = new Map();
  companion: CompanionEntity | null = null;
  furniture: FurnitureEntity[] = [];

  private preRenderedMap: HTMLCanvasElement | null = null;
  private syncService: WorldSyncService | null = null;
  private space: SpaceModel;

  private keysDown: Set<string> = new Set();
  private joystickInput: { x: number; y: number } = { x: 0, y: 0 };
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private animFrameId: number | null = null;

  // Build mode
  buildModeEnabled: boolean = false;
  selectedFurniture: FurnitureType | null = null;

  onCompanionTap?: () => void;
  onZoneChanged?: (zoneName: string) => void;
  onProximityChanged?: (distances: Map<string, number>) => void;

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
    this.space = params.space;
    this.syncService = params.syncService || null;

    this.player = new PlayerEntity(
      params.initialX,
      params.initialY,
      params.displayName,
      params.avatarConfig
    );

    this.initDefaultProps();
    this.setupInputs();
  }

  private initDefaultProps() {
    const G = 16;
    let idx = 1;
    const addProp = (type: FurnitureType, x: number, y: number) => {
      this.furniture.push(new FurnitureEntity(`prop-${idx++}`, type, x, y));
    };

    // Verdant Village
    addProp('stoneWell', G * 18, G * 14);
    addProp('woodenSign', G * 14, G * 14);
    addProp('streetLantern', G * 5, G * 14);
    addProp('streetLantern', G * 34, G * 14);
    addProp('streetLantern', G * 18, G * 27);
    addProp('woodenFence', G * 5, G * 22);
    addProp('woodenFence', G * 8, G * 22);
    addProp('flowerPatch', G * 5, G * 24);
    addProp('flowerPatch', G * 8, G * 24);
    addProp('flowerPatch', G * 18, G * 12);
    addProp('logBench', G * 23, G * 24);
    addProp('berryBush', G * 32, G * 21);
    addProp('berryBush', G * 32, G * 25);
    addProp('pineTree', G * 36, G * 8);

    // Whispering Woods foliage
    const grassCoords = [
      [G * 43, G * 6], [G * 46, G * 6], [G * 49, G * 6],
      [G * 43, G * 9], [G * 46, G * 9], [G * 49, G * 9],
      [G * 62, G * 10], [G * 65, G * 10], [G * 68, G * 10],
      [G * 62, G * 13], [G * 65, G * 13], [G * 68, G * 13],
    ];
    for (const [x, y] of grassCoords) {
      addProp('tallGrass', x, y);
    }

    const pineCoords = [
      [G * 39, G * 3], [G * 53, G * 3], [G * 58, G * 3], [G * 72, G * 4], [G * 76, G * 8],
      [G * 39, G * 18], [G * 48, G * 20], [G * 59, G * 19], [G * 70, G * 18], [G * 74, G * 23],
    ];
    for (const [x, y] of pineCoords) {
      addProp('pineTree', x, y);
    }

    addProp('berryBush', G * 54, G * 10);
    addProp('flowerPatch', G * 42, G * 14);
    addProp('woodenSign', G * 43, G * 19);

    // Adventure Camp props
    addProp('campfire', G * 58, G * 35);
    addProp('tent', G * 52, G * 33);
    addProp('tent', G * 64, G * 33);
    addProp('logBench', G * 57, G * 39);
    addProp('streetLantern', G * 51, G * 37);
    addProp('streetLantern', G * 67, G * 37);
    addProp('woodenSign', G * 62, G * 39);

    // Craggy Ridge props
    addProp('boulder', G * 5, G * 38);
    addProp('boulder', G * 13, G * 40);
    addProp('boulder', G * 30, G * 38);
    addProp('boulder', G * 8, G * 52);
    addProp('pineTree', G * 4, G * 43);
    addProp('pineTree', G * 31, G * 49);
    addProp('woodenSign', G * 22, G * 38);

    // Crystal Bay props
    addProp('boulder', G * 83, G * 11);
    addProp('boulder', G * 83, G * 45);
    addProp('woodenSign', G * 80, G * 27);
    addProp('streetLantern', G * 80, G * 30);
    addProp('logBench', G * 80, G * 23);
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
    if (comp) {
      this.companion = new CompanionEntity(this.player.x - 24, this.player.y - 16, comp);
    } else {
      this.companion = null;
    }
  }

  setJoystickInput(x: number, y: number) {
    this.joystickInput = { x, y };
  }

  start() {
    this.preRenderedMap = createPreRenderedWorldMap();
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private loop = (currentTime: number) => {
    if (!this.isRunning) return;
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    // 1. Calculate Player Movement vector
    let dx = 0;
    let dy = 0;
    const speed = this.player.isSwimming ? 110 : 160;

    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) dy -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) dy += 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) dx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) dx += 1;

    // Merge virtual joystick
    if (this.joystickInput.x !== 0 || this.joystickInput.y !== 0) {
      dx = this.joystickInput.x;
      dy = this.joystickInput.y;
    }

    const isMoving = dx !== 0 || dy !== 0;
    if (isMoving) {
      const len = Math.hypot(dx, dy);
      const nx = (dx / len) * speed * dt;
      const ny = (dy / len) * speed * dt;

      // Desired next position with collision check
      const nextX = this.player.x + nx;
      const nextY = this.player.y + ny;

      const playerHitbox = { x: nextX + 8, y: nextY + 16, w: 16, h: 16 };
      let collides = false;

      // Check walls
      for (const wall of BOUNDARY_WALLS) {
        if (checkAABB(playerHitbox, wall)) {
          collides = true;
          break;
        }
      }

      // Check furniture solid hitboxes
      if (!collides) {
        for (const furn of this.furniture) {
          const hb = furn.getHitbox();
          if (hb && checkAABB(playerHitbox, hb)) {
            collides = true;
            break;
          }
        }
      }

      if (!collides) {
        this.player.x = nextX;
        this.player.y = nextY;
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        this.player.direction = dx > 0 ? 'right' : 'left';
      } else {
        this.player.direction = dy > 0 ? 'down' : 'up';
      }
    }

    const prevMoving = this.player.isMoving;
    this.player.isMoving = isMoving;
    this.player.update(dt);

    // Broadcast movement to peers
    if (isMoving || prevMoving) {
      this.syncService?.broadcastMovement(
        this.player.x,
        this.player.y,
        this.player.direction,
        isMoving,
        prevMoving && !isMoving // forced stop packet
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
          this.remoteAvatars.set(id, avatar);
        } else {
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

        // Calculate euclidean distance for spatial proximity audio
        const dist = Math.hypot(avatar.x - this.player.x, avatar.y - this.player.y);
        peerDistances.set(id, dist);
      }

      // Evict deleted
      for (const id of this.remoteAvatars.keys()) {
        if (!peers.has(id)) {
          this.remoteAvatars.delete(id);
        }
      }

      if (this.onProximityChanged) {
        this.onProximityChanged(peerDistances);
      }
    }

    // 4. Update Camera
    this.camera.follow(this.player.x, this.player.y, this.canvas.width, this.canvas.height);
  }

  private render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.scale(this.camera.zoom, this.camera.zoom);
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw Pre-rendered World Map
    if (this.preRenderedMap) {
      this.ctx.drawImage(this.preRenderedMap, 0, 0);
    }

    // 2. Collect all depth-sorted entities (Y-sorting for 2.5D visual accuracy)
    type Renderable = { y: number; draw: () => void };
    const renderList: Renderable[] = [];

    // Furniture
    for (const f of this.furniture) {
      renderList.push({ y: f.y + 16, draw: () => f.render(this.ctx) });
    }

    // Remote Players
    for (const r of this.remoteAvatars.values()) {
      renderList.push({ y: r.y + 30, draw: () => r.render(this.ctx) });
    }

    // Companion
    if (this.companion) {
      renderList.push({ y: this.companion.y + 20, draw: () => this.companion?.render(this.ctx) });
    }

    // Local Player
    renderList.push({ y: this.player.y + 30, draw: () => this.player.render(this.ctx) });

    // Sort by bottom Y
    renderList.sort((a, b) => a.y - b.y);

    for (const r of renderList) {
      r.draw();
    }

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

  private setupInputs() {
    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    this.canvas.addEventListener('click', (e) => {
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

      // 2. Build mode placement
      if (this.buildModeEnabled && this.selectedFurniture) {
        this.placeFurnitureAtScreen(clickX, clickY);
      }
    });
  }

  dispose() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }
}
