/**
 * P8: engine fingerprinting — pure classification of which backend family
 * serves an endpoint, from probe results. Spec: `agent/specs/ollama-backend.md` §3.
 *
 * Fingerprint by response shape, **never guess silently**. No I/O in this
 * module: the collector decides which probes to fire (later probes depend on
 * earlier results) and passes the results here. First matching rule wins:
 *
 *   1. llama-cpp — `/health` → 2xx JSON `{"status":"ok"}` (the P1 oracle that
 *      already defines state `idle`; the `/slots` probe is not a requirement —
 *      an authed llama-server 401s `/slots` and must still read as llama)
 *   2. ollama    — `/api/version` → 2xx JSON object with a non-empty string
 *      `version` field (Ollama-specific; no other backend serves this shape)
 *   3. vllm      — `/metrics` → 2xx Prometheus text containing a `vllm:` series
 *      (doc-sourced stub, Tier 3 — see the spec)
 *   4. unknown   — none of the above
 *
 * `backendVersion` is non-null only when the fingerprint itself exposes a
 * version (Ollama's `/api/version`); null otherwise.
 */

import type { Backend } from '../shared/types'

/** Probe outcomes the fingerprint needs (absent/failed probes simply do not match). */
export interface FingerprintInput {
  /** `/health` → 2xx with JSON body `status === "ok"` (the llama oracle). */
  healthOk: boolean
  /** The Ollama version string when `/api/version` answered 2xx with one; null otherwise. */
  ollamaVersion: string | null
  /** True when a 2xx `/metrics` body contained a `vllm:` series. */
  vllmMetrics: boolean
}

/** Fingerprint result. `version` is null unless the fingerprint exposes one. */
export interface Fingerprint {
  backend: Backend
  version: string | null
}

/** Classify the backend family from probe outcomes. Pure — no I/O, no throws. */
export function fingerprintBackend(input: FingerprintInput): Fingerprint {
  if (input.healthOk) return { backend: 'llama-cpp', version: null }
  if (input.ollamaVersion !== null) return { backend: 'ollama', version: input.ollamaVersion }
  if (input.vllmMetrics) return { backend: 'vllm', version: null }
  return { backend: 'unknown', version: null }
}

/**
 * Extract the version string from an `/api/version` body.
 * Ollama answers `{"version":"0.22.1"}`; anything else (non-object, missing
 * key, non-string, empty string) → null. Pure and defensive — never throws.
 */
export function parseOllamaVersion(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const v = (body as { version?: unknown }).version
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * True when a 2xx `/metrics` body looks like vLLM's Prometheus output
 * (a `vllm:` series, e.g. `vllm:num_requests_running`). The prefix check is
 * deliberately minimal — vLLM is a doc-sourced stub (Tier 3), and a real
 * false positive would require an endpoint to serve both llama and vllm
 * series, which the other rules already separate.
 */
export function looksLikeVllmMetrics(body: unknown): boolean {
  if (typeof body !== 'string') return false
  return body.includes('vllm:')
}
