/**
 * P7 metrics engine — turns `/metrics` probe results into a `MetricsSection`.
 *
 * Pure module (no I/O, no timers): the sampler in `host/index.ts` owns one
 * `MetricsEngineState` and calls `advanceMetrics` once per tick with the
 * latest probe + snapshot. Everything here is unit-testable with fixture
 * probes and snapshots.
 *
 * Traps handled (see `agent/phases/P7-metrics-enrichment.md`):
 *  1. `_total` counters are cumulative since server start — rates come from
 *     counter deltas over the sample window, per-request figures from deltas
 *     across `id_task` boundaries (P2 latch). Raw counter values are never
 *     rendered as rates.
 *  2. `*_tokens_seconds` gauges read 0 while idle — they are never rendered;
 *     a derived rate is shown only when tokens actually moved in the window,
 *     otherwise the field is `null` (client renders "—", never a false
 *     "0 tok/s" that reads as "stuck").
 *  3. `/metrics` may be 401/404/501 — the capability state machine settles
 *     on `no` and stops probing; the section is `null` (rows vanish, no hole,
 *     no error styling).
 */

import type { HealthSnapshot, MetricsSection } from '../shared/types.ts'
import type { PromSample } from './promParse.ts'
import { parsePrometheusText } from './promParse.ts'

/** Capability verdict for `/metrics` on the configured origin. */
export type MetricsCapability = 'unknown' | 'yes' | 'no'

/**
 * Result of one GET `{origin}/metrics`. The collector never emits `null`
 * here — a skipped probe is expressed as `metricsProbe: null` instead.
 * `status: null` = fetch failed (refused/timeout); `text` is set only on a
 * 2xx with a readable body; `error` carries a short non-sensitive reason.
 */
export interface MetricsProbe {
  status: number | null
  text: string | null
  error: string | null
}

/**
 * The tracked counter set — counters only (gauges are read per tick and
 * never baseline'd, since they legitimately fall back to 0). `perPos` is
 * keyed by the integer `position` label.
 */
export interface CounterSet {
  /** `llamacpp:prompt_tokens_total` */
  prompt: number
  /** `llamacpp:tokens_predicted_total` */
  predict: number
  /** `llamacpp:spec_decode_num_draft_tokens_total` */
  draftTokens: number
  /** `llamacpp:spec_decode_num_accepted_tokens_total` */
  accepted: number
  /** `llamacpp:spec_decode_num_drafts_total` */
  drafts: number
  /** `llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position=N}` */
  perPos: Record<number, number>
}

/** Live gauges, read per tick (all `null`-able). */
interface GaugeSet {
  /** `llamacpp:requests_processing` */
  processing: number | null
  /** `llamacpp:requests_deferred` */
  deferred: number | null
  /** `llamacpp:n_tokens_max` */
  nTokensMax: number | null
}

/** One completed request's counter span, captured at its boundaries. */
interface RequestSpan {
  startMs: number
  endMs: number
  start: CounterSet
  end: CounterSet
}

/** A request known to be in flight, anchored at the tick it was first seen. */
interface ActiveTask {
  atMs: number
  counters: CounterSet
  /**
   * Busy slot id → id_task at the start tick. Empty when the request was
   * detected via the `requests_processing` fallback (slots unavailable);
   * the engine then ends it when processing drops back to 0.
   */
  tasks: Record<number, string>
}

/** Host-side engine state. Lives on the sampler; never serialized. */
export interface MetricsEngineState {
  capability: MetricsCapability
  /** Consecutive 501/404 misses while capability was `yes` (2nd ⇒ `no`). */
  downAfterYes: number
  /** Consecutive ticks with `snapshot.state === 'unreachable'`. */
  endpointDownTicks: number
  /** Window baseline for rate derivation; `null` until the first good parse. */
  baselineAtMs: number | null
  baseline: CounterSet | null
  /** Last completed request's counter span (null until one completes). */
  lastRequest: RequestSpan | null
  /** In-flight request anchor (null while idle). */
  activeTask: ActiveTask | null
  /** Last emitted section — kept for stale rendering on transient failures. */
  lastSection: MetricsSection | null
}

/** Endpoint must be down this many ticks before recovery re-opens the verdict. */
const RESTART_DOWN_TICKS = 3
/** A rate window shorter than this is too short to be meaningful (ms). */
const MIN_RATE_WINDOW_MS = 1000

