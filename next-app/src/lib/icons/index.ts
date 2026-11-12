// ============================================================
// APP ICONS (single source of truth — no emoji anywhere in the app)
// Line icons from `lucide` (ISC), plus a few custom paths in the same
// 24 × 24 / 2 px stroke style (weapons — lucide has none). The same data
// renders in React (<AppIcon />) and on the game canvas (drawIcon()).
// See CLAUDE.md → "No emoji".
// ============================================================

import {
  Accessibility, AlarmClock, Blocks, Grid3x3,
  RotateCw, Annoyed, Apple, ArrowBigUp, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp,
  Armchair, Axe, Backpack, Ban, Bandage, Bed, Bell, BellRing, Biohazard, BookOpen, BookOpenText, Bot, Briefcase,
  Building, Building2, Calendar, Camera, ChartColumn, Check, ChevronLeft, ChevronRight, ChevronsRight, Circle,
  CircleCheck, CircleDot, CircleMinus, CircleUser, Clipboard, ClipboardList, CloudFog, Coffee, Cookie, Copy, Crosshair,
  Crown, CupSoda, Dices, Disc3, DoorClosed, DoorOpen, Download, Droplet, Drumstick, Dumbbell, Eraser, Eye, EyeOff,
  FlaskConical, Flag, Flame, Flashlight, Folder, Footprints, Fuel, Gamepad2, Gem, Globe, Grid2x2, Guitar, Hammer,
  Hand, Handshake, Headphones, Heart, HeartPulse, Highlighter, Hospital, Hourglass, House, Joystick, Keyboard,
  Landmark, Laptop, Laugh, Leaf, Library, Link, LoaderCircle, Lock, LockOpen, LogOut, Mail, Map as MapIcon, MapPin, Mars,
  Martini, Maximize, Megaphone, MessageCircle, Mic, MicOff, Milestone, Monitor, Moon, MoonStar, Mountain,
  MoveHorizontal, Music, Music2, NotebookPen, Package, Palette, PartyPopper, Pause, PenLine, Pencil, Phone, Pill, Pin,
  Pizza, Play, Plus, Presentation, Repeat, Rocket, Sandwich, Save, School, ScreenShare, Search, Settings, Shield,
  ShieldAlert, Shirt, ShoppingBag, ShoppingCart, Siren, Skull, SkipBack, SkipForward, Smartphone, Smile, Snail, Sofa,
  Soup, Sparkles, Square, Star, StickyNote, Store, Sun, Sunrise, Sunset, Swords, Target, Tent, Ticket, Timer, Trash2,
  ThumbsUp, Cat, TreePalm, TreePine, TriangleAlert, Trophy, Tv, Undo2, User, Users, UtensilsCrossed, Venus, Video, Volume2, VolumeX,
  WashingMachine, Wheat, Wind, Wine, X, Zap, type IconNode,
} from 'lucide';

/** Custom glyphs in lucide's style (viewBox 24, stroke 2, round caps). */
const PISTOL: IconNode = [
  ['path', { d: 'M3 7h15l1 3H11l-1 3H8l-1 5H4l1-6-2-1z' }],
  ['path', { d: 'M18 7V5' }],
];
const SHOTGUN: IconNode = [
  ['path', { d: 'M2 9h17l3 1-3 1H9l-2 2H3l1-2-2-1z' }],
  ['path', { d: 'M11 11v3h3' }],
];
const RIFLE: IconNode = [
  ['path', { d: 'M2 10h18l2 1-2 1h-8l-1 4H9v-4H7l-2 3H2l1-4z' }],
  ['path', { d: 'M14 10V8h2' }],
];
const MACHINE_GUN: IconNode = [
  ['path', { d: 'M1 10h19l3 1-3 1h-9v3H8v-3H6l-2 3H1l1-4z' }],
  ['rect', { x: '12', y: '12', width: '5', height: '5', rx: '1' }],
  ['path', { d: 'M8 10V8h3' }],
];

