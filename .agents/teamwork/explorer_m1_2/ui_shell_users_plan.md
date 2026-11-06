# TeemChat Admin Dashboard UI: Shell, Navigation, Overview & Users Specification

**Role**: Explorer Agent (`explorer_m1_2`)  
**Milestone**: Milestone 1: Production Admin Dashboard UI (UI Shell & Users Architect)  
**Target Output**: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_2\ui_shell_users_plan.md`  
**Status**: Complete Architectural Blueprint & Implementation Specification  

---

## 1. Executive Summary & System Architecture

This specification provides the comprehensive, drop-in implementation plan for the TeemChat Admin Dashboard UI at `/admin`, focusing on the core UI Shell, Neo-brutalist styling, 100% vector SVG iconography, capability-gated navigation, the Overview Metrics tab, and the complete User Management lifecycle tab.

### 1.1 Architectural Boundary & Responsibilities

```
[Browser / Client] -> /admin (Next.js App Router Client Component)
       │
       ├── [Route Guard Lifecycle] (on-mount: GET /api/admin/auth/verify via AdminClientService)
       │      ├── 401 Unauthenticated -> <UnauthenticatedCard /> (SVG Lock, Sign In, Dev API Key)
       │      ├── 403 Forbidden        -> <AccessDeniedCard /> (SVG Shield, Insufficient Role, Return)
       │      └── 200 Authorized       -> <AdminShell /> (State: admin, capabilities, activeTab, toasts)
       │
       ├── [Header & Navigation] (<AdminNav />)
       │      ├── Brand & Admin Identity (Name, @username, Role Badge: SUPERADMIN / ADMIN)
       │      ├── Theme Switcher (<AdminThemeToggle /> with SVG Sun/Moon, ZERO EMOJIS)
       │      └── Capability-Gated Tab Bar:
       │             ├── "Overview"   (Always accessible to verified admins)
       │             ├── "Users"      (Gated by canManageUsers)
       │             ├── "Payments"   (Gated by canViewPaymentLogs - Explorer M1.3)
       │             ├── "Logs"       (Gated by canViewSystemLogs - Explorer M1.3)
       │             └── "CRUD"       (Gated by canExecuteCrud - Explorer M1.3)
       │
       └── [Core Tab Views]
              ├── <OverviewTab />:
              │      ├── 7 Neo-brutalist Stat Cards (Total Users, New 24h, Subs, Revenue, Reports, Spaces, AI)
              │      ├── Quick Action Navigators
              │      └── Real-time Refresh Trigger
              │
              └── <UsersTab />:
                     ├── Search (debounced username/display_name) & Filters (status, role, tier)
                     ├── Paginated Data Table with <PixelAvatar /> and <NeoBadge />
                     ├── <CreateUserModal /> (validation, role escalation guard)
                     ├── <EditUserModal /> (status, tier, role, password reset)
                     ├── <DeleteUserModal /> (soft ban vs permanent hard delete, self-deletion guard)
                     └── <UserDossierModal /> (auth meta, profile, sub, AI stats, reports, spaces)
```

### 1.2 Non-Negotiable Quality & Design Constraints

1. **Strictly Zero Emojis**: All indicators, buttons, tabs, badges, headers, and modal controls MUST render pure SVG vector icons from `AdminIcons.tsx`. No raw unicode emojis (e.g. `☀️`, `🌙`, `📊`, `👥`, `💳`, `📜`, `🗄️`, `🔍`, `⚠️`, `⚙️`, `✕`).
2. **Neo-brutalist Design System**:
   - Graphic stroke borders: `2.5px solid var(--card-border)`.
   - Hard, zero-blur drop shadows: `3.5px 3.5px 0px #18181B` in light mode, `3.5px 3.5px 0px #000000` in dark mode.
   - Tactile physics: `translate(2px, 2px)` on hover with reduced shadow; `translate(3px, 3px)` on press with zero shadow.
   - Typography: Plus Jakarta Sans (`var(--font-plus-jakarta)`), high-contrast weights (`900` black headers, `800` buttons, `700` labels).
3. **Dual Theme Compliance**: Seamless support for Light (`#F6F4EE` canvas, `#FFFFFF` cards, `#18181B` borders) and Dark (`#180D26` canvas, `#22123B` cards, `#FFFFFF` borders, `#000000` shadows).
4. **Hydration & Lifecycle Safety**: Interactive route marked `'use client'`; clean `useEffect` lifecycle; no hydration traps.
5. **Quality Gates**: Guaranteed pass of `npm run lint` (0 errors) and `npm test` (0 failures).

---

## 2. Drop-in Neo-Brutalist CSS Module (`next-app/src/app/admin/admin.module.css`)

This complete CSS module specification provides all required classes for the admin shell, navigation, metric cards, data tables, modals, badges, and responsive viewports.

