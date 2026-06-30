# PRMTR Design System

**Commercial Intelligence Operating System**
Version 2.0 — Foundations, Components, Patterns, Overlays & Tokens

---

## 0. About this document

This is the single source of truth for the PRMTR interface. It is written so a **developer can implement it without guessing** and a **marketer can apply it without ambiguity**. Every value below is a real, usable number; every token has a name, a value, and a meaning.

### 0.1 How to use this document (governance)
This file is **binding**. Everything built for PRMTR — every screen, component, and one-off element — must follow it.

- **Consume semantic tokens, never raw hex or ad-hoc pixels.** If you're typing a color or a radius literal in a component, stop and use the token.
- **The system is square, calm, and signal-driven.** Radius is always `0`. Color is consequence, never decoration. Numbers are mono + tabular.
- **When a component you need is not yet specified here, do not invent a new style.** Compose it from the existing foundations — the tokens (§2–§4), the dimension standards (§6.0), the state rules (§8), and the nearest documented component as a precedent. A new component must reuse: radius 0, the 40px control height, `1px --color-border`, `--space-*` spacing, `--shadow-*` elevation, the type scale, and the semantic color roles. Then **add it back to this document** (additive only) so the next person inherits it. The visual-language showcase (`PRMTR Visual Language.dc.html`) is the living render of everything here — extend it in lockstep.
- **Never fork the palette or the type scale.** Variation comes from layout and composition, not new colors or fonts.

PRMTR consolidates all commercial data into one platform that outputs a **daily prioritized Action Queue**. The interface is used daily by a team of 3–4 people making real revenue and margin decisions under accountability. Therefore the design system optimizes for three things, in this order:

1. **Speed of comprehension** — a number, its direction, and its consequence must be legible in under one second.
2. **Confidence** — every recommended action shows its revenue at stake, its margin impact, and whether it is *safe to run*.
3. **Restraint** — no decoration that doesn't carry meaning. Color is a signal, not a mood.

