# `dsh-slot-health` — Status

**Updated:** 2026-09-24 23:15 — PLAN approved, Q1–Q10 locked, **SPEC + 10 phase files written**
**Phase:** **READY TO BUILD** → start at `SPEC.md` §0, then `phases/P0-scaffold.md`

## How to rewrite this file (your only memory)

Keep **≤55 lines** including this header. **Rewrite, don't append** — it must always describe *now*. Sections: `LAW` (copy verbatim, never edit) · `Session log` (≤6 lines, newest first: "Pn: did X → verified by Y") · `Checkpoints` ([x]/[ ] over P0–P9) · `Next 3` · `Blockers` · `pending-human` · `Gotchas`.

- **"Next 3" is the most important block** — if the session dies right after you write, that's what saves the run. First item must be actionable immediately.
- Never write "in flight" without naming the exact file/function you were mid-edit on.
- Log `pending-human` items **as you create them**, not at the end — you will not remember them.
- After a compaction, re-read this file + the current phase file (~3k) and nothing else. Verify state against disk (`git log --oneline`, `ls src/`), not memory.

## LAW

1. Disk+git only. Chat lies.
2. **Git: `commit` after every verified phase. `push` FORBIDDEN** — `origin` exists, do not use it. No force-push, no remote/tag changes. Publishing is a human gate.
3. Sacred: never kill `:3080`/`:8080`/`:11434`. Acceptance on `:3090`. Never restart llama-server to gain a flag. **Never load an Ollama model** (starves the coding agent's GPUs). See [`ENV.md`](ENV.md).
4. `agent/**` + `skills/**` **are tracked** (un-ignored 2026-09-24) → commit STATUS/NOTES/SPEC updates **with** the code they describe. They are private briefs: the human strips them before any publish. You never push.
5. **Context discipline is a hard requirement** — 32k slot, ~14–16k usable. Read `SPEC.md` §0 first. Never read `PLAN.md` wholesale (~7.1k tokens); one phase file at a time.

## Name — LOCKED

**`dsh-slot-health`** everywhere it's a product identifier. Canonical table in [`ENV.md`](ENV.md) §"Canonical identifiers". Repo *directory* stays `dsh-local-endpoint-health` — a filesystem fact, **not** drift; do not rename it. Repo/package mismatch is a **publish-time** human action.

## Checkpoints

- [x] PLAN approved + de-ballasted · Q1–Q10 LOCKED (§11) · AC1–AC13 (§7)
- [x] Live probes: auth required, `/v1/slots` **404 trap**, `/metrics` **200** (after human restart w/ `--metrics`), counters are **cumulative**, rate gauges read **0 idle**, Ollama `/api/ps` = `{"models":[]}`
- [x] `~/.local/bin/llama-dsh` patched: `--metrics` default (escape `LLAMA_METRICS=0`), 3 exec paths, `bash -n` + stub dry-run verified
- [x] **`SPEC.md`** (thin orchestrator + context discipline) · **`STYLE.md`** (palette/geometry extracted from shipped blueprint) · **`phases/P0–P9`**
- [ ] P0 scaffold → P1 vertical slice → … → P9 ship

## Next 3

1. [ ] Read `SPEC.md` §0 + `ENV.md` + `STYLE.md`, then **`phases/P0-scaffold.md`** — package activates on `:3090`
2. [ ] P1 vertical slice: poll `/health` → route → pane shows reachable/unreachable/idle
3. [ ] P2 slot meat — the phase that justifies the project

## State / gotchas

- **Config = origin, never DSH `baseURL`** (`.../v1` → `/v1/slots` 404 while `/v1/health` 200 = silent-meatless, AC5b).
- **Key precedence:** explicit → env `LLAMA_API_KEY` → none. Never log/render the key. 1s poll healthy, ~10s on 401 (AC10).
- **No timestamps in `/slots`** → busy-age/TTFT latched host-side on `is_processing` false→true. Idle ≠ zero prompt tokens (~8369 retained) → use `is_processing`.
- **`/metrics` = enrichment only**, degrades invisibly. Counters lifetime, not per-request (AC12).
- **Placement:** rightbar tab **and** dock chip; chip hides while pane open (reference-counted `paneState`).
- **Backends:** llama.cpp full · Ollama thin (live, verifiable) · vLLM doc-sourced **unverified, excluded from acceptance**.
- **Styling:** match gpu-monitor exactly — `color-mix(currentColor)` theming, two-tier palette, `tabular-nums`, 3s stale dim. See `STYLE.md`.
- Vision currently OFF on the server (no `--mmproj`) while `settings.yaml` advertises `input: [text, image]`. Human aware, accepted for now. Do not restart to "fix".

Keep ≤55 lines.