```css
/* ==========================================================================
   TeemChat Admin Dashboard - Master Neo-brutalist CSS Module
   Target: next-app/src/app/admin/admin.module.css
   ========================================================================== */

/* --------------------------------------------------------------------------
   Root Page Shell
   -------------------------------------------------------------------------- */
.adminPage {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg);
  color: var(--text-main);
  font-family: var(--font-plus-jakarta), 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  overflow-x: hidden;
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* --------------------------------------------------------------------------
   Top Sticky Navigation Shell
   -------------------------------------------------------------------------- */
.headerShell {
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
  box-shadow: 0 2px 0px rgba(0, 0, 0, 0.04);
}

.brandCluster {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brandLogoWrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: var(--primary);
  color: #FFFFFF;
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2px 2px 0px var(--card-border);
}

[data-theme='dark'] .brandLogoWrap {
  box-shadow: 2px 2px 0px #000000;
}

.brandTextGroup {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brandHeading {
  font-size: 1.25rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--text-main);
}

.brandSubheading {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.headerActions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.adminIdentityBadge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background-color: var(--card-inner);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-full);
  box-shadow: 2px 2px 0px var(--card-border);
  font-size: 0.82rem;
  font-weight: 800;
}

[data-theme='dark'] .adminIdentityBadge {
  box-shadow: 2px 2px 0px #000000;
}

.identityRolePill {
  font-size: 0.7rem;
  font-weight: 900;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: var(--neo-radius-full);
  border: 1.5px solid var(--card-border);
  letter-spacing: 0.05em;
}

.roleSuperadmin {
  background-color: var(--primary);
  color: #FFFFFF;
}

.roleAdmin {
  background-color: var(--cta-btn);
  color: var(--cta-text);
}

.themeToggleBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: var(--card-inner);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2.5px 2.5px 0px var(--card-border);
  color: var(--text-main);
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

[data-theme='dark'] .themeToggleBtn {
  box-shadow: 2.5px 2.5px 0px #000000;
}

.themeToggleBtn:hover {
  transform: translate(1px, 1px);
  box-shadow: 1.5px 1.5px 0px var(--card-border);
}

[data-theme='dark'] .themeToggleBtn:hover {
  box-shadow: 1.5px 1.5px 0px #000000;
}

.themeToggleBtn:active {
  transform: translate(2.5px, 2.5px);
  box-shadow: none;
}

.exitButton {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  background-color: var(--card-bg);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2.5px 2.5px 0px var(--card-border);
  color: var(--text-main);
  font-size: 0.85rem;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

[data-theme='dark'] .exitButton {
  box-shadow: 2.5px 2.5px 0px #000000;
}

.exitButton:hover {
  transform: translate(1px, 1px);
  box-shadow: 1.5px 1.5px 0px var(--card-border);
}

.exitButton:active {
  transform: translate(2.5px, 2.5px);
  box-shadow: none;
}

/* --------------------------------------------------------------------------
   Main Layout Container
   -------------------------------------------------------------------------- */
.mainLayout {
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* --------------------------------------------------------------------------
   Sub-Header / Breadcrumb Bar
   -------------------------------------------------------------------------- */
.titleBar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.titleColumn {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pageHeadline {
  font-size: 2.25rem;
  font-weight: 900;
  letter-spacing: -0.025em;
  line-height: 1.1;
  color: var(--text-main);
  margin: 0;
}

.pageDescription {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  margin: 0;
}

.titleActions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* --------------------------------------------------------------------------
   Capability-Gated Navigation Pills
   -------------------------------------------------------------------------- */
.navPillsBar {
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

.navPill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 8px 18px;
  background-color: var(--card-inner);
  color: var(--text-muted);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2px 2px 0px var(--card-border);
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  user-select: none;
  transition: transform 0.1s ease, box-shadow 0.1s ease, background-color 0.12s ease;
}

[data-theme='dark'] .navPill {
  box-shadow: 2px 2px 0px #000000;
}

@media (hover: hover) and (pointer: fine) {
  .navPill:hover:not(:disabled) {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0px var(--card-border);
    color: var(--text-main);
  }
  [data-theme='dark'] .navPill:hover:not(:disabled) {
    box-shadow: 1px 1px 0px #000000;
  }
}

.navPill:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: none;
}

.navPill.activePill {
  background-color: var(--primary);
  border-color: var(--card-border);
  color: #FFFFFF;
  box-shadow: 2px 2px 0px var(--card-border);
}

[data-theme='dark'] .navPill.activePill {
  box-shadow: 2px 2px 0px #000000;
}

.navPill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(1);
}

/* --------------------------------------------------------------------------
   Overview Tab: Metrics Grid & Cards
   -------------------------------------------------------------------------- */
.overviewGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}

.metricCard {
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.metricCard:hover {
  transform: translate(1px, 1px);
  box-shadow: var(--neo-shadow-hover);
}

.metricHeaderRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metricTitle {
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.metricIconBox {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-inner);
  border: 1.5px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 1.5px 1.5px 0px var(--card-border);
  color: var(--text-main);
}

[data-theme='dark'] .metricIconBox {
  box-shadow: 1.5px 1.5px 0px #000000;
}

.metricValueRow {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.metricNumber {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--text-main);
}

.metricFooterText {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

/* Quick Navigation Shortcuts Section in Overview */
.shortcutsContainer {
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sectionHeading {
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: -0.01em;
  color: var(--text-main);
  margin: 0;
}

.shortcutsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.shortcutTile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background-color: var(--card-inner);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2px 2px 0px var(--card-border);
  color: var(--text-main);
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

[data-theme='dark'] .shortcutTile {
  box-shadow: 2px 2px 0px #000000;
}

.shortcutTile:hover {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0px var(--card-border);
}

/* --------------------------------------------------------------------------
   Users Tab: Toolbar, Filters & Controls
   -------------------------------------------------------------------------- */
.toolbarCard {
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.searchCluster {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 280px;
  flex: 1 1 280px;
  max-width: 440px;
}

.searchLensIcon {
  position: absolute;
  left: 12px;
  pointer-events: none;
  color: var(--text-muted);
}

.searchField {
  width: 100%;
  height: 42px;
  padding: 0 38px 0 38px;
  background-color: var(--card-inner);
  color: var(--text-main);
  font-size: 0.88rem;
  font-weight: 700;
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2px 2px 0px var(--card-border);
  outline: none;
  transition: border-color 0.15s ease;
}

[data-theme='dark'] .searchField {
  box-shadow: 2px 2px 0px #000000;
}

.searchField:focus {
  border-color: var(--primary);
}

.clearSearchAction {
  position: absolute;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-muted);
}

.filterCluster {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.filterSelect {
  height: 42px;
  padding: 0 32px 0 12px;
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

[data-theme='dark'] .filterSelect {
  box-shadow: 2px 2px 0px #000000;
}

.filterSelect:focus-visible {
  border-color: var(--primary);
}

/* --------------------------------------------------------------------------
   Data Table Layout
   -------------------------------------------------------------------------- */
.tableEnvelope {
  width: 100%;
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.dataTable {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.9rem;
}

.dataTable thead th {
  background-color: var(--card-inner);
  border-bottom: 2px solid var(--card-border);
  padding: 14px 18px;
  font-size: 0.78rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  white-space: nowrap;
}

.dataTable tbody td {
  padding: 14px 18px;
  border-bottom: 1.5px solid var(--card-border);
  color: var(--text-main);
  font-weight: 600;
  vertical-align: middle;
}

.dataTable tbody tr:last-child td {
  border-bottom: none;
}

.dataTable tbody tr:hover {
  background-color: var(--card-inner);
}

.userCell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.userMetaColumn {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.userDisplayName {
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--text-main);
}

.userUsername {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

.actionsCell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
}

.tableActionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background-color: var(--card-inner);
  border: 1.5px solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 1.5px 1.5px 0px var(--card-border);
  color: var(--text-main);
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

[data-theme='dark'] .tableActionBtn {
  box-shadow: 1.5px 1.5px 0px #000000;
}

.tableActionBtn:hover {
  transform: translate(1px, 1px);
  box-shadow: 0.5px 0.5px 0px var(--card-border);
}

.tableActionBtn.dangerAction:hover {
  color: #B91C1C;
  background-color: #FEE2E2;
}

/* --------------------------------------------------------------------------
   Pagination Bar
   -------------------------------------------------------------------------- */
.paginationBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 20px;
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
}

.pageInfoText {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-muted);
}

.pageActionsGroup {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* --------------------------------------------------------------------------
   Form & Modal Custom Controls
   -------------------------------------------------------------------------- */
.formGrid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.formRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.formFieldWrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.formLabel {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-main);
}

.formInput {
  height: 44px;
  padding: 0 14px;
  font-size: 0.9rem;
  font-weight: 600;
  background-color: var(--card-bg);
  color: var(--text-main);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius-sm);
  box-shadow: 2px 2px 0px var(--card-border);
  outline: none;
}

[data-theme='dark'] .formInput {
  box-shadow: 2px 2px 0px #000000;
}

.formInput:focus {
  border-color: var(--primary);
}

.radioGroup {
  display: flex;
  align-items: center;
  gap: 12px;
}

.radioOption {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
}

.checkboxOption {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 4px;
}

.modalFooter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

/* --------------------------------------------------------------------------
   Auth Guard States (Loading, 401, 403)
   -------------------------------------------------------------------------- */
.guardCentering {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 80px);
  padding: 24px;
}

.guardCard {
  max-width: 520px;
  width: 100%;
  background-color: var(--card-bg);
  border: var(--neo-border-width) solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: var(--neo-shadow);
  padding: 44px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 18px;
}

.guardIconWrapper {
  width: 68px;
  height: 68px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-inner);
  border: 2px solid var(--card-border);
  border-radius: var(--neo-radius);
  box-shadow: 3.5px 3.5px 0px var(--card-border);
}

[data-theme='dark'] .guardIconWrapper {
  box-shadow: 3.5px 3.5px 0px #000000;
}

.guardTitle {
  font-size: 1.6rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-main);
}

.guardBody {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.apiKeyAccordion {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1.5px dashed var(--card-border);
}

/* --------------------------------------------------------------------------
   Animations & Keyframes
   -------------------------------------------------------------------------- */
@keyframes skeletonPulse {
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
}

.skeletonLoading {
  animation: skeletonPulse 1.5s ease-in-out infinite;
}

/* --------------------------------------------------------------------------
   Mobile Responsiveness
   -------------------------------------------------------------------------- */
@media (max-width: 768px) {
  .headerShell {
    padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
  }

  .mainLayout {
    padding: 18px 14px 60px;
    gap: 18px;
  }

  .pageHeadline {
    font-size: 1.75rem;
  }

  .navPillsBar {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding: 6px;
    -webkit-overflow-scrolling: touch;
  }

  .navPillsBar::-webkit-scrollbar {
    display: none;
  }

  .navPill {
    flex-shrink: 0;
    min-height: 38px;
    padding: 6px 14px;
    font-size: 0.82rem;
  }

  .toolbarCard {
    flex-direction: column;
    align-items: stretch;
  }

  .searchCluster {
    max-width: none;
  }

  .filterCluster {
    width: 100%;
  }

  .filterSelect {
    flex: 1 1 calc(50% - 6px);
  }

  .formRow {
    grid-template-columns: 1fr;
  }
}
```

