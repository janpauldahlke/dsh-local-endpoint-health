/**
 * Shared snapshot types. Host produces a `HealthSnapshot`; the client polls
 * the plugin route for the latest one. Both halves import from here, so the
 * JSON shape is defined exactly once.
 *
 * Top-level endpoint state (from `{origin}/health`), stable since P1:
 *   unreachable — GET {origin}/health fails (refused / timeout / 5xx)
 *   idle        — /health → 200 with the recognizable llama-server shape
 *   unknown     — reachable, but not a recognizable server shape
 *
 * P2 adds per-slot state on top (see `SlotSample.state`), derived from
 * `is_processing` — never from token counts, because `n_prompt_tokens` reads
 * ~8369 while idle (retained context, not live work).
 *
 * P8 adds two Ollama states (spec: `agent/specs/ollama-backend.md` §5.3).
 * Ollama has no `/health` and no slots, so its honest states are expressed
 * via `/api/ps` (models resident in memory) — never via the llama vocabulary:
 *   up-no-model — Ollama reachable, `/api/ps` → `{"models":[]}` (up, nothing
 *                 loaded). A distinct honest state — not `idle`, not an error.
 *   up-loaded   — Ollama reachable, ≥1 model resident. "Loaded" means
 *                 *resident* (kept `keep_alive`, default 5 min), NOT busy.
 */

/**
 * P1 endpoint states. P2/P3 add slot-level states on top, not new top-level
 * ones. P8 adds the two Ollama states (see module header).
 */
export type EndpointState =
  | 'unreachable'
  | 'idle'
  | 'unknown'
  | 'up-no-model'
  | 'up-loaded'

/** Per-slot state, derived from `is_processing` only. */
export type SlotState = 'busy' | 'idle'

/**
 * P8: which engine family serves the endpoint. Fingerprinted from response
 * shape at probe time (spec: `agent/specs/ollama-backend.md` §3) — never
 * guessed silently:
 *   llama-cpp — `/health` → `{"status":"ok"}` and `/slots` → bare JSON array
 *   ollama    — `/api/version` → JSON object with a non-empty string `version`
 *   vllm      — `/health` → 2xx and `/metrics` → Prometheus text with a `vllm:` series
 *   unknown   — reachable, but none of the above shapes
 * The value is stable per endpoint (no per-tick churn) and drives the engine
 * label in the pane header and the engine word on the dock chip.
 */
export type Backend = 'llama-cpp' | 'ollama' | 'vllm' | 'unknown'

/**
 * One sample of a single llama-server slot (from `{origin}/slots`).
 *
 * All `*Ms` latch fields (`busySinceMs`, `busyAgeMs`, `ttftMs`) are computed
 * host-side (`host/latch.ts`), because the `/slots` payload contains no
 * timestamps. The collector emits them as `null`; the host sampler stamps the
 * real values on every tick. `null` means "not applicable right now", not 0.
 */
export interface SlotSample {
  /** The slot's `id` (llama-server slot index). */
  id: number
  /** Derived: `busy` iff `is_processing` is true, `idle` otherwise. */
  state: SlotState
  /** Raw `id_task`; changes per request. Exposed for debugging/latch evidence. */
  idTask: string | null
  /** `n_prompt_tokens` — total prompt tokens in the slot's context (retained while idle!). */
  promptTokens: number
  /** `n_prompt_tokens_processed` — how much of the prompt has been processed. */
  promptTokensProcessed: number
  /** `promptTokensProcessed / promptTokens` (0..1); null when there is no prompt to progress through. */
  promptProgress: number | null
  /** `n_prompt_tokens_cache` — prompt tokens served from cache (interesting during multi-turn prefill). */
  promptTokensCache: number
  /** `next_token[0].n_decoded` — decode tokens produced for this request. */
  decoded: number
  /** `next_token[0].n_remain` — estimated tokens left in this request (server estimate; -1/0 = unknown). */
  remain: number
  /** `next_token[0].has_next_token` — more tokens expected for the current request. */
  hasNextToken: boolean
  /** `n_ctx` — the slot's context window size. */
  contextSize: number
  /** Context in use ≈ `promptTokens + decoded` (llama-server reports no separate counter). */
  contextUsed: number
  /** `contextUsed / contextSize` (0..1); null when `contextSize` is not positive. */
  contextPressure: number | null
  /** Host-side latch: epoch ms when the current busy spell started; null while idle. */
  busySinceMs: number | null
  /** Host-side latch: `sampledAt - busySinceMs`; null while idle. */
  busyAgeMs: number | null
  /** Host-side latch: elapsed ms from busy start until the first `n_decoded > 0`; null until the first decode (cleared when idle). */
  ttftMs: number | null
  /** Raw `speculative` flag from the slot (drives the spec row in later phases). */
  speculative: boolean
}

