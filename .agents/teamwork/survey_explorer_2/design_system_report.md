# TeemChat Neo-brutalist Design System & UI Component Specification
**Survey & Discovery Report for Admin Dashboard UI (`/admin`)**  
**Document**: `design_system_report.md`  
**Explorer Agent**: `survey_explorer_2`  
**Date**: November 2026  
**Status**: Complete & Verified  

---

## 1. Executive Summary

This report establishes the definitive design system specification, visual tokens, component library contracts, theme architecture, and SVG iconography for the upcoming TeemChat **Admin Dashboard UI** (`/admin`).

TeemChat's user interface is founded upon a distinctive **Neo-brutalist visual language** merged with **16-bit retro computing accents**:
- High-contrast graphic borders (`2.5px solid var(--card-border)`)
- Zero-blur hard drop shadows (`3.5px 3.5px 0px #18181B` / `#000000`)
- Tactile hover and active click transformations (`translate(2px, 2px)` on hover, `translate(3px, 3px)` on press)
- Punchy, geometric Plus Jakarta Sans typography
- Distinct dual-palette theming: warm paper/cream in light mode vs. midnight aubergine & cyber lime in dark mode
- Strict requirement for **ZERO emojis** across all administrative UI surfaces, employing crisp SVG icons with standard SVG props

All backend API contracts (`/api/admin/auth/verify`, `/api/admin/metrics`, `/api/admin/users`, `/api/admin/payments/subscriptions`, `/api/admin/payments/invoices`, `/api/admin/logs`, `/api/admin/crud/[entity]`) are verified and in place, passing 515/515 tests with zero ESLint errors. This guide supplies the exact visual contracts, component usage patterns, and CSS module specifications to enable flawless implementation by the engineering team.

---

## 2. Neo-brutalist Visual Foundations & Design Tokens

### 2.1. Tokens in `globals.css` and `colors.ts`

The application styles are driven by CSS custom properties declared in `next-app/src/app/globals.css`, with semantic color mappings exported from `next-app/src/styles/colors.ts`.

#### CSS Custom Properties Reference Table

| Token Variable | Light Theme (`:root`) | Dark Theme (`[data-theme='dark']`) | Semantic Role |
| :--- | :--- | :--- | :--- |
| `--bg` | `#F6F4EE` (warm paper/cream) | `#180D26` (midnight aubergine) | Canvas / page background |
| `--card-bg` | `#FFFFFF` (crisp white) | `#22123B` (rich dark plum) | Primary card / modal surface |
| `--card-inner` | `#F3F4F6` (soft gray container) | `#2E1B4E` (elevated plum) | Inner container, nested box, table header |
| `--card-border` | `#18181B` (graphic ink black) | `#FFFFFF` (crisp white graphic line) | Graphic stroke for cards, modals, buttons |
| `--text-main` | `#18181B` | `#FFFFFF` | Primary headings, table text, body copy |
| `--text-muted` | `#71717A` | `#D1D5DB` | Secondary text, captions, timestamps |
| `--text-subtle` | `#A1A1AA` | `#9CA3AF` | Form labels, borders, subtle dividers |
| `--primary` | `#6D28D9` (royal purple) | `#8B5CF6` (vibrant lavender) | Brand primary, links, active rings |
| `--primary-hover` | `#581C87` | `#A78BFA` | Hover state for primary accents |
| `--cta-btn` | `#F59E0B` (warm amber CTA) | `#E2F952` (electric cyber lime CTA) | Primary call-to-action button background |
| `--cta-btn-hover`| `#D97706` | `#D4EC3B` | Hover state for CTA buttons |
| `--cta-text` | `#18181B` (black text) | `#180D26` (deep aubergine text) | High-contrast label color for CTA buttons |
| `--hero-highlight`| `#EA580C` (warm orange) | `#E879F9` (electric glowing magenta) | Stat accent, special badges |
| `--neo-border-width`| `2.5px` | `2.5px` | Standard border thickness |
| `--neo-shadow` | `3.5px 3.5px 0px #18181B` | `3.5px 3.5px 0px #000000` | Zero-blur offset box shadow |
| `--neo-shadow-hover`| `1.5px 1.5px 0px #18181B` | `1.5px 1.5px 0px #000000` | Pressed hover shadow |
| `--neo-radius` | `12px` | `12px` | Standard card / button corner radius |
| `--neo-radius-sm` | `8px` | `8px` | Inner panels, badges, compact buttons |
| `--neo-radius-md` | `10px` | `10px` | Dropdowns, dialog controls |
| `--neo-radius-lg` | `16px` | `16px` | Large container boxes |
| `--neo-radius-full`| `9999px` | `9999px` | Pill badges, circular avatar wrappers |
| `--focus-ring` | `#6D28D9` | `#E2F952` | Keyboard `:focus-visible` outline |

