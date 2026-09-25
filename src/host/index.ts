/**
 * Host half of dsh-slot-health.
 *
 * Registers the `/api/dsh-slot-health` route on the harness webserver and runs
 * a ~1 Hz sampler behind it, so the handler is a constant-time read of a
 * cached snapshot. Boot-safe by design: collector failures become runtime
 * states served by the route, never a boot-time throw.
 *
 * P2: the sampler also probes `/slots` (behind an optional Bearer token from
 * `LLAMA_API_KEY`) and stamps every slot sample with busy-age / TTFT values
 * latched in host memory (`./latch.ts`), so busy age survives client
 * reconnects — the latches belong to the sampler, not to any client.
 *
 * The `Config` named export is resolved by cordis before `apply` runs — see
 * `./config.ts`.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only import: activates the `Context.webServer` declaration merge from
// the webserver host package (erased at build time).
import type {} from '@deepseek-ai/dsh-host-webserver'
import { collectHealth, normalizeOrigin } from './collect.ts'
import { Config } from './config.ts'
import type { ResolvedConfig } from './config.ts'
import { stampSlotLatches } from './latch.ts'
import type { SlotLatch } from './latch.ts'
import {
  advanceMetrics,
  createMetricsState,
  shouldFetchMetrics,
  type MetricsEngineState,
  type MetricsProbe,
} from './metrics.ts'
import { ROUTE } from './route.ts'
import type { HealthSnapshot } from '../shared/types.ts'

export const name = 'dsh-slot-health'
export const inject = ['webServer']
export { ROUTE } from './route.ts'
export { Config } from './config.ts'
export type { HealthSnapshot } from '../shared/types.ts'

/** Milliseconds between samples. The client pane polls at ~1 Hz. */
export const SAMPLE_INTERVAL_MS = 1000

/** Per-probe timeout for the `/metrics` fetch (same budget as /health + /slots). */
const METRICS_TIMEOUT_MS = 2000

/** Latest sampled state; a placeholder until the first tick completes. */
let latest: HealthSnapshot = {
  ok: false,
  state: 'unknown',
  latencyMs: null,
  lastError: 'sampling…',
  sampledAt: Date.now(),
  slots: null,
  slotsError: null,
  metrics: null,
}

/** P7 metrics engine state (capability + baselines); owned by the sampler. */
let metricsState: MetricsEngineState = createMetricsState()

/**
 * Per-slot busy-age / TTFT latches (P2). Host memory only: they survive
 * client reconnects and are pruned by `stampSlotLatches` when a slot
 * disappears from `/slots`.
 */
const latches = new Map<number, SlotLatch>()

/** Bearer token for the privileged `/slots` probe; resolved once at apply time. */
let apiKey: string | undefined = undefined

/** True while a sample is in flight, so overlapping ticks are skipped. */
let sampling = false

/**
 * GET `{base}/metrics` with the per-probe timeout. Never throws — every
 * failure mode becomes a `MetricsProbe` (`status: null` on network failure)
 * so a metrics outage can never poison the health snapshot (phase P7 trap:
 * independent try/catch, like gpu-monitor's per-field isolation).
 *
 * The Bearer key goes in when one is configured: the verified endpoint
 * answers 401 without a key and 200 with one. The key is a request header
 * only — never logged, never stored in any probe or snapshot field.
 */
async function fetchMetrics(base: string): Promise<MetricsProbe> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), METRICS_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/metrics`, {
      signal: controller.signal,
      headers: apiKey !== undefined ? { authorization: `Bearer ${apiKey}` } : undefined,
    })
    if (res.status >= 200 && res.status < 300) {
      const text = await res.text()
      return { status: res.status, text, error: null }
    }
    return { status: res.status, text: null, error: null }
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name
    const cause = (err as { cause?: { code?: string } } | null)?.cause
    const reason =
      name === 'TimeoutError' || name === 'AbortError' || cause?.code === 'ETIMEDOUT'
        ? `timed out after ${METRICS_TIMEOUT_MS} ms`
        : cause?.code === 'ECONNREFUSED'
          ? 'connection refused'
          : String(err)
    return { status: null, text: null, error: reason.length > 120 ? `${reason.slice(0, 120)}…` : reason }
  } finally {
    clearTimeout(timer)
  }
}

/** One sampling pass: probe, stamp latches, advance metrics, store. Never throws. */
async function tick(origin: string): Promise<void> {
  if (sampling) return
  sampling = true
  try {
    const snap = await collectHealth(origin, { apiKey })
    if (snap.slots !== null) {
      const stamped = stampSlotLatches(snap.slots, latches, Date.now())
      snap.slots = stamped.slots
      latches.clear()
      for (const [id, latch] of stamped.latches) latches.set(id, latch)
    }
    // P7: enrich with /metrics when the capability state machine says to.
    // Skipped probes pass `null` (e.g. capability already `no`, or the
    // endpoint went unreachable) — the engine then keeps/stales the last
    // section according to its rules.
    const probe =
      snap.ok && shouldFetchMetrics(metricsState)
        ? await fetchMetrics(normalizeOrigin(origin))
        : null
    snap.metrics = advanceMetrics(metricsState, probe, snap, Date.now())
    latest = snap
  } catch (err) {
    // collectHealth is catch-all; this guards the sampler loop itself.
    latest = {
      ok: false,
      state: 'unreachable',
      latencyMs: null,
      lastError: String(err),
      sampledAt: Date.now(),
      slots: null,
      slotsError: null,
      metrics: null,
    }
  } finally {
    sampling = false
  }
}

export function apply(ctx: Context, config: ResolvedConfig): void {
  const origin = config.origin

  // Resolve the optional Bearer token once; env is stable for the host
  // process lifetime. Never logged, never served — only used as a request
  // header by the collector.
  const envKey = typeof process !== 'undefined' && process.env ? process.env.LLAMA_API_KEY : undefined
  apiKey = typeof envKey === 'string' && envKey !== '' ? envKey : undefined

  // Start sampling immediately so the route serves live data as soon as possible.
  void tick(origin)

  const unregister = ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'application/json', allow: 'GET' })
        res.end(JSON.stringify({ error: 'method not allowed; use GET' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      // Serve a copy (shallow, plus a copied slots array): the client must
      // never alias the live object, and latch stamping swaps slot objects
      // wholesale each tick. Route-level `origin` field (not part of
      // HealthSnapshot): lets the pane label which endpoint is sampled.
      const snap = latest
      res.end(JSON.stringify({ ...snap, slots: snap.slots ? [...snap.slots] : null, origin }))
    },
  })

  ctx.effect(() => {
    const timer = setInterval(() => {
      void tick(origin)
    }, SAMPLE_INTERVAL_MS)
    timer.unref?.()
    return () => {
      clearInterval(timer)
    }
  }, 'slot-health: sampler')

  ctx.effect(() => unregister, 'slot-health: /api/dsh-slot-health route')
}
