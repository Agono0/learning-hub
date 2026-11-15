# DESIGN.md — Learning HUB Design System & UI Specification

> [!NOTE]
> Grounded in the **getdesign.md** open standard for modern AI-assisted engineering.
> This specification codifies Learning HUB's visual identity, typography, semantic token hierarchy,
> elevation/depth layering, micro-interactions, component recipes, and accessibility rules.

---

## 1. Aesthetic Identity & Design Philosophy

Learning HUB is a research-backed, high-retention learning environment (FSRS-6, BKT, Elo).
Its visual atmosphere is **Calm by Default**:
- **Zero Distraction:** Uncluttered layouts, generous whitespace, single primary focal point per screen.
- **Tactile Elevation:** Layered surfaces using soft tinted borders and diffused ambient luminescence rather than heavy drop-shadows.
- **Responsive & Mobile-First:** Designed for 360px minimum width (phone in one hand) up to 4K ultra-wide displays. Touch targets $\ge 44\text{px}$.
- **Palette Agnostic:** Every component renders strictly through CSS variable tokens (`--hub-bg`, `--hub-panel`, `--hub-border`, `--hub-accent`), supporting real-time theme swapping (`calm`, `forest`, `ocean`, `sunset`, `cyberpunk`).

---

## 2. Semantic Color System & Surface Tokens

Hardcoded hex colors in application views are strictly forbidden. UI components resolve through semantic roles:

| Token | Semantic Role | Dark Mode (Calm Palette) | Light Mode Contrast |
|---|---|---|---|
| `--hub-bg` | App viewport background | `#0e120f` | Deep base canvas |
| `--hub-sunken` | Inset wells, code blocks, input fills | `#101411` | Subtle recess |
| `--hub-panel` | Base cards, navigation bars, toolbars | `#151a16` | Layer 1 elevation |
| `--hub-panel-2` | Floating menus, dialogs, hover cards | `#1c221d` | Layer 2 elevation |
| `--hub-border` | Subtle structural hairpins (1px) | `#262e28` | 15% opacity tint |
| `--hub-border-strong` | Active, focused, or selected boundaries | `#3a443c` | 35% opacity tint |
| `--ac-strong` | Primary action buttons, active tabs | `#56735f` | Sage emerald focus |
| `--ac-mid` | Secondary accents, progress fills | `#6d8f79` | Harmonious mid-tone |
| `--ac-soft` | Badge backgrounds, subtle glows | `#a7c3b0` | Tinted indicator wash |
| `--ac-deep` | Deep accent well / banner tint | `#2c3a31` | Low-luminance accent |

### Status Tokens
- **Success / Mastery ($\ge 90\%$):** Emerald (`#10b981`, soft `#064e3b20`)
- **Warning / Review Due Soon:** Amber (`#f59e0b`, soft `#78350f20`)
- **Danger / Lapse / Critical:** Rose (`#f43f5e`, soft `#88133720`)
- **Info / Insight:** Sky (`#0ea5e9`, soft `#082f4920`)

---

## 3. Typography & Hierarchy

Font Stack: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
Monospace: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`.

| Role | Size | Line Height | Tracking | Weight | Usage |
|---|---|---|---|---|---|
| **Display Title** | 2rem (32px) | 1.2 | -0.025em | 700 (Bold) | Top-level dashboard headers |
| **Page Title** | 1.5rem (24px) | 1.25 | -0.02em | 600 (Semibold) | PageHeader titles |
| **Section Header** | 1.125rem (18px) | 1.35 | -0.015em | 600 (Semibold) | Panel / card section titles |
| **Body (Default)** | 0.9375rem (15px) | 1.5 | normal | 400 (Regular) | Primary content, cards, notes |
| **Body Small** | 0.8125rem (13px) | 1.45 | normal | 400 / 500 | Metadata, helper texts, secondary info |
| **Caption / Micro** | 0.6875rem (11px) | 1.4 | +0.02em | 600 (Uppercase) | Badges, tags, metric pill labels |

---

## 4. Depth, Elevation & Border Rims

Rather than heavy artificial drop shadows, Learning HUB uses **Ambient Layering**:
1. **Layer 0 (Canvas):** `bg-hub-bg`
2. **Layer 1 (Panels & Cards):** `bg-hub-panel border border-hub-border rounded-xl shadow-sm`
3. **Layer 2 (Hover / Elevated Popovers):** `bg-hub-panel-2 border border-hub-border-strong rounded-2xl shadow-md`
4. **Layer 3 (Modals & Command Palettes):** Backdrop blur `backdrop-blur-md bg-hub-panel/95 border border-hub-border-strong shadow-2xl`

---

## 5. Micro-Interactions & Animation Standards

1. **Button Clicks:** `active:scale-[0.98] transition-all duration-150 ease-out`
2. **Hover Lift:** `hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`
3. **Focus States:** High-visibility outline: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hub-accent focus-visible:ring-offset-2 focus-visible:ring-offset-hub-bg`
4. **Tab Switches:** Smooth indicator cross-fade with no abrupt layout jump.
5. **Progress Bars:** Smooth animated fill (`transition-all duration-500 ease-out`).

---

## 6. Standard Component Recipes (`@/ui`)

### Button (`@/ui/Button`)
- `primary`: Solid accent fill with crisp white text and soft glow on hover.
- `secondary`: Subdued panel background with `border-hub-border`.
- `ghost`: Transparent background, hover tint.
- `danger`: Soft rose background with strong rose text.
- Minimum touch target: `min-h-[44px]` on mobile.

### Panel (`@/ui/Panel`)
- Encapsulates discrete semantic sections.
- Rounded corners: `rounded-xl` or `rounded-2xl`.
- Padding: `p-4 sm:p-6`.

### Badge (`@/ui/Badge`)
- Compact metadata tag with optional pulsing live status dot.
- Pill shape (`rounded-full px-2.5 py-0.5 text-xs font-medium`).

### Card / StatCard (`@/ui/StatCard`)
- KPI display: primary value, secondary label, trend chip (`+12%`), icon badge.

---

## 7. Responsive Breakpoints & Mobile Ergonomics

- **Mobile First ($< 640\text{px}$):**
  - Navigation via bottom bar or slide-over drawer.
  - Floating action buttons placed within thumb reach (bottom right, bottom center).
  - Horizontal scroll areas wrapped inside `.scroll-x` with hidden scrollbars.
  - Zero horizontal page overflow (`overflow-x-hidden` on main layout).
- **Tablet ($640\text{px} - 1024\text{px}$):** 2-column adaptive grids.
- **Desktop ($> 1024\text{px}$):** Multi-column dashboard with persistent collapsible sidebar.

---

## 8. Anti-Patterns (Never Do These)

- ❌ Never use raw un-sanitized HTML (`<div dangerouslySetInnerHTML>`). Use `<Markdown>` from `@/ui`.
- ❌ Never hardcode `#ffffff`, `#000000`, or arbitrary hex codes in component class strings.
- ❌ Never create buttons or interactive controls smaller than `44px × 44px` touch bounding boxes.
- ❌ Never trigger full-page horizontal scrollbars.
- ❌ Never make animations longer than `300ms` for micro-interactions (feels sluggish).