### 2.2. Borders & Drop Shadows (Zero-Blur Hard Offsets)

1. **Border Rules**:
   - Container cards and interactive elements use `var(--neo-border-width) solid var(--card-border)` (2.5px solid).
   - Compact elements (badges, nested list rows, pill tabs) use `2px solid var(--card-border)` or `1.5px solid var(--card-border)`.
   - Dashed borders are reserved for empty states or drag/drop zones: `2px dashed var(--card-border)`.

2. **Shadow Physics & Hover State**:
   - Neo-brutalist shadows in TeemChat are strictly **0 blur**: `offset-x offset-y 0px color`.
   - Never use diffuse shadows like `0 4px 6px rgba(0,0,0,0.1)`.
   - Standard card / button shadow: `box-shadow: var(--neo-shadow);` (which resolves to `3.5px 3.5px 0px #18181B` in light, `3.5px 3.5px 0px #000000` in dark).
   - On hover (for interactive cards/buttons):
     ```css
     @media (hover: hover) and (pointer: fine) {
       .element:hover {
         transform: translate(2px, 2px);
         box-shadow: var(--neo-shadow-hover); /* 1.5px 1.5px 0px ... */
       }
     }
     ```
   - On active (click/press):
     ```css
     .element:active {
       transform: translate(3px, 3px);
       box-shadow: none;
     }
     ```

3. **Dark Mode Shadow Discipline**:
   - In dark mode, `--card-border` flips to pure white (`#FFFFFF`).
   - Using `box-shadow: 3.5px 3.5px 0px var(--card-border)` in dark mode causes an awkward white shadow!
   - Therefore, `globals.css` specifies `--neo-shadow: 3.5px 3.5px 0px #000000;` under `[data-theme='dark']`.
   - **Rule**: Always use `box-shadow: var(--neo-shadow)` or `[data-theme='dark'] .element { box-shadow: 2px 2px 0px #000000; }` for custom compact elements so shadows remain dark and punchy against dark plum surfaces.

### 2.3. Typography & Hierarchy

- **Font Family**: Plus Jakarta Sans (`var(--font-plus-jakarta)`, 'Plus Jakarta Sans', system-ui, sans-serif) configured via `next/font/google` in `next-app/src/app/layout.tsx`.
- **Weights Used**:
  - `900` (Black): Page titles, brand headers, hero metrics (`font-weight: 900`).
  - `800` (ExtraBold): Section titles, modal titles, active tab labels, badge text, button labels.
  - `700` (Bold): Card headers, input labels, table column headers.
  - `600` (SemiBold): Table cell values, descriptions, metadata text.
  - `500` / `400` (Regular): Long form body copy, JSON code viewers.
- **Letter Spacing**:
  - Headings: `-0.02em` or normal for punchy modern weight.
  - Badges & Status Tags: `letter-spacing: 0.05em; text-transform: uppercase;`.

### 2.4. Semantic Status Colors (from `colors.ts`)

| Status | Color Token | Hex Code | Dark Equivalent | Typical Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Success / Active / Paid** | `AppColors.available` | `#22C55E` / `#10B981` | `#34D399` | User 'available', Subscription 'active', Invoice 'paid' |
| **Warning / Pending / Trial** | `AppColors.away` | `#FBBF24` / `#F59E0B` | `#FBBF24` | User 'away', Subscription 'trialing', Report 'pending' |
| **Danger / Banned / Canceled**| `AppColors.busy` | `#EF4444` | `#F87171` | User 'busy'/'banned', Invoice 'void', Delete action |
| **Admin / Superadmin** | `AppColors.teemPurple` | `#6D28D9` | `#8B5CF6` | Superadmin badge, capability pills, active tab |
| **Free Tier / Neutral** | `AppColors.inkMuted` | `#71717A` | `#9CA3AF` | Free user tier, offline status, disabled state |

---