### The 40% Margin Floor is a first-class design citizen
PRMTR enforces a hard **40% margin floor** at the platform level. The system **flags and blocks** any action that would breach it. This is not an edge case — it is a recurring, load-bearing UI state with its own dedicated tokens, components, and copy. See [§4.6 Margin Floor system](#46-margin-floor--the-40-rule) and the `--color-margin-*` tokens.

---

## 1. Design principles

| Principle | What it means in the UI |
|---|---|
| **One screen, one decision** | Each module answers a single question. Lead with the answer (the KPI, the ranked action), then progressive detail. |
| **Numbers are the hero** | Big, tabular, monospaced figures. Labels are quiet; values are loud. |
| **Color = consequence** | Green = revenue/safe/up. Red = loss/down. Amber = caution. The lime *Signal* accent = "live / act now". Never use these decoratively. |
| **Ranked, not listed** | Lists are ordered by revenue impact by default. Rank is shown explicitly. |
| **Show the stakes** | Every action surfaces revenue-at-stake and margin impact. No blind recommendations. |
| **Calm surface, sharp signal** | Off-white canvas, hairline borders, soft shadows. Saturated color is rare and therefore meaningful. |

### Platform rules made visible (MEAMA)
These business rules are load-bearing UI states — surface them, don't hide them:

| Rule | Value | Where it shows |
|---|---|---|
| **Margin floor** | 40% gross minimum | Promo calculator, Action Queue margin chips, blocked CTAs |
| **Max discount** | 25% hard cap | Discount sliders cap at 25%; calculator blocks beyond |
| **Churn** | no order ≥ 3 calendar months | Customer status, churn meter |
| **At-risk** | no order 45–89 days | Auto-triggers retention workflow; 45-day warning flag |
| **Active** | ≥ 1.5 capsules/day (trailing 90d) | Customer 360 consumption KPI, status badge |
| **Loyalist / Explorer** | **zero discount** — early access instead | Next-best-action enforces it (violet “no discount” tag) |

---

## 2. Color system

PRMTR uses a **two-tier token model**: **primitives** (raw scale values, never used directly in components) → **semantic tokens** (named by role, used everywhere). Always consume semantic tokens.

### 2.1 Primitive palettes

#### Neutrals — `--gray-*`
The canvas. Cool, faintly green-undertoned off-white through near-black ink.

| Token | Hex | Use |
|---|---|---|
| `--gray-0` | `#FFFFFF` | Card / surface |
| `--gray-25` | `#FAFBFA` | Raised surface tint |
| `--gray-50` | `#F5F7F5` | **App canvas** (page background) |
| `--gray-100` | `#ECEFEC` | Subtle fills, table zebra |
| `--gray-200` | `#E0E4E1` | **Hairline borders** |
| `--gray-300` | `#CBD1CC` | Strong borders, dividers |
| `--gray-400` | `#9BA39C` | Disabled text, placeholder |
| `--gray-500` | `#727B73` | Tertiary text |
| `--gray-600` | `#525B53` | Secondary text |
| `--gray-700` | `#3A423B` | Body emphasis |
| `--gray-800` | `#222823` | Headings |
| `--gray-900` | `#121712` | **Primary ink / near-black buttons** |
| `--gray-950` | `#0A0D0A` | Overlays, deepest ink |

#### Brand Green — `--green-*`
Money, growth, positive, brand. Anchors data visualization and the brand mark.

| Token | Hex | Use |
|---|---|---|
| `--green-50` | `#E9F8EE` | Positive badge bg, success fill |
| `--green-100` | `#CFF0DA` | Soft success, chart band |
| `--green-200` | `#A5E2BB` | Chart series (light) |
| `--green-300` | `#6FCB90` | Chart series (mid) |
| `--green-400` | `#3DAE68` | Chart series, accents |
| `--green-500` | `#1F9D52` | **Brand green** (primary positive) |
| `--green-600` | `#16823F` | Positive text on light, hover |
| `--green-700` | `#0F662F` | Deep data fill (area charts) |
| `--green-800` | `#0A4D24` | Darkest series, forest |
| `--green-900` | `#063318` | Brand ink |

#### Signal Lime — `--signal-*`
The accent. High-energy chartreuse used **only** for "live / now / act" affordances: active nav, live data pulse, focus highlight on the current Action Queue item, the most urgent positive highlight. Sparing by design — if everything is lime, nothing is.

| Token | Hex | Use |
|---|---|---|
| `--signal-100` | `#F2FAC9` | Highlight wash |
| `--signal-300` | `#E4F784` | Active segment bg, "live" badge |
| `--signal-500` | `#D2F03C` | **Signal accent** (active state, now) |
| `--signal-600` | `#B6D81F` | Signal hover / on-white text-safe edge |
| `--signal-700` | `#8FAA12` | Signal text on light (AA) |

> **Contrast note:** `--signal-500` is a bright chartreuse — never use it as a text color or as a fill behind white text. For text-on-signal, use `--gray-900`. For signal-as-text, use `--signal-700`.

#### Semantic primitives — status hues
| Hue | 50 (bg) | 500 (base) | 600 (text/icon) | 700 (deep) |
|---|---|---|---|---|
| **Success** `--success-*` | `#E9F8EE` | `#1F9D52` | `#16823F` | `#0F662F` |
| **Danger** `--danger-*` | `#FDECEC` | `#E5484D` | `#CC2E33` | `#A31C20` |
| **Warning** `--warning-*` | `#FFF6E6` | `#F5A314` | `#C97E08` | `#9A5F04` |
| **Info** `--info-*` | `#EAF3FE` | `#2E84F0` | `#1A68CC` | `#1351A3` |
| **Critical** `--critical-*` | `#FCE9E9` | `#C2181E` | `#9E1115` | `#6E0B0E` |

`Critical` is reserved for **margin-floor breaches and blocked actions** — a deeper, more alarming red than ordinary `Danger`. The distinction is intentional: *danger* = a metric is down; *critical* = the platform is preventing you from doing something.

### 2.2 Semantic tokens (use these)

```css
:root {
  /* Surfaces */
  --color-canvas:            var(--gray-50);
  --color-surface:           var(--gray-0);
  --color-surface-raised:    var(--gray-25);
  --color-surface-sunken:    var(--gray-100);
  --color-overlay:           color-mix(in srgb, var(--gray-950) 55%, transparent);

  /* Borders & lines */
  --color-border:            var(--gray-200);
  --color-border-strong:     var(--gray-300);
  --color-divider:           var(--gray-100);
  --color-focus-ring:        var(--signal-500);

  /* Text */
  --color-text:              var(--gray-900);
  --color-text-secondary:    var(--gray-600);
  --color-text-tertiary:     var(--gray-500);
  --color-text-disabled:     var(--gray-400);
  --color-text-inverse:      var(--gray-0);
  --color-text-link:         var(--green-600);

  /* Actions — primary action is decisive near-black */
  --color-action-primary:        var(--gray-900);
  --color-action-primary-hover:  var(--gray-800);
  --color-action-primary-text:   var(--gray-0);
  --color-action-secondary:      var(--gray-0);      /* on border */
  --color-action-secondary-text: var(--gray-900);
  --color-action-positive:       var(--green-500);   /* confirm / run-safe action */
  --color-action-positive-hover: var(--green-600);

  /* Brand & accent */
  --color-brand:             var(--green-700);
  --color-accent:            var(--signal-500);       /* live / now / active */
  --color-accent-soft:       var(--signal-300);

  /* Direction & deltas */
  --color-positive:          var(--success-600);
  --color-positive-bg:       var(--success-50);
  --color-negative:          var(--danger-600);
  --color-negative-bg:       var(--danger-50);
  --color-neutral-delta:     var(--gray-500);

  /* Status */
  --color-warning:           var(--warning-600);
  --color-warning-bg:        var(--warning-50);
  --color-info:              var(--info-600);
  --color-info-bg:           var(--info-50);

  /* Margin floor (40% rule) — see §4.6 */
  --color-margin-safe:       var(--green-600);   /* >= 45% headroom */
  --color-margin-safe-bg:    var(--green-50);
  --color-margin-near:       var(--warning-600); /* 40–45%, caution */
  --color-margin-near-bg:    var(--warning-50);
  --color-margin-breach:     var(--critical-600);/* < 40% — BLOCKED */
  --color-margin-breach-bg:  var(--critical-50);
}
```

### 2.3 Categorical palette — RFM segments

RFM segmentation needs a stable, distinguishable categorical scale. These map 1:1 to the canonical segments and must stay consistent across every chart, table, and badge.

| Segment | Token | Base | Badge bg | Meaning |
|---|---|---|---|---|
| Champions | `--seg-champions` | `#0F662F` | `#E9F8EE` | Best, recent, frequent, high value |
| Loyal | `--seg-loyal` | `#15998A` | `#E4F6F3` | Reliable repeat buyers |
| Potential Loyalist | `--seg-potential` | `#3DAE68` | `#EAF8EF` | Recent, promising |
| New Customers | `--seg-new` | `#2E84F0` | `#EAF3FE` | Just acquired |
| Promising | `--seg-promising` | `#7A5AF0` | `#F0ECFE` | Low frequency, recent |
| Need Attention | `--seg-attention` | `#F5A314` | `#FFF6E6` | Slipping engagement |
| At Risk | `--seg-atrisk` | `#EF6820` | `#FDEEE4` | Was valuable, going quiet |
| Can't Lose Them | `--seg-cantlose` | `#C2181E` | `#FCE9E9` | High value, churning now |
| Hibernating | `--seg-hibernating` | `#727B73` | `#F0F1F0` | Long inactive, low value |
| Lost / Churned | `--seg-lost` | `#9BA39C` | `#F5F7F5` | Gone |

> **Charting rule:** segment color is identity. A segment is the *same* color in the donut, the bar, the scatter, and the badge. Never re-map.

### 2.3b Action-type signal colors
Every Action Queue item is color-coded by **type** so the team reads intent before words. These are load-bearing: apply the identical hue to the type badge, the Overview signal legend, and any related accent.

| Action type | Token | Base | Badge bg | Signals |
|---|---|---|---|---|
| Reactivation | `--violet-600` `#5B3FD6` | violet | `--violet-50` `#F0ECFE` | Win back a lapsing customer |
| Reorder | `--info-600` `#1A68CC` | blue | `--info-50` | Predicted repurchase is due |
| Upsell / growth | `--green-600` `#16823F` | green | `--green-50` | Expand an active customer |
| Ad budget | `--teal-600` `#0E8C7E` | teal | `--teal-50` `#E2F6F3` | Shift or scale ad spend |
| Stock alert | `--warning-600` `#C97E08` | amber | `--warning-50` | Inventory at risk |
| Margin / blocked | `--critical-600` `#9E1115` | red | `--critical-50` | Floor breach — action blocked |

**Priority encoding (independent of type):** `P1` critical → `--critical` tokens · `P2` high → `--warning` tokens · `P3` standard → neutral `--gray` tokens. Type and priority appear side by side but never share a swatch.

Every screen that lists actions must carry the **signal legend** (see Overview) so the encoding is never ambiguous.

### 2.4 Color usage rules

- **Default to neutral.** Most of any screen is `--color-canvas`, `--color-surface`, `--color-text`, and borders.
- **Green is earned.** Use green for positive deltas, safe-to-run confirmation, brand, and data series — not for generic emphasis.
- **Signal lime is rationed.** One active nav item, one "live" indicator, one focused queue row. Do not stack signal accents on a single screen.
- **Critical red ≠ Danger red.** Critical is *only* margin breaches and platform blocks.
- **Minimum contrast:** body text ≥ 4.5:1, large text & UI ≥ 3:1. Test signal and amber against white before using as text — both fail and must use their `700` step or `--gray-900`.

---

## 3. Typography

### 3.1 Typefaces

| Role | Family | Why |
|---|---|---|
| **UI / Display** | `Hanken Grotesk` | Warm, modern grotesque; excellent at large display sizes and small labels; full weight range. |
| **Numerics & code** | `Geist Mono` | Tabular by nature. Used for all primary KPI values, IDs, timestamps, currency in tables — anything that must align in columns. |

```css
:root {
  --font-ui:   "Hanken Grotesk", "Segoe UI", system-ui, sans-serif;
  --font-mono: "Geist Mono", "SFMono-Regular", ui-monospace, monospace;
}
/* Always enable tabular + lining figures for data */
.tabular { font-feature-settings: "tnum" 1, "lnum" 1; }
```

> **Rule:** every figure that lives in a column, a KPI card, or a delta uses tabular figures. Body prose uses proportional. Large hero KPI values (`Metric / Display`) are set in `--font-mono` for precision and column alignment; supporting/secondary numbers may stay in `--font-ui .tabular`.

### 3.2 Type scale

Base = 16px / 1rem. Scale is a tuned 1.2–1.25 modular progression with explicit roles.

| Token | Size / Line | Weight | Tracking | Role |
|---|---|---|---|---|
| `--text-display` | 40 / 44 | 700 | -0.02em | Page hero, login |
| `--text-h1` | 30 / 36 | 700 | -0.02em | Page / module title |
| `--text-h2` | 24 / 30 | 650 | -0.01em | Section title |
| `--text-h3` | 20 / 26 | 650 | -0.01em | Card title |
| `--text-h4` | 16 / 22 | 600 | 0 | Sub-section, table group |
| `--text-body-lg` | 16 / 24 | 400 | 0 | Long-form body |
| `--text-body` | 14 / 20 | 400 | 0 | **Default UI text** |
| `--text-body-strong` | 14 / 20 | 600 | 0 | Emphasis, table values |
| `--text-caption` | 12 / 16 | 500 | 0.01em | Labels, meta, helper |
| `--text-overline` | 11 / 14 | 600 | 0.06em | UPPERCASE eyebrow / nav group |
| **Metric tokens** | | | | *(font-mono, tabular)* |
| `--metric-xl` | 44 / 48 | 600 | -0.02em | Headline KPI ($98,643.24) |
| `--metric-lg` | 32 / 36 | 600 | -0.02em | KPI card value |
| `--metric-md` | 22 / 28 | 600 | -0.01em | Secondary metric |
| `--metric-sm` | 16 / 20 | 600 | 0 | Inline table figure, delta |

### 3.3 Typography rules
- **One H1 per screen** — the module name.
- Labels above values, never below. Label in `--text-caption` `--color-text-secondary`; value in a metric token `--color-text`.
- Currency: symbol at 0.6em superscript-baseline for hero metrics (`$56,783.00`), inline otherwise.
- Never set body below 12px. Table data minimum 13px (use `--text-body` at 14 by default).
- `text-wrap: pretty` on headings; `text-wrap: balance` on short titles and empty-state copy.

---

## 4. Spacing, layout & grid

### 4.1 Spacing scale (4px base)
| Token | px | Token | px |
|---|---|---|---|
| `--space-0` | 0 | `--space-5` | 20 |
| `--space-1` | 4 | `--space-6` | 24 |
| `--space-2` | 8 | `--space-8` | 32 |
| `--space-3` | 12 | `--space-10` | 40 |
| `--space-4` | 16 | `--space-12` | 48 |
| | | `--space-16` | 64 |

**Defaults:** card padding `--space-6` (24); compact card / table cell `--space-4` (16); gap between cards `--space-5`–`--space-6`; section vertical rhythm `--space-8`–`--space-10`; inline icon↔label gap `--space-2`.

### 4.2 Corner radius — squared
PRMTR is **fully square: `--radius: 0` on every element.** Rounding reads as soft and consumer; PRMTR signals seriousness, precision, and confidence. There is exactly one radius token and it is zero. Even circular elements are squared — a status dot is an 8–10px **square**, not a circle; avatars are squares.

| Token | px | Use |
|---|---|---|
| `--radius` | **0** | Everything, without exception |

> Signal accents that were rounded left-rails are now **flush square borders** — `border-left: 3px solid <signal>` on a 0-radius surface — never a floating absolute strip overlapping a rounded corner.

### 4.3 Elevation / shadows
Soft and low. The canvas does the separating; shadows whisper.
```css
--shadow-xs:  0 1px 2px rgba(18,23,18,.05);
--shadow-sm:  0 1px 3px rgba(18,23,18,.06), 0 1px 2px rgba(18,23,18,.04);
--shadow-md:  0 4px 12px rgba(18,23,18,.07), 0 2px 4px rgba(18,23,18,.04);
--shadow-lg:  0 12px 28px rgba(18,23,18,.10), 0 4px 8px rgba(18,23,18,.05);
--shadow-pop: 0 16px 40px rgba(18,23,18,.16);          /* modals, popovers */
--shadow-focus: 0 0 0 3px color-mix(in srgb, var(--signal-500) 55%, transparent);
```
**Rule:** cards default to `--shadow-sm` **or** a `1px --color-border` — pick one per surface, not both heavily. Raise to `--shadow-md` on hover for interactive cards. `--shadow-pop` only for floating layers.

### 4.4 Grid & breakpoints
- **12-column** fluid grid, gutter `--space-6` (24), max content width **1440px**, page padding `--space-8` (32) desktop / `--space-4` (16) mobile.

| Breakpoint | Min width | Layout |
|---|---|---|
| `sm` | 640 | Single column, stacked KPIs (2-up) |
| `md` | 768 | 2-col cards, collapsible nav |
| `lg` | 1024 | Sidebar + content, 3–4 KPI row |
| `xl` | 1280 | Full app shell, 4-up KPIs |
| `2xl` | 1536 | Max container, denser tables |

### 4.5 App shell
Two supported chromes (use one per product surface):

- **A — Sidebar shell** (default for the OS): fixed left nav **264px** (collapsible to 72px icon rail), grouped sections (`MAIN`, `INTELLIGENCE`, `ACTION`), top bar **64px** with global search, command palette trigger, notifications, account. Content scrolls under a sticky top bar. *(See refs: Ocupite.)*
- **B — Top-nav shell** (for focused / marketing-adjacent surfaces): centered segmented (square) navigation, no sidebar. *(See refs: PRMTR overview, Rexora.)*

```
┌──────── topbar 64px ─────────────────────────────────┐
│ ◫ search⌘K            ● live   🔔   ⚙   avatar ▾      │
├──────┬───────────────────────────────────────────────┤
│ nav  │  H1 module title          [period ▾] [actions] │
│ 264  │  ── KPI row (4-up) ──                           │
│      │  ── primary panel ─────────  ── side panel ──   │
└──────┴───────────────────────────────────────────────┘
```

### 4.6 Margin Floor — the 40% rule
A reusable system, not a one-off. Every place a margin is shown or an action is proposed, evaluate against the floor and render the matching token + component.

| State | Condition | Token set | UI treatment |
|---|---|---|---|
| **Safe** | margin ≥ 45% | `--color-margin-safe` | Green badge "Margin 52% · Safe". Action runnable. |
| **Near floor** | 40% ≤ margin < 45% | `--color-margin-near` | Amber badge "Margin 42% · Near floor". Action runnable with caution note. |
| **Breach** | margin < 40% | `--color-margin-breach` | Critical badge "Margin 37% · Below floor". Action **blocked**; primary button disabled with lock icon + explainer. |

**Margin meter** (component): a horizontal track with the 40% floor marked by a vertical critical line; fill colored by state. Always label the floor. Never show a margin without its state color.

---

## 5. Iconography

- **Library:** Lucide (line icons) — matches the references' clean 1.5px-stroke set.
- **Stroke:** 1.5px at 20/24px; 2px only below 16px. Round caps, round joins.
- **Sizes:** `--icon-sm` 16, `--icon-md` 20 (default), `--icon-lg` 24, `--icon-xl` 32 (feature/empty-state).
- **Color:** inherit `currentColor`. Icons are `--color-text-secondary` at rest, `--color-text` on hover/active, semantic color only when the icon *is* the status.
- **Alignment:** optical-center icons with their label; icon↔label gap `--space-2`.
- **Don't:** mix filled and line icon styles in one view; use emoji as functional icons; scale icons to non-standard sizes.

**Domain icon vocabulary (consistency map):**
revenue → `trending-up` · churn risk → `user-x` / `alert-triangle` · reorder → `package` / `repeat` · margin → `percent` / `shield` · promotion → `tag` / `badge-percent` · ads → `megaphone` / `target` · segment → `layers` / `pie-chart` · action queue → `list-checks` · blocked → `lock` · live → `radio` (signal-colored).

---

## 6. Components

Each component lists: anatomy, sizes, and **all states** (rest, hover, active/pressed, focus-visible, disabled, loading, error where applicable).

### 6.0 Component dimension standards — every pixel fixed
One radius (0). One control height. One border. Consistency is enforced by these constants — do **not** improvise per-component.

| Property | Value | Applies to |
|---|---|---|
| Corner radius | **0px** (fully square) | Everything — cards, buttons, inputs, badges, avatars, chips, dots |
| Control height | **40px** | Buttons, inputs, selects, search, icon-buttons, period pickers |
| Small control height | 36px | Dense table-inline controls only |
| Icon button | **40 × 40px**, icon centered | All icon-only buttons |
| Text button padding | `0 16px` | Every text button |
| Input padding | `0 14px` | Every input |
| Solid chip / badge | `4px 9px` · 12px/600 | Status, type, segment tags |
| Delta badge | `4px 8px` · 12px mono | Up/down deltas |
| Border | `1px solid --color-border` | All surfaces & controls |
| Card padding | **20px** | KPI & standard cards |
| Panel header padding | `18px 20–22px` | Card / table headers |
| Card gap (grids) | **16px** | All card grids |
| Section rhythm | 16px | Between stacked blocks |
| Focus ring | `0 0 0 3px` signal @ 55% | All interactive elements |

Card grids use `repeat(auto-fit, minmax(168–230px, 1fr))` so cards wrap rather than overflow; tracks never shrink below min-content width (no horizontal scroll at any viewport).

### 6.1 Buttons

**Variants**
| Variant | Rest | Hover | Active | Disabled | Use |
|---|---|---|---|---|---|
| **Primary** | bg `--color-action-primary` (near-black), text inverse | bg `--gray-800` | bg `--gray-950`, translateY(0) | bg `--gray-200`, text `--gray-400` | The decisive action per screen |
| **Positive** | bg `--green-500`, text white | bg `--green-600` | bg `--green-700` | as above | "Run action" when margin-safe |
| **Secondary** | surface, `1px --color-border`, text `--color-text` | bg `--gray-50`, border `--gray-300` | bg `--gray-100` | text `--gray-400`, border `--gray-200` | Default non-primary |
| **Ghost** | transparent, text `--color-text-secondary` | bg `--gray-100` | bg `--gray-200` | text `--gray-400` | Toolbar, low emphasis |
| **Destructive** | bg `--danger-600`, text white | `--danger-700` | deeper | muted | Delete, remove |
| **Blocked** | bg `--gray-100`, text `--gray-400`, lock icon | — (not interactive) | — | always | Margin-breach action |

**Sizes:** `sm` 32px h / 12px text / 12–14px pad-x; `md` 40px / 14px / 16px *(default)*; `lg` 48px / 16px / 20px. Radius 0 (square). Icon-only buttons are square at the same height.

**Focus:** all buttons show `--shadow-focus` on `:focus-visible` (signal ring). **Loading:** swap label for a spinner, keep width, set `aria-busy`, disable pointer. **Icon+label** gap `--space-2`.

### 6.2 Inputs & form controls

**Text input / select / textarea**
- Height 40px (`md`), radius 0 (square), `1px --color-border`, surface bg, text `--color-text`, placeholder `--gray-400`, padding-x `--space-3`.
- **Hover:** border `--gray-300`. **Focus:** border `--green-500` + `--shadow-focus`. **Error:** border `--danger-500`, helper text `--danger-600`, `alert-circle` icon. **Disabled:** bg `--gray-50`, text `--gray-400`. **Read-only:** no border, bg transparent.
- **Anatomy:** label (`--text-caption`, secondary) → control → helper/error (`--text-caption`). Optional leading/trailing icon or prefix (e.g. `$`).

**Other controls**
- **Checkbox / Radio:** 18px, square (radius 0), checked fill `--gray-900` (neutral) — checkmark white. Focus ring as above.
- **Toggle:** 36×20 track; off `--gray-300`, on `--green-500`; thumb white; 150ms ease.
- **Segmented control:** square container `--gray-100`; active segment surface white + `--shadow-xs`, text `--color-text`; inactive `--color-text-secondary`. *(refs: TransUnion/Equifax switch.)*
- **Date/period picker:** secondary-button styling with `calendar` icon + chevron; opens `--shadow-pop` panel.
- **Slider (margin / price simulation):** track `--gray-200`, filled `--green-500`, thumb white w/ `--shadow-sm`; floor markers render a `--critical-500` tick.

### 6.3 Cards

Base card: surface, square (radius 0), padding `--space-6`, **either** `1px --color-border` **or** `--shadow-sm`. Header row = title (`--text-h3`) + optional `...` overflow / link / filter.

Card variants:
- **Standard panel** — chart or table container.
- **KPI card** — see §7.1.
- **Interactive card** — adds hover `--shadow-md` + `translateY(-1px)` 120ms; cursor pointer; whole card is the click target.
- **Highlight card** — feature surface using `--signal-300` or a soft tint bg; reserve for *one* hero element (e.g. the top Action Queue item).
- **List card** — title + scrollable ranked rows (Top Products, Transactions).

### 6.4 Badges, tags & pills

| Type | Shape | Example | Spec |
|---|---|---|---|
| **Delta badge** | square | `▲ +3.1%` | bg `--color-positive-bg`, text `--color-positive`; negative uses negative tokens; neutral uses gray. Caret icon. Tabular. |
| **Status badge** | square | `Active` `Pending` `Completed` | Status hue 50 bg + 600 text; 1px same-hue border optional. |
| **Segment tag** | square | `Champions` | RFM segment bg + base text from §2.3. |
| **Priority tag** | square | `P1` | See §7.4 Action Queue. |
| **Count badge** | square | `3` | `--signal-500` bg + `--gray-900` text for live counts; `--danger-500`+white for alerts. |
| **Margin chip** | square | `Margin 42% · Near` | Margin token set, with leading `percent`/`shield` icon. |

Badge text: `--text-caption` 12px 600. Vertical pad `--space-1`, horizontal `--space-2`.

### 6.5 Alerts / banners
Full-width, square (radius 0), leading status icon, title + body + optional actions, dismissible.
- **Info / system:** info tokens (e.g. "Payroll submission due in 2 days" pattern → "Reorder window opens in 2 days").
- **Success:** success tokens.
- **Warning:** warning tokens.
- **Critical (blocked):** critical tokens, non-dismissible while the condition holds (e.g. "This promotion breaches the 40% margin floor and cannot be launched").
Inline form alerts use the compact variant (icon + one line).

### 6.6 Modals & dialogs
- Surface square (radius 0), `--shadow-pop`, max-width 480 (confirm) / 640 (form) / 900 (detail). Overlay `--color-overlay`.
- Anatomy: header (title `--text-h3` + close `x`) · body · footer (right-aligned: secondary + primary). 24px padding.
- **Confirm-with-consequence pattern:** for actions touching revenue/margin, the modal restates revenue-at-stake and margin state before the primary button. Margin-breach confirm shows the Blocked button.
- Focus trapped; `Esc` closes; return focus to trigger.

### 6.7 Tooltips & popovers
- **Tooltip:** dark `--gray-900` bg, white text `--text-caption`, square (radius 0), `--space-2`/`--space-3` pad, `--shadow-md`, 6px arrow. For data points show label + value rows (see chart tooltip in refs). Delay-in 150ms, instant-out.
- **Popover:** surface bg, `--shadow-pop`, square (radius 0), used for filters, column menus, "card info". Light, bordered.

### 6.8 Navigation

**Sidebar (shell A)**
- Width 264px; logo/workspace switcher top (workspace name + chevron); grouped nav with `--text-overline` group labels (`MAIN MENU`, `INTELLIGENCE`, `ACTION`).
- Item: 40px h, square (radius 0), icon (`--icon-md`) + label (`--text-body`). **Rest:** text-secondary. **Hover:** bg `--gray-100`. **Active:** bg `--signal-300` *(shell B)* **or** bg `--gray-100` + 2px left `--green-600` rail + text `--color-text` *(shell A — preferred)*. Active gets a count badge where relevant (e.g. Action Queue `12`).
- Collapsed rail 72px: icons only, label as tooltip.
- Footer: upgrade/account card, collapse toggle.

**Top segmented nav (shell B):** centered square segment group on `--gray-100`/white; active item = `--signal-300` fill (refs: Rexora "Reports") or green pill. Right cluster: notifications, help, avatar.

### 6.9 Tabs
- Underline tabs (default): label `--text-body-strong`; active text `--color-text` + 2px `--green-600` underline; inactive `--color-text-secondary`; hover text darkens. Optional leading count badge per tab (e.g. `Negative Accounts 3`).
- Segmented tabs (square, alt): for filters/segments; active = surface + `--shadow-xs` on `--gray-100` track.

### 6.10 Avatars & identity
- Sizes 24 / 32 / 40 / 64; **squared (radius 0)**. Fallback = initials on `--gray-200`. Status indicator bottom-right = small `--green-500` **square** (online). Avatar stacks overlap -8px with a white ring.

### 6.11 Overlays & feedback (operational layer)

These are the components that make the platform feel like software, not a report. All share: square corners, `--shadow-pop` (`0 16px 40px rgba(18,23,18,.16)`), `Esc` to dismiss, and an overlay scrim `color-mix(in srgb, var(--gray-950) 45–55%, transparent)`. Z-index ladder: dropdown 5 · modal 50 · drawer 55 · command palette 58 · toast 60.

- **Modal / dialog** — centered, 480 (confirm) / 640 (form) / 900 (detail) wide. Header (title + close `×`) · body · right-aligned footer (secondary + primary). The **confirm-with-consequence** variant restates revenue-at-stake + margin state in a sunken panel before the primary button; a margin-breaching action shows the **Blocked** button instead of a CTA. Focus trapped; returns focus to trigger.
- **Drawer (side sheet)** — slides from the right, 420px (max 90vw), `transform: translateX` over 280ms `--ease-out`; scrim fades 250ms. Header + scrollable body + sticky footer actions. Use for quick-view / inspect without leaving the list (e.g. Customer quick-view from any table row → “Open full profile” routes to Customer 360). Click-scrim or `Esc` closes.
- **Toast** — top-right stack, 340px, square, **3px left accent** in the semantic hue (success/info/warning/critical) + matching tinted swatch, title + message + dismiss `×`. Auto-dismiss ~4.2s; manual dismiss always available. Never use toasts for margin breaches that block work — those are inline non-dismissible alerts.
- **Command palette** — `⌘K` / `Ctrl+K`, centered at 12vh, 560px. Search field + grouped results (`Quick actions`, `Modules`, customers/SKUs). First result pre-highlighted with `↵` hint; `Esc` closes. The platform's universal jump-to.
- **Dropdown menu** — anchored popover, 200px+, square, `--shadow-pop`. Items 40px, `--text-body`; hover `--gray-50`; destructive item uses `--danger-600` text + `--danger-50` hover; divider `--gray-100`. Opens on click, closes on outside-click / `Esc`.
- **Tooltip** — dark `--gray-900` bg, white `--text-caption`, square, ~190px max; appears above trigger on hover/focus with 150ms delay-in, instant-out. For metric definitions (churn score, RFM) and truncated text.
- **Tabs** — underline style: 44px, active = `--color-text` + 2px green inset underline, inactive `--color-text-secondary`; optional per-tab count badge. Panels swap via component state (no layout shift, scroll preserved).
- **Accordion** — 48px header rows, chevron rotates 180° on open (150ms); one-open or multi-open. Body `--text-body` secondary. For FAQ / definitions / collapsible detail.
- **Segmented control** — `--gray-100` track, 3px inset; active segment = white surface + `--shadow-xs`. Date-range toggles (Today / WTD / MTD / 30d) and 2–4 option switches.

---

## 7. Data display patterns

### 7.1 KPI card (with delta)
The atomic unit of PRMTR. **Anatomy (top→bottom):** label row (caption + optional trailing icon) → value (`--metric-lg`, mono, tabular) → footer row (delta badge + comparison caption, or "View Details ↗" link).

```
┌─────────────────────────────┐
│ Total Revenue          ($)  │  label  (--text-caption, secondary)
│ $68,837                     │  value  (--metric-lg, mono)
│ ▲ +2.4%  vs Last Week       │  delta badge + caption
└─────────────────────────────┘
```
Rules: delta caret + color from direction tokens; always state the comparison basis ("vs Last Week"). For revenue-critical KPIs, optionally append a margin chip. 4-up on `xl`, 2-up on `md`. Loading = skeleton bars for value + delta.

### 7.2 Ranking list
Used for Top Products, Action Queue, segment leaders. **Row anatomy:** rank index (or omit) → media/icon → primary label + sublabel → trailing metric (mono, tabular) → optional delta/chevron. Row height 56–64px, divider `--color-divider`, hover bg `--gray-50`. First/featured row may use a highlight tint. Always sorted by the stated metric; show the sort key.

### 7.3 Segmentation breakdown
- **Donut / stacked bar** colored strictly by §2.3 segment tokens, with a legend listing segment · count · % · value.
- **Distribution bar** (segmented progress): single horizontal track split into proportional segment-colored fills with a square cap (refs: Spending Limits bar). Each segment a tooltip.
- **RFM matrix:** 5×5 grid (Recency × Frequency), cell fill = green sequential scale `--green-100…--green-800` by population/value; hovered cell shows count + value + segment name.

### 7.4 Action Queue (signature module)
The Action Queue is a **ranked list of commercial actions sorted by revenue impact**. Each row is a decision.

**Row anatomy:**
```
[#1] [P1] Win back churning VIP — "Abdul Kodir"          ⟶
      Predicted churn 82% · Last order 47d ago
      Offer: 15% bundle · Channel: Email · Margin 46% ✔ Safe
      Revenue at stake  $4,280        [ Run action ]  [ Snooze ]
```
- **Rank** `#1…` — `--font-mono`, `--color-text-tertiary`, the explicit priority order.
- **Priority tag** — `P1` critical (`--critical` tokens), `P2` high (`--warning`), `P3` standard (`--gray-100`/`--green` tokens). Priority reflects revenue impact tier.
- **Target** — customer/product, bold.
- **Reasoning line** — the model signal(s) driving it (churn %, predicted reorder date, affinity), `--text-caption` secondary.
- **Recommendation** — offer + channel + **margin chip** (the safety check). If margin < 40%, the chip is a Critical "Below floor" and the **Run action button is replaced by Blocked**.
- **Revenue at stake** — `--metric-md` mono, the headline number, right-aligned.
- **Actions** — `Run action` (Positive button when safe / Blocked when breached), `Snooze`, overflow.
- **Focused row** (the one to act on now) gets a `--signal-500` left rail + faint `--signal-100` wash — the single "now" accent on the screen.

### 7.5 Progress & gauges
- **Linear progress:** 8px track `--gray-200`, fill `--green-500` (or status hue by context), **squared (radius 0)**. Label value % to the right.
- **Goal progress:** "$8,000 / $20,000 · 40%" pattern — fill + caption.
- **Radial gauge** (e.g. churn score, credit-style score, margin headroom): arc on `--gray-200` base; fill is a **diverging scale** danger→warning→success for risk-type metrics, or solid `--green-600` for simple completion. Center holds the big mono value + small label. Mark thresholds (e.g. the 40% floor) on the arc.
- **Sparkbars / mini charts** in cards use a single muted series (`--green-300`) with the active point in `--green-700` or signal.

### 7.6 Status indicators
- **Square indicator:** 8px square in a status hue + label (`Active`, `Stocking out`, `Churn risk`). Live data uses a pulsing `--signal-500` dot.
- **Status badge:** §6.4.
- **Stockout risk scale (Reorder engine):** `Healthy` (success) → `Watch` (warning) → `Reorder now` (danger) → `Out` (critical), shown as a chip + days-of-cover number.
- **Trend chip:** caret + % (delta badge), the universal up/down marker.

### 7.7 Tables
The workhorse for Customer 360, Payroll-style lists, product/ads tables.
- **Header:** `--text-caption` 600 secondary, sortable columns show a sort chevron; sticky on scroll; bg `--color-surface`, bottom `1px --color-border`.
- **Row:** 52–56px, `--text-body`, divider `--color-divider`; hover bg `--gray-50`; selected bg `--green-50` + checkbox. Optional zebra `--gray-25`.
- **Cells:** numeric & currency right-aligned, `--font-mono .tabular`; text left; status/segment via badges; first cell may carry avatar/media + 2-line identity.
- **Affordances:** leading checkbox (bulk select → bulk action bar), trailing overflow / chevron (expand to detail), inline editable cells where relevant.
- **Density:** comfortable (56px) default; compact (44px) toggle for power users.
- **Footer:** pagination or "load more", total row count, optional column-sum row (mono).
- **States:** loading = skeleton rows; empty = §8 empty state inside the table body; error = inline retry row.

### 7.8 Charts — house style
- **Area chart** (revenue over time): deep `--green-700` fill at ~70% opacity with a lighter `--green-200` comparison series behind; thin axis labels `--text-caption` tertiary; dotted hover guideline; dark tooltip with label + per-series value rows + delta. *(refs: Total balance.)*
- **Bar chart:** flat-top (square) bars; primary series `--green-500`, secondary/stacked `--green-200`; non-active bars muted `--gray-100`, the focused bar saturated. Period labels below.
- **Donut:** segment-colored, center total in mono.
- **Line:** 2px stroke `--green-600`, area-less; emphasized point = filled dot + callout.
- **Map:** choropleth in `--green` sequential; labeled markers as dark `--gray-900` pills with flag + value.
- **Axes/grid:** gridlines `--gray-100`, axis text `--color-text-tertiary` 11–12px. No 3D, no heavy gradients, no drop shadows on data.

---

## 8. States & interaction patterns

| State | Spec |
|---|---|
| **Hover** | Surfaces: bg `--gray-50`/`--gray-100` or `--shadow-md` lift. Interactive cards translateY(-1px), 120ms ease-out. Rows: bg `--gray-50`. Never change layout/size on hover for data. |
| **Active / pressed** | One step darker than hover; remove lift (translateY 0). 80ms. |
| **Focus-visible** | `--shadow-focus` (signal ring) on every interactive element. Keyboard-first; do not suppress outlines. |
| **Selected** | bg `--green-50`, optional 2px `--green-600` marker (left rail / underline / checkbox). |
| **Disabled** | opacity not used for color — use `--gray-200` fills + `--gray-400` text; `cursor: not-allowed`; remove shadows. |
| **Loading** | **Skeletons** (animated `--gray-100`→`--gray-50` shimmer, 1.4s) for content; **spinners** only for button/action in-flight. Preserve layout dimensions to avoid shift. |
| **Error** | Field: border `--danger-500` + helper. Section: inline alert + retry. Always say what failed and the next step. |
| **Empty** | Centered: `--icon-xl` muted icon, `--text-h4` headline (`text-balance`), one secondary line, one primary action. Tone = calm + directive ("No actions in your queue — you're clear for today."). Never a blank panel. |
| **Live / now** | Pulsing `--signal-500` dot + "Live" caption; the focused Action Queue row's signal rail. |
| **Blocked (margin)** | Critical tokens, lock icon, disabled Blocked button, explainer linking to the margin breakdown. The platform-level guarantee made visible. |

**Motion tokens**
```css
--ease-out: cubic-bezier(.2,.8,.2,1);
--ease-in-out: cubic-bezier(.4,0,.2,1);
--dur-fast: 120ms;   /* hovers, toggles */
--dur-base: 200ms;   /* menus, tabs */
--dur-slow: 320ms;   /* modals, drawers */
```
Respect `prefers-reduced-motion`: drop translate/scale, keep opacity.

---

## 9. Token structure & naming convention

**Three layers.** Components reference only **semantic** (and, for charts/segments, **categorical**) tokens.

```
1. Primitive   --<scale>-<step>                 --green-500, --gray-50, --space-6
2. Semantic    --color-<role>[-<variant>]       --color-action-primary, --color-margin-breach
               --text-<role> / --metric-<size>  --text-h2, --metric-lg
               --radius (always 0) / --shadow-<size>
3. Component    --btn-bg, --card-pad             (optional, alias semantic per component)
```

**Naming rules**
- kebab-case, prefixed `--` (and namespace `--prmtr-` if embedded in a host app to avoid collisions).
- Role before variant before state: `--color-action-primary-hover`.
- Numeric scales ascend with intensity/darkness (`50` lightest → `900` darkest); spacing ascends with size.
- Never bake a hex into a component — alias a semantic token.
- Dark mode (future): override semantic tokens only; primitives and component aliases stay put.

**Reference implementation (drop-in `:root`)** — combine §2.2, §3, §4.1–4.3, §8 motion blocks. Example component aliasing:
```css
.kpi-card{
  background:var(--color-surface); border:1px solid var(--color-border);
  border-radius:var(--radius); padding:var(--space-6); box-shadow:var(--shadow-sm);
}
.kpi-card__label{ font:500 var(--text-caption)/1 var(--font-ui); color:var(--color-text-secondary); }
.kpi-card__value{ font:600 44px/48px var(--font-mono); letter-spacing:-.02em;
  color:var(--color-text); font-feature-settings:"tnum" 1,"lnum" 1; }
.delta--up{ color:var(--color-positive); background:var(--color-positive-bg); }
.delta--down{ color:var(--color-negative); background:var(--color-negative-bg); }
```

---

## 10. Information architecture & module map

The platform is organized into **five sidebar groups**. Group labels are `--text-overline` (uppercase, tracked). This structure is the canonical navigation — use these exact names.

| Group | Items | Purpose |
|---|---|---|
| **Command** | Command Overview · Action Queue | Where every session starts — health + the day's ranked work |
| **Intelligence** | Customer 360 · Product Intelligence · Campaign Intelligence · Social & Email | The analytical core — per-customer, per-SKU, per-campaign, per-channel |
| **Operations** | Stock · Alerts · Reports | Run the business — inventory, early warnings, time-series |
| **Scorecard** | KPI Dashboard | North Star + all 9 channels vs. target (RAG) |
| **System** | Components | The live design-system reference |

**Nav item anatomy:** 40px row, square, icon (`--icon-md`) + label (`--text-body`). Trailing slot carries a **count badge** (Action Queue, Stock alerts), a **channel tag** (`9 ch`), or a small **green square** marking modules with a finished design. Active = `--gray-100` fill + 2px green left rail + `--color-text`.

### Module → signature components

| Module (spec) | Lead element | Signature components |
|---|---|---|
| **Command Overview** | Business Health Score + North Star | Score gauge, RAG KPI cards, forecast area chart, channel bars, alert strip |
| **Action Queue** | Ranked action rows | Action rows (§7.4), priority/type tags, revenue-at-stake, margin chips |
| **Customer 360** | Profile header + consumption/threshold | Profile header, RFM trio, churn meter, AI panel, journey path, drawer |
| **Product Intelligence** | SKU revenue ranking + portfolio | Portfolio cards (image slot), ranking table, affinity, status chips |
| **Campaign Intelligence** | Promo calculator + calendar | Slider (25% cap), margin meter, Blocked state, calendar grid, AI verdict |
| **Social & Email** | Multi-channel audience cards | Platform cards (IG/FB/TikTok/Omnisend/Corner), ROAS chips, tables |
| **Stock** | Days-of-cover ranked list | Stock-status chips, reorder-point meter, understock alerts |
| **Alerts** | Severity-grouped feed | Alert banners (critical/high/medium), Telegram-sent tag |
| **Reports** | Time-series + affinity | Hourly/day heatmaps, seasonality chart, affinity matrix, channel split |
| **KPI Dashboard** | North Star + 9-channel scorecard | RAG status cells, target-vs-actual rows, sparklines, cadence tags |

---

## 11. Do / Don't summary

**Do**
- Lead with the answer; rank by revenue impact; show the stakes.
- Use mono tabular figures for every data number.
- Reserve signal lime for "now/live/active" — one per screen.
- Show margin state every time an action is proposed.
- Keep surfaces calm: off-white canvas, hairline borders, soft shadows.

**Don't**
- Decorate with green/red/amber — color is consequence only.
- Mix filled + line icons, or use emoji as functional UI.
- Put body text under 12px or numbers in proportional figures.
- Stack multiple saturated accents in one view.
- Ever surface a "Run action" CTA on a margin-breaching action — render Blocked.

---

*PRMTR Design System v2.0 — foundations stable; squared identity, color-coded signals, full overlay/feedback layer, MEAMA module map. Component specs evolve via additive tokens only.*