---

## 3. Strict Zero-Emoji Vector SVG Icon Library (`AdminIcons.tsx`)

File location: `next-app/src/app/admin/components/AdminIcons.tsx`  
**Strict Directive**: Zero Unicode emojis anywhere in the file. All icons use clean inline SVG paths with standardized sizing, default strokeWidth, customizable classes, and `aria-hidden="true"`.

```tsx
// next-app/src/app/admin/components/AdminIcons.tsx
import React from 'react';

export interface AdminIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

// 1. Navigation: Overview
export const MonitorIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

// 2. Navigation: Users
export const UsersIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// 3. Navigation: Payments & Subscriptions
export const CreditCardIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

// 4. Navigation: Multi-Category System Logs
export const FileTextIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

// 5. Navigation: CRUD Explorer
export const DatabaseIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

// 6. Theme: Sun (Zero emojis)
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

// 7. Theme: Moon (Zero emojis)
export const MoonIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

// 8. Auth: Lock (401 Unauthenticated)
export const LockIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// 9. Auth: Shield (403 Forbidden & Superadmin)
export const ShieldIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// 10. Search: Magnifying Glass
export const SearchIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// 11. Controls: Refresh
export const RefreshIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

// 12. Actions: Plus (Create User / Record)
export const PlusIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// 13. Actions: Edit
export const EditIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

// 14. Actions: Trash (Delete / Soft Ban)
export const TrashIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// 15. Actions: Eye (Inspect Dossier)
export const EyeIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// 16. Controls: Close / Clear
export const CloseIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// 17. Status: Check
export const CheckIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// 18. Status: Alert Triangle
export const AlertTriangleIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// 19. Pagination: Left
export const ChevronLeftIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

// 20. Pagination: Right
export const ChevronRightIcon: React.FC<AdminIconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// 21. Metric: Trending Up
export const TrendingUpIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

// 22. Metric: Dollar Sign
export const DollarSignIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

// 23. Metric: Flag (Reports)
export const FlagIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

// 24. Metric: Compass (Spaces)
export const CompassIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

// 25. Metric: Bot (AI Messages)
export const BotIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <line x1="8" y1="16" x2="8" y2="16" />
    <line x1="16" y1="16" x2="16" y2="16" />
  </svg>
);

// 26. Security: Key (Machine Dev Key)
export const KeyIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M21 2l-2 2m-1.5 1.5L14 9l-2-2-5 5 1.5 1.5-2 2-2-2L2 16l3 3 7.5-7.5" />
    <circle cx="7.5" cy="16.5" r="1.5" />
  </svg>
);

// 27. Navigation: Exit / Arrow Left
export const ArrowLeftIcon: React.FC<AdminIconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);
```