## 3. Light / Dark Theming Architecture

### 3.1. Store and DOM Lifecycle

Theme switching is managed through a lightweight Zustand store in `next-app/src/stores/theme.ts`:

```typescript
// next-app/src/stores/theme.ts
import { create } from 'zustand';

interface ThemeState {
  theme: 'light' | 'dark';
  initTheme: () => void;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',
  initTheme: () => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('teemchat-theme') as 'light' | 'dark' | null;
    const currentAttr = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null;
    const active = saved || currentAttr || 'light';
    document.documentElement.setAttribute('data-theme', active);
    set({ theme: active });
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    if (typeof window !== 'undefined') {
      localStorage.setItem('teemchat-theme', next);
      document.documentElement.setAttribute('data-theme', next);
    }
    set({ theme: next });
  },
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('teemchat-theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },
}));
```

### 3.2. Hydration Best Practices for Next.js 16 (App Router)

1. Root element in `layout.tsx` renders `<html lang="en" className={plusJakartaSans.variable}>`.
2. Interactive components must declare `'use client'` at the top of the file.
3. In client views (such as `AdminDashboardClient` or `/admin/page.tsx`), initialize theme in `useEffect`:
   ```tsx
   useEffect(() => {
     useThemeStore.getState().initTheme();
   }, []);
   ```
4. Never conditionally render drastically different HTML trees between server and initial client render based on theme state to avoid hydration mismatch warnings. Use CSS custom properties for instant styling.

---

## 4. Reusable Component Catalog (`next-app/src/components/neo/`)

TeemChat provides core Neo-brutalist building blocks under `next-app/src/components/neo/`.

### 4.1. `NeoButton`
*Path*: `next-app/src/components/neo/NeoButton.tsx`

```tsx
interface NeoButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}
```

- **Variants**:
  - `primary`: Background `var(--cta-btn)` (amber in light, cyber lime in dark), text `var(--cta-text)`. Ideal for the primary action (e.g., "Create User", "Save Changes", "Generate Invoice").
  - `secondary`: Background `var(--card-bg)`, text `var(--text-main)`. Ideal for standard secondary buttons, cancel actions, export buttons.
  - `accent`: Background `var(--primary)` (royal purple / lavender), text `#FFFFFF`. Ideal for administrative promotion or capability changes.
  - `danger`: Background `#EF4444`, text `#FFFFFF`. Ideal for destructive actions ("Delete User", "Revoke Access", "Ban Account").
  - `ghost`: Transparent background, no border, no shadow; on hover displays `var(--card-inner)`. Ideal for close buttons, pagination chevrons, icon-only buttons.
- **Sizes**:
  - `sm`: Min-height `36px` (`40px` on touch screens), padding `6px 14px`, font size `0.85rem`. Ideal for table action buttons and modal sub-actions.
  - `md` (default): Min-height `44px`, padding `10px 20px`, font size `0.95rem`.
  - `lg`: Min-height `48px`, padding `14px 28px`, font size `1.05rem`. Ideal for login/auth triggers and prominent calls to action.
- **Physics**:
  - Hover: `transform: translate(2px, 2px); box-shadow: var(--neo-shadow-hover);`
  - Active: `transform: translate(3px, 3px); box-shadow: none;`
  - Disabled: `opacity: 0.6; cursor: not-allowed;`

### 4.2. `NeoCard`
*Path*: `next-app/src/components/neo/NeoCard.tsx`

```tsx
interface NeoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  inner?: boolean;
}
```

- **Outer Card (`inner={false}`)**:
  - Background `var(--card-bg)`, border `var(--neo-border-width) solid var(--card-border)`, box-shadow `var(--neo-shadow)`, border-radius `var(--neo-radius)` (12px), padding `20px`.
  - Used for top-level modules: Stat Cards, Tab Container, Data Tables, Filter Card.
- **Inner Card (`inner={true}`)**:
  - Background `var(--card-inner)`, no shadow, border-radius `var(--neo-radius-sm)` (8px), padding `14px`.
  - Used for nested sections inside cards: Search bar wrappers, JSON payload inspection boxes, detail row expansion, secondary stat metrics.

### 4.3. `NeoBadge`
*Path*: `next-app/src/components/neo/NeoBadge.tsx`

```tsx
interface NeoBadgeProps {
  children: React.ReactNode;
  color?: string;       // Custom background override
  textColor?: string;   // Custom text color override
  className?: string;
}
```

