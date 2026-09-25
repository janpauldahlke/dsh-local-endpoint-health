/**
 * P7 — unit tests for the /metrics engine (src/host/metrics.ts), exercised
 * through the standalone bundle lib/metrics.mjs.
 *
 * Covers: capability state machine (unknown→yes/no, stale-once→no,
 * re-open after endpoint-down), rate window math (deltas, idle ⇒ null,
 * sub-1s window suppression), restart detection (counter decrease),
 * request-boundary tracking (id_task latch + requests_processing fallback),
 * lifetime vs last-request draft figures, and gauge read-through.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createMetricsState,
  shouldFetchMetrics,
  advanceMetrics,
} from '../lib/metrics.mjs'

// --- Fixture helpers ----------------------------------------------------------

/** Build a Prometheus text body from the counters/gauges we track. */
function metricsText(o = {}) {
  const lines = []
  if (o.prompt !== undefined) lines.push(`llamacpp:prompt_tokens_total ${o.prompt}`)
  if (o.predict !== undefined) lines.push(`llamacpp:tokens_predicted_total ${o.predict}`)
  if (o.draft !== undefined) lines.push(`llamacpp:spec_decode_num_draft_tokens_total ${o.draft}`)
  if (o.accepted !== undefined) lines.push(`llamacpp:spec_decode_num_accepted_tokens_total ${o.accepted}`)
  if (o.drafts !== undefined) lines.push(`llamacpp:spec_decode_num_drafts_total ${o.drafts}`)
  for (const [pos, v] of Object.entries(o.perPos ?? {})) {
    lines.push(`llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position="${pos}"} ${v}`)
  }
  if (o.processing !== undefined) lines.push(`llamacpp:requests_processing ${o.processing}`)
  if (o.deferred !== undefined) lines.push(`llamacpp:requests_deferred ${o.deferred}`)
  if (o.nTokensMax !== undefined) lines.push(`llamacpp:n_tokens_max ${o.nTokensMax}`)
  return lines.join('\n')
}

const ok = (o) => ({ status: 200, text: metricsText(o), error: null })
const http = (status) => ({ status, text: '', error: null })
const netError = (error) => ({ status: null, text: null, error })

/** Minimal HealthSnapshot shape — the engine only reads `state` + `slots`. */
const snap = (state = 'ok', slots = null) => ({ state, slots })

const T0 = 1000

// --- Capability state machine -------------------------------------------------

test('unknown + 501: settles to no, null section, probing stops', () => {
  const st = createMetricsState()
  assert.equal(shouldFetchMetrics(st), true)
  const section = advanceMetrics(st, http(501), snap(), T0)
  assert.equal(section, null)
  assert.equal(st.capability, 'no')
  assert.equal(shouldFetchMetrics(st), false)
})

test('unknown + 401: settles to no (verified :8080 behavior without key)', () => {
  const st = createMetricsState()
  const section = advanceMetrics(st, http(401), snap(), T0)
  assert.equal(section, null)
  assert.equal(st.capability, 'no')
})

test('unknown + network error: settles to no', () => {
  const st = createMetricsState()
  const section = advanceMetrics(st, netError('connect ECONNREFUSED'), snap(), T0)
  assert.equal(section, null)
  assert.equal(st.capability, 'no')
})

test('unknown + 200 with parseable body: settles to yes with a fresh section', () => {
  const st = createMetricsState()
  const section = advanceMetrics(
    st,
    ok({ prompt: 100, predict: 200, draft: 10, accepted: 8, drafts: 2, perPos: { 0: 5, 1: 3 }, deferred: 1, nTokensMax: 512 }),
    snap(),
    T0,
  )
  assert.equal(st.capability, 'yes')
  assert.equal(section.fresh, true)
  assert.equal(section.error, null)
  assert.equal(section.requestsDeferred, 1)
  assert.equal(section.contextHighWater, 512)
  assert.deepEqual(section.draftAcceptance.lifetime, { value: 0.8, sample: 10 })
  assert.deepEqual(section.draftMeanLen.lifetime, { value: 4, sample: 2 })
  assert.equal(section.draftAcceptance.lastRequest, null)
  assert.deepEqual(section.perPosLastRequest, [])
})

test('unknown + 200 but empty body: stays yes, section is stale, probing continues', () => {
  const st = createMetricsState()
  const s1 = advanceMetrics(st, ok({}), snap(), T0)
  assert.equal(st.capability, 'yes')
  assert.equal(s1.fresh, false)
  assert.match(s1.error, /no parseable samples/)
  assert.equal(shouldFetchMetrics(st), true)
})

