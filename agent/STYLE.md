# STYLE — match `dsh-gpu-monitor-nvml`

**Why this file exists:** the two panes sit side by side in the same rightbar, by the same author, for the same operator. Visual consistency is a product property, not decoration. All values below were **extracted from the shipped blueprint** (`/home/hagbard/dev/dsh-gpu-monitor-nvml/src/client/`), not invented. Copy them; don't approximate.

**Read this once**, at P1 (first time you render anything). ~1.6k tokens.

---

## The one trick that makes it theme-agnostic

`color: 'inherit'` on the container, then derive every border/background/separator from **`currentColor`** via `color-mix`:

```js
border:     '1px solid color-mix(in srgb, currentColor 22%, transparent)'
background: 'color-mix(in srgb, currentColor 6%, transparent)'
// dimmed separator glyph:
color:      'color-mix(in srgb, currentColor 35%, transparent)'
```

Never hardcode a border or background color — that's what breaks in dark theme. **Inline styles only** (no CSS pipeline out-of-tree).

## Two-tier palette (they differ on purpose — don't unify them)

| Use | ok | warn | crit | no-data |
| --- | --- | --- | --- | --- |
| **Chip + tab dot** | `#22c55e` | `#f59e0b` | `#ef4444` | `#8b93a7` |
| **Pane body text/borders** | *(inherit)* | `#fbbf24` | `#f87171` | — |

Body also uses softer mixes for fills: `color-mix(in srgb, #fbbf24 45%, transparent)` for a warn border, `#f87171 60%` for crit; text at `#fbbf24 75–80%` / `#f87171 80–85%` mixed with `currentColor`.

Map your states onto this: `idle`→ok, `busy`→ok or warn (your call, but **busy is not an error** — don't use crit), `wedged`→crit, `unreachable`→crit, auth/config errors→crit, `unknown`/stale→no-data grey.

**Pair color with a word or glyph.** Color-only distinction fails colorblind users and dim rooms (P4/AC11 already requires distinguishable messages).

## Chip geometry (verbatim from `GpuDockChip.tsx`)

```js
display:'inline-flex', alignItems:'center', gap:5,
fontSize:11.5, fontWeight:600, letterSpacing:'0.03em', whiteSpace:'nowrap',
padding:'1px 8px', borderRadius:999,
border:'1px solid color-mix(in srgb, currentColor 22%, transparent)',
background:'color-mix(in srgb, currentColor 6%, transparent)',
color:'inherit', cursor:'pointer',
opacity: stale ? 0.55 : 1, transition:'opacity 200ms',
```

Dot: `width:7, height:7, borderRadius:'50%', background:dot`, with a glow only when live: `boxShadow: hasData && !stale ? \`0 0 5px ${dot}\` : 'none'`.

**Numbers must use `fontVariantNumeric:'tabular-nums'`** — this is what stops the chip jittering as digits change width. Do not skip it.

Structure: `dot · LABEL · <dimmed sep> · <tabular values>`. Blueprint renders `GPU · 62% · 9.7/16G`. Slot-health equivalent is yours to choose (see P6), but keep it short enough never to wrap.

Accessibility: `title` = multi-line tooltip joined with `\n`, and `aria-label` describing the action ("Open slot health pane"). Blueprint appends a blank line then `stale — last updated N s ago` to the tooltip when stale — inherit that.

## Staleness convention

Chip dims at **`now - lastOk > 3000`** ms (3s, i.e. 3 missed polls at 1Hz) → `opacity: 0.55`. Reuse the same 3s threshold; don't invent a second one.

## Chip visibility (inherited design decision)

The chip **hides itself while the pane is open** (`if (paneOpen) return null`) — the two surfaces never duplicate. This is coordinated through `paneState.ts`: a module-level, **reference-counted** open tracker with no React dependency, so it works at 1Hz and survives a second open pane (e.g. two Sessions with the tab open). Copy that file's pattern rather than using component state.

Note this is *reference-counted*, not boolean — a naive boolean breaks when one of two open panes closes.

## Pane body conventions

- **Every number gets an unambiguous name.** Blueprint's rule: "GPU util" is never confusable with "Mem util"; VRAM shows used/total *and* free; power shows draw *and* limit as separate named quantities. Apply the same rigor: "prompt processed" vs "prompt cached", "decoded" vs "context", "busy age" vs "time to first token".
- **`title` tooltip on every row** explaining what the metric is *and where it comes from* — including honest source semantics (blueprint documents NVML-vs-smi "used" differences in tooltips; you document `/slots`-vs-`/metrics` lifetime-counter semantics the same way).
- **Meter bars** on meterable rows, with tone from the threshold model below.
- Header carries: source badge, `updated N s ago`, and per-endpoint error notes.

## Threshold model — **the convention worth copying most**

Blueprint `aggregate.ts` is a **pure module: no React, no network** — just selectors + cutoffs. Both the tab title (`GpuTitle.tsx`) and the body (`GpuBody.tsx`) import from it, so warn/crit values and the "worst of" logic are **defined exactly once**. Its header comment says so explicitly. Do the same: one pure `slotState.ts`/`aggregate.ts` holding your thresholds and state derivation, consumed by both chip and pane. This is also what keeps P6's "chip and pane never disagree" true by construction rather than by testing.

Real constants (there is **no** uniform "95% amber" rule — thresholds are per-metric and unit-aware):

```js
export type Level = 'ok' | 'warn' | 'crit'
VRAM_WARN = 90;  VRAM_CRIT = 97            // percent of capacity
TEMP_WARN = 80;  TEMP_CRIT = 88            // degrees
POWER_WARN_FRAC = 0.9; POWER_CRIT_FRAC = 1.0  // fraction of the card's own limit
levelFor(value, warn, crit) -> 'crit' if >=crit, 'warn' if >=warn, 'ok', 'na' if value == null
worstLevel(a,b) via RANK {ok:0, warn:1, crit:2};  fleetWorst reduces over cards
```

Note `'na'` is distinct from `'ok'` — unknown is not healthy. Keep that distinction; it's the same honesty rule PLAN applies to `unknown` backends.

**Your equivalents** (choose, but follow the shape — absolute where absolute, fraction-of-own-limit where that's the natural denominator): context pressure vs `n_ctx` is a percentage; busy age vs the P3 thresholds (120s / 300s) is absolute seconds. Define each once, in the pure module.

## What NOT to inherit

- **Sparklines.** Blueprint keeps a 120-point rolling history for per-GPU trends. PLAN §3.3 explicitly says "fancy charts without state labels" is *not* the v0 goal — honesty of busy/idle/wedged beats sparkline vanity. Skip history buffers in v0 unless a phase asks for one.
- **Anything NVML/native.** This plugin is pure HTTP.
