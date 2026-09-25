# `dsh-slot-health` — Status

**Updated:** 2026-09-25 10:30 — **P0–P7 committed.** `:3090` OK; `:3080` empty pane = stale host +
client null crash — full write-up in **`agent/REVIEW.md`** (also UI polish brief).

Laws in **`AGENTS.md`** (auto-loaded); facts in **`ENV.md`**; style in `STYLE.md`; packaging gotchas in
SKILL "Corrections learned the hard way."

## P7 — DONE (was the loop)

- Cause A implemented per frozen decision: `DraftFigure {value, sample}` for
  `draftAcceptance`/`draftMeanLen` (lifetime + lastRequest); `perPosLastRequest` always an array
  (`[]` = no data — frozen tests 4/19 win over the note's `null` case; recorded in NOTES).
- Causes B/C/D: fixtures use canonical `EndpointState` (`'unreachable'`/`'idle'`, null probes on
  down ticks, test 12 re-open verified via down-tick path not restart); capability `no` short-
  circuits; skipped probe while `yes` keeps section stale; empty-body test expects `null`.
- **68/68 pass, `tsc --noEmit` + `node build.mjs` clean.**
- Client: `MetricsBlock.tsx` (rows render only for non-null values; spec rows labeled
  lifetime vs last req with denominators — AC6/AC12) + `SlotBody` header now uses
  `deriveChip` (dock-chip parity; the green-"idle"-while-busy defect is fixed).

## Environment (re-probed ~10:10)

- llama-server pid **419949** on `:8080` (model unchanged; **key is in env as `LLAMA_API_KEY`,
  not in argv**; value is a stub — never print it). dsh `:3080` pid **420284** (also has the key).
- Acceptance `:3090` pid **427648** — booted with the key from `/proc/419949/environ`;
  token URL in `/tmp/dsh-3090.log` line 1. **Restart recipe:** same nohup command; host-half
  changes need this pid restarted, client-half is HMR-picked-up.
- Live route verified with the new engine shape: `draftAcceptance.lifetime: { value: 0.649,
  sample: 26394 }`, `draftMeanLen.lifetime: { value: 1.9, sample: 8798 }`, `perPosLastRequest: []`.
- `/slots` now auth-gated (401 without key); engine `n_ctx 128000` confirmed on live slot.

## Committed so far

- `749714d` P7 client · `8216613` P7 engine · `875d13c` P7 WIP (superseded) · `e93a772` P6 chip ·
  `9b0f9ac` P2–P5 · `2069b8a` P1 · `090a524` P0

## Next 3

1. [ ] **`:3080` empty pane** — see `agent/REVIEW.md` §1. Harden `MetricsBlock` (`perPos` null-guard +
   legacy number figures); human may restart `:3080` for the new host — agent does not bounce it unless asked.
2. [ ] **UI polish pass** — `agent/REVIEW.md` §2: GPU-style meter rows, dock-chip width/stable label,
   heartbeat guide icon (not the default cube shared with GPU Monitor). Verify on `:3090`.
3. [ ] Re-derive P3 `wedged` thresholds for IQ4_XS + 128k; optional `latency 0 ms` → `<1 ms`.

## pending-human

- P7 AC6/AC12 + pane-header chip parity + stale-metrics dim — steps in `agent/ACCEPTANCE.md`.
- P6 AC9 (chip states, no jitter, light+dark, no gpu-monitor collision).

Keep ≤60 lines / ≤1k tokens. Rewrite, don't append.
