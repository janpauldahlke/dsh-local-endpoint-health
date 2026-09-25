/**
 * Module-level live endpoint-health store (client half).
 *
 * Polls the plugin route at ~1 Hz with a self-chaining setTimeout (never
 * setInterval) so requests can never overlap. The poller is refcounted: it
 * starts on the first subscriber and stops when the last one leaves, aborting
 * any in-flight fetch. Follows the store shape from the dsh-gpu-monitor-nvml
 * blueprint, plus a per-tick AbortController timeout so a hung route cannot
 * stall the pane forever.
 *
 * Pure module — no React. `useSlotHealth.ts` is the only React binding.
 */
import type { HealthRouteResponse } from '../shared/types.ts'

const API_PATH = '/api/dsh-slot-health'
/** Milliseconds between poll attempts. */
const POLL_MS = 1000
/** Abort a single poll if the route has not answered by this many ms. */
const TIMEOUT_MS = 2500

type Listener = () => void

let snapshot: HealthRouteResponse | null = null
let error: string | null = null
let lastOk: number | null = null
let lastAttempt: number | null = null
let listeners = new Set<Listener>()
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight = false
/** Controller for the in-flight fetch (null between ticks). */
let controller: AbortController | null = null

function emit(): void {
  for (const l of [...listeners]) l()
}

function start(): void {
  if (timer !== null || inFlight) return
  void tick()
}

function stopIfIdle(): void {
  if (listeners.size > 0) return
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  // Abort any in-flight fetch so a slow response cannot write stale data.
  controller?.abort('stopped')
}

async function tick(): Promise<void> {
  if (inFlight) return
  inFlight = true
  controller = new AbortController()
  const timeout = setTimeout(() => controller?.abort('timeout'), TIMEOUT_MS)
  try {
    const res = await fetch(API_PATH, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new Error(`poll failed: HTTP ${res.status}`)
    snapshot = (await res.json()) as HealthRouteResponse
    error = null
    lastOk = Date.now()
  } catch (err) {
    const reason = controller?.signal.reason
    if (reason === 'stopped') {
      // Intentional teardown: leave the previous state as-is.
    } else if (reason === 'timeout') {
      error = `poll timed out after ${TIMEOUT_MS} ms`
    } else {
      error = err instanceof Error ? err.message : String(err)
    }
  } finally {
    clearTimeout(timeout)
    lastAttempt = Date.now()
    inFlight = false
    controller = null
    emit()
    if (listeners.size > 0 && timer === null) {
      timer = setTimeout(() => {
        timer = null
        void tick()
      }, POLL_MS)
    }
  }
}

/** Subscribe a listener; returns the unsubscribe function (refcounted). */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
    stopIfIdle()
  }
}

/** Latest route response (snapshot + origin), or null until the first successful poll. */
export function getSnapshot(): HealthRouteResponse | null {
  return snapshot
}
/** Set when the most recent poll attempt failed (null when the last one succeeded). */
export function getPollError(): string | null {
  return error
}
/** Wall-clock of the most recent successful sample (epoch ms), or null. */
export function getLastOk(): number | null {
  return lastOk
}
/** Wall-clock of the most recent poll attempt, success or failure (epoch ms). */
export function getLastAttempt(): number | null {
  return lastAttempt
}