---

## 4. Capability-Gated Navigation Component (`AdminNav.tsx`)

File location: `next-app/src/app/admin/components/AdminNav.tsx`

### 4.1 Component Contract & Interfaces

```typescript
export type AdminTabKey = 'overview' | 'users' | 'payments' | 'logs' | 'crud';

export interface AdminCapabilities {
  canManageUsers: boolean;
  canViewPaymentLogs: boolean;
  canViewSystemLogs: boolean;
  canExecuteCrud: boolean;
  canAssignSuperadmin: boolean;
}

export interface AdminProfileSummary {
  id: string;
  email: string;
  username: string;
  displayName: string;
  systemRole: 'admin' | 'superadmin';
  isMachineKey: boolean;
}

export interface AdminNavProps {
  activeTab: AdminTabKey;
  onSelectTab: (tab: AdminTabKey) => void;
  admin: AdminProfileSummary;
  capabilities: AdminCapabilities;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}
```

### 4.2 Tab Definitions & Capability Mapping

```typescript
interface TabDefinition {
  key: AdminTabKey;
  label: string;
  icon: React.ComponentType<AdminIconProps>;
  requiredCapability?: keyof AdminCapabilities;
}

export const ADMIN_TABS: TabDefinition[] = [
  { key: 'overview', label: 'Overview', icon: MonitorIcon },
  { key: 'users', label: 'Users', icon: UsersIcon, requiredCapability: 'canManageUsers' },
  { key: 'payments', label: 'Payments', icon: CreditCardIcon, requiredCapability: 'canViewPaymentLogs' },
  { key: 'logs', label: 'Logs', icon: FileTextIcon, requiredCapability: 'canViewSystemLogs' },
  { key: 'crud', label: 'CRUD Explorer', icon: DatabaseIcon, requiredCapability: 'canExecuteCrud' },
];
```

