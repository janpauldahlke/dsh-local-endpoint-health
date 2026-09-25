# `dsh-slot-health` — Status

**Updated:** 2026-09-25 ~15:45 — **P8 slices 1–5 DONE + verified live** (next commit).
Entry point for all P8 work: **`agent/specs/ollama-backend.md`**.

> ## ⚠️ HARD RULE (human, critical — do not violate)
> **NEVER start, load, or pull a model on ollama `:11434` — it OOMs the agent's own process.**
> Probe ollama **read-only** (GET `/api/version`, `/api/ps`, `/api/tags`) only. All Ollama
> verification against a loaded model is **pending-human**. Also in `AGENTS.md` "Never do these".

Laws in **`AGENTS.md`** (auto-loaded); facts in **`ENV.md`**; style in `STYLE.md`; packaging
gotchas in SKILL "Corrections learned the hard way."

## In flight — P8 Ollama (slices per spec §8)

1. [x] Slice 1: `src/shared/types.ts` — `Backend`, `backend`/`backendVersion`/`ollama` on
   `HealthSnapshot`, `OllamaLoadedModel`/`OllamaSection`, `up-no-model`/`up-loaded` states.
2. [x] Slice 2: `src/host/fingerprint.ts` — pure `fingerprintBackend`/`parseOllamaVersion`/
   `looksLikeVllmMetrics`; wired into `collect.ts` (llama = /health oracle, 0 extra probes).
3. [x] Slice 3: Ollama probe path — `/api/version` oracle → `/api/ps` + `/api/tags` →
   `OllamaSection`; `src/host/ollama.ts` defensive parsers; `up-loaded`/`up-no-model` states.
4. [x] Slice 4: engine display — dock chip prefix (`ollama · no model`), pane-top tag
   (`· ollama 0.22.1`, spec §4.1), `backendWord`/`backendLabel` pure fns, STATE_COLOR/DOT.
5. [x] Slice 5: Models card (`OllamaCard` in SlotBody; `{"models":[]}` → "no model loaded",
   never an error) + library-count meta from /api/tags.
6. [ ] Slice 6: README + ACCEPTANCE (ollama = Tier 2 "limited", vllm = stub "unverified").

## Done this session

- P8 slices 1–5: fingerprint by shape (never guess), Ollama read-only probe path, honest
  `up-no-model`/`up-loaded` states, engine in chip + pane, MODELS card. 115/115 tests; tsc
  clean. **Live smoke (read-only):** `:11434` → `up-no-model`, backend `ollama` v0.22.1,
  library 12; `:8080` → `idle`/`llama-cpp` unchanged (no regression).
- `cb0a45c` P8 spec · `385cc06` dock chip chrome · `4812a74` REVIEW2 cards.

## Environment (re-probed ~15:45)

- llama-server pid **419949** on `:8080` (key in env — never print). dsh `:3080` pid **440235**
  (human's — never restart). Acceptance `:3090` pid **454046** (token: `/tmp/dsh-3090.log` line 1).
- Ollama **live on `:11434`** (v0.22.1; `/api/tags` 12 models; `/api/ps` empty; no `/health`,
  no `/metrics` — both 404). Read-only access only.

## Next 3

1. [ ] Commit P8 slices 1–5.
2. [ ] Slice 6: README + ACCEPTANCE updates (Tier 2 honest + vLLM stub + pending-human list).
3. [ ] Refresh acceptance `:3090` bundle so the human can see the chip/pane (no :3080 touch).

## pending-human

- REVIEW2 card-UX checklist (ACCEPTANCE.md). Real wedged observation. **Ollama model-load +
  verify Models card** (agent must NOT load — OOM risk).

Keep ≤60 lines / ≤1k tokens. Rewrite, don't append.
