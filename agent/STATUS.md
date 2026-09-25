# `dsh-slot-health` — Status

**Updated:** 2026-09-25 ~11:30 UTC — **P8 DONE (slices 1–6)** + `:3090` reconnected.
Entry point for all P8 work: **`agent/specs/ollama-backend.md`**.

> ## ⚠️ HARD RULE (human, critical — do not violate)
> **NEVER start, load, or pull a model on ollama `:11434` — it OOMs the agent's own process.**
> Probe ollama **read-only** (GET `/api/version`, `/api/ps`, `/api/tags`) only. All Ollama
> verification against a loaded model is **pending-human**. Also in `AGENTS.md` "Never do these".

Laws in **`AGENTS.md`** (auto-loaded); facts in **`ENV.md`**; style in `STYLE.md`; packaging
gotchas in SKILL "Corrections learned the hard way."

## P8 slices (spec §8) — all done

1. [x] Types: `Backend`, `backend`/`backendVersion`/`ollama`, `OllamaLoadedModel`/
   `OllamaSection`, `up-no-model`/`up-loaded`.
2. [x] `fingerprint.ts` (pure; llama oracle = 0 extra probes; rule order llama→ollama→vllm).
3. [x] Ollama probe path (`/api/version` → `/api/ps` + `/api/tags`) + `ollama.ts` parsers.
4. [x] Engine display: dock prefix (`ollama · no model`), pane-top tag (`· ollama 0.22.1`).
5. [x] MODELS card (`{"models":[]}` → "no model", never error) + `12 in library` meta.
6. [x] README (Supported engines) + ACCEPTANCE P8 record (agent-verified + pending-human).

## Done this session

- `0b5fb60` P8 slices 1–5: 115/115 tests, tsc clean. Live read-only smoke: `:11434` →
  `up-no-model`/ollama 0.22.1/lib 12, chip `ollama · no model`; `:8080` → idle/llama-cpp.
- Slice 6: README + ACCEPTANCE. `:3090` reconnected: server pid **528259**,
  real `LLAMA_API_KEY` re-injected (never printed); served bundle has all P8
  markers; route → idle + real slots. Token: `/tmp/dsh-3090.log` line 1.
- P8 follow-up (header reorder, human request): pane header now stable-first
  `· llama.cpp  127.0.0.1:8080  ● busy 15s · dec 1` — engine+origin left,
  volatile state right. `bareStateWord()` strips the engine prefix so it never
  repeats. 118/118, tsc clean; served bundle re-verified (engine→origin→dot).

## Environment (re-probed now — old pids are DEAD)

- llama-server pid **525954** on `:8080` (key in its environ — never print). Ollama live
  `:11434` (v0.22.1, 12 models, nothing loaded). dsh `:3080` pid **526121** (human's —
  never restart; runs the OLD host bundle until human restarts it). Acceptance `:3090`
  pid **528259** (token: `/tmp/dsh-3090.log` line 1). Profile patch origin = `:8080`
  (`~/.dsh/profiles/web/cordis.patch.yml` wins over the checkout's).

## Next 3

1. [ ] pending-human: P8 UI checks (ACCEPTANCE.md) — esp. human loads an ollama model.
2. [ ] If asked: point `:3090` at `:11434` (edit profile patch + restart) for Ollama UI.
3. [ ] Watch for human `:3080` restart → new host bundle auto-applies.

## pending-human

- P8: ollama chip/pane/MODELS card (no-model now; loaded after human loads a model).
- REVIEW2 card-UX checklist. Real wedged observation.

Keep ≤60 lines / ≤1k tokens. Rewrite, don't append.