### 4.3 Component Logic Specification

1. **Header Rendering**:
   - Left: Logo icon (`ShieldIcon`), brand title "TeemChat Admin", and environment badge (`PRODUCTION` / `DEV KEY`).
   - Right: Admin identity badge displaying `admin.displayName` (`@admin.username`) + role chip (`SUPERADMIN` in purple, `ADMIN` in amber).
   - Theme toggle button: Reads from `useThemeStore`, calls `toggleTheme()`, renders `<SunIcon />` in dark mode or `<MoonIcon />` in light mode. Zero emojis!
   - Exit button: Link navigating back to `/dashboard` with `<ArrowLeftIcon />` and text "Back to App".
2. **Pill Navigation Rendering**:
   - Maps through `ADMIN_TABS`.
   - Determines enabled state: `const isEnabled = !tab.requiredCapability || Boolean(capabilities[tab.requiredCapability]);`.
   - If disabled: Renders pill with `disabled={true}`, title `"Access restricted: Missing capability"`, and dimmed visual styling.
   - If active: Applies `styles.activePill`.
   - Clicking an enabled pill triggers `onSelectTab(tab.key)`.

---

## 5. Admin Dashboard Route Entrypoint & Guard (`page.tsx`)

File location: `next-app/src/app/admin/page.tsx`  
**Directive**: Must be marked `'use client'`.

### 5.1 Route Guard State Machine

```typescript
type AuthState = 
  | { status: 'CHECKING' }
  | { status: 'UNAUTHENTICATED'; error: string }
  | { status: 'FORBIDDEN'; error: string; adminInfo?: Partial<AdminProfileSummary> }
  | { status: 'AUTHORIZED'; admin: AdminProfileSummary; capabilities: AdminCapabilities };
```

### 5.2 Verification Lifecycle Execution

1. **Mount Hook (`useEffect`)**:
   ```typescript
   useEffect(() => {
     let isMounted = true;

     async function checkAuth() {
       try {
         const result = await AdminClientService.verifyAuth();
         if (!isMounted) return;

         if (result.verified && result.admin) {
           setAuthState({
             status: 'AUTHORIZED',
             admin: result.admin,
             capabilities: result.capabilities,
           });
         }
       } catch (err: unknown) {
         if (!isMounted) return;
         const apiErr = err as { status?: number; message?: string };
         if (apiErr.status === 403) {
           setAuthState({
             status: 'FORBIDDEN',
             error: apiErr.message || 'Insufficient administrative privileges.',
           });
         } else {
           setAuthState({
             status: 'UNAUTHENTICATED',
             error: apiErr.message || 'Authentication required.',
           });
         }
       }
     }

     checkAuth();
     return () => { isMounted = false; };
   }, []);
   ```

2. **State 1: `CHECKING` Rendering**:
   - Renders centered Neo-brutalist card with skeleton pulse:
   - Icon: `RefreshIcon` with CSS spin animation.
   - Headline: "Verifying Admin Credentials..."
   - Subtitle: "Validating cryptographic session token and role claims."

