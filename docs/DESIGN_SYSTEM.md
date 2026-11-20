# GeoTracker design system

GeoTracker is a personal tool: calm, readable, and quick to scan. The UI uses neutral surfaces, one blue accent for actions, and colour only where it carries meaning (live, paused, SOS, low battery).

Everything lives in [`src/styles/globals.css`](../src/styles/globals.css). Components never use raw hex values; they use the tokens below, so light and dark mode stay in sync.

## Themes

| Mode | How it's chosen |
|---|---|
| System (default) | Follows `prefers-color-scheme` |
| Light / Dark | Set with the theme switch (`ThemeToggle`) and stored in `localStorage` under `geotracker:theme` |

A small script in `<head>` (`src/lib/theme-script.ts`) applies the stored choice before first paint, so the page never flashes the wrong theme. Code that isn't React (the map) reads the active theme with `currentTheme()` from `src/lib/theme.ts`.

## Tokens

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f6f8` | `#0c0e13` | Page background |
| `--surface` | `#ffffff` | `#14171e` | Cards, inputs, header |
| `--surface-2` | `#f1f3f6` | `#1b1f28` | Hover, table headers, wells |
| `--surface-3` | `#e8ebf0` | `#232834` | Avatars, pressed |
| `--border` / `--border-strong` | `#e2e5ea` / `#cdd2da` | `#262b36` / `#353b48` | Dividers / input outlines |
| `--text` / `--text-muted` / `--text-subtle` | `#111827` / `#566072` / `#7c8595` | `#e8ebf1` / `#a0a8b6` / `#737c8c` | Body / secondary / hints |
| `--accent` (+ `-hover`, `-soft`, `-text`, `-fg`) | `#2563eb` | `#2f6fe8` | Primary actions, links, selection |
| `--success` (+ `-soft`, `-text`) | `#16a34a` | `#22c55e` | Live |
| `--warning` (+ `-soft`, `-text`) | `#d97706` | `#f59e0b` | Paused, low battery |
| `--danger` (+ `-hover`, `-soft`, `-text`) | `#dc2626` | `#ef4444` | SOS, destructive actions |

`-soft` is a tinted background, `-text` is the readable foreground on that tint (AA contrast in both themes).

Map markers use the same palette (`VARIANT_COLORS` in `LiveMap.tsx`): live is green, paused amber, SOS red, the selected tracker blue and idle grey.

### Typography

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 12 px | Meta, badges, captions |
| `--text-sm` | 13 px | Secondary text, small buttons |
| `--text-base` | 14 px | Body, controls |
| `--text-md` | 16 px | Card titles |
| `--text-lg` | 18 px | Dialog titles |
| `--text-xl` | 22 px | Section titles |
| `--text-2xl` | 28 px | Page titles, big numbers |

Fonts: **Inter** (`--font-sans`) for text, **JetBrains Mono** (`--font-mono`, class `.mono`) for coordinates, IDs and checksums. Weights: 400, 500, 600 and 700. Numbers in stats and tables use `font-variant-numeric: tabular-nums`.

### Spacing, radius, elevation, motion

- **Spacing** on a 4 px grid: `--space-1` (4) … `--space-12` (48).
- **Radius:** `--radius-sm` 6 (controls), `--radius-md` 10 (tiles), `--radius-lg` 14 (cards), `--radius-full` (pills).
- **Elevation:** `--shadow-sm` (cards), `--shadow-md` (floating controls), `--shadow-lg` (dialogs, toasts).
- **Motion:** `--duration-fast` 120 ms (hover), `--duration` 200 ms (enter), `--ease`. Everything respects `prefers-reduced-motion`.
- **Focus:** `--focus-ring` on every interactive element (`:focus-visible`).

## Components

### Button (`.btn`)

| Variant | Class | Use |
|---|---|---|
| Primary | `.btn` | The single main action in a view |
| Secondary | `.btn .btn-secondary` | Supporting actions (Copy, Share, QR) |
| Ghost | `.btn .btn-ghost` | Toolbars, low-emphasis actions |
| Danger | `.btn .btn-danger` | Confirming a destructive action (Acknowledge SOS) |
| Danger outline | `.btn .btn-danger-outline` | Starting a destructive action (Delete, Stop sharing) |

Sizes: `.btn-sm` (30 px), default (38 px), `.btn-lg` (44 px, the minimum tap target on phones). Modifiers: `.btn-block` (full width), `.btn-icon` (square, icon only; always add an `sr-only` label). States: hover, `:focus-visible` ring, and `:disabled` (50 % opacity, no pointer events).

| ✅ Do | ❌ Don't |
|---|---|
| One primary button per view | Several primary buttons side by side |
| Icon + verb ("Copy link") | Emoji as icons |
| `btn-danger-outline` → confirm dialog | A red primary button for a first click |

### Input (`.input`, `.field`)

`.field` stacks a `<label>` over an `.input` with a 6 px gap. Every input has a visible label, or an `sr-only` one when a placeholder is enough context. States: hover (stronger border), focus (accent border + ring).

### Card (`.card`, `.card-header`, `.card-title`, `.card-body`)

The main container. The header has a bottom divider; the body has 20 px padding.

### Badge (`.badge`)

A small status pill. Add `.badge-dot` for a leading status dot. Variants: `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-accent`; the default is neutral. `StatusBadge` maps tracker status to a variant: Live → success, Paused → warning, SOS → danger, Waiting → accent, Offline and Stopped → neutral.

### Alert (`.status`)

An inline message with an icon. Variants: `.loading` (info), `.success`, `.warning`, `.error`. Use `role="alert"` for errors and `role="status"` for confirmations.

### Stat tile (`.stat`, `.stat-label`, `.stat-value`)

A label above a value, used in stats grids. `.info-card` / `.info-label` / `.info-value` are aliases used by the tracker page.

### Other

- **Tabs** (dashboard detail): `role="tablist"`, a 2 px accent underline on the selected tab, `aria-selected` and `aria-controls`.
- **Toast** (`.toast`): bottom-centre, inverted colours, `role="status"`, disappears after 3 s.
- **Disclosure** (`details.disclosure`): a chevron that rotates when open.
- **Spinner** (`.spinner`) and full-page loader (`.page-center`).

### React components (`src/components/ui/`)

| Component | Purpose |
|---|---|
| `AppHeader` | Sticky top bar for signed-in pages: brand, navigation (Dashboard, Quick Track, Users), extra actions, theme switch, account and sign-out. Navigation collapses to icons below 720 px. |
| `Brand` | Logo mark + wordmark; the mark uses `--accent`. |
| `ThemeToggle` | Light / Dark / System segmented control (`role="radiogroup"`). |
| `StatusBadge` | Tracker status → badge. |
| `QrImage` | QR code rendered locally as SVG. |

## Icons

[Lucide](https://lucide.dev) (`lucide-react`): 14 px in small buttons, 16 px in default buttons and navigation, 18–22 px in empty states and feature lists. Decorative icons get `aria-hidden="true"`. Emoji appear only in system notifications.

## Layout

- Content is at most 1440 px wide (`--content-max`), with 24 px gutters (16 px on phones).
- Dashboard: summary row, then a 360 px sidebar (new tracker + tracker list) beside the map and detail panel. Below 1024 px it becomes one column with the map first.
- Pages for the person sharing (tracking link, Quick Track) are a single 640 px column, designed for phones first.
- No horizontal page scroll at 390 px. Wide tables scroll inside their own frame.

## Voice

Plain and friendly: "Dashboard", "Start sharing", "Get the app". No "command centre" or "agent" language. Messages say what happened and what to do next.
