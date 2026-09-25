# `dsh-slot-health` — Status

**Updated:** 2026-09-25 09:45 — **P0–P6 committed** · **P7 engine committed WIP** (`875d13c`), 12 tests red,
cause A **DECIDED** → unblocked. Server UP on the new model; `:3090` needs a boot.

Laws in **`AGENTS.md`** (auto-loaded); facts in **`ENV.md`**; style in `STYLE.md`; packaging gotchas in
SKILL "Corrections learned the hard way."

## ⚠ P7 loop — read `NOTES.md` §"P7 BLOCKER" + §"Cause A FROZEN" before touching tests

The last run **looped** on 12 red tests. Root cause is a **contract split, not a code bug**: `tsc` and
build pass; the impl agrees with `types.ts` + frozen NOTES, the **tests encode a richer contract**.
Chasing red breaks typecheck or contradicts NOTES. **Decide first, edit second.** Four causes:

- **A (6 tests) — `{value, sample}` vs `number | null`. DECIDED 09:40: adopt `{value, sample}`** (NOTES
  §"Cause A FROZEN"; reversible). `sample` = denominator (draft tokens / draft attempts).
  `perPosLastRequest`: `[]` after a completed request with no movement, `null` if none. Only cause touching `src/`.
- **B/C/D (6 tests) — test-side only.** B: fixture's `snap('down')` isn't a canonical `EndpointState`
  (use `'unreachable'`); test 12 passes for the *wrong* reason. C: capability rules contradict the frozen
  note. D: empty body ⇒ `null`, test derefs it ⇒ TypeError.

## Environment — re-probed 09:33 after the model swap

- Server **UP** (new pid — resolve live, never trust a doc): `:8080` + `:3080`; **`:3090` acceptance DOWN** →
  boot per SKILL §"Acceptance port" (check first, clean env, no `--profile web`).
- New model: `Qwen3.8-27B-…-IQ4_XS` MTP GGUF, KV q8. `/slots`: **`n_ctx: 128000`** (the "~65k" guess was
  wrong), `speculative: true`. `/metrics`: `spec_decode_*` live incl. per-pos 0–2; `n_tokens_max` ~20k.
  All earlier sizing stale; P3 `wedged` thresholds tuned on the old quant — re-derive.
- ENV.md argv block has a STALE banner; truth = `/proc/<pid>/cmdline`.
- Client pane has **no metrics render code yet** — P7 client half TODO after the engine goes green.
- Verified-in-code visual defect (not screenshot-guessing): `SlotBody.tsx` header renders raw endpoint-level
  `snapshot.state` → can show green "idle" while a slot is busy; the dock chip uses `deriveChip` and would say
  busy, violating slotState.ts's "cannot disagree" promise. Fix = pane header consumes the derived state.
  Rest of visual polish = pending-human.

## Committed so far

- `875d13c` P7 engine WIP + 27 tests · `12c4d16`/`6233217` diagnosis · `ddb4ca6` promParse · `e93a772` P6 chip ·
  `9b0f9ac` P2–P5 · `2069b8a` P1 · `090a524` P0
- `:3090` bundle served via the `??` combo URL only (5 MB; `/tmp/combo-url.txt`) — single-file
  `client.js?rev=` 404s **by design**. CLI `0.1.6-alpha.2`: `--profile`/`--dump-config` are global.

## Next 3

1. [ ] Boot `:3090` (check first); fix B/C/D **test-side** (`'down'`→`'unreachable'`; capability per NOTES; D expects `null`).
2. [ ] Implement cause A in types.ts + metrics.ts + tests → `npm test` green → **commit P7 engine**.
3. [ ] Client metrics rows (AC6/AC12) + pane-header derived-state fix; visual polish = pending-human.

## pending-human

- ~~P0/P1/P2 pane~~ **HUMAN-CONFIRMED 09:32** (screenshot: tab renders, slot rows live with
  prompt/decoded/busy/ttft/context + meters). Remaining visual work is polish, not activation proof.
- P6 AC9: chip alone distinguishes busy / idle / error·auth / unreachable / stale; no jitter while typing;
  light+dark readable; no gpu-monitor collision. Steps in `agent/ACCEPTANCE.md`.
- P7 AC6 (not a tok/s clone) + AC12 (acceptance labeled lifetime vs delta'd) — server is up now.

Keep ≤60 lines / ≤1k tokens. Rewrite, don't append.