3. **State 2: `UNAUTHENTICATED` (401) Rendering**:
   - Centered `<div className={styles.guardCard}>`.
   - Icon: `<LockIcon size={32} />` inside `styles.guardIconWrapper`.
   - Title: "Authentication Required"
   - Body: "You must be signed in with a valid administrator account to access the administration dashboard."
   - Action cluster:
     - `NeoButton variant="primary"` -> "Sign In" (routes to `/`).
     - "Use Machine Admin Key" accordion toggle: reveals an input for `ADMIN_SECRET_KEY` that saves to `sessionStorage.setItem('teem_admin_api_key', val)` and triggers re-verification!

4. **State 3: `FORBIDDEN` (403) Rendering**:
   - Centered `<div className={styles.guardCard}>`.
   - Icon: `<ShieldIcon size={32} color="#EF4444" />`.
   - Title: "Access Forbidden"
   - Body: "Your current account does not possess administrative privileges."
   - Displays caller identity details if available.
   - Action: `NeoButton variant="primary"` -> "Return to Dashboard" (routes to `/dashboard`).

5. **State 4: `AUTHORIZED` (200) Rendering**:
   - Renders `AdminNav` top bar.
   - Renders page header with current active tab title and quick subtitle.
   - Dynamically mounts the active tab component:
     - `'overview'` -> `<OverviewTab capabilities={capabilities} onNavigateTab={setActiveTab} />`
     - `'users'` -> `<UsersTab capabilities={capabilities} currentAdminId={admin.id} isSuperadmin={admin.systemRole === 'superadmin'} />`
     - `'payments'` -> `<PaymentsTab capabilities={capabilities} />`
     - `'logs'` -> `<LogsTab capabilities={capabilities} />`
     - `'crud'` -> `<CrudTab capabilities={capabilities} />`
   - Global Toast container for mutation feedback (e.g. "User created successfully", "Status updated").

---

## 6. Overview Metrics Tab Specification (`OverviewTab.tsx`)

File location: `next-app/src/app/admin/components/OverviewTab.tsx`

### 6.1 Data Model & Endpoint Alignment

Endpoint: `GET /api/admin/metrics`  
Payload Shape:
```typescript
export interface AdminMetricsData {
  totalUsers: number;
  newUsers24h: number;
  activeSubscriptions: number;
  totalRevenueCents: number;
  pendingReports: number;
  activeSpaces: number;
  todayAiMessages: number;
}
```

### 6.2 The 7 Responsive Metric Cards

| # | Metric Title | Icon Component | Value Formatting | Accent / Status Badge |
|---|---|---|---|---|
| 1 | **Total Users** | `<UsersIcon />` | `totalUsers.toLocaleString()` | Neutral / Primary |
| 2 | **New Users (24h)** | `<TrendingUpIcon />` | `+${newUsers24h}` | `<NeoBadge color="#22C55E">24H GAIN</NeoBadge>` |
| 3 | **Active Subscriptions** | `<CreditCardIcon />` | `activeSubscriptions.toLocaleString()` | `<NeoBadge color="#10B981">ACTIVE</NeoBadge>` |
| 4 | **Total Revenue** | `<DollarSignIcon />` | `$${(totalRevenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` | `<NeoBadge color="#F59E0B">ALL TIME</NeoBadge>` |
| 5 | **Pending Reports** | `<FlagIcon />` | `pendingReports` | If > 0: Red danger badge; If 0: Green check badge |
| 6 | **Active Spaces** | `<CompassIcon />` | `activeSpaces` | Neutral container count |
| 7 | **Today's AI Messages** | `<BotIcon />` | `todayAiMessages.toLocaleString()` | Highlight lavender pill |

### 6.3 Quick Navigation Shortcuts

Below the grid, render quick action tiles allowing one-click navigation to other dashboard areas:
- "Manage Users & Permissions" -> `onNavigateTab('users')`
- "Review Platform Reports" -> `onNavigateTab('logs')` with filter category `reports`
- "Inspect Subscriptions & Revenue" -> `onNavigateTab('payments')`
- "Explore Database CRUD Tables" -> `onNavigateTab('crud')`

---

## 7. User Management Tab Specification (`UsersTab.tsx`)

File location: `next-app/src/app/admin/components/UsersTab.tsx`

### 7.1 Data Contract & State Interfaces

```typescript
export interface AdminUserProfile {
  id: string;
  username: string;
  display_name: string;
  status: 'available' | 'away' | 'busy' | 'offline' | 'banned';
  status_message: string | null;
  gender: 'male' | 'female';
  tier: 'free' | 'pro' | 'enterprise';
  is_paid: boolean;
  system_role: 'user' | 'moderator' | 'admin' | 'superadmin';
  has_ai_companion: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsersTabProps {
  capabilities: AdminCapabilities;
  currentAdminId: string;
  isSuperadmin: boolean;
}
```

### 7.2 Toolbar, Filters & Pagination

1. **Search Input**:
   - Input text debounced (300ms) triggering query `search=...` (searches `username` and `display_name`).
   - Prefix: `<SearchIcon />`, Suffix: `<CloseIcon />` clear button.
