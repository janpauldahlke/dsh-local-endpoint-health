/**
 * Shared snapshot types. Host produces a `HealthSnapshot`; the client polls
 * the plugin route for the latest one. Both halves import from here, so the
 * JSON shape is defined exactly once.
 *
 * P1 has three states only (see `agent/phases/P1-vertical-slice.md`):
 *   unreachable — GET {origin}/health fails (refused / timeout / 5xx)
 *   idle        — /health → 200 with the recognizable llama-server shape
 *   unknown     — reachable, but not a recognizable server shape
 */

/** Three P1 endpoint states. P2/P3 add slot-level states on top, not new top-level ones. */
export type EndpointState = 'unreachable' | 'idle' | 'unknown'

/**
 * One sample of the local endpoint's health. Produced by `host/collect.ts`,
 * served by the plugin route (wrapped in `HealthRouteResponse`), consumed by
 * the client poller.
 *
 * P2 will extend this with per-slot data (e.g. an optional `slots` array);
 * the base fields below are stable and never reinterpreted.
 */
export interface HealthSnapshot {
  /** True when the HTTP request to {origin}/health completed with a 2xx/3xx status. */
  ok: boolean
  /** Derived state: unreachable (request failed), idle (200 + ok shape), unknown (reachable, wrong shape). */
  state: EndpointState
  /** Round-trip latency in ms, measured only on completed requests (null when unreachable). */
  latencyMs: number | null
  /** Human-readable reason for the most recent failure; null when the last sample was fine. */
  lastError: string | null
  /** Wall-clock of the sample (epoch ms). Client renders "updated N s ago" from this. */
  sampledAt: number
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
