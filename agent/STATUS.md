# `dsh-slot-health` — Status

**Updated:** 2026-09-25 01:15 — **P0 DONE** (`090a524`) · **P1 RESTARTED FROM ZERO**
**Phase:** **P1 (vertical slice)** — poll `/health` → route → pane reachable/unreachable/idle

Laws live in **`AGENTS.md`** (auto-loaded, survives compaction) — not repeated here.
Facts live in **`ENV.md`**; style in **`STYLE.md`**; packaging gotchas in **SKILL "Corrections learned the hard way"**.

## ⚠ Read first: P1 was restarted

Previous P1 attempt was interrupted having **written nothing to disk**. It read ~8 files, designed in
memory, hit the output token limit twice, compaction returned an **empty summary**. All seven `src/`
files are still **P0's** — no partial P1 work exists to salvage. Start P1 fresh.

Lesson, now law: **read ≤3–4 files, then WRITE.** Never announce a complete design without a file
written in the same turn. Smallest file first → commit → continue.

## New since P0

- **`AGENTS.md`** at repo root — auto-loaded workspace instructions. Read it.
- **SKILL** now has "Corrections learned the hard way" (the four P0 packaging discoveries: combo-URL
  404 by design, `dsh web` implies profile, `main` required, route handler shape). Read before touching
  `package.json` / `build.mjs` / client code.
- **llama-server restarted 01:06** by human. Resolve pid live (`pgrep -x llama-server`) — never trust a
  pid in a doc. Flags now `--reasoning on --reasoning-budget 2048 --metrics -np 1`. Re-verified:
  `/health` 200 open; `/slots` + `/metrics` 200 with key `local`. **Reasoning ON, 2048 budget** →
  expect visible thinking; pace for it.

## Next 3

1. [ ] Read `AGENTS.md` + SKILL "Corrections" (≤2 files), then `phases/P1-vertical-slice.md`
2. [ ] **Write first:** snapshot type in `src/shared/types.ts` → commit; then `src/host/collect.ts`
       `/health` poller (~2s timeout, never throws) → commit
3. [ ] Route + client poller; verify via `curl :3090/api/dsh-slot-health` + dead-port origin for
       `unreachable`. Pane render = `pending-human`

## Checkpoints

- [x] PLAN approved · Q1–Q10 LOCKED · AC1–AC13 · SPEC/STYLE/phases P0–P9 · `AGENTS.md`
- [x] Live probes: auth required, `/v1/slots` **404 trap**, `/metrics` **200**, counters **cumulative**,
      rate gauges **0 idle**, Ollama `/api/ps` = `{"models":[]}`
- [x] `~/.local/bin/llama-dsh`: `--metrics` default (`LLAMA_METRICS=0` escape), 3 exec paths, dry-run verified
- [x] **P0 scaffold** — activates on `:3090`; `lib/` committed; browser render = pending-human
- [ ] **P1 vertical slice** ← you are here
- [ ] P2 slot meat → P3 wedged → P4 errors → P5 auth → P6 chip → P7 metrics → P8 backends → P9 ship

## pending-human

- **P0 browser check (first morning task):** open token URL (see `ACCEPTANCE.md` §Morning check);
  confirm rightbar tab renders the placeholder. Server-side activation proven; browser execution unverified.

Keep ≤55 lines. Rewrite, don't append.
