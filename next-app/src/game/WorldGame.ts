import { Camera } from './camera';
import { checkAABB, Rect } from './collision';
import { PlayerEntity } from './entities/player';
import { RemotePlayerEntity } from './entities/remotePlayer';
import { CompanionEntity } from './entities/companion';
import { FurnitureEntity, FurnitureType } from './entities/furniture';
import { createPreRenderedWorldMap } from './map/worldMap';
import { getCurrentZone } from './map/zones';
import { getBoundaryWallsForMap, getDefaultPropsForMap } from './map/mapRegistry';
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
  private boundaryWalls: Rect[] = [];

  private keysDown: Set<string> = new Set();
  private joystickInput: { x: number; y: number } = { x: 0, y: 0 };
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private animFrameId: number | null = null;

  // Stored listener references for clean memory teardown
  private onKeyDownBound: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUpBound: ((e: KeyboardEvent) => void) | null = null;
  private onCanvasClickBound: ((e: MouseEvent) => void) | null = null;

  // Build mode
  buildModeEnabled: boolean = false;
  selectedFurniture: FurnitureType | null = null;

  private currentZoneName: string = '';

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
    this.ctx.imageSmoothingEnabled = false;
    this.space = params.space;
    this.syncService = params.syncService || null;
    this.boundaryWalls = getBoundaryWallsForMap(params.space.mapTheme);

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
    this.syncService = sync;
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
    this.camera.follow(x, y, this.canvas.width, this.canvas.height);

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

    const z = getCurrentZone(x, y, this.space.mapTheme);
    this.currentZoneName = z.name;
    if (this.onZoneChanged) {
      this.onZoneChanged(z.name);
    }
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
    if (comp) {
      this.companion = new CompanionEntity(this.player.x - 24, this.player.y - 16, comp);
    } else {
      this.companion = null;
    }
  }

  setJoystickInput(x: number, y: number) {
    this.joystickInput = { x, y };
    if (x !== 0 || y !== 0) {
      this.player.clearTargetDestination();
    }
  }

  start() {
    this.preRenderedMap = createPreRenderedWorldMap(this.space.mapTheme);
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
    // 1. Calculate Movement Vector
    let dx = 0;
    let dy = 0;
    const speed = this.player.isSwimming ? 110 : 160;

    // Keyboard Input
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) dy -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) dy += 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) dx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) dx += 1;

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

    const isMoving = dx !== 0 || dy !== 0;
    if (isMoving) {
      const len = Math.hypot(dx, dy);
      const nx = (dx / len) * speed * dt;
      const ny = (dy / len) * speed * dt;

      // Desired position with collision slide support
      let targetX = this.player.x + nx;
      let targetY = this.player.y + ny;

      // Collision Check X
      const playerHitboxX = { x: targetX + 8, y: this.player.y + 16, w: 16, h: 16 };
      let collidesX = false;
      for (const wall of this.boundaryWalls) {
        if (checkAABB(playerHitboxX, wall)) {
          collidesX = true;
          break;
        }
      }
      if (!collidesX) {
        for (const furn of this.furniture) {
          const hb = furn.getHitbox();
          if (hb && checkAABB(playerHitboxX, hb)) {
            collidesX = true;
            break;
          }
        }
      }
      if (collidesX) targetX = this.player.x;

      // Collision Check Y
      const playerHitboxY = { x: targetX + 8, y: targetY + 16, w: 16, h: 16 };
      let collidesY = false;
      for (const wall of this.boundaryWalls) {
        if (checkAABB(playerHitboxY, wall)) {
          collidesY = true;
          break;
        }
      }
      if (!collidesY) {
        for (const furn of this.furniture) {
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
    const zone = getCurrentZone(this.player.x + 16, this.player.y + 20, this.space.mapTheme);
    if (zone.name !== this.currentZoneName) {
      this.currentZoneName = zone.name;
      if (this.onZoneChanged) {
        this.onZoneChanged(zone.name);
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

        const dist = Math.hypot(avatar.x - this.player.x, avatar.y - this.player.y);
        peerDistances.set(id, dist);
      }

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
    this.ctx.imageSmoothingEnabled = false;

    this.ctx.save();
    this.ctx.scale(this.camera.zoom, this.camera.zoom);
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw Pre-rendered World Map
    if (this.preRenderedMap) {
      this.ctx.drawImage(this.preRenderedMap, 0, 0);
    }

    // 2. Performance: Viewport Culling Bounds
    const viewLeft = this.camera.x - 48;
    const viewTop = this.camera.y - 48;
    const viewRight = this.camera.x + this.canvas.width / this.camera.zoom + 48;
    const viewBottom = this.camera.y + this.canvas.height / this.camera.zoom + 48;

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
    this.onKeyDownBound = (e: KeyboardEvent) => {
      this.keysDown.add(e.code);
      this.player.clearTargetDestination();
    };

    this.onKeyUpBound = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
    };

    this.onCanvasClickBound = (e: MouseEvent | PointerEvent) => {
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

      // 2. Build Mode Placement
      if (this.buildModeEnabled && this.selectedFurniture) {
        this.placeFurnitureAtScreen(clickX, clickY);
        return;
      }

      // 3. Tap-to-Move / Click-to-Move Navigation
      const worldX = clickX / this.camera.zoom + this.camera.x - 16;
      const worldY = clickY / this.camera.zoom + this.camera.y - 20;
      this.player.setTargetDestination(worldX, worldY);
    };

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    this.canvas.addEventListener('pointerdown', this.onCanvasClickBound);
  }

  dispose() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.onKeyDownBound) {
      window.removeEventListener('keydown', this.onKeyDownBound);
      this.onKeyDownBound = null;
    }
    if (this.onKeyUpBound) {
      window.removeEventListener('keyup', this.onKeyUpBound);
      this.onKeyUpBound = null;
    }
    if (this.onCanvasClickBound) {
      this.canvas.removeEventListener('pointerdown', this.onCanvasClickBound);
      this.onCanvasClickBound = null;
    }
  }
}
