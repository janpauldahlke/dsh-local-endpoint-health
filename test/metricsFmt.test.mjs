/**
 * REVIEW §1 — smoke tests for the metrics pane coercers
 * (`src/client/metricsFmt.ts`, bundled to `lib/metricsFmt.mjs`).
 *
 * The point of these tests: a pre-P7 host serves the OLD section shape —
 * `perPosLastRequest: null` and bare-number draft figures — and the pane
 * must degrade to fewer rows, never throw (the old MetricsBlock crashed the
 * whole pane on `null.length`). Every coercer accepts `unknown`.
 *
 * Run: `npm test` (node --test) or `node --test test/metricsFmt.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toFigure,
  fmtFigure,
  toPerPos,
  fmtPerPos,
  metricsHasRows,
} from '../lib/metricsFmt.mjs'

/** The exact section shape a pre-P7 host (≤8216613) serves. */
const LEGACY_SECTION = {
  fresh: true,
  error: null,
  promptTokensPerSec: 32.6,
  tokensPerSec: 3.7,
  rateWindowMs: 8741,
  requestsDeferred: 0,
  requestsProcessing: 1,
  contextHighWater: 84534,
  draftAcceptance: { lifetime: 0.657, lastRequest: null },
  draftMeanLen: { lifetime: 1.9, lastRequest: null },
  perPosLastRequest: null,
}

test('legacy section: no coercer throws, rows degrade', () => {
  assert.equal(metricsHasRows(LEGACY_SECTION), true)
  assert.deepEqual(toPerPos(LEGACY_SECTION.perPosLastRequest), [])
  assert.equal(fmtFigure(toFigure(LEGACY_SECTION.draftAcceptance.lifetime)), '0.657')
  assert.equal(fmtFigure(toFigure(LEGACY_SECTION.draftAcceptance.lastRequest)), null)
  assert.equal(fmtFigure(toFigure(LEGACY_SECTION.draftMeanLen.lifetime)), '1.9')
})

test('legacy bare number renders bare (no n, no undefined)', () => {
  for (const v of [0, 0.657, 1.9, 42]) {
    const out = fmtFigure(toFigure(v))
    assert.equal(out, `${v}`, `bare ${v} rendered ${out}`)
    assert.ok(!out.includes('undefined'), `undefined leaked: ${out}`)
  }
})

test('current {value, sample} shape renders with denominator', () => {
  assert.equal(fmtFigure(toFigure({ value: 0.657, sample: 26394 })), '0.657 (n=26394)')
  assert.equal(fmtFigure(toFigure({ value: 1.9, sample: 8798 })), '1.9 (n=8798)')
  assert.equal(fmtFigure(toFigure(null)), null)
})

test('garbage figures coerce to null (row hidden, no throw)', () => {
  for (const v of [null, undefined, NaN, Infinity, '0.657', {}, { value: 0.5 }, { sample: 3 }]) {
    assert.equal(toFigure(v), null, `toFigure(${String(v)}) should be null`)
  }
})

test('perPos: null → [], entries with non-numeric fields dropped', () => {
  assert.deepEqual(toPerPos(null), [])
  assert.deepEqual(toPerPos(undefined), [])
  assert.deepEqual(toPerPos('garbage'), [])
  assert.deepEqual(
    toPerPos([
      { position: 0, acceptance: 9 },
      { position: 1, acceptance: null }, // old contract allowed null acceptance
      { position: 2, acceptance: 'x' },
      null,
      'junk',
    ]),
    [{ position: 0, acceptance: 9 }],
  )
})

test('fmtPerPos joins segments; empty list → empty string', () => {
  assert.equal(fmtPerPos([]), '')
  assert.equal(fmtPerPos([{ position: 0, acceptance: 9 }, { position: 1, acceptance: 4 }]), 'p0 9 · p1 4')
})

test('metricsHasRows: current-shape section', () => {
  assert.equal(
    metricsHasRows({
      fresh: true,
      promptTokensPerSec: null,
      tokensPerSec: null,
      requestsDeferred: 0,
      requestsProcessing: null,
      contextHighWater: null,
      draftAcceptance: { lifetime: null, lastRequest: null },
      draftMeanLen: { lifetime: null, lastRequest: null },
      perPosLastRequest: [],
    }),
    true, // deferred: 0 is a real row (queue is 0)
  )
  assert.equal(
    metricsHasRows({
      fresh: true,
      promptTokensPerSec: null,
      tokensPerSec: null,
      requestsDeferred: null,
      requestsProcessing: null,
      contextHighWater: null,
      draftAcceptance: { lifetime: { value: 0.87, sample: 30 }, lastRequest: null },
      draftMeanLen: { lifetime: null, lastRequest: null },
      perPosLastRequest: null,
    }),
    true,
  )
})

test('metricsHasRows: empty section → no rows (block vanishes)', () => {
  assert.equal(metricsHasRows(null), false)
  assert.equal(metricsHasRows({}), false)
  assert.equal(
    metricsHasRows({
      fresh: true,
      promptTokensPerSec: null,
      tokensPerSec: null,
      requestsDeferred: null,
      requestsProcessing: null,
      contextHighWater: null,
      draftAcceptance: { lifetime: null, lastRequest: null },
      draftMeanLen: { lifetime: null, lastRequest: null },
      perPosLastRequest: null,
    }),
    false,
  )
})
