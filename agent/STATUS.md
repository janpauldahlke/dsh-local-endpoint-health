# `dsh-slot-health` — Status

**Updated:** 2026-09-25 ~13:00 — **REVIEW §1 (hardening) + §2 (UI pass) committed and verified
on `:3090`.** `:3080` was restarted by the human (pane works there too — stale-host crash gone
on both, doubly: new client hardens AND new host serves the P7 shape).

Laws in **`AGENTS.md`** (auto-loaded); facts in **`ENV.md`**; style in `STYLE.md`; packaging
gotchas in SKILL "Corrections learned the hard way."

## REVIEW §1 + §2 — DONE

- **§1** `7e9bc1e`: `metricsFmt.ts` pure coercers (`toFigure`/`toPerPos`/`fmtFigure`/
  `fmtPerPos`/`metricsHasRows`); MetricsBlock consumes them — legacy `perPos: null` + bare-number
  figures degrade to fewer rows, never throw. 8 new tests; **76/76 pass**, tsc + build clean.
- **§2** `021f2cb`: `row.tsx` shared GPU-language rows (label | meter flex:1 | value right,
  tabular-nums; color-mix ink — no hardcoded greys) used by SlotBody + MetricsBlock; slot word
  uses `STATE_DOT` (busy blue); header shows rich `chip.detail`; dock chip label stable `'busy'`
  (rich detail in `detail`); `SlotHealthIcon.tsx` ECG guide icon registered (no cube collision);
  `latency 0 ms` → `<1 ms`; every row has a source-honest tooltip.

## Environment (re-probed ~13:00)

- llama-server pid **419949** on `:8080` (key in env as `LLAMA_API_KEY`, stub — never print).
  dsh `:3080` is now pid **440235** (human's restart). Acceptance `:3090` pid **454046**
  (rebooted after the env restart took 427648 down; same nohup recipe, key from
  `/proc/419949/environ`; token in `/tmp/dsh-3090.log` line 1).
- Live `:3090` route verified: `draftAcceptance.lifetime {value 0.647, sample 76990}`,
  `draftMeanLen.lifetime {value 1.9, sample 25664}`, `perPosLastRequest []`,
  `promptTokensPerSec 267`, ctxHighWater 102581; slot 0 live-busy (the agent's own request).
- Served combo on `:3090` re-fetched and grepped: ECG path, `icon: SlotHealthGuideIcon`,
  color-mix 22%/55%, tabular-nums, stable `label: "busy"`, coercers — all present.

## Committed so far

- `021f2cb` UI pass · `7e9bc1e` hardening · `749714d` P7 client · `8216613` P7 engine ·
  `e93a772` P6 chip · `9b0f9ac` P2–P5 · `2069b8a` P1 · `090a524` P0

## Next 3

1. [ ] Human visual pass on `:3080` + `:3090` (REVIEW §2 acceptance: 3-col rows, no meter slide,
   stable chip width, ECG icon in guide, theme-safe ink) — steps in `agent/ACCEPTANCE.md`.
2. [ ] Re-derive P3 `wedged` thresholds for IQ4_XS + 128k context.
3. [ ] Optional: per-pos rows only appear once a spec request completes on a live host.

## pending-human

- REVIEW §2 visual acceptance (see above). P3 `wedged` thresholds unvalidated at 128k.

Keep ≤60 lines / ≤1k tokens. Rewrite, don't append.