test('yes + first miss: section kept stale (fresh=false, error set), values retained', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ predict: 100, deferred: 2 }), snap(), T0)
  const s2 = advanceMetrics(st, http(501), snap(), T0 + 1000)
  assert.equal(st.capability, 'yes')
  assert.equal(s2.fresh, false)
  assert.match(s2.error, /HTTP 501/)
  assert.equal(s2.requestsDeferred, 2) // stale values survive the miss
  assert.equal(shouldFetchMetrics(st), true)
})

test('yes + two consecutive misses: settles to no, section vanishes, probing stops', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ predict: 100 }), snap(), T0)
  advanceMetrics(st, http(501), snap(), T0 + 1000)
  const s3 = advanceMetrics(st, http(501), snap(), T0 + 2000)
  assert.equal(st.capability, 'no')
  assert.equal(s3, null)
  assert.equal(shouldFetchMetrics(st), false)
})

test('capability no: probe is ignored entirely', () => {
  const st = createMetricsState()
  advanceMetrics(st, http(501), snap(), T0)
  const section = advanceMetrics(st, ok({ predict: 999 }), snap(), T0 + 1000)
  assert.equal(section, null)
  assert.equal(st.capability, 'no')
})

// --- Null probe / endpoint down / re-open -------------------------------------

test('null probe (metrics fetch skipped): returns last section marked stale', () => {
  const st = createMetricsState()
  const fresh = advanceMetrics(st, ok({ predict: 100, deferred: 3 }), snap(), T0)
  assert.equal(fresh.fresh, true)
  const stale = advanceMetrics(st, null, snap(), T0 + 1000)
  assert.equal(stale.fresh, false)
  assert.match(stale.error, /metrics not available/)
  assert.equal(stale.requestsDeferred, 3)
})

test('null probe with no section yet: null', () => {
  const st = createMetricsState()
  advanceMetrics(st, http(501), snap(), T0) // no section ever produced
  assert.equal(advanceMetrics(st, null, snap(), T0 + 1000), null)
})

test('endpoint down: null section while down, derived state dropped', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ predict: 100 }), snap(), T0)
  const s1 = advanceMetrics(st, ok({ predict: 101 }), snap('down'), T0 + 1000)
  assert.equal(s1, null)
  assert.equal(st.baseline, null) // derived state dropped on down
})

test('endpoint down for 3 ticks then back: re-opens and re-settles to yes', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ predict: 100 }), snap(), T0)
  advanceMetrics(st, ok({ predict: 101 }), snap('down'), T0 + 1000)
  advanceMetrics(st, ok({ predict: 102 }), snap('down'), T0 + 2000)
  advanceMetrics(st, ok({ predict: 103 }), snap('down'), T0 + 3000) // 3rd down tick
  const back = advanceMetrics(st, ok({ predict: 10, prompt: 5 }), snap('ok'), T0 + 4000)
  assert.equal(st.capability, 'yes')
  assert.ok(back.fresh)
  assert.equal(back.tokensPerSec, null) // window re-established, no movement yet
  assert.equal(back.rateWindowMs, 0)
})

test('fewer than 3 down ticks: no re-open, probe still ignored while down', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ predict: 100 }), snap(), T0)
  const s1 = advanceMetrics(st, ok({ predict: 101 }), snap('down'), T0 + 1000)
  const s2 = advanceMetrics(st, ok({ predict: 102 }), snap('down'), T0 + 2000)
  assert.equal(s1, null)
  assert.equal(s2, null)
  // Endpoint still down: capability unchanged, no section.
  assert.equal(st.capability, 'yes')
})

// --- Rate window math -----------------------------------------------------------

test('rate: counter deltas over a 2 s window, rounded to 0.1', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ prompt: 1000, predict: 100 }), snap(), 1000)
  const s = advanceMetrics(st, ok({ prompt: 1400, predict: 400 }), snap(), 3000)
  assert.equal(s.rateWindowMs, 2000)
  assert.equal(s.promptTokensPerSec, 200) // (1400-1000)/2s
  assert.equal(s.tokensPerSec, 150) // (400-100)/2s
})

