# `dsh-slot-health` — Status

**Updated:** 2026-09-25 ~15:00 — **P8 Ollama backend SPEC written (dry run, no code, nothing
Ollama was started/loaded).** Engine-display design + doc-grounded Ollama shapes. vLLM = stub.

Laws in **`AGENTS.md`** (auto-loaded); facts in **`ENV.md`**; style in `STYLE.md`; packaging
gotchas in SKILL "Corrections learned the hard way."

## P8 Ollama spec — DONE (design only)

- **`agent/specs/ollama-backend.md`** — the implementation spec. Grounded in the Ollama
  main-branch API reference + **read-only** probes of live `:11434` (Ollama 0.22.1).
- Key findings: Ollama has **no `/health` and no `/metrics`** (both 404) → oracle must be
  `GET /api/version`; has **no slots** → no busy/idle/wedged, `{"models":[]}` is its own honest
  "up, nothing loaded" state, a loaded model is **resident** (keep_alive 5m), not "busy".
- **Engine display (user ask):** `snapshot.backend` drives a pane-top label chip
  (`llama.cpp · full` / `ollama · limited` / `vllm · unverified`) + an engine-word prefix on the
  collapsed dock chip (`ollama · loaded`).
- Fingerprint by response shape (never guess); optional `config.backend` override (default auto).
- vLLM kept as a doc-sourced **stub** (not installed, excluded from acceptance).
- **Safety (hard rule):** never start/load/pull an Ollama model — it can OOM the agent's own
  process. `:11434` is probed GET-only; the human does the model load for acceptance.
- Docs wired: P8 pointer, NOTES decision entry. No code, no build, no tests touched.

## REVIEW2 §3 + dock chip — DONE (prior)

- `4812a74` cards (CollapsibleCard, per-slot + SERVER cards, `slotTone` wedged) · `385cc06` dock
  chip chrome copied from `GpuDockChip` (aligns both pills) · `b197687` docs. 83/83 tests.

## Environment (re-probed ~15:00)

- llama-server pid **419949** on `:8080` (key in env — never print). dsh `:3080` pid **440235**
  (human's — never restart). Acceptance `:3090` pid **454046** (token: `/tmp/dsh-3090.log` line 1).
- Ollama **live on `:11434`** (v0.22.1, 12 models in `/api/tags`, `/api/ps` empty) — read-only.

## Next 3

1. [ ] **Implement P8 slice 1–2**: `Backend` type + `backend`/`backendVersion` on the snapshot,
   pure fingerprint fn + unit tests (no I/O in the pure part).
2. [ ] **Implement P8 slice 3–5**: Ollama probe path + `OllamaSection`, pane-top engine chip,
   dock-chip engine prefix, Models card (reuse `CollapsibleCard`/`Row`).
3. [ ] pending-human: human loads a model in Ollama → confirm chip `ollama · up-loaded` + Models
   card with VRAM + "unloads in"; confirm no invented llama fields / no metrics card.

## pending-human

- REVIEW2 card-UX checklist (ACCEPTANCE.md). Real wedged-server observation. Ollama model-load
  (agent must NOT do it — OOM risk).

Keep ≤60 lines / ≤1k tokens. Rewrite, don't append.