2. **Status Dropdown**:
   - Options: `All Statuses`, `available`, `away`, `busy`, `offline`, `banned`.
3. **Role Dropdown**:
   - Options: `All Roles`, `user`, `moderator`, `admin`, `superadmin`.
4. **Tier Dropdown**:
   - Options: `All Tiers`, `free`, `pro`, `enterprise`.
5. **Action**:
   - `<NeoButton variant="primary" onClick={() => setShowCreateModal(true)}>+ New User</NeoButton>`.
6. **Pagination Controls**:
   - "Showing Page {page} of {totalPages} ({total} total users)".
   - Buttons: `<ChevronLeftIcon /> Prev` (disabled on page 1), `Next <ChevronRightIcon />` (disabled on page totalPages).

### 7.3 Data Table Column Architecture

1. **User Column**:
   - `<PixelAvatar config={...} size={36} />`.
   - Display name in bold, `@username` in muted text.
2. **Status Column**:
   - `<NeoBadge color={statusColor}>{user.status.toUpperCase()}</NeoBadge>`.
   - Colors: `available` -> `#22C55E`, `away` -> `#FBBF24`, `busy`/`banned` -> `#EF4444`, `offline` -> `#71717A`.
3. **Role Column**:
   - `<NeoBadge color={roleColor}>{user.system_role.toUpperCase()}</NeoBadge>`.
   - `superadmin`/`admin` -> Royal Purple `#6D28D9`, `moderator` -> Blue `#3B82F6`, `user` -> Subtle Gray `#A1A1AA`.
4. **Tier Column**:
   - `free`, `pro`, `enterprise` badge.
5. **AI Companion Column**:
   - If `has_ai_companion`: `<BotIcon size={16} color="var(--primary)" /> Enabled`.
   - Else: Muted `-`.
6. **Created Date**:
   - Formatted as `MMM DD, YYYY`.
7. **Actions Column**:
   - `<button className={styles.tableActionBtn} onClick={() => openDossier(user.id)} title="View Dossier"><EyeIcon /></button>`
   - `<button className={styles.tableActionBtn} onClick={() => openEditModal(user)} title="Edit User"><EditIcon /></button>`
   - `<button className={`${styles.tableActionBtn} ${styles.dangerAction}`} onClick={() => openDeleteModal(user)} title="Delete / Suspend"><TrashIcon /></button>`

---

### 7.4 Create User Modal (`POST /api/admin/users`)

Built using `<NeoModal isOpen={...} onClose={...} title="Provision New User">`.

#### Input Fields:
1. **Email** (required, valid email): `<NeoInput label="Email Address *" type="email" required />`
2. **Password** (required, min 8 chars): `<NeoInput label="Initial Password *" type="password" required />`
3. **Username** (optional, 3-30 alphanumeric + `_.-`): `<NeoInput label="Username (Optional)" />`
4. **Display Name** (required, default "Explorer"): `<NeoInput label="Display Name" />`
5. **Gender**: Radio group: `Male` | `Female` (affects default avatar configuration).
6. **Tier**: Select dropdown: `free` (default), `pro`, `enterprise`.
7. **System Role**:
   - Select dropdown: `user` (default), `moderator`, `admin`, `superadmin`.
   - **Crucial Security Guard**: If `!isSuperadmin`, disable the `admin` and `superadmin` options:
     ```tsx
     <option value="admin" disabled={!isSuperadmin}>Admin {!isSuperadmin ? '(Superadmin Only)' : ''}</option>
     <option value="superadmin" disabled={!isSuperadmin}>Superadmin {!isSuperadmin ? '(Superadmin Only)' : ''}</option>
     ```
8. **Auto-Confirm Email**: Checkbox (default checked).
9. **Enable AI Companion**: Checkbox (default unchecked).

#### Submission:
- Calls `AdminClientService.createUser(payload)`.
- On success: Closes modal, adds success toast, refetches users list.
- On error: Displays banner with error message from server.

---

### 7.5 Edit User Modal (`PATCH /api/admin/users/[id]`)

Built using `<NeoModal isOpen={...} onClose={...} title="Edit User Profile">`.

#### Pre-populated Fields:
1. **Display Name**: `<NeoInput label="Display Name" value={...} />`
2. **Username**: `<NeoInput label="Username" value={...} />`
3. **Presence Status**: Dropdown (`available`, `away`, `busy`, `offline`, `banned`).
4. **Status Message**: `<NeoInput label="Status Message" maxLength={160} />`
5. **Subscription Tier**: Dropdown (`free`, `pro`, `enterprise`).
6. **Is Paid**: Checkbox toggle.
7. **System Role**:
   - Dropdown (`user`, `moderator`, `admin`, `superadmin`).
   - If `!isSuperadmin`, the entire role dropdown is `disabled={true}` with an explanatory label: *"Only superadmins can alter system security roles."*