test('rate: idle ⇒ null (never a fake "0 tok/s"), cumulative counters are not rates', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ prompt: 90000, predict: 50000 }), snap(), 1000)
  const s = advanceMetrics(st, ok({ prompt: 90000, predict: 50000 }), snap(), 5000)
  assert.equal(s.rateWindowMs, 4000)
  assert.equal(s.promptTokensPerSec, null)
  assert.equal(s.tokensPerSec, null)
})

test('rate: window under 1 s is suppressed', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ predict: 100 }), snap(), 1000)
  const s = advanceMetrics(st, ok({ predict: 400 }), snap(), 1500)
  assert.equal(s.rateWindowMs, 500)
  assert.equal(s.tokensPerSec, null)
})

test('rate: rounding to one decimal (301 tokens / 3 s ⇒ 100.3)', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ predict: 0 }), snap(), 1000)
  const s = advanceMetrics(st, ok({ predict: 301 }), snap(), 4000)
  assert.equal(s.tokensPerSec, 100.3)
})

// --- Restart detection ----------------------------------------------------------

test('restart: counter decrease resets baseline, no negative rate, re-estimates from zero', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ predict: 1000 }), snap(), 1000)
  const mid = advanceMetrics(st, ok({ predict: 2000 }), snap(), 3000)
  assert.equal(mid.tokensPerSec, 500)
  // Server restarts: predict counter resets to 5.
  const restarted = advanceMetrics(st, ok({ predict: 5 }), snap(), 5000)
  assert.equal(restarted.tokensPerSec, null) // window re-established at 0
  assert.equal(restarted.rateWindowMs, 0)
  const after = advanceMetrics(st, ok({ predict: 105 }), snap(), 7000)
  assert.equal(after.tokensPerSec, 50) // (105-5)/2s — post-restart delta only
})

test('restart: request span state is dropped too', () => {
  const st = createMetricsState()
  advanceMetrics(
    st,
    ok({ predict: 100, draft: 10 }),
    snap('ok', [{ id: 1, state: 'busy', idTask: 'a' }]),
    1000,
  )
  const s = advanceMetrics(
    st,
    ok({ predict: 3, draft: 2 }), // counters went backwards ⇒ restart
    snap('ok', []),
    3000,
  )
  assert.equal(s.draftAcceptance.lastRequest, null)
  assert.deepEqual(s.perPosLastRequest, [])
})

// --- Request boundary: id_task latch (P2 slot slots) ------------------------------

test('per-request: slot goes idle ⇒ span finalized with request-scoped figures', () => {
  const st = createMetricsState()
  advanceMetrics(
    st,
    ok({ draft: 100, accepted: 90, drafts: 10, perPos: { 0: 60, 1: 30 } }),
    snap('ok', [{ id: 1, state: 'busy', idTask: 'task-1' }]),
    1000,
  )
  // Mid-flight: slot still busy with the same id_task — no span yet.
  const mid = advanceMetrics(
    st,
    ok({ draft: 115, accepted: 103, drafts: 11, perPos: { 0: 69, 1: 34 } }),
    snap('ok', [{ id: 1, state: 'busy', idTask: 'task-1' }]),
    2000,
  )
  assert.equal(mid.draftAcceptance.lastRequest, null)

  const done = advanceMetrics(
    st,
    ok({ draft: 130, accepted: 116, drafts: 12, perPos: { 0: 78, 1: 38 } }),
    snap('ok', [{ id: 1, state: 'idle', idTask: null }]),
    3000,
  )
  // Span: draft 100→130, accepted 90→116, drafts 10→12, perPos 0: 60→78, 1: 30→38.
  assert.equal(done.draftAcceptance.lastRequest.value, 0.867) // 26/30 rounded
  assert.equal(done.draftAcceptance.lastRequest.sample, 30)
  assert.equal(done.draftMeanLen.lastRequest.value, 13) // (18+8)/2
  assert.equal(done.draftMeanLen.lastRequest.sample, 2)
  assert.deepEqual(done.perPosLastRequest, [
    { position: 0, acceptance: 9 }, // 18/2
    { position: 1, acceptance: 4 }, // 8/2
  ])
  // Lifetime figures still reflect cumulative counters.
  assert.equal(done.draftAcceptance.lifetime.value, 0.892) // 116/130 rounded
  assert.equal(done.draftMeanLen.lifetime.value, 9.7) // 116/12 rounded
})