- **Styling**:
  - Rounded pill: `border-radius: var(--neo-radius-full);`
  - Border: `2px solid var(--card-border);`
  - Shadow: `2px 2px 0px var(--card-border);` (and `#000000` in dark mode)
  - Typography: `font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;`
  - Usage: Display user roles (`SUPERADMIN`, `ADMIN`, `MODERATOR`), subscription status (`ACTIVE`, `PAST_DUE`), tier badges (`ENTERPRISE`, `PRO`, `FREE`), log severity (`CRITICAL`, `AUDIT`, `PAYMENT`).

### 4.4. `NeoInput`
*Path*: `next-app/src/components/neo/NeoInput.tsx`

```tsx
interface NeoInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
```

- **Styling**:
  - Wrapper with flex column, gap `6px`.
  - Label: `font-size: 0.85rem; font-weight: 700; color: var(--text-main);`
  - Input: min-height `44px`, background `var(--card-bg)`, border `var(--neo-border-width) solid var(--card-border)`, box-shadow `2.5px 2.5px 0px var(--card-border)`.
  - Focus state: `border-color: var(--primary); box-shadow: 3.5px 3.5px 0px var(--primary); outline: none;`
  - Error state (`error` prop present): `border-color: #EF4444; box-shadow: 2.5px 2.5px 0px #EF4444;`
  - Error message: `font-size: 0.8rem; color: #EF4444; font-weight: 600;`

### 4.5. `NeoModal`
*Path*: `next-app/src/components/neo/NeoModal.tsx`

```tsx
interface NeoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string; // Default: '500px'
}
```

- **Features**:
  - Full-screen fixed overlay with `background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 1000;`.
  - Locks background document scroll (`document.body.style.overflow = 'hidden'`).
  - Listens for `Escape` key to close.
  - Smooth pop-in animation: `popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)`.
  - Internal header with title and close button (`closeBtn`).
  - Scrollable content area with `-webkit-overflow-scrolling: touch;`.
  - Fully responsive: Adjusts padding to `10px` on screens `<= 640px` and `6px` on screens `<= 380px`.

### 4.6. `PixelAvatar`
*Path*: `next-app/src/components/neo/PixelAvatar.tsx`

```tsx
interface PixelAvatarProps {
  config: AvatarConfig;
  size?: number;       // Default: 48
  className?: string;
  bustOnly?: boolean;  // Default: true when size <= 64
}
```

- Renders a 16-bit retro canvas avatar using `image-rendering: pixelated;`.
- Ideal for user rows in the Admin User Management table (e.g. `size={36}`) and user detail inspectors (`size={80}`).

---

## 5. Strict "ZERO Emojis" Policy & Crisp SVG Icon System

### 5.1. Audit & Anti-Pattern Elimination

In legacy consumer pages, the following emoji anti-patterns were observed:
- `ThemeToggle.tsx`: `{theme === 'light' ? '🌙' : '☀️'}`
- `SpaceTabsFilter.tsx`: `'🌐 All Worlds'`, `'🏡 My Spaces'`, `'⭐ Discover'`, `'📌 Pinned'`
- `NotificationBell.tsx`: `🔔`, `✓`, `✕`, `→`

**Directive for Admin Dashboard UI**:
1. **NO raw Unicode emojis** anywhere in `/admin` (no `📊`, `👥`, `💳`, `📜`, `🗄️`, `🔍`, `⚠️`, `⚙️`, etc.).
2. All icons must be crisp, inline vector SVGs matching the visual stroke width (`strokeWidth={2}` or `2.25`), with customizable `size`, `color="currentColor"`, and standard accessibility tags (`aria-hidden="true"` or `role="img"`).
3. The Admin theme toggle must render SVG `SunIcon` and `MoonIcon` instead of raw emojis.

### 5.2. Existing SVG Icons Available for Reuse

The codebase contains two rich SVG icon libraries:
- `next-app/src/components/icons/DockIcons.tsx`
- `next-app/src/components/icons/LandingIcons.tsx`

#### Icon Matrix for Admin Dashboard

