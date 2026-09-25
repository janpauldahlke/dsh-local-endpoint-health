# `dsh-slot-health` — Status

**Updated:** 2026-09-25 09:20 — **P0–P6 done + committed** · **P7 in flight, UNCOMMITTED, blocked**
**Phase:** **P7 metrics** — engine written, `tsc` + build **pass**, but **12 unit tests red**.

Laws in **`AGENTS.md`** (auto-loaded); facts in **`ENV.md`**; style in `STYLE.md`; packaging gotchas in
SKILL "Corrections learned the hard way."

## ⚠ BLOCKED — read `NOTES.md` §"P7 BLOCKER" before touching anything

The last run **looped** here. Root cause is a **contract split, not a code bug**:

- `npx tsc --noEmit` **passes** · `node build.mjs` **succeeds** · `npm test` = 68 → **56 pass / 12 fail**
- All 12 are in the uncommitted `test/metrics.test.mjs`. The impl agrees with `src/shared/types.ts` and
  the frozen NOTES "P7 engine shape"; the **tests were written against a richer contract.**
- Chasing the red tests breaks typecheck or contradicts NOTES. **That is the loop. Decide first, edit second.**

Four independent causes — full table + evidence in **NOTES.md §"P7 BLOCKER"**:

- **A (6 tests) — `{value, sample}` vs `number | null`. DECIDED 09:40: adopt `{value, sample}`** (frozen in
  NOTES §"Cause A FROZEN"; reversible, one type change if vetoed). `sample` = denominator (draft tokens /
  draft attempts). `perPosLastRequest`: `[]` after a completed request with no movement, `null` if none.
  Only cause touching `src/` (types.ts + metrics.ts + tests + later client rows).
- **B/C/D (6 tests) — test-side only.** B: fixture's `snap('down')` isn't a canonical `EndpointState`
  (use `'unreachable'`); test 12 passes for the *wrong* reason. C: capability rules contradict the frozen
  note. D: empty body ⇒ `null`, test derefs it ⇒ TypeError.

## Environment — re-probed 09:33 after human's model swap

- Server **UP** (new pid — resolve live, never trust a doc): `:8080` + `:3080` listening; **`:3090` acceptance
  server DOWN** → boot it per SKILL §"Acceptance port" (check first, clean env, no `--profile web`).
- New model live: `Qwen3.8-27B-…-IQ4_XS` MTP GGUF, KV q8. `/slots` says **`n_ctx: 128000`** (the "~65k"
  estimate was wrong), `speculative: true`. `/metrics` has `spec_decode_*` incl. per-pos 0–2; `n_tokens_max`
  ~20k. All earlier sizing numbers stale; P3 `wedged` thresholds were tuned on the old quant — re-derive.
- ENV.md argv block carries a STALE banner; read `/proc/<pid>/cmdline` for truth.
- Client pane has **no metrics render code yet** — P7 client half is TODO after the engine goes green.
- One verified-in-code visual defect (not screenshot-guessing): `SlotBody.tsx` header renders the raw
  endpoint-level `snapshot.state`, so it can show green "idle" while a slot is busy; the dock chip uses
  `deriveChip` and would say busy. Fix = pane header consumes the same derived state (slotState.ts's
  stated promise). Rest of visual polish = pending-human.

## Committed so far

- `875d13c` P7 engine WIP/BLOCKED + 27 tests · `12c4d16` this diagnosis · `ddb4ca6` promParse ·
  `e93a772` P6 chip · `9b0f9ac` P2–P5 · `2069b8a` P1 · `090a524` P0
- `:3090` bundle served via the `??` combo URL only (5 MB; `/tmp/combo-url.txt`) — single-file
  `client.js?rev=` 404s **by design**. CLI `0.1.6-alpha.2`: `--profile`/`--dump-config` are global.

## Next 3

1. [ ] Boot `:3090` (check first), then fix B/C/D **test-side** (`'down'`→`'unreachable'`; capability per NOTES; D expects `null`).
2. [ ] Implement cause A (`{value, sample}`) in types.ts + metrics.ts + tests → `npm test` green → **commit P7 engine**.
3. [ ] Client metrics rows (AC6/AC12) + pane-header derived-state fix; visual polish = pending-human.

## pending-human

- P0/P1: tab renders; idle + "updated N s ago" ticks.
- P6 AC9: chip alone distinguishes busy / idle / error·auth / unreachable / stale; no jitter while typing;
  light+dark readable; no gpu-monitor collision. Steps in `agent/ACCEPTANCE.md`.
- P7 AC6 (not a tok/s clone) + AC12 (acceptance labeled lifetime vs delta'd) — needs the server up.

Keep ≤60 lines / ≤1k tokens (cap raised from 55 while P7 is blocked — the blocker section is the whole
point of this file right now; drop it back to 55 once P7 is committed). Rewrite, don't append.
