/**
 * Health collector: one GET of `{origin}/health`, mapped to a `HealthSnapshot`.
 *
 * This function **never throws** — every failure mode (refused, timeout, 5xx,
 * garbage body) becomes a snapshot, so the sampler can tick unconditionally.
 *
 * State table (see `agent/NOTES.md` "P1 snapshot semantics"):
 *   fetch throws / status ≥ 500            → unreachable
 *   2xx + JSON body `status === "ok"`      → idle
 *   anything else reachable (2xx/3xx/4xx)  → unknown
 */

import type { HealthSnapshot, EndpointState } from '../shared/types'

/** Probed path. P1 is /health only; slots and metrics come in later phases. */
const PROBE_PATH = '/health'
/** Per-probe timeout. Module constant on purpose — P1 has no config. */
const PROBE_TIMEOUT_MS = 2000

/**
 * Normalize a user-supplied origin into a base URL for probing.
 *
 * Traps handled (see `agent/ENV.md` endpoint matrix):
 *   - trailing slashes are stripped
 *   - a trailing `/v1` is stripped — llama-server serves `/health` at the
 *     process root, not under the OpenAI-compatible prefix
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
  const name = (err as { name?: string } | null)?.name
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

/**
 * Take one health sample of the endpoint rooted at `origin`.
 * Resolves for every input; only ever rejects if the host's `fetch` is
 * missing (impossible on the dsh host runtime, which is Node ≥ 18).
 */
export async function collectHealth(origin: string): Promise<HealthSnapshot> {
  const url = `${normalizeOrigin(origin)}${PROBE_PATH}`
  const t0 = performance.now()
  const sampledAt = () => Date.now()

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    const latencyMs = Math.round(performance.now() - t0)
    const status = res.status

    if (status >= 500) {
      return {
        ok: false,
        state: 'unreachable',
        latencyMs,
        lastError: `HTTP ${status}`,
        sampledAt: sampledAt(),
      }
    }

    // Reachable (2xx/3xx/4xx). Only a 2xx with the recognizable llama-server
    // shape counts as idle; everything else is reachable-but-unknown.
    let state: EndpointState = 'unknown'
    let lastError: string | null =
      status >= 400 ? `HTTP ${status} from ${PROBE_PATH}` : 'unrecognized /health response'

    if (status >= 200 && status < 300) {
      const text = await res.text()
      try {
        const body: unknown = JSON.parse(text)
        if (body !== null && typeof body === 'object' && (body as { status?: unknown }).status === 'ok') {
          state = 'idle'
          lastError = null
        }
      } catch {
        // Non-JSON body → stays unknown.
      }
    }

    return {
      ok: status >= 200 && status < 400,
      state,
      latencyMs,
      lastError,
      sampledAt: sampledAt(),
    }
  } catch (err) {
    return {
      ok: false,
      state: 'unreachable',
      latencyMs: null,
      lastError: describeFailure(err),
      sampledAt: sampledAt(),
    }
  }
}
