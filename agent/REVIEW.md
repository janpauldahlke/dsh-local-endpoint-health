# REVIEW — Slot Health UI + :3080 empty-pane (2026-09-25 ~10:25)

Human review after P7. Local agent: **iterate from this file**. Do not re-derive;
do not reopen P7 contract design. Fix → verify on `:3090` → commit → update STATUS.

---

## 1. Is the empty pane on `:3080` "just a restart" or a real error?

**Both.**

| Layer | What | Verdict |
| --- | --- | --- |
| **Symptom on `:3080`** | Pane blank; console `TypeError: can't access property "length", perPos is null` in `MetricsBlock` | Real crash, caught by `componentDidCatch` → empty pane |
| **Why only `:3080`?** | Host process still serves **old** metrics shape: `perPosLastRequest: null`, `draftAcceptance.lifetime: <number>`. New client expects `[]` and `{value, sample}`. | **Stale host** (not restarted after `8216613` / `749714d`) |
| **`:3090`** | Already serves new shape; pane renders (human confirmed) | Working acceptance surface |

**Reproduce the shape skew (do not print the API key):**

```sh
curl -s http://127.0.0.1:3080/api/dsh-slot-health | python3 -c \
  "import json,sys; m=json.load(sys.stdin)['metrics']; print(m['draftAcceptance']['lifetime'], m['perPosLastRequest'])"
# broken : 0.657…  None
curl -s http://127.0.0.1:3090/api/dsh-slot-health | python3 -c \
  "import json,sys; m=json.load(sys.stdin)['metrics']; print(m['draftAcceptance']['lifetime'], m['perPosLastRequest'])"
# good   : {'value': 0.657, 'sample': …}  []
```

**Crash site** (`src/client/MetricsBlock.tsx` ~70):

```ts
const perPos = metrics.perPosLastRequest
const specRows = … || perPos.length > 0   // null → TypeError → whole pane dies
```

### What the human should do about `:3080`

- **Yes — the human may restart `:3080`** to pick up the new host bundle. That alone clears the empty pane *for this machine*, because the new host emits `[]`.
- The overnight agent must **not** bounce `:3080` unless the human explicitly asks (AGENTS.md sacred-port law). Prefer fixing the client and verifying on `:3090`.
- **Still fix the client** even after a restart: a stale / mixed host must never blank the whole pane. Harden:
  1. `perPosLastRequest == null` → treat as `[]`
  2. `fmtFigure` must tolerate legacy bare `number` (or refuse safely) so `figure.value` on a number never yields `"undefined (n=undefined)"` or a throw
  3. Optional: unit test that feeds the **old** JSON shape and asserts MetricsBlock does not throw

Restart ≠ substitute for the null-guard.

---

## 2. UI comparison — Slot Health (img 1) vs GPU Monitor (img 2)

Goal: **same visual language as `dsh-gpu-monitor-nvml`**. STYLE.md already says so; Slot Health drifted.

### 2a. Meter layout — **jumping left/right** (human: put meters on their own row / match GPU)

**GPU pattern** (`GpuBody.tsx` `Row`): one flex row —

`[label fixed]  [meter flex:1 middle]  [value right, tabular-nums]`

Meter grows in the **middle**; value is always right-aligned. Number width changes do **not** shove the bar.

**Slot Health today** (`SlotBody.tsx`): meter is **inline after the text** inside the value cell:

`prompt  0 / 97,084 (0%) [====meter====]`

When `97,084` ↔ `9,708` (or % width) changes, the meter slides. Fixed `width: 72` still sits after a variable-length string → horizontal jump every tick.

**Fix (preferred — copy GPU):**

- Refactor `Row` to GPU's three-column layout: `label | meter? | value`.
- Meter: `flex: 1`, height ~4, `color-mix(currentColor …)` fills (theme-safe — drop hard `#60a5fa` / `rgba(139,147,167,…)`).
- Values: `fontVariantNumeric: 'tabular-nums'`, `fontWeight: 600`, right-aligned.
- `%` can stay in the value string or as a caption under the value (GPU uses caption for "3.1 GiB free").

**Alt (human suggested "own row"):** value row, then a full-width meter row under it. Also stops jumping; slightly taller. Prefer GPU three-column unless the pane feels too cramped.

### 2b. Values not "properly visible" / overall cleanliness

Observed issues vs GPU:

