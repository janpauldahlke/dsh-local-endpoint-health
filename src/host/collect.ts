/**
 * Health collector: one GET of `{origin}/health` (P1) plus one GET of
 * `{origin}/slots` (P2), mapped to a `HealthSnapshot`.
 *
 * This function **never throws** — every failure mode (refused, timeout, 5xx,
 * 401 on /slots, garbage body) becomes a snapshot, so the sampler can tick
 * unconditionally.
 *
 * State table (see `agent/NOTES.md` "P1 snapshot semantics"):
 *   fetch throws / status ≥ 500            → unreachable
 *   2xx + JSON body `status === "ok"`      → idle
 *   anything else reachable (2xx/3xx/4xx)  → unknown
 *
 * P8 engine fingerprint (see `agent/specs/ollama-backend.md`): the /health
 * oracle shape doubles as the llama-cpp fingerprint, so a llama endpoint pays
 * no extra probes. Only a non-llama endpoint gets a small `GET /api/version`
 * (Ollama oracle) and, still unmatched with a 2xx /health, a `GET /metrics`
 * read (vLLM stub). Once Ollama is identified, `/api/ps` + `/api/tags` are
 * probed and the state becomes the honest `up-loaded` / `up-no-model`.
 *
 * P2 slot semantics (see `agent/NOTES.md` "P2 latch design"):
 *   - `/slots` returns a **bare JSON array** of slot objects;
 *   - the only busy/idle source of truth is `is_processing` — token counts
 *     say nothing (`n_prompt_tokens` reads ~8369 while idle);
 *   - `/slots` may sit behind a Bearer token: a 401 is "auth required",
 *     **not** unreachable (AC4). The key is passed in via `opts.apiKey`,
 *     never logged, never placed in any snapshot field;
 *   - busy age / TTFT are latched host-side (`host/latch.ts`); the collector
 *     emits those fields as `null`.
 */

import type { EndpointState, HealthSnapshot, OllamaLoadedModel, SlotSample } from '../shared/types'
import { fingerprintBackend, looksLikeVllmMetrics, parseOllamaVersion } from './fingerprint'
import { parseOllamaPs, parseOllamaTagsCount } from './ollama'

/** Probed paths. P1 is /health only; slots join in P2; P8 adds the fingerprints. */
const HEALTH_PATH = '/health'
const SLOTS_PATH = '/slots'
/** P8 (Ollama): `GET /api/version` → `{"version":"…"}` — Ollama's reachability oracle too. */
const API_VERSION_PATH = '/api/version'
/** P8 (Ollama): models currently resident in memory (drives up-loaded/up-no-model). */
const API_PS_PATH = '/api/ps'
/** P8 (Ollama): local library (count only). */
const API_TAGS_PATH = '/api/tags'
/** P8 (vLLM stub): Prometheus text with a `vllm:` series. */
const METRICS_PATH = '/metrics'
/** Per-probe timeout. Module constant on purpose — P2 has no config. */
const PROBE_TIMEOUT_MS = 2000

/**
 * Normalize a user-supplied origin into a base URL for probing.
 *
 * Traps handled (see `agent/ENV.md` endpoint matrix):
 *   - trailing slashes are stripped
 *   - a trailing `/v1` is stripped — llama-server serves `/slots` at the
 *     process root, not under the OpenAI-compatible prefix. (Also applied at
 *     the config boundary in `config.ts`; doing it here again is idempotent
 *     and keeps this function safe when called directly.)
 *   - a bare `host:port` gets `http://` prepended
 */
