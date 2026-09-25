# REVIEW2 — Card chrome + collapsible sections (2026-09-25 ~11:10)

Human ask after REVIEW §1+§2 landed: **match GPU monitor’s card / hover feel**, and
structure the pane as **collapsible cards** with a **small preview** when collapsed —
one card language for **slot(s)** and **server metrics**.

Verified visually on **`:3090`** (token `/tmp/dsh-3090.log`). Do **not** re-open P7
contracts or REVIEW §1/§2 layout math — build **on top** of `row.tsx`.

---

## 0. Baseline (what is already done — do not redo)

Committed and live on `:3090` / `:3080` (human restarted `:3080`):

| Item | Status | Evidence |
| --- | --- | --- |
| MetricsBlock null-guard / legacy shape | done `7e9bc1e` | no empty-pane crash |
| GPU-language rows (`label \| meter flex \| value`) | done `021f2cb` `row.tsx` | seen live: prompt/context meters sit mid-row |
| Theme-safe `color-mix` ink | done | light theme reads correctly on `:3090` |
| Stable dock chip label (`idle` / `busy`) | done | dock shows short `idle`; chip hides while pane open |
| ECG guide icon | done | guide list (not the tab’s live status dot) |
| Row `title=` tooltips (source-honest) | done | CDP: 8+ rows carry long `/slots`/`/metrics` titles |

**This REVIEW is the next visual pass only.**

---

## 1. Visual findings on `:3090` (browser, 11:05–11:10)

Pane content observed (idle endpoint):

```
idle · 127.0.0.1:8080
latency 1 ms · updated 0 s ago
slot 0 idle
  prompt   [====meter====]  0 / 51,163 (0%)
  decoded  0
  busy     —
  ttft     —
  context  [====meter====]  51,163 / 128,000 (40%)
server metrics · 12m20s window
  prompt /s … decode /s … deferred … active … ctx peak …
  acc · lifetime 0.644 (n=82180)
  len · lifetime 1.9 (n=27394)
```

### What’s good

- Three-column meters no longer trail the number string (REVIEW §2a landed).
- Values use tabular weight; labels are muted.
- Native tooltips exist and name the **source** (`/slots`, `/metrics`, latch semantics).
- Dock chip is short and does not inflate the composer row while the pane is open.

### What’s still weak vs GPU Monitor (img 2 / `GpuCard`)

| Gap | Slot Health now | GPU Monitor |
| --- | --- | --- |
| **Card chrome** | Flat stack in the pane; **0** `border-radius: 8` card shells | Each GPU is a **card**: `border` + `borderRadius: 8` + hover wash |
| **Collapse** | Everything always expanded (~12+ rows when idle) | Header always visible; body toggles; `▸` chevron; `aria-expanded` |
| **Collapsed preview** | none | Header carries key numbers (`0%  13/16G  41°C  8W`) with per-stat `title=` |
| **Hover affordance** | none on section headers | Header `background: color-mix(…6%)` on mouseenter |
| **Persist expand** | n/a | `localStorage` key per card (`dsh.gpuMonitor.card.${index}`) |
| **Warn/crit tone** | meters are mono `currentColor` mix | Border + value color shift on VRAM/temp/power levels |
| **Captions** | none under values | e.g. “3.1 GiB free” under VRAM |
| **“Popover” feel** | native `title=` only (same *mechanism* as GPU!) | Also native `title=` — richer because **header stats + long row copy + meter-specific titles**. Not a React portal popover. |

**Important clarification for the implementer:** GPU does **not** use a custom popover library.
It uses **native `title` tooltips** on the row container, on each header stat, and on the meter.
Slot Health already has row titles. The “nice hover” gap is mostly **card + collapsed preview
stats with their own titles**, plus optionally **meter-specific** tooltips (GPU passes a
separate `meter.tooltip`; our `row.tsx` reuses the row tooltip for the meter).

---

## 2. Product ask (human) — target design

> One card language; collapsible **slot ▸** and **server metrics ▸** with a **small preview**.

### 2a. Pane skeleton (proposed)

```
┌─ pane header (not a card) ─────────────────────────┐
│ ● idle   127.0.0.1:8080                             │
│ latency <1 ms · updated 0 s ago                    │
└────────────────────────────────────────────────────┘

┌─ card: slot 0 ─────────────────────────────────────┐  ← borderRadius 8, hairline border
│ ▸  SLOT 0   idle          ctx 40% · dec 0 · —      │  ← collapsed preview (tabular)
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│   (expanded) existing Row rows for prompt…context  │
└────────────────────────────────────────────────────┘

┌─ card: server metrics ─────────────────────────────┐
│ ▸  SERVER   12m window    50.9/9.1 tok/s · acc 64% │  ← preview
│   (expanded) MetricsBlock rows                     │
└────────────────────────────────────────────────────┘
```