| Admin Dashboard Feature | Existing Component | Source File | Recommended Role |
| :--- | :--- | :--- | :--- |
| **Overview Metrics Tab** | `MonitorIcon` | `DockIcons.tsx` | Main tab navigation icon |
| **User Management Tab** | `UsersIcon` | `DockIcons.tsx` | Main tab navigation icon |
| **Payments & Billing Tab** | `GemIcon` | `LandingIcons.tsx` | Main tab navigation icon (Revenue / Subscriptions) |
| **System Logs Tab** | `FileTextIcon` (below) | Admin SVG helper | Multi-category system logs tab |
| **Database CRUD Explorer**| `HammerIcon` | `DockIcons.tsx` | Database CRUD explorer tab |
| **Create User / Add** | `PlusIcon` | `DockIcons.tsx` | Action button in User Management & Invoices |
| **Delete User / Record** | `TrashIcon` | `LandingIcons.tsx` | Destructive table row action |
| **Success / Verified** | `CheckIcon` | `LandingIcons.tsx` | Status pill, success alerts, confirmed auth |
| **Cancel / Close / Error** | `CloseIcon` / `XIcon` | `DockIcons.tsx` / `LandingIcons.tsx` | Modal close, clear search, failed status |
| **Search Filter** | `SearchIcon` (below) | Admin SVG helper | User, Log, and CRUD search input |
| **Filter / Category** | `FilterIcon` (below) | Admin SVG helper | Log category selection, user status filtering |
| **Refresh Data** | `RefreshIcon` (below) | Admin SVG helper | Manual metrics/table refresh trigger |
| **Inspect / View Details**| `EyeIcon` (below) | Admin SVG helper | User details and JSON payload inspector |
| **Auth / Access Lock** | `LockIcon` | `DockIcons.tsx` | Access denied state, security audit category |
| **Superadmin Shield** | `ShieldIcon` (below) | Admin SVG helper | Superadmin badge & capability status |
| **Edit User / Record** | `EditIcon` (below) | Admin SVG helper | Table action for editing fields |
| **Theme Toggle (Light)** | `SunIcon` (below) | Admin SVG helper | Switch to dark mode (replaces ☀️) |
| **Theme Toggle (Dark)** | `MoonIcon` (below) | Admin SVG helper | Switch to light mode (replaces 🌙) |

### 5.3. Recommended Admin SVG Icon Library Snippet

To keep the Admin UI self-contained and guarantee ZERO emojis, the following standard SVG components should be co-located or exported for the admin page:

```tsx
// next-app/src/app/admin/AdminIcons.tsx
import React from 'react';

export interface AdminIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export const SunIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

export const MoonIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const SearchIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const RefreshIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export const FileTextIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

export const DatabaseIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

export const ShieldIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const EditIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export const EyeIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
```

---

## 6. Admin Dashboard Layout & Implementation Blueprint

### 6.1. Component and Route Hierarchy

```
next-app/src/app/admin/
├── page.tsx                  // Next.js App Router entrypoint ('use client')
├── admin.module.css          // Comprehensive Neo-brutalist styling
├── AdminIcons.tsx            // Pure vector SVG icon library (ZERO emojis)
└── components/ (or inline tabs)
    ├── AdminHeader.tsx       // Sticky top bar, capabilities pills, theme switcher, return link
    ├── AuthDeniedCard.tsx    // 401 / 403 Access Denied presentation
    ├── OverviewTab.tsx       // 7 Metric Stat Cards + Platform Status
    ├── UsersTab.tsx          // User table, filters, Create User modal, Edit modal, Delete dialog
    ├── PaymentsTab.tsx       // Subscriptions table + Invoices table + Create Invoice modal
    ├── LogsTab.tsx           // 6 log categories, date range picker, search, JSON inspector
    └── CrudTab.tsx           // 15 whitelisted entities browser and editor
```

### 6.2. Route Authentication Guard Flow

When `/admin` mounts:
1. Calls `GET /api/admin/auth/verify`.
2. While pending: Renders a loading card with animated skeleton pulse (`@keyframes skeletonPulse`).
3. If response status is `401` or `403` (or `!data.verified`):
   - Renders `AuthDeniedCard` containing `LockIcon`, clear explanation ("Admin privilege required. Contact your administrator."), and a `NeoButton` redirecting back to `/dashboard`.