export function normalizeOrigin(origin: string): string {
  let s = origin.trim().replace(/\/+$/, '')
  if (s.endsWith('/v1')) s = s.slice(0, -'/v1'.length)
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`
  return s
}

function describeFailure(err: unknown): string {
  // Node's fetch rejects timeouts with a TimeoutError (or an AbortError
  // cause); refused connections arrive as TypeError "fetch failed" with
  // the real errno on `cause.code`.
  const name = (err as { name?: unknown } | null)?.name
  const cause = (err as { cause?: unknown } | null)?.cause as
    | { code?: string; message?: string }
    | undefined
  if (name === 'TimeoutError' || name === 'AbortError' || cause?.code === 'ETIMEDOUT') {
    return `timed out after ${PROBE_TIMEOUT_MS} ms`
  }
  switch (cause?.code) {
    case 'ECONNREFUSED':
      return 'connection refused'
    case 'ECONNRESET':
      return 'connection reset'
    case 'ENOTFOUND':
      return 'host not found'
    default:
      break
  }
  const msg = cause?.message || (err instanceof Error ? err.message : String(err))
  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg
}

/** Defensive number: finite numbers pass through, anything else → 0. */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Parse one slot object from the bare-array `/slots` payload.
 *
 * `null` when the object has no usable `id` (the latch map is keyed by slot
 * id; an id-less slot is unusable). The slot's `id` passes through as-is
 * (coerced from number/string) — it is the server's own index.
 */
function parseSlot(raw: unknown): SlotSample | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Record<string, unknown>
  const idRaw = s.id
  const id = typeof idRaw === 'number' && Number.isFinite(idRaw)
    ? idRaw
    : typeof idRaw === 'string' && idRaw.trim() !== ''
      ? Number(idRaw)
      : null
  if (id === null || !Number.isFinite(id)) return null

  const promptTokens = num(s.n_prompt_tokens)
  const promptTokensProcessed = num(s.n_prompt_tokens_processed)
  const promptProgress =
    promptTokens > 0 && promptTokensProcessed >= 0
      ? Math.min(1, promptTokensProcessed / promptTokens)
      : null
  const contextSize = num(s.n_ctx)
  const nextToken = Array.isArray(s.next_token)
    ? (s.next_token[0] as Record<string, unknown> | undefined) ?? {}
    : {}
  const decoded = num(nextToken.n_decoded)
  const contextUsed = promptTokens + decoded
  const contextPressure = contextSize > 0 ? Math.min(1, contextUsed / contextSize) : null

  return {
    id,
    // The ONLY busy/idle source of truth is `is_processing` (NOTES.md "the
    // idle detection trap").
    state: s.is_processing === true ? 'busy' : 'idle',
    idTask: typeof s.id_task === 'string' ? s.id_task : null,
    promptTokens,
    promptTokensProcessed,
    promptProgress,
    promptTokensCache: num(s.n_prompt_tokens_cache),
    decoded,
    remain: num(nextToken.n_remain),
    hasNextToken: nextToken.has_next_token === true,
    contextSize,
    contextUsed,
    contextPressure,
    // Host-side latches — stamped by stampSlotLatches() in index.ts.
    busySinceMs: null,
    busyAgeMs: null,
    ttftMs: null,
    speculative: s.speculative === true,
  }
}

/** Parse the bare-array `/slots` payload; malformed shapes → null. */
function parseSlots(payload: unknown): SlotSample[] | null {
  if (!Array.isArray(payload)) return null
  const slots: SlotSample[] = []
  for (const raw of payload) {
    const slot = parseSlot(raw)
    if (slot !== null) slots.push(slot)
  }
  return slots
}

/** One completed (or failed) HTTP probe. `body` is null when no body arrived. */
interface ProbeResult {
  status?: number
  body: unknown
  error?: string
}

async function probe(url: string, apiKey: string | undefined): Promise<ProbeResult> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (apiKey !== undefined && apiKey !== '') headers.authorization = `Bearer ${apiKey}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    })
    const text = await res.text()
    let body: unknown = null
    if (text.length > 0) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text // non-JSON (e.g. an HTML error page) — kept for diagnostics
      }
    }
    return { status: res.status, body }
  } catch (err) {
    return { body: null, error: describeFailure(err) }
  }
}

/**
 * P8 (Ollama): probe the reporting surface and fill the snapshot.
 * `/api/ps` drives the state — a successful fetch yields `up-loaded` (≥1
 * model) or `up-no-model` (none), and the misleading `404 from /health` error
 * line is cleared (the endpoint IS recognized; that 404 is Ollama not having
 * a /health, not a fault). A failed or malformed `/api/ps` keeps state
 * `unknown` with the section `fresh: false` — the resident-state claim simply
 * cannot be made. `/api/tags` is count-only enrichment and never affects state.
 */
async function fetchOllamaSection(base: string, snapshot: HealthSnapshot): Promise<void> {
  const ps = await probe(`${base}${API_PS_PATH}`, undefined)
  let loaded: OllamaLoadedModel[] | null = null
  let psError: string | null = null
  if (ps.error !== undefined) {
    psError = `GET ${API_PS_PATH} failed: ${ps.error}`
  } else if (ps.status === undefined || ps.status < 200 || ps.status >= 300) {
    psError = `HTTP ${ps.status} from ${API_PS_PATH}`
  } else {
    loaded = parseOllamaPs(ps.body)
    if (loaded === null) psError = `unrecognized ${API_PS_PATH} payload`
  }

  let libraryCount: number | null = null
  const tags = await probe(`${base}${API_TAGS_PATH}`, undefined)
  if (tags.error === undefined && tags.status !== undefined && tags.status >= 200 && tags.status < 300) {
    libraryCount = parseOllamaTagsCount(tags.body)
  }

  if (loaded === null) {
    snapshot.ollama = { fresh: false, error: psError, loaded: [], libraryCount }
  } else {
    snapshot.ollama = { fresh: true, error: null, loaded, libraryCount }
    snapshot.state = loaded.length > 0 ? 'up-loaded' : 'up-no-model'
    snapshot.lastError = null
  }
}

/** Shared shape for every unreachable sample (engine unknown, no sections). */
function unreachableSnapshot(lastError: string, latencyMs: number | null): HealthSnapshot {
  return {
    ok: false,
    state: 'unreachable',
    backend: 'unknown',
    backendVersion: null,
    latencyMs,
    lastError,
    sampledAt: Date.now(),
    slots: null,
    slotsError: null,
    metrics: null,
    ollama: null,
  }
}

