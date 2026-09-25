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

- **A (the blocker, 6 tests) — `{value, sample}` vs `number | null`. Needs a human decision.** Tests want a
  denominator (`draftAcceptance.lifetime.sample === 10`); `types.ts:141` has no `sample`, and that word
  appears nowhere in `src/`. Recommended = adopt `{value, sample}` (AC12 already requires labeling
  lifetime-vs-delta; a bare `0.87` is untrustworthy). **Don't guess.** Only cause touching `src/`.
- **B/C/D (6 tests) — test-side only.** B: fixture's `snap('down')` isn't a canonical `EndpointState`
  (use `'unreachable'`); note test 12 passes for the *wrong* reason. C: capability rules contradict the
  frozen note. D: empty body ⇒ `null`, test derefs it ⇒ TypeError.

## Environment DOWN + model changed — re-verify everything

- At 09:00: **no `llama-server`**, `:8080` dead, `:3080`/`:3090` gone; only ollama `:11434`. Resolve pids
  live (`pgrep -x llama-server`) — **never trust a pid in a doc.**
- Model swapped for ctx headroom: `Qwen3.8-27B-…-IQ4_XS` **MTP** GGUF (was Q6_*), **KV q8**, **~65k ctx**.
  Every earlier number is stale (incl. "`contextUsed` ~22k"). P3 `wedged` thresholds were tuned on the old
  quant — re-derive, don't inherit.
- Spec-decode MTP was **already** active on the old server (ENV.md:78) — `spec_decode_*` is not new, don't
  "discover" it. But the new GGUF has MTP baked in, so check whether `--spec-draft-model` is still passed;
  if not, those series may **disappear** and cause A becomes moot for live data. **Probe before trusting fixtures.**
- ENV.md's argv block is stale (`-c 32768`, `--reasoning off`). Re-read `/proc/<pid>/cmdline`, not ENV.md.

## Committed so far

- `ddb4ca6` P7 promParse + 5 tests — **HEAD** · `e93a772` P6 chip · `9b0f9ac` P2–P5 · `2069b8a` P1 · `090a524` P0
- **Uncommitted P7:** new `src/host/metrics.ts`, `test/metrics.test.mjs`, `lib/metrics.mjs`; modified
  `types.ts`, `collect.ts`, `host/index.ts`, `promParse.ts`, `build.mjs`, `NOTES.md`
- `:3090` bundle served via the `??` combo URL only (5 MB; `/tmp/combo-url.txt`) — single-file
  `client.js?rev=` 404s **by design**. CLI `0.1.6-alpha.2`: `--profile`/`--dump-config` are global.

## Next 3

1. [ ] **Get the cause-A decision** (`{value,sample}` vs `number|null`); freeze it in NOTES.
2. [ ] Fix B/C/D **test-side** expectations (`'down'`→`'unreachable'`; capability rules per NOTES; D expects `null`).
3. [ ] Implement A → `npm test` green → **commit P7**. Then AC6/AC12 + pending-human below.

## pending-human

- P0/P1: tab renders; idle + "updated N s ago" ticks.
- P6 AC9: chip alone distinguishes busy / idle / error·auth / unreachable / stale; no jitter while typing;
  light+dark readable; no gpu-monitor collision. Steps in `agent/ACCEPTANCE.md`.
- P7 AC6 (not a tok/s clone) + AC12 (acceptance labeled lifetime vs delta'd) — needs the server up.

Keep ≤60 lines / ≤1k tokens (cap raised from 55 while P7 is blocked — the blocker section is the whole
point of this file right now; drop it back to 55 once P7 is committed). Rewrite, don't append.