/**
 * P8 (Ollama tier 2): one model currently resident in memory, from
 * `{origin}/api/ps`. All fields are nullable where the API omits them;
 * `size`/`sizeVram` are BYTES (client renders GiB). A model here is *loaded
 * (resident)*, not *busy* — Ollama keeps it for `keep_alive` (default 5 min)
 * after the last request, so the client must never label it "busy".
 */
export interface OllamaLoadedModel {
  /** `name`, e.g. `mistral:latest`. */
  name: string
  /** Total model size in bytes. */
  size: number
  /** Bytes resident in VRAM (`size_vram`); null when absent. */
  sizeVram: number | null
  /** RFC3339 time Ollama will unload the model (`expires_at`); null when absent. */
  expiresAt: string | null
  /** `details.family`, e.g. `llama`; null when absent. */
  family: string | null
  /** `details.parameter_size`, e.g. `7.2B`; null when absent. */
  parameterSize: string | null
  /** `details.quantization_level`, e.g. `Q4_0`; null when absent. */
  quantization: string | null
}

/**
 * P8 (Ollama tier 2): the Ollama surface of the snapshot — everything the
 * backend can honestly report (no `/metrics` exists, no slots exist). `null`
 * when the backend is not Ollama or the fetch has not succeeded yet.
 * `loaded: []` is a real state — "Ollama is up, nothing loaded" — never an
 * error; the client renders it as a single honest line, not an empty hole.
 */
export interface OllamaSection {
  /** True when this section reflects a `/api/ps` fetch made on the current tick. */
  fresh: boolean
  /** Short non-sensitive reason when not fresh (transient fetch failure); null when fresh. */
  error: string | null
  /** Models currently resident in memory (GET /api/ps). */
  loaded: OllamaLoadedModel[]
  /** Count of models in the local library (GET /api/tags); null when not fetched yet. */
  libraryCount: number | null
}

/**
 * One sample of the local endpoint's health. Produced by `host/collect.ts`,
 * stamped with latch values by `host/latch.ts`, served by the plugin route
 * (wrapped in `HealthRouteResponse`), consumed by the client poller.
 */
export interface HealthSnapshot {
  /** True when the HTTP request to {origin}/health completed with a 2xx/3xx status. */
  ok: boolean
  /** Derived state: unreachable (request failed), idle (200 + ok shape), unknown (reachable, wrong shape). */
  state: EndpointState
  /** P8: fingerprinted engine family (see `Backend`); `unknown` until a shape is recognized. */
  backend: Backend
  /** P8: engine version string when the fingerprint exposes one (Ollama `/api/version`); null otherwise. */
  backendVersion: string | null
  /** Round-trip latency in ms, measured only on completed requests (null when unreachable). */
  latencyMs: number | null
  /** Human-readable reason for the most recent failure; null when the last sample was fine. */
  lastError: string | null
  /** Wall-clock of the sample (epoch ms). Client renders "updated N s ago" from this. */
  sampledAt: number
  /**
   * Per-slot samples (P2). `null` — not an empty array — when `/slots` could
   * not be used: 401 (auth refused), 404 (endpoint does not expose slots),
   * 5xx, fetch failure, or an unrecognized payload. `slotsError` names which.
   * An empty array means the server answered with a genuine zero-slot list.
   */
  slots: SlotSample[] | null
  /** Non-sensitive reason when `slots` is null; never contains key material. */
  slotsError: string | null
  /**
   * P7 server-wide metrics. `null` (not an empty object) whenever there is
   * nothing to show: endpoint unreachable, `/metrics` capability not detected
   * (501/404/401 → rows hide permanently until a restart is detected), or the
   * first fetch has not succeeded yet. A transient fetch failure while the
   * capability is known-`yes` keeps the last good values with `fresh: false`.
   */
  metrics: MetricsSection | null
  /**
   * P8 (Ollama tier 2): Ollama surface (`/api/ps` loaded models + `/api/tags`
   * library count). `null` when the backend is not Ollama or no fetch has
   * succeeded yet. Ollama has no `/metrics` and no slots — never invent either.
   */
  ollama: OllamaSection | null
}