export function createMetricsState(): MetricsEngineState {
  return {
    capability: 'unknown',
    downAfterYes: 0,
    endpointDownTicks: 0,
    baselineAtMs: null,
    baseline: null,
    lastRequest: null,
    activeTask: null,
    lastSection: null,
  }
}

/** Should the collector fetch `/metrics` this tick? (`no` ⇒ stop probing.) */
export function shouldFetchMetrics(state: MetricsEngineState): boolean {
  return state.capability !== 'no'
}

/**
 * Advance the engine one tick. Mutates `state`; returns the section to
 * attach to the snapshot — `null` when there is nothing to render
 * (endpoint down, capability `no`, probe skipped, or nothing parsed yet).
 */
export function advanceMetrics(
  state: MetricsEngineState,
  probe: MetricsProbe | null,
  snapshot: HealthSnapshot,
  nowMs: number,
): MetricsSection | null {
  // --- Endpoint liveness first: down ⇒ no section, no probe processing. ---
  if (snapshot.state === 'unreachable') {
    state.endpointDownTicks += 1
    return null
  }
  if (state.endpointDownTicks >= RESTART_DOWN_TICKS) {
    // Gone ≥3 ticks and back — treat as restart: re-open the verdict and
    // drop derived state (restart detection below re-clears baselines too).
    state.capability = 'unknown'
    state.downAfterYes = 0
    resetDerived(state)
  }
  state.endpointDownTicks = 0

  // --- Firm `no` verdict: probes are ignored entirely, section stays gone.
  // (The collector already skips probing while `no`; this keeps the engine
  // honest if a probe slips through.) ---
  if (state.capability === 'no') return null

  // --- Skipped probe (fetch deliberately skipped this tick): nothing new to
  // render — a known-`yes` endpoint keeps its last section stale rather than
  // dropping rows; no verdict yet ⇒ `null`. ---
  if (probe === null) {
    if (state.capability === 'yes' && state.lastSection !== null) {
      return staleSection(state, 'metrics not available on this tick')
    }
    return null
  }

  // --- Fetch failed (refused / timeout): stale or keep probing. ---
  if (probe.status === null) {
    if (state.capability === 'yes') return staleSection(state, probe.error ?? 'fetch failed')
    return null
  }

  // --- Firm "not here" statuses: settle the capability. ---
  if (probe.status === 501 || probe.status === 404 || probe.status === 401) {
    if (state.capability === 'yes') {
      state.downAfterYes += 1
      if (state.downAfterYes >= 2) {
        state.capability = 'no'
        resetDerived(state)
        return null
      }
      return staleSection(state, `HTTP ${probe.status} from /metrics`)
    }
    state.capability = 'no'
    resetDerived(state)
    return null
  }

  // --- Anything else but a readable 200: transient for a known endpoint. ---
  if (probe.status !== 200 || probe.text === null) {
    if (state.capability === 'yes') return staleSection(state, `HTTP ${probe.status} from /metrics`)
    return null
  }

  // --- 200 with a body: parse and advance. ---
  const samples = parsePrometheusText(probe.text)
  state.capability = 'yes'
  state.downAfterYes = 0
  if (samples.length === 0) {
    // Endpoint exists but yielded nothing parseable — keep the verdict, no data.
    if (state.capability === 'yes' && state.lastSection !== null) {
      return staleSection(state, '/metrics returned no parseable samples')
    }
    return null
  }

  const counters = extractCounters(samples)
  const gauges = extractGauges(samples)
  const processing = gauges.processing ?? 0

  // Restart detection: any tracked counter moved backwards ⇒ server restart.
  if (state.baseline !== null && countersDecreased(state.baseline, counters)) {
    resetDerived(state)
  }

  // --- Request-boundary tracking (trap #1). ---
  const busySlots: Record<number, string> | null =
    snapshot.slots !== null
      ? busySlotTasks(snapshot.slots)
      : null // null ⇒ slots unavailable, use the requests_processing fallback
  const busyNow = busySlots !== null ? Object.keys(busySlots).length > 0 : processing > 0

  const active = state.activeTask
  if (active !== null && requestEnded(active, snapshot, busySlots, processing)) {
    state.lastRequest = { startMs: active.atMs, endMs: nowMs, start: active.counters, end: counters }
    state.activeTask = null
  }
  if (state.activeTask === null && busyNow) {
    state.activeTask = { atMs: nowMs, counters, tasks: busySlots ?? {} }
  }

  // --- Baseline for the rate window (re-established after any reset). ---
  if (state.baselineAtMs === null || state.baseline === null) {
    state.baselineAtMs = nowMs
    state.baseline = counters
  }

  const section = buildSection(state, counters, gauges, nowMs)
  state.lastSection = section
  return section
}