test('per-request: id_task change while busy finalizes the span', () => {
  const st = createMetricsState()
  advanceMetrics(
    st,
    ok({ draft: 10, accepted: 9, drafts: 1, perPos: { 0: 9 } }),
    snap('ok', [{ id: 1, state: 'busy', idTask: 'a' }]),
    1000,
  )
  const s = advanceMetrics(
    st,
    ok({ draft: 25, accepted: 20, drafts: 2, perPos: { 0: 20 } }),
    snap('ok', [{ id: 1, state: 'busy', idTask: 'b' }]),
    3000,
  )
  assert.equal(s.draftAcceptance.lastRequest.value, 0.733) // 11/15 rounded
  assert.deepEqual(s.perPosLastRequest, [{ position: 0, acceptance: 11 }]) // 11/1
})

test('per-request: span persists across later idle ticks until a new request completes', () => {
  const st = createMetricsState()
  advanceMetrics(
    st,
    ok({ draft: 100, accepted: 90, drafts: 10, perPos: { 0: 60, 1: 30 } }),
    snap('ok', [{ id: 1, state: 'busy', idTask: 'task-1' }]),
    1000,
  )
  const done = advanceMetrics(
    st,
    ok({ draft: 130, accepted: 116, drafts: 12, perPos: { 0: 78, 1: 38 } }),
    snap('ok', [{ id: 1, state: 'idle', idTask: null }]),
    3000,
  )
  const later = advanceMetrics(
    st,
    ok({ draft: 130, accepted: 116, drafts: 12, perPos: { 0: 78, 1: 38 } }),
    snap('ok', []),
    5000,
  )
  assert.equal(later.draftAcceptance.lastRequest.value, done.draftAcceptance.lastRequest.value)
  assert.deepEqual(later.perPosLastRequest, done.perPosLastRequest)
})

// --- Request boundary: requests_processing fallback --------------------------------

test('fallback: slots unavailable — requests_processing 1→0 closes the span', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ processing: 1, draft: 50 }), snap('ok', null), 1000)
  const s = advanceMetrics(st, ok({ processing: 0, draft: 80 }), snap('ok', null), 3000)
  assert.ok(s.draftAcceptance.lastRequest)
  assert.equal(s.draftAcceptance.lastRequest.sample, 30) // 80-50
  assert.equal(s.draftAcceptance.lastRequest.value, 0) // no accepted counter in feed
})

test('fallback: slots become available mid-request — idle slots close the span', () => {
  const st = createMetricsState()
  advanceMetrics(st, ok({ processing: 1, draft: 50 }), snap('ok', null), 1000)
  // Anchored via fallback (empty tasks); slots now available: ends iff nothing busy.
  const mid = advanceMetrics(
    st,
    ok({ processing: 1, draft: 60 }),
    snap('ok', [{ id: 1, state: 'busy', idTask: 'z' }]),
    2000,
  )
  assert.equal(mid.draftAcceptance.lastRequest, null)
  const s = advanceMetrics(
    st,
    ok({ processing: 0, draft: 80 }),
    snap('ok', [{ id: 1, state: 'idle', idTask: null }]),
    3000,
  )
  assert.equal(s.draftAcceptance.lastRequest.sample, 30)
})

// --- Gauges -----------------------------------------------------------------------

test('gauges: read-through for processing/deferred/context; missing ⇒ null', () => {
  const st = createMetricsState()
  const s1 = advanceMetrics(
    st,
    ok({ processing: 2, deferred: 4, nTokensMax: 4096 }),
    snap(),
    T0,
  )
  assert.equal(s1.requestsProcessing, 2)
  assert.equal(s1.requestsDeferred, 4)
  assert.equal(s1.contextHighWater, 4096)

  const st2 = createMetricsState()
  const s2 = advanceMetrics(st2, ok({ predict: 10 }), snap(), T0)
  assert.equal(s2.requestsProcessing, null)
  assert.equal(s2.requestsDeferred, null)
  assert.equal(s2.contextHighWater, null)
})

test('gauges: n_tokens_max of 0 is a valid reading, not missing', () => {
  const st = createMetricsState()
  const s = advanceMetrics(st, ok({ nTokensMax: 0 }), snap(), T0)
  assert.equal(s.contextHighWater, 0)
})

test('gauges: idle n_tokens_max is 0 on a real server — not a high-water mark', () => {
  const st = createMetricsState()
  const s = advanceMetrics(
    st,
    ok({ nTokensMax: 0, processing: 0 }),
    snap(),
    T0,
  )
  assert.equal(s.contextHighWater, 0)
  assert.equal(s.requestsProcessing, 0)
})