/**
 * P7: server-wide figures from `{origin}/metrics` (llama-server's Prometheus
 * endpoint, `llamacpp:*` series). Pure enrichment — `/slots` stays
 * authoritative for slot state, and every value here is `null`-able: the
 * client renders a row only for a non-null value, so the whole section can
 * vanish without leaving a layout hole.
 *
 * Rates are **derived from `_total` counter deltas** over the sample window,
 * not from the `*_tokens_seconds` gauges (which read `0` while idle — a `0`
 * is ambiguous between "idle" and "stuck"). `null` means "no meaningful
 * value right now", never zero.
 */
export interface MetricsSection {
  /** True when this section reflects a `/metrics` fetch made on the current tick. */
  fresh: boolean
  /** Short non-sensitive reason when not fresh (transient fetch failure); null when fresh. */
  error: string | null
  /**
   * Derived prompt-encoding rate (tokens/s) over `rateWindowMs`. `null` when
   * nothing moved in the window or the window is too small to be meaningful.
   */
  promptTokensPerSec: number | null
  /** Derived decode rate (tokens/s) over `rateWindowMs`; same rules as `promptTokensPerSec`. */
  tokensPerSec: number | null
  /** Window the rates were derived over, in ms (0 until the first baseline). */
  rateWindowMs: number
  /** Queue depth: `requests_deferred` (requests waiting behind an active one). */
  requestsDeferred: number | null
  /** In-flight requests: `requests_processing`. */
  requestsProcessing: number | null
  /** Context high-water since server start: `n_tokens_max`. */
  contextHighWater: number | null
  /**
   * Speculative-decode draft acceptance (accepted tokens / generated draft
   * tokens). `lifetime` is cumulative since server start; `lastRequest` is the
   * delta across the most recent completed request's `id_task` boundary (P2
   * latch). Both `null` when no draft tokens were generated (spec off, or no
   * completed request yet). Each figure carries its denominator (`sample` =
   * generated draft tokens), so the client can render "0.87 (n=30)" — a bare
   * ratio without n is untrustworthy (AC12).
   */
  draftAcceptance: { lifetime: DraftFigure | null; lastRequest: DraftFigure | null }
  /**
   * Mean accepted draft length (accepted tokens per draft attempt), same two
   * scopes as `draftAcceptance`; `sample` counts draft attempts.
   */
  draftMeanLen: { lifetime: DraftFigure | null; lastRequest: DraftFigure | null }
  /**
   * Per-position acceptance of the last completed request
   * (position → accepted/generated). `[]` — not `null` — when no request has
   * completed or one completed with no per-position movement; the client
   * renders nothing for an empty list. MTP diagnostic; optional to render.
   */
  perPosLastRequest: { position: number; acceptance: number }[]
}

/**
 * A ratio plus its denominator. `value` is the ratio itself; `sample` is the
 * count of the denominator (draft tokens generated, or draft attempts) so the
 * client can show how much data backs the figure.
 */
export interface DraftFigure {
  value: number
  sample: number
}

/**
 * What the plugin route actually serves: a snapshot plus a route-level field
 * the pane uses to label which endpoint the host is sampling. The host adds
 * it at serve time; it is not part of the sample itself.
 */
export interface HealthRouteResponse extends HealthSnapshot {
  /** The origin the host is sampling (validated config value). */
  origin: string
}