4. If response is `200` with `verified: true`:
   - Stores `admin` details (`displayName`, `systemRole`, `email`) and `capabilities` in local state.
   - Conditionally enables/disables navigation tabs based on capability flags:
     - `Overview`: Accessible to all verified admins.
     - `Users`: Guarded by `capabilities.canManageUsers`.
     - `Payments`: Guarded by `capabilities.canViewPaymentLogs`.
     - `Logs`: Guarded by `capabilities.canViewSystemLogs`.
     - `CRUD Explorer`: Guarded by `capabilities.canExecuteCrud`.
     - `Assign Superadmin / Admin`: Guarded by `capabilities.canAssignSuperadmin`.

### 6.3. The 5 Dashboard Tab Views

#### Tab 1: Overview Metrics
- Fetches `GET /api/admin/metrics`.
- Renders a 7-card responsive grid (`grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`):
  1. **Total Users**: `metrics.totalUsers` (formatted with commas).
  2. **New Users (24h)**: `metrics.newUsers24h` with a subtle highlight badge.
  3. **Active Subscriptions**: `metrics.activeSubscriptions` styled with green status pill.
  4. **Total Revenue**: `(metrics.totalRevenueCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })`.
  5. **Pending Reports**: `metrics.pendingReports` (red badge if > 0, green if 0).
  6. **Active Spaces**: `metrics.activeSpaces` count.
  7. **Today's AI Messages**: `metrics.todayAiMessages` with `BotIcon`.
- Stat card layout uses `NeoCard` with an inner stat box, crisp label, big 900-weight value, and a top-right SVG icon.

#### Tab 2: User Management
- Fetches `GET /api/admin/users?page=1&limit=20&search=...&status=...&role=...&tier=...`.
- **Toolbar**:
  - Search input with `SearchIcon` and clear button.
  - Role dropdown (`All Roles`, `user`, `moderator`, `admin`, `superadmin`).
  - Tier dropdown (`All Tiers`, `free`, `pro`, `enterprise`).
  - Status dropdown (`All Statuses`, `available`, `away`, `busy`, `offline`, `banned`).
  - "Create User" `NeoButton` with `PlusIcon` (variant="primary").
- **Table**:
  - Neo-brutalist table container: 2.5px border, crisp row dividers (`border-bottom: 2px solid var(--card-border)`), alternating hover row background (`var(--card-inner)`).
  - Columns: User (PixelAvatar + Name + Username), Role (NeoBadge), Tier (NeoBadge), Status (NeoBadge), Created Date, Actions (`EditIcon`, `EyeIcon`, `TrashIcon`).
- **Create User Modal**:
  - Implemented using `NeoModal`.
  - Fields: Email, Password, Username, Display Name, Gender (Male/Female button group), Tier, System Role (disabled for non-superadmins), Auto-Confirm toggle.
  - Submits to `POST /api/admin/users`.
- **Edit User Modal**:
  - Submits to `PATCH /api/admin/users/[id]`.
- **Delete Confirmation Modal**:
  - Submits to `DELETE /api/admin/users/[id]?hard=true|false`.

#### Tab 3: Payments & Subscriptions
- Sub-tab toggle: "Subscriptions" and "Invoices".
- **Subscriptions View**:
  - Fetches `GET /api/admin/payments/subscriptions`.
  - Displays user, status (`active`, `trialing`, `past_due`, `canceled`), current period end, AI unlimited toggle.
  - Status override action calling `PATCH /api/admin/payments/subscriptions` with `{ subscriptionId, status, hasAiUnlimited }`.
- **Invoices View**:
  - Fetches `GET /api/admin/payments/invoices`.
  - "Create Invoice" button calling `POST /api/admin/payments/invoices` with `{ userId, amountCents, currency, status }`.
  - Displays invoice ID, user, amount, status badge, paid timestamp, invoice link.

#### Tab 4: Multi-Category System Logs
- Fetches `GET /api/admin/logs?category=...&page=1&limit=20&search=...&startDate=...&endDate=...`.
- 6 Category Pills:
  1. `admin_audit` (Admin Audit Logs)
  2. `space_audit` (Space Audit Logs)
  3. `payments` (Billing Invoices)
  4. `ai_usage` (AI Companion Usage)
  5. `guest_security` (Guest Provision Logs)
  6. `reports` (User Reports)
- Date range input filters (`startDate`, `endDate`).
- Search input matching actions, tables, or IP addresses.
- Row inspection drawer/modal displaying formatted JSON metadata with a "Copy JSON" button.

