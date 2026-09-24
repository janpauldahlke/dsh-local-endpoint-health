# P8 — Backend adapters: Ollama thin + vLLM doc-sourced

**Goal:** the same pane vocabulary across stacks, without ever pretending a thin backend has meat it lacks.

**Read:** this file only. **Not** `PLAN.md`.

**Requires:** P4 — thin backends must degrade through the existing error/state vocabulary.

---

## The three-tier honesty rule (Q7 / PLAN §11.1)

| Tier | Backend | Status |
| --- | --- | --- |
| 1 | llama.cpp | Full meat, verified on this host |
| 2 | **Ollama** | Thin, **verifiable tonight** (live on `:11434`) |
| 3 | **vLLM** | **Doc-sourced, NOT installed here — excluded from acceptance** |

The pane must make the tier **legible**. A user must never mistake tier 3 for verified, and must never see a llama `/slots` field invented for a backend that doesn't expose it.

## Architecture

One adapter interface, one shared snapshot type, one pane. The adapter reports **what it knows** and **what it cannot know**; the pane renders `unknown` for absent fields rather than fabricating them. Auto-detect the backend from response shape (or let config say), but never guess silently.

## Tier 2 — Ollama (verified live, v0.22.1)

Probed, not assumed:

| Endpoint | Result |
| --- | --- |
| `GET /api/version` | `{"version":"0.22.1"}` → cheap reachability + fingerprint |
| `GET /api/tags` | 200, 12 models; per-model keys: `details`, `digest`, `model`, `modified_at`, `name`, `size` |
| `GET /api/ps` | 200, **`{"models": []}`** — nothing loaded in VRAM at probe time |
| `GET /v1/models` | 200 (OpenAI-compat surface also present) |

**The `{"models": []}` result is the important one.** "Ollama is up, no model loaded" is a *distinct honest state* — it explains a non-responding chat better than `idle` does. Do not collapse it into `idle`, and do not render an empty list as an error.

**Do not load a model to test this.** Loading pulls weights onto the GPUs that serve the coding agent (sacred). Test against the live empty state; if you need a populated `/api/ps` shape, read it from Ollama's docs or the human — never by running a model.

What the thin adapter can honestly offer: reachable + latency, server version, **loaded models** (`/api/ps`: name, size, VRAM, expiry when present), model count from `/api/tags`. What it **cannot**: slot busy/free, prompt progress, decode count, TTFT, wedged detection. Say so in the pane ("no slot visibility on this backend") and in the README.

## Tier 3 — vLLM (from upstream docs; **not** installed here)

Verified absent on this host: no `vllm` binary, no Python module. So this adapter **cannot be executed**. Rules:

- Label it **doc-sourced / unverified on this host** in the README *and* in a code comment at the adapter.
- **Excluded from v0 acceptance criteria.** Do not claim it works; do not write a test that pretends to.
- Keep it behind the same interface so a future contributor with a vLLM instance can verify and promote it to tier 1 without restructuring.

Documented endpoints (confirm against current docs before writing — they move):
- `GET /health` — liveness only; checks an `engine_dead` boolean. **A 200 does not mean inference works.** A recent addition, `/health/ready`, runs a 1-token GPU forward pass; treat its absence as normal (version-dependent).
- `GET /metrics` — Prometheus, `vllm:` prefix. Useful gauges: `vllm:num_requests_running`, `vllm:num_requests_waiting` (queue depth — the closest analogue to llama's `requests_deferred`), `vllm:kv_cache_usage_perc` (**a 0–1 fraction, not a percentage** — multiplying by 100 is your job).
- **Documented gotcha:** vLLM started with `--disable-log-stats` returns an **empty** `/metrics` (200, no series). That must read as "no data", never as "idle".
- vLLM has **no `/slots` equivalent** — do not fake one. Busy/idle must come from the `num_requests_*` gauges, and the adapter must state that its notion of "busy" is weaker than llama's.

## Your call

- Adapter interface shape (this is the main design decision of the phase — keep it small; two or three methods, not a framework).
- How the pane discloses tier/backend ("llama.cpp · full", "ollama · limited", "vllm · unverified adapter").
- Whether backend detection is automatic, configured, or both.
- Generic-OpenAI fallback (`/v1/models` + latency only): worth including since it's testable against llama-server's own `/v1/models` (200). PLAN lists it as optional; your judgment on whether it's cheap enough to fold in.

## Verify

1. **AC13 Ollama:** point config at `http://127.0.0.1:11434` → pane shows reachable + version + the honest "no model loaded / no slot visibility" state. No crash, no invented slot data, no `idle` misreading.
2. Restore origin to llama → full meat returns, no residue from the Ollama snapshot.
3. **AC13 vLLM:** cannot be runtime-verified. Instead verify the *honesty*: README labels it doc-sourced, the code comment says unverified, no acceptance test claims it passes. Confirm the adapter degrades to state 5 ("reachable, not a known server") if pointed at something that isn't vLLM.
4. Confirm **no llama `/slots` field name appears in the Ollama or vLLM adapter output** unless genuinely populated (grep your own snapshot dumps).
5. Confirm the 0–1 vs percent handling for `kv_cache_usage_perc` is correct in code (a comment or test), since it's unverifiable at runtime here.

## Then

Commit. Update `STATUS.md`. Record the real Ollama payload shapes in `NOTES.md` — they're evidence, and `/api/ps` populated-shape is the one gap.

## Likely traps

- Inventing slot semantics for Ollama to make the pane look complete. The whole project's credibility rests on not doing this.
- Letting one adapter's failure break the others (isolate per-request, per-field, like gpu-monitor's sampler).
- Testing Ollama by loading a model → starves the coding agent's GPUs. **Forbidden.**
