# Ollama Backend Spec (Tier 2) + Engine Display

**Status:** dry-run spec (designed, NOT implemented). **Read before implementing P8.**

**Safety rule (do not break):** do **not** start, load, pull, or query a model on
`ollama` (`:11434` or anywhere). Loading puts weights onto the GPUs that serve the
coding agent and can OOM the agent's own process. The live `:11434` is used
**read-only** (GET only: `/api/version`, `/api/ps`, `/api/tags`). Never POST
`/api/generate`, `/api/chat`, `/api/load`. This spec was written against the
upstream docs plus those read-only probes.

**Scope:** Ollama is the real, verifiable Tier 2 adapter. **vLLM is a stub** —
documented from upstream docs only, not implemented, not in acceptance, and kept
behind the same interface so it can be promoted to Tier 1 later without
restructuring.

---

## 1. Source of truth (what this spec is grounded in)

- Ollama upstream API reference, main branch (`docs/api.md`, "Ollama's API docs are
  moving to https://docs.ollama.com/api"): endpoint list + exact response shapes.
- Live `:11434` running **Ollama 0.22.1**, probed **read-only**:

  | Probe | Result |
  | --- | --- |
  | `GET /` | 200, plain text `Ollama is running` (not JSON) |
  | `GET /health` | **404** — no `/health` endpoint |
  | `GET /metrics` | **404** — no Prometheus endpoint |
  | `GET /api/version` | `{"version":"0.22.1"}` |
  | `GET /api/ps` | `{"models":[]}` (empty = nothing loaded) |
  | `GET /api/tags` | 12 models; keys `name,model,modified_at,size,digest,details`; `details` keys `parent_model,format,family,families,parameter_size,quantization_level` |

---

## 2. Facts that drive the design (the honesty constraints)

1. **Ollama has no `/health` and no Prometheus `/metrics`.** The current
   collector's reachability oracle is `GET {origin}/health`, which 404s on Ollama.
   The adapter needs its own cheap oracle (see §3) — it must **not** route Ollama
   through the llama `/health` path.
2. **Ollama has no concept of "slots."** There is no per-slot busy/idle, no
   `is_processing`, no `n_prompt_tokens_processed`, no decode count, no TTFT, no
   wedged detection. The llama slot vocabulary **cannot** be applied without
   fabricating fields the backend doesn't expose (P8 three-tier honesty rule).
3. **"Model loaded" ≠ "busy."** `/api/ps` lists models currently resident in
   memory. A loaded model stays resident for `keep_alive` (default **5m**) after
   the last request. So "loaded" is a *resident* state, not a *processing* state.
   It is the closest thing Ollama offers to "busy" and **must** be labeled
   `loaded` (in memory), never `busy`.
4. **`{"models": []}` is a distinct honest state** — "Ollama is up, nothing
   loaded." It explains a non-responding chat better than `idle`. Do **not**
   collapse it into `idle`, and do **not** render an empty list as an error.
5. **Units:** `size` / `size_vram` are **bytes** (not MiB). Per-request durations
   (in completion responses, not needed for the thin pane) are **nanoseconds**.
   RFC3339 timestamps for `expires_at`.

---

## 3. Engine fingerprinting (how to know which engine is serving)

Fingerprint from **response shape**, never guess silently. Probes are cheap GETs.
Evaluate in order; first match wins. All probes are read-only and must never
load a model.

| # | Engine | Fingerprint (all must hold) | Notes |
| --- | --- | --- | --- |
| 1 | **llama.cpp** | `GET /health` → 2xx JSON with `status === "ok"` **and** `GET /slots` → bare JSON array | existing P1/P2 oracle; Tier 1 |
| 2 | **ollama** | `GET /api/version` → 2xx JSON object with a non-empty string `version` field | Ollama-specific; no other backend serves `/api/version` with this shape; Tier 2 |
| 3 | **vllm** (stub) | `GET /health` → 2xx (empty or JSON) **and** `GET /metrics` → Prometheus text containing a `vllm:` series | doc-sourced, Tier 3, not in acceptance |
| 4 | **unknown** | none of the above | reachable-but-unrecognized; keep the existing `unknown` state |

The fingerprint result is stored on the snapshot as `backend` (see §5) and drives
both the pane top label and the collapsed dock chip (§4).

**Config override (optional, later):** allow `config.backend: auto | llama-cpp |
ollama | vllm`. `auto` = fingerprint. An explicit value skips fingerprinting for
that endpoint (useful if a proxy mangles shapes). Default stays `auto`.

---

## 4. Engine display (the user-visible ask)

Show **which engine is running the model** in two places, both fed by
`snapshot.backend` so they can never disagree (same rule as the chip/pane state).

### 4.1 Pane top (rightbar, above the cards)
A small label chip in the flat header row, next to the state dot + origin. Render
the engine name with a short tier hint so a thin backend is never mistaken for
the full llama view:

| backend | Label |
| --- | --- |
| `llama-cpp` | `llama.cpp · full` |
| `ollama` | `ollama · limited` |
| `vllm` | `vllm · unverified` |
| `unknown` | `unknown engine` |

- `limited` (ollama) and `unverified` (vllm) make the P8 tier **legible** — the
  user must never mistake a thin/doc-sourced backend for verified.
- When `ollama`, add the version after a dot: `ollama 0.22.1 · limited`
  (`backendVersion` is known for ollama; null for the others in v0).

### 4.2 Collapsed dock chip
The dock chip currently renders a stable state word (`idle` / `busy` / `down` …).
Prefix the **engine word** so the engine is visible even when the pane is closed:

- `ollama` (chip) — engine word first, then the existing stable state word after
  a `·`, e.g. `ollama · loaded` / `ollama · down`.
- Keep the chip **stable-width** (no per-second widening): the engine word is
  constant for a given endpoint, and the state word is already the stable short
  label. No live numbers in the chip (REVIEW §2c rule still applies).
- Use the existing `STATE_DOT` color for the state dot; the engine word is neutral
  ink (currentColor), not a new color, so it reads as a prefix, not a second state.

---

## 5. Data model

### 5.1 New shared type
```ts
/** Which engine family is serving the endpoint (fingerprinted, never guessed). */
export type Backend = 'llama-cpp' | 'ollama' | 'vllm' | 'unknown'
```

Add to `HealthSnapshot`:
```ts
/** Fingerprinted engine family for this endpoint (see agent/specs/ollama-backend.md §3). */
backend: Backend
/** Engine version string when the fingerprint exposes one (ollama `/api/version`); null otherwise. */
backendVersion: string | null
```

### 5.2 New Ollama section (Tier 2 surface — what it CAN honestly show)
```ts
export interface OllamaLoadedModel {
  name: string                 // e.g. "mistral:latest"
  size: number                 // bytes (total)
  sizeVram: number | null      // bytes resident in VRAM; null if absent
  expiresAt: string | null     // RFC3339; when Ollama will unload it (keep_alive)
  family: string | null        // details.family, e.g. "llama"
  parameterSize: string | null // details.parameter_size, e.g. "7.2B"
  quantization: string | null  // details.quantization_level, e.g. "Q4_0"
}
export interface OllamaSection {
  /** True when this reflects a /api/ps + /api/tags fetch made on the current tick. */
  fresh: boolean
  error: string | null
  /** Models currently resident in memory (from GET /api/ps). [] = up, nothing loaded. */
  loaded: OllamaLoadedModel[]
  /** Count of models in the local library (from GET /api/tags); null if not fetched. */
  libraryCount: number | null
}
```
Add `ollama: OllamaSection | null` to `HealthSnapshot` (null when backend ≠ ollama
or the fetch has not succeeded).

### 5.3 Ollama endpoint state (honest, no fabricated slots)
The thin adapter reports **what it knows**:
- `unreachable` — probe failed (refused / timeout / 5xx).
- `up-no-model` — Ollama reachable, `/api/ps` → `{"models":[]}`. **Distinct honest
  state**, not `idle`, not an error.
- `up-loaded` — Ollama reachable, ≥1 model resident.
- `unknown` — reachable but not recognizable as Ollama.

These map onto the existing top-level `EndpointState` by adding the two Ollama
states, OR by reusing `idle`/`unknown` + a `backend` field + the `OllamaSection`.
**Decision (your call when implementing):** prefer adding `up-no-model` /
`up-loaded` as real states so the pane can say exactly what it means; keep
`busy`/`wedged` llama-only and never emit them for Ollama.

---

## 6. Ollama adapter — probe plan (read-only, no model load)

Poll at the existing cadence (~1 Hz for state; heavier fields can be slower):

| What | Endpoint | Cost | Refresh |
| --- | --- | --- | --- |
| Reachability + version (oracle + fingerprint) | `GET /api/version` | tiny JSON | every tick |
| Loaded models (resident VRAM, name, expiry) | `GET /api/ps` | small JSON | every tick |
| Library count | `GET /api/tags` | larger (12 models) | every N ticks (e.g. 30 s) or on change |

Rules:
- The **oracle is `/api/version`**, not `/health` (which 404s). If `/api/version`
  is down → `unreachable`.
- Parse `/api/ps` defensively: a missing `models` key or non-array → treat as
  empty, never throw (REVIEW §1 coercion rule). `size_vram` / `expires_at` /
  `details.*` are all nullable.
- `/api/tags` only for a count (and optionally the names) — do not ship the full
  library into the snapshot.
- Never send an Authorization header requirement: Ollama has no Bearer auth on
  these GETs (a misconfigured key must not break the adapter).

### 6.1 Pane rendering for Ollama (what the user sees)
- Header: state dot + `up-loaded` / `up-no-model` label + origin + `ollama 0.22.1 · limited`.
- A **Models** card (not a slot card) listing each loaded model:
  `name · parameterSize · quantization · sizeVram (GB) · unloads in <age>`.
  `unloads in` = `expires_at - now`, using the shared `ageLabel` formatter; if
  absent, omit the column.
- When `{"models":[]}`: the Models card shows a single honest line
  `no model loaded (Ollama is up)` — not an error, not an empty hole.
- A muted note line: `no slot visibility on this backend — Ollama exposes no
  per-request /slots data`. (P8 rule: say so in the pane.)
- No metrics card (Ollama has no `/metrics`). Do **not** invent one.

---

## 7. vLLM (stub — doc-sourced, NOT implemented, NOT in acceptance)

Documented from upstream docs only; **no vLLM is installed on this host**, so the
adapter **cannot be executed** and must not be claimed to work. Keep it behind the
same `Backend` interface so a future contributor with a vLLM instance can verify
and promote it without restructuring.

Documented surface (confirm against current docs before implementing — they move):
- `GET /health` — liveness only; **200 does not mean inference works**.
- `GET /health/ready` — runs a 1-token GPU forward pass; treat its **absence as
  normal** (version-dependent).
- `GET /metrics` — Prometheus text, `vllm:` prefix. Useful gauges:
  `vllm:num_requests_running`, `vllm:num_requests_waiting` (queue depth),
  `vllm:kv_cache_usage_perc` (**a 0–1 fraction, not a percent** — ×100 is our job).
- **Gotcha:** vLLM started with `--disable-log-stats` returns an **empty**
  `/metrics` (200, no series) — must read as "no data", never "idle".
- vLLM has **no `/slots` equivalent** — do not fake one. Busy/idle, if ever shown,
  must come from the `num_requests_*` gauges and be labeled weaker than llama's.

Label it `doc-sourced / unverified on this host` in the README and in a code
comment at the adapter. Excluded from v0 acceptance.

---

## 8. Implementation slices (suggested order, each verifiable + committed)

1. `shared/types.ts`: add `Backend`, `backend`/`backendVersion` to `HealthSnapshot`
   (and the Ollama types from §5). Backward-compatible: old clients ignore new
   fields.
2. Host: fingerprint function (pure, unit-tested) — takes the probe results and
   returns `Backend` + `backendVersion`. No I/O in the pure part.
3. Host: Ollama probe path (oracle = `/api/version`, then `/api/ps`, then
   `/api/tags` for the count) producing `OllamaSection`. Defensive parsing.
4. Client: engine label in the pane header (§4.1) + engine prefix in the dock chip
   (§4.2). Both read `snapshot.backend`.
5. Client: Models card for Ollama (§6.1). Reuse `CollapsibleCard` + `Row` so the
   chrome is identical to the llama cards.
6. README + ACCEPTANCE: Ollama = Tier 2 "limited", vLLM = Tier 3 "unverified",
   plus the pending-human live-Ollama checklist (see below).

### pending-human (do NOT run during agent work)
- Point a session at `http://127.0.0.1:11434`, confirm the chip reads
  `ollama · up-no-model` (or `up-loaded`) and the pane shows `ollama 0.22.1 ·
  limited` + the Models card.
- **Human** loads a model in Ollama (safe for them; not for the agent), then
  confirm the Models card shows the model with VRAM + "unloads in".
- Confirm no llama fields are invented and no metrics card appears for Ollama.