// Chess pieces as closed silhouettes, so a fill colour covers the whole piece
// (lucide's chess icons are open line art and only partly fill).
const PIECE_BASE: [string, Record<string, string>] = ['path', { d: 'M5 21h14v-1.2a1.8 1.8 0 0 0-1.8-1.8H6.8A1.8 1.8 0 0 0 5 19.8z' }];
const CHESS_PAWN: IconNode = [
  ['path', { d: 'M8.6 18c0-3 1.1-5.4 2.3-6.8h2.2c1.2 1.4 2.3 3.8 2.3 6.8z' }],
  ['path', { d: 'M8.4 9.8h7.2v1.6H8.4z' }],
  ['circle', { cx: '12', cy: '6', r: '3.2' }],
  PIECE_BASE,
];
const CHESS_ROOK: IconNode = [
  ['path', { d: 'M7 18l1-8.2h8l1 8.2z' }],
  ['path', { d: 'M5.8 3h2.6v2h2.2V3h2.8v2h2.2V3h2.6v4.6a1.6 1.6 0 0 1-1.6 1.6H7.4a1.6 1.6 0 0 1-1.6-1.6z' }],
  PIECE_BASE,
];
const CHESS_KNIGHT: IconNode = [
  ['path', { d: 'M17 18c1-2.2 2.3-5 2.3-8.8A7.2 7.2 0 0 0 12.1 2H6.7a.9.9 0 0 0-.7 1.5L7.2 5 4.8 10.7a2 2 0 0 0 .9 2.5l2.7 1.4L7.2 18z' }],
  ['circle', { cx: '10.2', cy: '6.3', r: '.6' }],
  PIECE_BASE,
];
const CHESS_BISHOP: IconNode = [
  ['path', { d: 'M8.6 18C7.2 17.3 6 15.6 6 13.3 6 9.2 9.4 5 12 2.6c2.6 2.4 6 6.6 6 10.7 0 2.3-1.2 4-2.6 4.7z' }],
  ['path', { d: 'm15 7.2-2.7 2.7' }],
  PIECE_BASE,
];
const CHESS_QUEEN: IconNode = [
  ['path', { d: 'M6.6 18 4.2 8.8l4.4 3.4L12 5.6l3.4 6.6 4.4-3.4-2.4 9.2z' }],
  ['circle', { cx: '4', cy: '7.2', r: '1.7' }],
  ['circle', { cx: '12', cy: '3.8', r: '1.7' }],
  ['circle', { cx: '20', cy: '7.2', r: '1.7' }],
  PIECE_BASE,
];
const CHESS_KING: IconNode = [
  ['path', { d: 'M7 18c-2-1.9-4-3.7-4-6.3A4.6 4.6 0 0 1 7.6 7.1c2 0 3.3.9 4.4 2.3 1.1-1.4 2.4-2.3 4.4-2.3a4.6 4.6 0 0 1 4.6 4.6c0 2.6-2 4.4-4 6.3z' }],
  ['path', { d: 'M12 1.8v5.4' }],
  ['path', { d: 'M9.6 4h4.8' }],
  PIECE_BASE,
];

