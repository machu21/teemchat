import { Rect } from '../collision';

export type FurnitureType =
  | 'pineTree'
  | 'berryBush'
  | 'flowerPatch'
  | 'tallGrass'
  | 'campfire'
  | 'tent'
  | 'logBench'
  | 'woodenSign'
  | 'boulder'
  | 'stoneWell'
  | 'streetLantern'
  | 'woodenFence'
  | 'pingPongTable'
  | 'blueSofa'
  | 'armchair'
  | 'coffeeTable'
  | 'pottedPlant'
  | 'beanBagRed'
  | 'beanBagBlue'
  | 'beanBagYellow'
  | 'bookshelf'
  | 'vendingMachine'
  | 'officePrinter'
  | 'wallTv'
  | 'floorLamp';

export class FurnitureEntity {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;

  constructor(id: string, type: FurnitureType, x: number, y: number) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
  }

  getHitbox(): Rect | null {
    switch (this.type) {
      case 'flowerPatch':
      case 'tallGrass':
      case 'beanBagRed':
      case 'beanBagBlue':
      case 'beanBagYellow':
      case 'wallTv':
        return null;
      case 'pineTree':
        return { x: this.x + 20, y: this.y + 50, w: 20, h: 18 };
      case 'berryBush':
        return { x: this.x + 4, y: this.y + 16, w: 32, h: 16 };
      case 'campfire':
        return { x: this.x + 8, y: this.y + 16, w: 28, h: 20 };
      case 'tent':
        return { x: this.x + 6, y: this.y + 22, w: 52, h: 26 };
      case 'logBench':
        return { x: this.x + 4, y: this.y + 10, w: 40, h: 16 };
      case 'woodenSign':
        return { x: this.x + 10, y: this.y + 20, w: 12, h: 14 };
      case 'boulder':
        return { x: this.x + 6, y: this.y + 10, w: 32, h: 22 };
      case 'stoneWell':
        return { x: this.x + 6, y: this.y + 22, w: 36, h: 26 };
      case 'streetLantern':
        return { x: this.x + 8, y: this.y + 30, w: 8, h: 14 };
      case 'woodenFence':
        return { x: this.x + 2, y: this.y + 6, w: 44, h: 16 };
      case 'pingPongTable':
        return { x: this.x + 4, y: this.y + 14, w: 56, h: 24 };
      case 'blueSofa':
        return { x: this.x + 4, y: this.y + 10, w: 48, h: 20 };
      case 'armchair':
        return { x: this.x + 4, y: this.y + 8, w: 24, h: 20 };
      case 'coffeeTable':
        return { x: this.x + 4, y: this.y + 8, w: 36, h: 16 };
      case 'pottedPlant':
        return { x: this.x + 6, y: this.y + 24, w: 20, h: 18 };
      case 'bookshelf':
        return { x: this.x + 4, y: this.y + 16, w: 32, h: 32 };
      case 'vendingMachine':
        return { x: this.x + 4, y: this.y + 20, w: 24, h: 30 };
      case 'officePrinter':
        return { x: this.x + 4, y: this.y + 12, w: 22, h: 20 };
      case 'floorLamp':
        return { x: this.x + 6, y: this.y + 34, w: 10, h: 14 };
      default:
        return null;
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(Math.floor(this.x), Math.floor(this.y));

    const s = 2.0;
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
    };

    const p = (x: number, y: number, col: string) => {
      px(x * s, y * s, s, s, col);
    };

    const span = (y: number, x1: number, x2: number, col: string) => {
      px(x1 * s, y * s, (x2 - x1 + 1) * s, s, col);
    };

    // Soft pixel drop shadow under solid props
    if (this.type !== 'flowerPatch' && this.type !== 'tallGrass' && this.type !== 'wallTv') {
      const w = this.getSize().w;
      const h = this.getSize().h;
      px(6, h - 6, w - 12, 6, 'rgba(0, 0, 0, 0.22)');
      px(10, h - 8, w - 20, 2, 'rgba(0, 0, 0, 0.14)');
    }

    switch (this.type) {
      case 'pineTree': {
        const out = '#1A4018';
        const darkG = '#3A7830';
        const midG = '#52A842';
        const lightG = '#80D858';
        const crownG = '#A8F078';
        const trunk = '#8B5E2C';
        const trunkDk = '#5C3A18';
        const trunkLt = '#B07840';

        // Trunk
        for (let y = 25; y <= 34; y++) {
          span(y, 11, 18, trunk);
          span(y, 11, 12, trunkLt);
          span(y, 17, 18, trunkDk);
          p(10, y, out);
          p(19, y, out);
        }
        span(34, 9, 20, trunkDk);
        span(35, 8, 21, out);

        // Layer 1: Top Canopy
        span(2, 13, 16, out);
        span(3, 11, 18, out);
        span(3, 12, 17, crownG);
        for (let y = 4; y <= 7; y++) {
          span(y, 14 - y, 15 + y, midG);
          p(13 - y, y, out);
          p(16 + y, y, out);
          span(y, 14 - y + 1, 14, crownG);
        }
        for (let y = 8; y <= 11; y++) {
          span(y, 6, 23, midG);
          span(y, 7, 13, lightG);
          span(y, 19, 22, darkG);
          p(5, y, out);
          p(24, y, out);
        }
        span(12, 6, 23, darkG);
        span(13, 7, 22, out);

        // Layer 2: Mid Canopy
        for (let y = 12; y <= 18; y++) {
          const left = Math.max(3, 16 - y);
          const right = Math.min(26, 13 + y);
          span(y, left, right, midG);
          span(y, left + 1, left + 6, lightG);
          span(y, right - 5, right - 1, darkG);
          p(left - 1, y, out);
          p(right + 1, y, out);
        }
        span(19, 4, 25, darkG);
        span(20, 5, 24, out);

        // Layer 3: Lower Canopy
        for (let y = 19; y <= 25; y++) {
          const left = Math.max(1, 20 - y);
          const right = Math.min(28, 9 + y);
          span(y, left, right, midG);
          span(y, left + 1, left + 7, lightG);
          span(y, right - 6, right - 1, darkG);
          p(left - 1, y, out);
          p(right + 1, y, out);
        }
        span(26, 2, 27, darkG);
        span(27, 3, 26, out);
        break;
      }

      case 'berryBush': {
        const out = '#1A4818';
        const darkG = '#389028';
        const midG = '#50B838';
        const lightG = '#88E058';
        const berryR = '#EF4444';
        const berryB = '#60A5FA';
        const glint = '#FFFFFF';

        span(2, 6, 13, out);
        span(3, 4, 15, out);

        for (let y = 4; y <= 15; y++) {
          const x1 = y < 7 ? 3 : y < 13 ? 1 : 2;
          const x2 = y < 7 ? 16 : y < 13 ? 18 : 17;
          span(y, x1, x2, midG);
          p(x1 - 1, y, out);
          p(x2 + 1, y, out);
          if (y <= 8) span(y, x1 + 1, x1 + 6, lightG);
          if (y >= 10) span(y, x2 - 5, x2 - 1, darkG);
        }
        span(16, 2, 17, darkG);
        span(17, 3, 16, out);

        const drawBerry = (bx: number, by: number, col: string) => {
          p(bx, by, col);
          p(bx + 1, by, col);
          p(bx, by + 1, col);
          p(bx + 1, by + 1, col);
          p(bx, by, glint);
        };
        drawBerry(4, 7, berryR);
        drawBerry(12, 6, berryB);
        drawBerry(8, 10, berryR);
        drawBerry(14, 11, berryR);
        drawBerry(5, 12, berryB);
        break;
      }

      case 'flowerPatch': {
        const leafDk = '#3A8028';
        const leafLt = '#70C848';
        span(7, 3, 16, leafDk);
        span(8, 2, 17, leafLt);
        span(9, 1, 18, leafDk);
        span(10, 2, 17, leafLt);
        span(11, 4, 15, leafDk);

        const flower = (fx: number, fy: number, petal: string, center: string) => {
          p(fx + 1, fy, petal);
          p(fx, fy + 1, petal);
          p(fx + 2, fy + 1, petal);
          p(fx + 1, fy + 2, petal);
          p(fx + 1, fy + 1, center);
          p(fx + 1, fy + 3, '#206010');
        };
        flower(3, 4, '#F43F5E', '#FEF08A');
        flower(8, 2, '#FACC15', '#78350F');
        flower(14, 4, '#38BDF8', '#FFFFFF');
        flower(6, 7, '#FFFFFF', '#FACC15');
        flower(12, 7, '#A855F7', '#FEF08A');
        break;
      }

      case 'tallGrass': {
        const out = '#2A5820';
        const darkG = '#3E8828';
        const midG = '#60B838';
        const lightG = '#98E860';

        const tuft = (x: number, y: number) => {
          p(x + 1, y, lightG);
          p(x + 1, y + 1, midG);
          p(x + 1, y + 2, darkG);
          p(x + 3, y - 2, lightG);
          p(x + 3, y - 1, lightG);
          p(x + 3, y, midG);
          p(x + 3, y + 1, midG);
          p(x + 3, y + 2, darkG);
          p(x + 5, y - 1, lightG);
          p(x + 5, y, midG);
          p(x + 5, y + 1, darkG);
          p(x + 5, y + 2, darkG);
          span(y + 3, x, x + 6, darkG);
          span(y + 4, x + 1, x + 5, out);
        };
        tuft(2, 6);
        tuft(12, 4);
        tuft(5, 11);
        tuft(14, 10);
        break;
      }

      case 'campfire': {
        const rock = '#889098';
        const rockDk = '#586068';
        const rockLt = '#B8C0C8';
        const log = '#784018';
        const logDk = '#482008';
        const fireR = '#E82810';
        const fireO = '#F87810';
        const fireY = '#FFD830';
        const fireW = '#FFF8D0';

        const stone = (sx: number, sy: number, sw: number) => {
          span(sy, sx, sx + sw - 1, rockLt);
          span(sy + 1, sx, sx + sw - 1, rock);
          span(sy + 2, sx, sx + sw - 1, rockDk);
        };
        stone(2, 13, 4);
        stone(7, 15, 7);
        stone(15, 13, 4);
        stone(4, 11, 4);
        stone(13, 11, 4);

        span(13, 6, 14, '#282018');
        span(14, 6, 14, '#181008');

        span(12, 5, 15, logDk);
        span(13, 7, 13, log);

        // Fire flame layers
        span(3, 10, 11, fireR);
        span(4, 9, 12, fireR);
        span(5, 8, 13, fireR);
        span(6, 7, 14, fireR);
        span(7, 6, 14, fireR);
        span(8, 6, 14, fireR);
        span(9, 7, 13, fireR);

        span(5, 10, 11, fireO);
        span(6, 9, 12, fireO);
        span(7, 8, 13, fireO);
        span(8, 8, 12, fireO);
        span(9, 8, 12, fireO);
        span(10, 9, 11, fireO);

        span(7, 10, 11, fireY);
        span(8, 9, 11, fireY);
        p(10, 8, fireW);
        p(10, 9, fireW);
        break;
      }

      case 'tent': {
        const out = '#182830';
        const cloth = '#3888A8';
        const clothLt = '#58B0D0';
        const clothDk = '#205870';
        const peg = '#704018';

        span(3, 14, 17, out);
        for (let y = 4; y <= 21; y++) {
          const w = (y - 3) * 2;
          const x1 = Math.max(3, 15 - Math.floor(w / 2));
          const x2 = Math.min(28, 15 + Math.floor(w / 2));
          span(y, x1, x2, cloth);
          span(y, x1, x1 + 3, clothLt);
          span(y, x2 - 3, x2, clothDk);
          p(x1 - 1, y, out);
          p(x2 + 1, y, out);
        }
        for (let y = 14; y <= 21; y++) {
          const dw = y - 13;
          span(y, 15 - dw, 15 + dw, '#101820');
        }
        p(1, 22, peg);
        p(29, 22, peg);
        span(22, 3, 27, out);
        break;
      }

      case 'logBench': {
        const out = '#301808';
        const wood = '#885020';
        const woodLt = '#B07838';
        const woodDk = '#583010';
        const rings = '#D8A868';

        for (let y = 7; y <= 12; y++) {
          span(y, 3, 5, woodDk);
          span(y, 18, 20, woodDk);
          p(2, y, out);
          p(6, y, out);
          p(17, y, out);
          p(21, y, out);
        }
        span(2, 2, 21, out);
        span(3, 2, 21, woodLt);
        span(4, 1, 22, wood);
        span(5, 1, 22, wood);
        span(6, 1, 22, woodDk);
        span(7, 2, 21, woodDk);
        span(8, 2, 21, out);
        p(1, 4, rings);
        p(1, 5, rings);
        p(22, 4, rings);
        p(22, 5, rings);
        break;
      }

      case 'woodenSign': {
        const out = '#382010';
        const board = '#986030';
        const boardLt = '#C08848';
        const boardDk = '#683818';
        const textCol = '#402410';

        for (let y = 9; y <= 16; y++) {
          span(y, 7, 8, boardDk);
          p(6, y, out);
          p(9, y, out);
        }
        span(17, 6, 9, out);

        span(1, 2, 13, out);
        span(2, 2, 13, boardLt);
        for (let y = 3; y <= 7; y++) {
          span(y, 2, 13, board);
          p(1, y, out);
          p(14, y, out);
        }
        span(8, 2, 13, boardDk);
        span(9, 2, 13, out);

        span(4, 4, 11, textCol);
        span(6, 5, 10, textCol);
        break;
      }

      case 'boulder': {
        const out = '#282830';
        const rock = '#687078';
        const rockLt = '#98A0A8';
        const rockHi = '#C8D0D8';
        const rockDk = '#404850';

        span(2, 7, 14, out);
        span(3, 5, 16, rockHi);
        span(4, 3, 17, rockLt);
        for (let y = 5; y <= 13; y++) {
          const x1 = y < 7 ? 2 : 1;
          const x2 = y < 7 ? 18 : 20;
          span(y, x1, x2, rock);
          p(x1 - 1, y, out);
          p(x2 + 1, y, out);
          if (y <= 8) span(y, x1 + 1, x1 + 5, rockLt);
          if (y >= 9) span(y, x2 - 5, x2 - 1, rockDk);
        }
        span(14, 2, 19, rockDk);
        span(15, 3, 18, out);
        p(8, 7, out);
        p(9, 8, out);
        p(8, 9, out);
        break;
      }

      case 'stoneWell': {
        const out = '#202028';
        const roof = '#A03020';
        const roofDk = '#681810';
        const roofLt = '#D04838';
        const beam = '#704020';
        const stone = '#788088';
        const stoneLt = '#A0A8B0';
        const stoneDk = '#485058';

        span(1, 10, 13, out);
        for (let y = 2; y <= 6; y++) {
          const w = (y - 1) * 3;
          const x1 = 11 - Math.floor(w / 2);
          const x2 = 12 + Math.floor(w / 2);
          span(y, x1, x2, roof);
          span(y, x1, x1 + 2, roofLt);
          span(y, x2 - 2, x2, roofDk);
          p(x1 - 1, y, out);
          p(x2 + 1, y, out);
        }
        span(7, 2, 21, out);

        for (let y = 8; y <= 15; y++) {
          span(y, 4, 5, beam);
          span(y, 18, 19, beam);
          p(3, y, out);
          p(6, y, out);
          p(17, y, out);
          p(20, y, out);
        }

        for (let y = 16; y <= 23; y++) {
          span(y, 3, 20, stone);
          span(y, 4, 8, stoneLt);
          span(y, 15, 19, stoneDk);
          p(2, y, out);
          p(21, y, out);
          if (y % 2 === 0) span(y, 3, 20, out);
        }
        span(24, 3, 20, out);

        span(16, 8, 15, '#183858');
        p(11, 12, '#C0A060');
        p(11, 13, '#C0A060');
        break;
      }

      case 'streetLantern': {
        const iron = '#282830';
        const ironLt = '#485060';
        const glass = '#FDE047';
        const glow = '#FEF9C3';

        span(2, 4, 7, iron);
        span(3, 3, 8, iron);
        span(4, 2, 9, iron);

        for (let y = 5; y <= 9; y++) {
          span(y, 3, 8, glass);
          p(2, y, iron);
          p(9, y, iron);
          p(5, y, glow);
          p(6, y, glow);
        }
        span(10, 2, 9, iron);

        for (let y = 11; y <= 21; y++) {
          span(y, 5, 6, iron);
          p(5, y, ironLt);
        }

        span(22, 4, 7, iron);
        span(23, 3, 8, iron);
        break;
      }

      case 'woodenFence': {
        const out = '#382010';
        const wood = '#885020';
        const woodLt = '#B07838';
        const woodDk = '#583010';

        span(3, 1, 22, woodLt);
        span(4, 1, 22, woodDk);
        span(7, 1, 22, woodLt);
        span(8, 1, 22, woodDk);

        const post = (pxPos: number) => {
          p(pxPos + 1, 0, out);
          span(1, pxPos, pxPos + 2, woodLt);
          for (let y = 2; y <= 10; y++) {
            span(y, pxPos, pxPos + 2, wood);
            p(pxPos, y, woodLt);
            p(pxPos + 2, y, woodDk);
            p(pxPos - 1, y, out);
            p(pxPos + 3, y, out);
          }
          span(11, pxPos, pxPos + 2, out);
        };
        post(2);
        post(10);
        post(18);
        break;
      }

      // ──────────────────────────────────────────────────────────
      // MODERN RETRO LOUNGE & HANGOUT FURNITURE (Matching Image 1)
      // ──────────────────────────────────────────────────────────
      case 'pingPongTable': {
        const tableBlue = '#2563EB';
        const tableBorder = '#FFFFFF';
        const netCol = '#E2E8F0';
        const legCol = '#1E293B';
        const out = '#0F172A';

        // Legs
        span(15, 3, 4, legCol);
        span(16, 3, 4, legCol);
        span(17, 3, 4, legCol);
        span(18, 3, 4, legCol);
        span(19, 3, 4, out);

        span(15, 27, 28, legCol);
        span(16, 27, 28, legCol);
        span(17, 27, 28, legCol);
        span(18, 27, 28, legCol);
        span(19, 27, 28, out);

        span(15, 14, 17, legCol);
        span(16, 14, 17, legCol);
        span(17, 14, 17, legCol);
        span(18, 14, 17, legCol);
        span(19, 14, 17, out);

        // Table Top Surface (Blue)
        for (let y = 6; y <= 14; y++) {
          span(y, 2, 29, tableBlue);
          p(1, y, out);
          p(30, y, out);
        }
        span(5, 2, 29, out);
        span(15, 2, 29, out);

        // White perimeter boundary lines
        span(6, 3, 28, tableBorder);
        span(14, 3, 28, tableBorder);
        for (let y = 7; y <= 13; y++) {
          p(3, y, tableBorder);
          p(28, y, tableBorder);
        }

        // Horizontal center line
        span(10, 3, 28, tableBorder);

        // Center Net
        span(3, 15, 16, '#94A3B8');
        for (let y = 4; y <= 14; y++) {
          p(15, y, netCol);
          p(16, y, '#CBD5E1');
        }

        // Red Paddle (Left) & Blue Paddle (Right)
        p(6, 8, '#EF4444');
        p(7, 8, '#EF4444');
        p(6, 9, '#EF4444');
        p(5, 9, '#78350F'); // Handle

        p(24, 12, '#3B82F6');
        p(25, 12, '#3B82F6');
        p(25, 11, '#3B82F6');
        p(26, 12, '#78350F'); // Handle

        // White ping pong ball
        p(18, 9, '#FFFFFF');
        break;
      }

      case 'blueSofa': {
        const blueBase = '#1E40AF';
        const blueLt = '#3B82F6';
        const blueDk = '#172554';
        const out = '#0F172A';

        // Backrest
        span(2, 3, 24, out);
        for (let y = 3; y <= 7; y++) {
          span(y, 3, 24, blueBase);
          span(y, 4, 23, blueLt);
          p(2, y, out);
          p(25, y, out);
        }

        // Seating Cushions
        for (let y = 8; y <= 13; y++) {
          span(y, 2, 25, blueBase);
          p(1, y, out);
          p(26, y, out);
          // Cushion split seams (3 cushions)
          p(10, y, blueDk);
          p(18, y, blueDk);
        }

        // Armrests
        for (let y = 6; y <= 13; y++) {
          span(y, 1, 3, blueLt);
          span(y, 24, 26, blueLt);
          p(0, y, out);
          p(27, y, out);
        }

        // Sofa base & front legs
        span(14, 2, 25, blueDk);
        span(15, 2, 25, out);
        p(3, 16, '#78350F');
        p(24, 16, '#78350F');
        break;
      }

      case 'armchair': {
        const blueBase = '#1E40AF';
        const blueLt = '#3B82F6';
        const blueDk = '#172554';
        const out = '#0F172A';

        // Backrest
        span(2, 2, 13, out);
        for (let y = 3; y <= 7; y++) {
          span(y, 2, 13, blueBase);
          span(y, 3, 12, blueLt);
          p(1, y, out);
          p(14, y, out);
        }

        // Cushion
        for (let y = 8; y <= 13; y++) {
          span(y, 2, 13, blueBase);
          p(1, y, out);
          p(14, y, out);
        }

        // Armrests
        for (let y = 6; y <= 13; y++) {
          span(y, 1, 2, blueLt);
          span(y, 13, 14, blueLt);
          p(0, y, out);
          p(15, y, out);
        }

        span(14, 2, 13, blueDk);
        span(15, 2, 13, out);
        p(2, 16, '#78350F');
        p(13, 16, '#78350F');
        break;
      }

      case 'coffeeTable': {
        const wood = '#A16207';
        const woodLt = '#CA8A04';
        const woodDk = '#713F12';
        const out = '#451A03';

        // Table surface
        span(3, 2, 19, out);
        span(4, 2, 19, woodLt);
        for (let y = 5; y <= 8; y++) {
          span(y, 2, 19, wood);
          p(1, y, out);
          p(20, y, out);
        }
        span(9, 2, 19, woodDk);
        span(10, 2, 19, out);

        // Items on table: Magazine + Coffee Cup
        // Magazine
        span(5, 5, 8, '#EF4444');
        span(6, 5, 8, '#FFFFFF');
        p(6, 6, '#3B82F6');
        // Coffee Cup
        p(14, 5, '#FFFFFF');
        p(15, 5, '#78350F');
        p(14, 6, '#FFFFFF');
        p(15, 6, '#FFFFFF');
        p(16, 6, '#FFFFFF'); // handle

        // Table legs
        for (let y = 11; y <= 13; y++) {
          span(y, 3, 4, woodDk);
          span(y, 17, 18, woodDk);
        }
        break;
      }

      case 'pottedPlant': {
        const pot = '#EA580C';
        const potLt = '#FB923C';
        const potDk = '#9A3412';
        const leaf = '#16A34A';
        const leafLt = '#4ADE80';
        const leafDk = '#14532D';
        const out = '#18181B';

        // Monstera leaves
        span(2, 6, 9, leafLt);
        span(3, 4, 11, leaf);
        p(3, 7, leafDk);
        p(3, 8, leafDk);

        span(4, 2, 13, leaf);
        span(5, 3, 14, leafLt);
        p(5, 5, leafDk);
        p(5, 11, leafDk);

        span(6, 2, 14, leaf);
        span(7, 3, 13, leafDk);
        span(8, 4, 12, leaf);
        span(9, 5, 11, leafDk);

        // Stems into pot
        span(10, 7, 8, leafDk);
        span(11, 7, 8, leafDk);

        // Terracotta Pot
        span(12, 4, 11, out);
        span(13, 4, 11, potLt);
        for (let y = 14; y <= 20; y++) {
          const w = Math.max(0, Math.floor((y - 14) / 3));
          span(y, 5 + w, 10 - w, pot);
          p(4 + w, y, potLt);
          p(11 - w, y, potDk);
          p(3 + w, y, out);
          p(12 - w, y, out);
        }
        span(21, 7, 8, out);
        break;
      }

      case 'beanBagRed':
      case 'beanBagBlue':
      case 'beanBagYellow': {
        const isRed = this.type === 'beanBagRed';
        const isBlue = this.type === 'beanBagBlue';

        const mainCol = isRed ? '#DC2626' : isBlue ? '#2563EB' : '#EAB308';
        const ltCol = isRed ? '#F87171' : isBlue ? '#60A5FA' : '#FDE047';
        const dkCol = isRed ? '#991B1B' : isBlue ? '#1E3A8A' : '#A16207';
        const out = '#18181B';

        span(2, 4, 9, out);
        span(3, 3, 10, ltCol);
        p(3, 5, '#FFFFFF'); // Glossy shine
        p(3, 6, '#FFFFFF');

        for (let y = 4; y <= 7; y++) {
          span(y, 2, 11, mainCol);
          p(1, y, out);
          p(12, y, out);
          p(2, y, ltCol);
        }

        for (let y = 8; y <= 9; y++) {
          span(y, 3, 10, dkCol);
          p(2, y, out);
          p(11, y, out);
        }
        span(10, 4, 9, out);
        break;
      }

      case 'bookshelf': {
        const wood = '#78350F';
        const woodLt = '#B45309';
        const woodDk = '#451A03';
        const out = '#18181B';

        // Outer cabinet frame
        span(2, 1, 18, out);
        span(3, 1, 18, woodLt);
        for (let y = 4; y <= 24; y++) {
          p(1, y, woodLt);
          p(2, y, wood);
          p(17, y, wood);
          p(18, y, woodDk);
          p(0, y, out);
          p(19, y, out);
        }

        // Shelves
        const drawShelf = (sy: number) => {
          span(sy, 2, 17, woodDk);
          span(sy + 1, 2, 17, woodLt);
        };
        drawShelf(9);
        drawShelf(16);
        drawShelf(23);

        // Books on shelf 1
        const bookColors = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];
        for (let i = 0; i < 5; i++) {
          span(4, 3 + i * 2, 4 + i * 2, bookColors[i]);
          span(5, 3 + i * 2, 4 + i * 2, bookColors[i]);
          span(6, 3 + i * 2, 4 + i * 2, bookColors[i]);
          span(7, 3 + i * 2, 4 + i * 2, bookColors[i]);
          span(8, 3 + i * 2, 4 + i * 2, bookColors[i]);
        }

        // Books on shelf 2
        for (let i = 0; i < 6; i++) {
          const col = bookColors[(i + 2) % bookColors.length];
          span(11, 3 + i * 2, 4 + i * 2, col);
          span(12, 3 + i * 2, 4 + i * 2, col);
          span(13, 3 + i * 2, 4 + i * 2, col);
          span(14, 3 + i * 2, 4 + i * 2, col);
          span(15, 3 + i * 2, 4 + i * 2, col);
        }

        // Box & Storage on shelf 3
        span(18, 4, 10, '#D97706');
        span(19, 4, 10, '#B45309');
        span(20, 4, 10, '#B45309');
        span(21, 4, 10, '#92400E');
        span(22, 4, 10, '#92400E');

        span(25, 1, 18, out);
        break;
      }

      case 'vendingMachine': {
        const red = '#DC2626';
        const redLt = '#EF4444';
        const redDk = '#991B1B';
        const glass = '#0EA5E9';
        const out = '#18181B';

        // Outer chassis
        span(2, 2, 13, out);
        span(3, 2, 13, redLt);
        for (let y = 4; y <= 24; y++) {
          span(y, 3, 12, red);
          p(2, y, redLt);
          p(13, y, redDk);
          p(1, y, out);
          p(14, y, out);
        }

        // Glass Display Window
        for (let y = 5; y <= 15; y++) {
          span(y, 3, 12, '#1E293B');
        }

        // Soda Cans row 1
        span(7, 4, 5, '#EF4444');
        span(8, 4, 5, '#EF4444');
        span(7, 7, 8, '#3B82F6');
        span(8, 7, 8, '#3B82F6');
        span(7, 10, 11, '#10B981');
        span(8, 10, 11, '#10B981');

        // Soda Cans row 2
        span(12, 4, 5, '#F59E0B');
        span(13, 4, 5, '#F59E0B');
        span(12, 7, 8, '#8B5CF6');
        span(13, 7, 8, '#8B5CF6');
        span(12, 10, 11, '#EC4899');
        span(13, 10, 11, '#EC4899');

        // Glass Glint reflection line
        p(4, 5, glass);
        p(5, 6, glass);
        p(6, 7, glass);

        // Coin slot & Bill acceptor
        p(11, 18, '#FDE047');
        p(11, 19, '#18181B');

        // Dispenser hatch
        span(20, 4, 11, '#09090B');
        span(21, 4, 11, '#18181B');
        span(22, 4, 11, '#09090B');

        span(25, 2, 13, out);
        break;
      }

      case 'officePrinter': {
        const white = '#F8FAFC';
        const gray = '#E2E8F0';
        const grayDk = '#94A3B8';
        const out = '#18181B';

        span(2, 3, 12, out);
        span(3, 3, 12, white);
        for (let y = 4; y <= 16; y++) {
          p(3, y, white);
          p(12, y, grayDk);
          p(2, y, out);
          p(13, y, out);
        }

        // Scanner lid
        span(4, 4, 11, gray);
        span(5, 4, 11, gray);
        // Status display screen
        p(10, 6, '#38BDF8');
        p(11, 6, '#10B981'); // Green ready light

        // Output paper tray
        span(8, 4, 11, grayDk);
        span(9, 5, 10, '#FFFFFF'); // Paper sheet
        span(10, 5, 10, '#FFFFFF');

        // Paper feed drawers
        span(12, 4, 11, grayDk);
        span(13, 4, 11, gray);
        span(14, 4, 11, grayDk);
        span(15, 4, 11, gray);

        span(17, 3, 12, out);
        break;
      }

      case 'wallTv': {
        const bezel = '#09090B';
        const pitch = '#16A34A';
        const pitchLt = '#22C55E';
        const line = '#FFFFFF';

        // Outer TV frame
        span(1, 1, 24, bezel);
        for (let y = 2; y <= 16; y++) {
          p(0, y, bezel);
          p(1, y, bezel);
          p(24, y, bezel);
          p(25, y, bezel);
        }
        span(17, 1, 24, bezel);

        // Soccer Pitch display
        for (let y = 2; y <= 16; y++) {
          span(y, 2, 23, (y % 2 === 0) ? pitch : pitchLt);
        }

        // Pitch white markings
        span(2, 2, 23, line);
        span(16, 2, 23, line);
        for (let y = 3; y <= 15; y++) {
          p(2, y, line);
          p(23, y, line);
          p(12, y, line); // Halfway line
        }

        // Center circle
        p(10, 8, line);
        p(14, 8, line);
        p(11, 9, line);
        p(13, 9, line);
        p(10, 10, line);
        p(14, 10, line);

        // Goal box left & right
        span(7, 2, 5, line);
        span(11, 2, 5, line);
        p(5, 8, line);
        p(5, 9, line);
        p(5, 10, line);

        span(7, 20, 23, line);
        span(11, 20, 23, line);
        p(20, 8, line);
        p(20, 9, line);
        p(20, 10, line);

        // Soccer ball
        p(9, 7, '#FFFFFF');
        p(9, 8, '#FFFFFF');
        break;
      }

      case 'floorLamp': {
        const out = '#18181B';
        const shade = '#FEF08A';
        const shadeLt = '#FEF9C3';
        const shadeDk = '#FACC15';
        const pole = '#334155';

        // Conical Lampshade
        span(3, 4, 7, out);
        span(4, 4, 7, shadeLt);
        span(5, 3, 8, shade);
        span(6, 2, 9, shadeDk);
        span(7, 2, 9, out);

        // Lamp pole
        for (let y = 8; y <= 22; y++) {
          p(5, y, pole);
          p(6, y, '#64748B');
        }

        // Weighted Round Base
        span(23, 3, 8, out);
        span(24, 3, 8, '#1E293B');
        span(25, 2, 9, out);
        break;
      }
    }

    ctx.restore();
  }

  getSize(): { w: number; h: number } {
    switch (this.type) {
      case 'pineTree':
        return { w: 60, h: 72 };
      case 'berryBush':
        return { w: 40, h: 36 };
      case 'flowerPatch':
        return { w: 40, h: 28 };
      case 'tallGrass':
        return { w: 44, h: 36 };
      case 'campfire':
        return { w: 44, h: 40 };
      case 'tent':
        return { w: 64, h: 52 };
      case 'logBench':
        return { w: 48, h: 28 };
      case 'woodenSign':
        return { w: 32, h: 36 };
      case 'boulder':
        return { w: 44, h: 36 };
      case 'stoneWell':
        return { w: 48, h: 54 };
      case 'streetLantern':
        return { w: 24, h: 48 };
      case 'woodenFence':
        return { w: 48, h: 24 };
      case 'pingPongTable':
        return { w: 64, h: 42 };
      case 'blueSofa':
        return { w: 56, h: 36 };
      case 'armchair':
        return { w: 34, h: 36 };
      case 'coffeeTable':
        return { w: 44, h: 28 };
      case 'pottedPlant':
        return { w: 32, h: 46 };
      case 'beanBagRed':
      case 'beanBagBlue':
      case 'beanBagYellow':
        return { w: 28, h: 24 };
      case 'bookshelf':
        return { w: 42, h: 54 };
      case 'vendingMachine':
        return { w: 32, h: 54 };
      case 'officePrinter':
        return { w: 30, h: 38 };
      case 'wallTv':
        return { w: 54, h: 38 };
      case 'floorLamp':
        return { w: 22, h: 54 };
    }
  }
}