/** Drop everything derived (baseline, request spans) but keep the verdict. */
function resetDerived(state: MetricsEngineState): void {
  state.baselineAtMs = null
  state.baseline = null
  state.lastRequest = null
  state.activeTask = null
  state.lastSection = null
}

/** Last section with `fresh: false` + error, or null when there is none to keep. */
function staleSection(state: MetricsEngineState, error: string): MetricsSection | null {
  if (state.lastSection === null) return null
  const section: MetricsSection = { ...state.lastSection, fresh: false, error }
  state.lastSection = section
  return section
}

/** Busy slot id → id_task; empty object when none busy. */
function busySlotTasks(slots: { id: number; state: 'busy' | 'idle'; idTask: string | null }[]): Record<number, string> {
  const tasks: Record<number, string> = {}
  for (const slot of slots) {
    if (slot.state === 'busy' && slot.idTask !== null) tasks[slot.id] = slot.idTask
  }
  return tasks
}

/**
 * Did the in-flight request finish this tick? Slots mode: every anchored
 * busy slot went idle or its id_task changed. Fallback mode (slots were
 * unavailable at start): `requests_processing` dropped to 0.
 */
function requestEnded(
  active: ActiveTask,
  snapshot: HealthSnapshot,
  busySlots: Record<number, string> | null,
  processing: number,
): boolean {
  if (busySlots !== null) {
    const keys = Object.keys(active.tasks)
    if (keys.length === 0) {
      // Anchored via fallback, slots now available: end iff nothing is busy.
      return Object.keys(busySlots).length === 0
    }
    return keys.some((k) => {
      const slot = snapshot.slots?.find((s) => s.id === Number(k))
      return slot === undefined || slot.state !== 'busy' || slot.idTask !== active.tasks[Number(k)]
    })
  }
  // Slots still unavailable: use the processing gauge.
  return processing === 0
}

/** Pull the tracked counters out of parsed samples; missing ⇒ 0. */
function extractCounters(samples: PromSample[]): CounterSet {
  const c: CounterSet = { prompt: 0, predict: 0, draftTokens: 0, accepted: 0, drafts: 0, perPos: {} }
  for (const s of samples) {
    if (!Number.isFinite(s.value)) continue
    switch (s.name) {
      case 'llamacpp:prompt_tokens_total':
        c.prompt = s.value
        break
      case 'llamacpp:tokens_predicted_total':
        c.predict = s.value
        break
      case 'llamacpp:spec_decode_num_draft_tokens_total':
        c.draftTokens = s.value
        break
      case 'llamacpp:spec_decode_num_accepted_tokens_total':
        c.accepted = s.value
        break
      case 'llamacpp:spec_decode_num_drafts_total':
        c.drafts = s.value
        break
      case 'llamacpp:spec_decode_num_accepted_tokens_per_pos_total': {
        const pos = Number(s.labels.position)
        if (Number.isInteger(pos) && pos >= 0) c.perPos[pos] = s.value
        break
      }
      default:
        break
    }
  }
  return c
}

function extractGauges(samples: PromSample[]): GaugeSet {
  const g: GaugeSet = { processing: null, deferred: null, nTokensMax: null }
  for (const s of samples) {
    if (!Number.isFinite(s.value)) continue
    switch (s.name) {
      case 'llamacpp:requests_processing':
        g.processing = s.value
        break
      case 'llamacpp:requests_deferred':
        g.deferred = s.value
        break
      case 'llamacpp:n_tokens_max':
        g.nTokensMax = s.value
        break
      default:
        break
    }
  }
  return g
}

/** True when any tracked counter decreased (server restart ⇒ counters reset). */
function countersDecreased(a: CounterSet, b: CounterSet): boolean {
  if (a.prompt > b.prompt || a.predict > b.predict || a.draftTokens > b.draftTokens) return true
  if (a.accepted > b.accepted || a.drafts > b.drafts) return true
  for (const pos of Object.keys(a.perPos)) {
    if (a.perPos[Number(pos)] > (b.perPos[Number(pos)] ?? 0)) return true
  }
  return false
}