#### Tab 5: Database CRUD Explorer
- Entity Selector: Pill bar or dropdown featuring all 15 `WHITELISTED_CRUD_ENTITIES`:
  - `spaces`, `worlds`, `space_settings`, `space_members`, `space_roles`, `user_reports`, `space_bans`, `space_mutes`, `ai_companions`, `companion_memories`, `space_playlists`, `playlist_tracks`, `world_objects`, `billing_invoices`, `user_subscriptions`.
- Fetches `GET /api/admin/crud/[entity]?page=1&limit=20&sortBy=created_at&sortOrder=desc`.
- Displays dynamic table columns inferred from records.
- Actions per row: View/Edit (`GET /api/admin/crud/[entity]/[id]`, `PATCH`), Delete (`DELETE`).
- "New Record" button opening JSON editor or field form submitting to `POST /api/admin/crud/[entity]`.

---

## 7. Master CSS Modules Blueprint (`admin.module.css`)

Below is the complete CSS Module specification that should be used for `next-app/src/app/admin/admin.module.css`:

```css
/* ==========================================================================
   TeemChat Admin Dashboard - Neo-brutalist Styling Module
   File: next-app/src/app/admin/admin.module.css
   ========================================================================== */

.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg);
  color: var(--text-main);
  font-family: var(--font-plus-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif;
  overflow-x: hidden;
}

/* --------------------------------------------------------------------------
   Top Sticky Header
   -------------------------------------------------------------------------- */
.header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 24px 14px;
  background-color: var(--card-bg);
  border-bottom: var(--neo-border-width) solid var(--card-border);
}

.brandGroup {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brandTitle {
  font-size: 1.25rem;
  font-weight: 900;
  letter-spacing: -0.02em;
}

.adminChip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1.5px solid var(--card-border);
  border-radius: var(--neo-radius-full);
  background-color: var(--card-inner);
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
}

.headerActions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* --------------------------------------------------------------------------
   Main Container & Sub-Header
   -------------------------------------------------------------------------- */
.main {
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.topBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.titleArea {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pageTitle {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  margin: 0;
}

.pageSubtitle {
  color: var(--text-muted);
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}

/* --------------------------------------------------------------------------
   Navigation Tabs Bar
   -------------------------------------------------------------------------- */
.tabsNav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
}

.tabButton {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  min-height: 40px;
  font-size: 0.88rem;
  font-weight: 800;
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  background-color: var(--card-inner);
  color: var(--text-muted);
  box-shadow: 2px 2px 0px var(--card-border);
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease, background-color 0.12s ease;
  user-select: none;
}

[data-theme='dark'] .tabButton {
  box-shadow: 2px 2px 0px #000000;
}

@media (hover: hover) and (pointer: fine) {
  .tabButton:hover:not(:disabled) {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0px var(--card-border);
    color: var(--text-main);
  }
  [data-theme='dark'] .tabButton:hover:not(:disabled) {
    box-shadow: 1px 1px 0px #000000;
  }
}

.tabButton:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: none;
}

.tabButton.activeTab {
  background-color: var(--primary);
  border-color: var(--card-border);
  color: #FFFFFF;
  box-shadow: 2px 2px 0px var(--card-border);
}

[data-theme='dark'] .tabButton.activeTab {
  background-color: var(--primary);
  box-shadow: 2px 2px 0px #000000;
}

/* --------------------------------------------------------------------------
   Metrics Grid (Overview Tab)
   -------------------------------------------------------------------------- */
.metricsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.metricCard {
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  transition: transform 0.1s ease;
}

.metricTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metricLabel {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metricIconWrap {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-inner);
  border: 1.5px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  color: var(--text-main);
}

.metricValue {
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--text-main);
}

.metricHint {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

/* --------------------------------------------------------------------------
   Toolbar & Filter Bar (Tables & Lists)
   -------------------------------------------------------------------------- */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
}

.filterGroup {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.selectInput {
  padding: 8px 12px;
  font-size: 0.88rem;
  font-weight: 700;
  background-color: var(--card-inner);
  color: var(--text-main);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2px 2px 0px var(--card-border);
  outline: none;
  cursor: pointer;
}

[data-theme='dark'] .selectInput {
  box-shadow: 2px 2px 0px #000000;
}

.selectInput:focus-visible {
  border-color: var(--primary);
}

.searchWrap {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 240px;
}

.searchIcon {
  position: absolute;
  left: 12px;
  pointer-events: none;
  color: var(--text-muted);
}

.searchInput {
  width: 100%;
  padding: 8px 36px 8px 36px;
  font-size: 0.88rem;
  font-weight: 600;
  background-color: var(--card-inner);
  color: var(--text-main);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2px 2px 0px var(--card-border);
  outline: none;
}

[data-theme='dark'] .searchInput {
  box-shadow: 2px 2px 0px #000000;
}

.searchInput:focus {
  border-color: var(--primary);
}

.clearSearchBtn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* --------------------------------------------------------------------------
   Data Table Styling
   -------------------------------------------------------------------------- */
.tableContainer {
  width: 100%;
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}

.table th {
  background-color: var(--card-inner);
  border-bottom: 2px solid var(--card-border);
  padding: 12px 16px;
  font-weight: 800;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  white-space: nowrap;
}

.table td {
  padding: 12px 16px;
  border-bottom: 1.5px solid var(--card-border);
  color: var(--text-main);
  font-weight: 600;
  vertical-align: middle;
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.table tbody tr:hover {
  background-color: var(--card-inner);
}

.actionsCell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
}

.iconActionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background-color: var(--card-inner);
  border: 1.5px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 1.5px 1.5px 0px var(--card-border);
  color: var(--text-main);
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

[data-theme='dark'] .iconActionBtn {
  box-shadow: 1.5px 1.5px 0px #000000;
}

.iconActionBtn:hover {
  transform: translate(1px, 1px);
  box-shadow: 0.5px 0.5px 0px var(--card-border);
}

.iconActionBtn.dangerAction:hover {
  color: #B91C1C;
  background-color: #FEE2E2;
}

/* --------------------------------------------------------------------------
   Pagination Controls
   -------------------------------------------------------------------------- */
.paginationBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
}

.pageInfo {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted);
}

.pageButtons {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* --------------------------------------------------------------------------
   Access Denied & Empty State Cards
   -------------------------------------------------------------------------- */
.stateCard {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 56px 24px;
  gap: 16px;
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
  max-width: 600px;
  margin: 40px auto;
}

.stateIconWrap {
  width: 64px;
  height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-inner);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: 3px 3px 0px var(--card-border);
}

.stateTitle {
  font-size: 1.5rem;
  font-weight: 900;
  margin: 0;
}

.stateText {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  max-width: 440px;
  line-height: 1.5;
  margin: 0;
}

/* --------------------------------------------------------------------------
   Mobile Responsiveness
   -------------------------------------------------------------------------- */
@media (max-width: 768px) {
  .main {
    padding: 20px 14px 60px;
    gap: 18px;
  }

  .pageTitle {
    font-size: 1.7rem;
  }

  .tabsNav {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding: 6px;
    -webkit-overflow-scrolling: touch;
  }

  .tabsNav::-webkit-scrollbar {
    display: none;
  }

  .tabButton {
    flex-shrink: 0;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .filterGroup {
    width: 100%;
  }

  .searchWrap {
    width: 100%;
    min-width: 0;
  }
}
```

---

## 8. Verification & Quality Gates

To preserve repository integrity and guard against regressions during implementation, all changes must strictly adhere to the following quality gates:

1. **Static Analysis & Linting**:
   - Command: `npm run lint` inside `next-app`
   - Requirement: 0 errors, 0 warnings.
   - Guard against unused imports, unhandled promises, and any raw emoji literals.
2. **Unit & Integration Tests**:
   - Command: `npm test` (`vitest run`) inside `next-app`
   - Current baseline: 515 passed (100% green across 48 test suites).
   - Ensure all admin backend tests (`tests/api/admin_auth.test.ts`, `tests/api/admin_users.test.ts`, `tests/api/admin_crud.test.ts`, `tests/api/admin_payments.test.ts`, `tests/api/admin_logs.test.ts`) continue to pass.
3. **Responsive Visual Testing**:
   - Verify layout on 320px (compact mobile), 768px (tablet), and 1440px (desktop).
   - Check horizontal scroll behavior on tables (`overflow-x: auto`) and tab bar scrolling.
4. **Theme Verification**:
   - Toggle theme using the SVG theme switcher; confirm all borders remain crisp white in dark mode and all box-shadows remain `#000000`.
   - Confirm Zero Emojis in both light and dark mode.