| Issue | Slot Health now | GPU / STYLE target |
| --- | --- | --- |
| Hardcoded greys (`#8b93a7`, `#c3c9d6`) | breaks dark/light parity | `currentColor` + `color-mix` |
| Meter hard blue/amber | theme-deaf | tone via `color-mix` like GPU |
| Value weight | often light mono | heavier tabular value, muted label |
| Label column | short labels OK | keep fixed label width (~96) like now / GPU |
| Server metrics block | dense; `acc · lifetime` ok | keep; ensure tabular-nums + same row rhythm as slot rows |
| Header | `idle` + origin | fine; chip color already from `deriveChip` |

Also optional polish already in STATUS pending-human: `latency 0 ms` → `<1 ms` on localhost.

### 2c. Dock chip flicker / layout shift (img 3)

Composer dock: GPU chip + Slot Health `idle` chip sit in one row. When Slot Health label flips

`idle` → `busy 22s · dec 892`

the chip **grows**, shoving "1 turns · 42 tok/s · …" left/right every second.

STYLE.md already requires `fontVariantNumeric: 'tabular-nums'` (dock chip has it) — that only stabilizes **digits**, not **label length**.

**Fix:**

- Give the chip a **`minWidth`** sized for the longest common busy label (e.g. enough for `busy 99m59s · dec 99999`), and/or **`maxWidth` + ellipsis** so it never blows the dock.
- Prefer a **stable short label** on the chip (e.g. always `idle` / `busy` / `auth` / `down`) and put age/decoded in the **tooltip only** — biggest win against flicker. Pane header can keep the richer label.
- Do **not** invent a second layout language; match `GpuDockChip` padding/radius (already close).

### 2d. Guide + tab icon collision (img 4) — same cube as GPU Monitor

Both plugins omit `guide[].icon`. Registry docs (`tab-registry.ts`):

> Optional glyph… **without one the guide draws its cube placeholder.**

So Slot Health and GPU Monitor both get the **default cube** — human is right, that is bad.

**Fix:** register a distinct icon on the Slot Health guide entry (and tab title if the same glyph is reused there).

```ts
// pattern from ui-sidebar-terminal: guide: [{ …, icon: TerminalGuideIcon }]
guide: [{
  id: 'slot-health',
  order: 300,
  title: () => 'Slot Health',
  description: () => '…',
  icon: SlotHealthGuideIcon,  // NEW — heartbeat / ECG pulse SVG
}]
```

**Icon brief (human request):** cardio-monitor / heartbeat / ECG pulse line — reads as "health", not a second GPU cube. Tiny inline SVG component (~16×16), `currentColor`, no emoji. File suggestion: `src/client/SlotHealthIcon.tsx`. Check `IconProps` from the sidebar-right package (same as Terminal).

Tab chrome currently shows a **status-colored disc** (from `SlotTitle` / state) — keep the live status dot; the **guide list** is where the cube must change. If the tab header also uses the guide icon somewhere, verify after the change so it isn't still a cube.

---

## 3. Work order for the local agent

1. **Harden MetricsBlock** (null `perPos` + legacy number figures) + tiny unit/smoke test → commit. Verifies empty-pane cannot return.
2. **UI pass (this REVIEW):**
   - Row/meter layout → GPU three-column (or value + meter-own-row).
   - `tabular-nums` + theme-safe `color-mix` on pane body.
   - Dock chip: stable short label and/or min/max width.
   - Heartbeat guide icon ≠ GPU cube.
3. Rebuild client; verify on **`:3090`** (token in `/tmp/dsh-3090.log`). Hard-refresh.
4. Human restarts **`:3080`** when ready to see the same there (agent does not bounce it unless asked).
5. Update `STATUS.md` + mark visual items in `ACCEPTANCE.md` as pending-human or done-with-evidence.

---

## 4. Out of scope / do not touch

- P7 `{value, sample}` contract (frozen).
- Sacred `:8080` / `:11434`; no `POST` to llama-server.
- No `git push`.
- Do not "fix" by only telling the human to restart — ship the null-guard.

---

## 5. Evidence index

- Console: `MetricsBlock.tsx` / `perPos is null` / `slot entry crashed in 'sidebar.right.pane.tab'`
- Live curl shape skew `:3080` vs `:3090` (section 1)
- Screenshots (human, ~10:25): pane meters; GPU reference layout; dock chip row; guide cube collision
- Blueprint: `/home/hagbard/dev/dsh-gpu-monitor-nvml/src/client/GpuBody.tsx` (`Row` + `Meter`)
- STYLE.md chip + tabular-nums + color-mix rules