export interface CollectOptions {
  /**
   * Bearer token for the privileged `/slots` endpoint (P2). Absent or empty →
   * no Authorization header is sent; a 401 from `/slots` then surfaces as
   * "auth required". **Never logged, never placed in a snapshot field.**
   */
  apiKey?: string
}

/**
 * Take one health sample of the endpoint rooted at `origin`.
 * Resolves for every input; only ever rejects if the host's `fetch` is
 * missing (impossible on the dsh host runtime, which is Node ≥ 18).
 */
export async function collectHealth(origin: string, opts: CollectOptions = {}): Promise<HealthSnapshot> {
  const base = normalizeOrigin(origin)
  const t0 = performance.now()

  // --- /health (reachability oracle, no auth needed) ---
  const health = await probe(`${base}${HEALTH_PATH}`, undefined)
  const latencyMs = Math.round(performance.now() - t0)

  if (health.error !== undefined) {
    return unreachableSnapshot(health.error, null)
  }

  const status = health.status as number
  if (status >= 500) {
    return unreachableSnapshot(`HTTP ${status} from ${HEALTH_PATH}`, latencyMs)
  }

  // Reachable (2xx/3xx/4xx). Only a 2xx with the recognizable llama-server
  // shape counts as idle; everything else is reachable-but-unknown.
  let state: EndpointState = 'unknown'
  let lastError: string | null =
    status >= 400 ? `HTTP ${status} from ${HEALTH_PATH}` : 'unrecognized /health response'

  // P8: `healthOk` — the /health oracle (2xx + JSON `status === "ok"`). It
  // both defines state `idle` and IS the llama-cpp fingerprint (see below),
  // so a llama endpoint pays no extra probes.
  let healthOk = false
  if (status >= 200 && status < 300) {
    let body: unknown = health.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        // Non-JSON body → stays unknown.
      }
    }
    if (body !== null && typeof body === 'object' && (body as { status?: unknown }).status === 'ok') {
      healthOk = true
      state = 'idle'
      lastError = null
    }
  }

  const snapshot: HealthSnapshot = {
    ok: status >= 200 && status < 400,
    state,
    backend: 'unknown',
    backendVersion: null,
    latencyMs,
    lastError,
    sampledAt: Date.now(),
    slots: null,
    slotsError: null,
    metrics: null,
    ollama: null,
  }

  // --- /slots (privileged; probed only when /health answered 2xx/3xx) ---
  if (snapshot.ok) {
    const slots = await probe(`${base}${SLOTS_PATH}`, opts.apiKey)
    if (slots.error !== undefined) {
      snapshot.slotsError = `GET ${SLOTS_PATH} failed: ${slots.error}`
    } else if (slots.status === 401) {
      // AC4: auth required is NOT unreachable. The endpoint row stays at its
      // /health-derived state; the pane shows "slots unavailable: auth required".
      snapshot.slotsError = 'auth required (401) — set LLAMA_API_KEY'
    } else if (slots.status === 404) {
      snapshot.slotsError = 'endpoint does not expose /slots (404)'
    } else if (slots.status !== undefined && slots.status >= 400) {
      snapshot.slotsError = `HTTP ${slots.status} from ${SLOTS_PATH}`
    } else {
      const parsed = parseSlots(slots.body)
      if (parsed === null) {
        snapshot.slotsError = 'unrecognized /slots payload (expected a JSON array)'
      } else {
        snapshot.slots = parsed
      }
    }
  }

  // --- P8 engine fingerprint (spec: agent/specs/ollama-backend.md §3) ---
  // The llama oracle is the /health shape itself, so llama-cpp needs no extra
  // probe. Non-llama endpoints pay at most one small GET (`/api/version`,
  // Ollama) plus — still unmatched with a 2xx /health — one `/metrics` read
  // (the vLLM stub check). Ollama has no /health (404) so it lands here.
  if (!healthOk) {
    let ollamaVersion: string | null = null
    const apiVersion = await probe(`${base}${API_VERSION_PATH}`, undefined)
    if (apiVersion.status !== undefined && apiVersion.status >= 200 && apiVersion.status < 300) {
      ollamaVersion = parseOllamaVersion(apiVersion.body)
    }

    let vllmMetrics = false
    if (ollamaVersion === null && status >= 200 && status < 300) {
      const metrics = await probe(`${base}${METRICS_PATH}`, undefined)
      if (metrics.status !== undefined && metrics.status >= 200 && metrics.status < 300) {
        vllmMetrics = looksLikeVllmMetrics(metrics.body)
      }
    }

    const fingerprint = fingerprintBackend({ healthOk, ollamaVersion, vllmMetrics })
    snapshot.backend = fingerprint.backend
    snapshot.backendVersion = fingerprint.version

    // Ollama identified: probe its reporting surface and express the honest
    // states (up-loaded / up-no-model) — see fetchOllamaSection.
    if (snapshot.backend === 'ollama') {
      await fetchOllamaSection(base, snapshot)
    }
  } else {
    snapshot.backend = 'llama-cpp'
  }

  return snapshot
}