/** Round a 0..1 ratio to 3 decimals (display precision for acceptance). */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}

/** Round a token count / small ratio to 1 decimal. */
function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/** Sum of the per-position accepted counters within one set (or a delta). */
function sumPerPos(perPos: Record<number, number>): number {
  let sum = 0
  for (const key of Object.keys(perPos)) sum += perPos[Number(key)]
  return sum
}

function perPosDelta(a: Record<number, number>, b: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {}
  const positions = new Set<number>([...Object.keys(a).map(Number), ...Object.keys(b).map(Number)])
  for (const pos of positions) out[pos] = (b[pos] ?? 0) - (a[pos] ?? 0)
  return out
}

function buildSection(
  state: MetricsEngineState,
  counters: CounterSet,
  gauges: GaugeSet,
  nowMs: number,
): MetricsSection {
  const baseline = state.baseline as CounterSet
  const windowMs = nowMs - (state.baselineAtMs as number)
  const dtSec = windowMs / 1000

  // --- Derived rates over the window since the last restart (traps #1/#2). ---
  // Shown only when tokens actually moved; idle ⇒ null ⇒ "—", never "0 tok/s".
  let promptTokensPerSec: number | null = null
  let tokensPerSec: number | null = null
  if (windowMs >= MIN_RATE_WINDOW_MS) {
    const dPrompt = counters.prompt - baseline.prompt
    const dPredict = counters.predict - baseline.predict
    if (dPrompt > 0) promptTokensPerSec = Math.round((dPrompt / dtSec) * 10) / 10
    if (dPredict > 0) tokensPerSec = Math.round((dPredict / dtSec) * 10) / 10
  }

  // --- Lifetime draft figures (cumulative since server start). ---
  // Each figure carries its denominator (`sample`) so the client can show
  // how much data backs the ratio (AC12). Ratios are rounded to 3 decimals
  // (0..1 scale); mean length to 1 decimal (token counts).
  let draftAcceptance: MetricsSection['draftAcceptance'] = { lifetime: null, lastRequest: null }
  let draftMeanLen: MetricsSection['draftMeanLen'] = { lifetime: null, lastRequest: null }
  let perPosLastRequest: MetricsSection['perPosLastRequest'] = []

  if (counters.draftTokens > 0) {
    draftAcceptance.lifetime = {
      value: round3(counters.accepted / counters.draftTokens),
      sample: counters.draftTokens,
    }
  }
  if (counters.drafts > 0) {
    draftMeanLen.lifetime = {
      value: round1(sumPerPos(counters.perPos) / counters.drafts),
      sample: counters.drafts,
    }
  }

  // --- Delta'd figures across the last completed request's id_task boundary. ---
  const span = state.lastRequest
  if (span !== null) {
    const dDraft = span.end.draftTokens - span.start.draftTokens
    const dAccepted = span.end.accepted - span.start.accepted
    const dDrafts = span.end.drafts - span.start.drafts
    if (dDraft > 0) {
      draftAcceptance.lastRequest = { value: round3(dAccepted / dDraft), sample: dDraft }
    }
    if (dDrafts > 0) {
      draftMeanLen.lastRequest = { value: round1(perPosSumDelta(span) / dDrafts), sample: dDrafts }
      const delta = perPosDelta(span.start.perPos, span.end.perPos)
      perPosLastRequest = Object.keys(delta)
        .map(Number)
        .sort((x, y) => x - y)
        .map((position) => ({ position, acceptance: round1(delta[position] / dDrafts) }))
    }
  }

  return {
    fresh: true,
    error: null,
    promptTokensPerSec,
    tokensPerSec,
    rateWindowMs: windowMs,
    requestsDeferred: gauges.deferred,
    requestsProcessing: gauges.processing,
    contextHighWater: gauges.nTokensMax,
    draftAcceptance,
    draftMeanLen,
    perPosLastRequest,
  }
}

function perPosSumDelta(span: RequestSpan): number {
  let sum = 0
  const positions = new Set<number>([
    ...Object.keys(span.end.perPos).map(Number),
    ...Object.keys(span.start.perPos).map(Number),
  ])
  for (const pos of positions) sum += (span.end.perPos[pos] ?? 0) - (span.start.perPos[pos] ?? 0)
  return sum
}