export const ICONS = {
  // Brand / navigation
  logo: Gamepad2,
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  swipe: MoveHorizontal,
  close: X,
  check: Check,
  checkCircle: CircleCheck,
  plus: Plus,
  search: Search,
  settings: Settings,
  globe: Globe,
  map: MapIcon,
  mapPin: MapPin,
  pin: Pin,
  link: Link,
  copy: Copy,
  clipboard: Clipboard,
  clipboardList: ClipboardList,
  download: Download,
  undo: Undo2,
  save: Save,
  edit: Pencil,
  pen: PenLine,
  highlighter: Highlighter,
  eraser: Eraser,
  trash: Trash2,
  folder: Folder,
  hourglass: Hourglass,
  loader: LoaderCircle,
  maximize: Maximize,
  eye: Eye,
  eyeOff: EyeOff,
  warning: TriangleAlert,
  ban: Ban,
  flag: Flag,
  lock: Lock,
  unlock: LockOpen,
  logOut: LogOut,
  bell: Bell,
  bellRing: BellRing,
  calendar: Calendar,
  alarm: AlarmClock,
  timer: Timer,
  ticket: Ticket,
  crown: Crown,
  star: Star,
  sparkles: Sparkles,
  zap: Zap,
  rocket: Rocket,
  palette: Palette,
  notes: NotebookPen,
  stickyNote: StickyNote,
  presentation: Presentation,
  keyboard: Keyboard,
  smartphone: Smartphone,
  monitor: Monitor,
  screenShare: ScreenShare,
  laptop: Laptop,
  tv: Tv,
  accessibility: Accessibility,

  // People & social
  user: User,
  userCircle: CircleUser,
  users: Users,
  handshake: Handshake,
  hand: Hand,
  smile: Smile,
  laugh: Laugh,
  wow: Annoyed,
  heart: Heart,
  heartPulse: HeartPulse,
  thumbsUp: ThumbsUp,
  party: PartyPopper,
  male: Mars,
  female: Venus,
  bot: Bot,
  shield: Shield,
  shieldAlert: ShieldAlert,
  message: MessageCircle,
  mail: Mail,
  phone: Phone,
  video: Video,
  camera: Camera,
  mic: Mic,
  micOff: MicOff,
  volume: Volume2,
  volumeOff: VolumeX,
  headphones: Headphones,
  megaphone: Megaphone,
  music: Music,
  music2: Music2,
  play: Play,
  pause: Pause,
  stop: Square,
  skipBack: SkipBack,
  skipForward: SkipForward,
  repeat: Repeat,
  target: Target,
  coffee: Coffee,
  door: DoorClosed,
  doorOpen: DoorOpen,
  armchair: Armchair,
  dot: Circle,
  dotFilled: CircleDot,
  busy: CircleMinus,
  moon: Moon,
  moonStar: MoonStar,
  sun: Sun,
  sunrise: Sunrise,
  sunset: Sunset,

  // Places & map
  house: House,
  building: Building,
  office: Building2,
  landmark: Landmark,
  school: School,
  briefcase: Briefcase,
  store: Store,
  shoppingBag: ShoppingBag,
  shoppingCart: ShoppingCart,
  pharmacy: Pill,
  hospital: Hospital,
  police: Siren,
  fuel: Fuel,
  hammer: Hammer,
  book: BookOpen,
  bookText: BookOpenText,
  library: Library,
  shirt: Shirt,
  trophy: Trophy,
  diner: UtensilsCrossed,
  laundry: WashingMachine,
  tree: TreePine,
  palm: TreePalm,
  leaf: Leaf,
  mountain: Mountain,
  bridge: Milestone,
  flame: Flame,
  tent: Tent,
  flask: FlaskConical,
  backpack: Backpack,
  sandwich: Sandwich,
  dumbbell: Dumbbell,
  chart: ChartColumn,
  sofa: Sofa,
  wine: Wine,
  cocktail: Martini,
  disc: Disc3,
  joystick: Joystick,
  gamepad: Gamepad2,
  // Chat mini-games
  chessKing: CHESS_KING,
  chessQueen: CHESS_QUEEN,
  chessRook: CHESS_ROOK,
  chessBishop: CHESS_BISHOP,
  chessKnight: CHESS_KNIGHT,
  chessPawn: CHESS_PAWN,
  grid3x3: Grid3x3,
  blocks: Blocks,
  rotate: RotateCw,
  guitar: Guitar,
  dice: Dices,
  gem: Gem,
  cat: Cat,
  pizza: Pizza,
  swords: Swords,

  // Survival
  skull: Skull,
  crosshair: Crosshair,
  axe: Axe,
  pistol: PISTOL,
  shotgun: SHOTGUN,
  rifle: RIFLE,
  machineGun: MACHINE_GUN,
  package: Package,
  bandage: Bandage,
  droplet: Droplet,
  drumstick: Drumstick,
  soup: Soup,
  cookie: Cookie,
  apple: Apple,
  bread: Wheat,
  soda: CupSoda,
  bed: Bed,
  wind: Wind,
  window: Grid2x2,
  footprints: Footprints,
  jump: ArrowBigUp,
  flashlight: Flashlight,
  biohazard: Biohazard,
  snail: Snail,
  fog: CloudFog,
  charge: ChevronsRight,
  down: ArrowDownToLine,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

export function isIconName(v: unknown): v is IconName {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ICONS, v);
}

/**
 * Values saved before the no-emoji rule (squad icons, chat reactions) are
 * mapped to icons at display time, so old rows keep working.
 */
const LEGACY_EMOJI: Record<string, IconName> = {
  '\u{1F47E}': 'logo',
  '\u{1F680}': 'rocket',
  '\u{1F3AE}': 'gamepad',
  '\u{1F332}': 'tree',
  '\u{1F355}': 'pizza',
  '\u{2694}\u{FE0F}': 'swords',
  '\u{2694}': 'swords',
  '\u{26FA}': 'tent',
  '\u{1F52E}': 'gem',
  '\u{1F431}': 'cat',
  '\u{1F465}': 'users',
  '\u{1F44D}': 'thumbsUp',
  '\u{2764}\u{FE0F}': 'heart',
  '\u{2764}': 'heart',
  '\u{1F525}': 'flame',
  '\u{1F602}': 'laugh',
  '\u{1F44B}': 'hand',
  '\u{1F4DE}': 'phone',
  '\u{1F4AC}': 'message',
  '\u{1F3E1}': 'house',
};

/** Icon for a stored value: an icon name, a legacy emoji, or the fallback. */
export function toIconName(value: string | null | undefined, fallback: IconName = 'logo'): IconName {
  if (!value) return fallback;
  if (isIconName(value)) return value;
  return LEGACY_EMOJI[value] ?? LEGACY_EMOJI[value.replace(/\uFE0F/g, '')] ?? fallback;
}