8. **Reset Password**:
   - `<NeoInput label="Set New Password (Leave blank to keep unchanged)" type="password" placeholder="••••••••" />`
9. **Has AI Companion**: Checkbox toggle.

#### Submission:
- Sends diff to `PATCH /api/admin/users/[id]`.
- Refreshes user table and updates profile cache.

---

### 7.6 Delete / Suspend Confirmation Modal (`DELETE /api/admin/users/[id]`)

Built using `<NeoModal isOpen={...} onClose={...} title="Suspend or Delete User">`.

#### Critical Security & Safety Rules:
1. **Self-Deletion Guard**: If `targetUser.id === currentAdminId`:
   - Display error card: *"You cannot delete or suspend your own account."*
   - Disable submission button.
2. **Superadmin Deletion Guard**: If `targetUser.system_role === 'superadmin'` and `!isSuperadmin`:
   - Display error card: *"Only a superadmin can remove or suspend another superadmin."*
   - Disable submission button.
3. **Mode Selector**:
   - Radio Option A: **"Soft Ban (Recommended)"** (`mode='soft'`)
     - Explanatory copy: *"Changes profile status to 'banned' and locks Supabase Auth for 100 years. All user spaces, chats, and payment records remain intact for auditing."*
   - Radio Option B: **"Hard Delete (Permanent)"** (`mode='hard'`)
     - Explanatory copy: *"Permanently purges the user from authentication and database cascading records. Irreversible!"*
4. **Destructive Action Button**:
   - `<NeoButton variant="danger" onClick={handleDeleteConfirm}>Confirm {mode === 'soft' ? 'Suspension' : 'Permanent Deletion'}</NeoButton>`.

---

### 7.7 User Dossier / Inspection Modal (`GET /api/admin/users/[id]`)

Built using `<NeoModal isOpen={...} onClose={...} title={`User Dossier: @${user.username}`} maxWidth="680px">`.

#### Content Sections:
1. **Avatar & Bio Header**: Large `<PixelAvatar size={64} />` with display name, email, and joined date.
2. **Account Metadata**:
   - Email confirmed at timestamp / Unconfirmed indicator.
   - Last sign-in timestamp.
   - Banned until timestamp (if active).
3. **Subscription Status**:
   - Active plan ID, period end date, cancel at period end flag, AI unlimited entitlement.
4. **AI Companion Usage (Last 7 Days)**:
   - Mini bar chart or table listing daily message counts against daily quota.
5. **User Reports & Moderation History**:
   - Total complaints filed against this user.
6. **Space Memberships**:
   - Count of joined spaces and roles within each space.

---

## 8. Testing & Quality Verification Blueprint

### 8.1 Verification Commands
- `npm run lint`: Verifies Next.js 16 core-web-vitals, TypeScript types, and zero unused imports.
- `npm test`: Runs Vitest suite across node test environment (ensures 515/515 existing tests remain passing + new admin tests pass).

### 8.2 Vitest Test Cases for Route Guard & UI Shell Logic

To preserve Vitest node-environment compatibility without `jsdom`, test the logic and state machines via pure unit/integration suites:

1. **Auth Guard Verification (`tests/admin_guard.test.ts`)**:
   - `401 Unauthorized` response transitions state to `UNAUTHENTICATED` with appropriate message.
   - `403 Forbidden` response transitions state to `FORBIDDEN` and extracts target role.
   - `200 OK` response grants access and parses capabilities.
   - Capability gating disables unauthorized tabs (`canManageUsers`, `canViewPaymentLogs`, `canViewSystemLogs`, `canExecuteCrud`).
   - Privilege escalation blocker prevents assigning superadmin role when `canAssignSuperadmin` is false.
   - Self-deletion check throws before calling delete API when `targetId === currentAdminId`.

2. **Zero-Emoji Compliance Test**:
   - Scripted AST or regex verification that scans `next-app/src/app/admin/` ensuring zero unicode emojis exist in source code or template strings.

---

## 9. Implementation Checklist for Developer Agents

- [ ] Create `next-app/src/app/admin/admin.module.css` matching Section 2.
- [ ] Create `next-app/src/app/admin/components/AdminIcons.tsx` matching Section 3 with 27 SVG vector icons.
- [ ] Create `next-app/src/app/admin/components/AdminNav.tsx` matching Section 4.
- [ ] Create `next-app/src/app/admin/page.tsx` with on-mount auth guard matching Section 5.
- [ ] Create `next-app/src/app/admin/components/OverviewTab.tsx` with 7 metric cards matching Section 6.
- [ ] Create `next-app/src/app/admin/components/UsersTab.tsx` with table, filters, Create User, Edit User, Delete Modal, and Dossier Modal matching Section 7.
- [ ] Verify `npm run lint` exits with 0 errors.
- [ ] Verify `npm test` runs with 100% passing tests.