- **Default expand policy (recommended):**
  - **Slot card(s):** expanded when any slot is `busy` or `wedged`; collapsed when all idle
    (preview still shows ctx pressure). Override persisted in `localStorage`.
  - **Server metrics:** collapsed by default (noisy when idle); expand on demand.
    Persist `dsh.slotHealth.card.metrics`.
- Multi-slot later: **one card per slot** (`slot ${id}`), same as one `GpuCard` per GPU.
  Today `-np 1` → a single slot card is enough.

### 2b. Collapsed preview contents (keep short, tabular-nums)

**Slot card preview (right-aligned cluster):**

| State | Preview bits |
| --- | --- |
| idle | `ctx 40%` (and optional retained prompt size) |
| busy | `busy 22s · dec 892 · prompt 5%` (or ctx) |
| wedged | `wedged · busy 3m` (crit tone) |
| auth / slots error | `auth` / `slots` (crit) |

Each preview fragment gets its own `title=` (one-liner, source-honest).

**Server metrics preview:**

- `prompt/s · decode/s` when non-null, else `—`
- `acc 64%` when lifetime figure present (`round(value*100)` or show `0.64`)
- `window 12m` already in header meta — don’t duplicate awkwardly

### 2c. Card chrome (copy GpuCard constants, don’t invent)

From `dsh-gpu-monitor-nvml` `GpuCard`:

- Shell: `borderRadius: 8`, `overflow: 'hidden'`, border via `color-mix(currentColor 18%)`
  (warn/crit borders when slot wedged / unreachable — reuse `STATE_DOT` / worst-of logic).
- Header: `padding: '8px 10px'`, hover wash `currentColor 6%`, chevron `▸` rotates 90° when open.
- Body: `padding: '6px 10px 8px'`, top hairline when expanded.
- Keyboard: `role="button"`, `tabIndex={0}`, Enter/Space toggles; `aria-expanded`.

Extract a tiny shared `CollapsibleCard` in `src/client/` (or inline once) used by SlotBody +
MetricsBlock wrapper — **do not** fork two different card styles.

### 2d. Tooltips / “popovers”

1. **Keep native `title=`** (matches GPU; zero deps; works in the pane).
2. Enrich:
   - Preview stats: short titles (like GPU’s `title="VRAM used / total"`).
   - Meter: optional dedicated meter tooltip (`prompt 5% of this request` vs the long row
     explanation) — extend `row.tsx` `meter?: { ratio; tooltip }` to match GPU’s API.
3. **Do not** add a custom floating popover library unless the platform already exposes one
   as a frozen dependency. Native titles are the blueprint.

### 2e. Out of scope for REVIEW2

- Sparklines / trend charts (GPU has them; PLAN said no charts in v0 for slot-health).
- Process lists.
- Changing `{value, sample}` / engine.
- Bouncing sacred `:8080` / `:11434`. Agent still does not restart `:3080` unless human asks.

---

## 3. Implementation sketch (smallest slices)

1. Add `CollapsibleCard.tsx` (or `card.tsx`) mirroring GpuCard header/body/hover/a11y/storage.
2. Wrap **each slot** in a card; collapsed preview from `deriveChip` / slot fields.
3. Wrap **MetricsBlock** in a card; collapsed preview from the section’s non-null rates + acc.
4. Default expand rules + `localStorage` keys (`dsh.slotHealth.card.slot.${id}`, `…metrics`).
5. Optional: extend `row.tsx` meter tooltip object; add value `caption?` if a free-ctx style
   line helps (`76% of n_ctx` already in the value — caption only if it adds info).
6. Rebuild client; hard-refresh `:3090`; verify collapse / preview / titles; commit.
7. Update `STATUS.md` + `ACCEPTANCE.md` pending-human for card UX.

Verify checklist (agent, curl + eyes on `:3090`):

- [ ] Idle: metrics card collapsed by default; slot card collapsed or expanded per policy; preview readable.
- [ ] Busy (use fixture or wait for live busy — **never POST `:8080` from the agent**): slot card prefers expanded; preview shows busy age / decode.
- [ ] Hover on card header shows wash; chevron rotates; Enter toggles.
- [ ] Row tooltips still present after wrap (don’t strip `title=`).
- [ ] No layout jump in dock chip; ECG guide icon unchanged.
- [ ] Light theme + (if available) dark theme: borders via `color-mix`, no hardcoded greys.

---

## 4. Relation to REVIEW.md

| REVIEW.md | REVIEW2 |
| --- | --- |
| §1 crash harden | done |
| §2 row/meter/chip/icon | done |
| (implied) still flat pane | **this file** — cards + collapse + preview |

Human paste for the overnight / local agent:

```
Read agent/REVIEW2.md and implement §3.
Verify on :3090 (token in /tmp/dsh-3090.log). Do not POST to :8080.
Do not restart :3080 unless I ask. Commit when green; update STATUS.md.
```
