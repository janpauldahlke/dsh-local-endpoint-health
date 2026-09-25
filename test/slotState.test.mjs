/**
 * Unit tests for the P6 chip state derivation (`src/client/slotState.ts`,
 * bundled to `lib/slotState.mjs`).
 *
 * AC10: assert the state→label mapping for each chip state. Both the dock
 * chip and the rightbar pane consume this module so they can never disagree.
 *
 * Run: `npm test` (node --test) or `node --test test/slotState.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveChip, ageLabel, STALE_MS, slotTone, WEDGED_AFTER_MS, backendLabel } from '../lib/slotState.mjs'

// Fixed clock so staleness arithmetic is exact.
const NOW = 1_700_000_000_000
const FRESH = NOW - 500 // 500 ms ago — well within STALE_MS
const STALE = NOW - (STALE_MS + 1000) // 4 s ago — past the threshold

/** Minimal slot sample for chip derivation (only `state` + `busyAgeMs` + `decoded` matter). */
function slot(overrides = {}) {
  return { id: 1, state: 'idle', busyAgeMs: null, decoded: 0, ...overrides }
}

/** Build a full SlotHealthLive fixture. */
function live({ snapshot = null, error = null } = {}) {
  return { snapshot, error, lastAttempt: snapshot ? FRESH : null }
}

/** A reachable, recognizable snapshot with all-idle slots. */
function idleSnapshot(overrides = {}) {
  return {
    state: 'idle',
    origin: 'http://127.0.0.1:8080',
    latencyMs: 42,
    sampledAt: FRESH,
    lastError: null,
    slots: [slot()],
    slotsError: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Top-level state → label mapping (AC10)
// ---------------------------------------------------------------------------

test('waiting: no snapshot, no error → state=waiting, label="waiting"', () => {
  const d = deriveChip(live(), NOW)
  assert.equal(d.state, 'waiting')
  assert.equal(d.label, 'waiting')
  assert.equal(d.stale, false)
  assert.equal(d.dot, '#8b93a7')
})

test('transport error takes priority over everything → state=error, label="error"', () => {
  // Error set AND a snapshot exists — error must win.
  const d = deriveChip(live({ snapshot: idleSnapshot(), error: 'route 500' }), NOW)
  assert.equal(d.state, 'error')
  assert.equal(d.label, 'error')
  assert.equal(d.stale, false)
  assert.equal(d.dot, '#ef4444')
  assert.match(d.title, /route 500/)
})

test('transport error with no snapshot → state=error (not waiting)', () => {
  const d = deriveChip(live({ error: 'fetch failed' }), NOW)
  assert.equal(d.state, 'error')
  assert.equal(d.label, 'error')
})

test('unreachable: snapshot.state=unreachable → state=unreachable, label="down"', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot({ state: 'unreachable' }) }), NOW)
  assert.equal(d.state, 'unreachable')
  assert.equal(d.label, 'down')
  assert.equal(d.dot, '#ef4444')
})

test('unreachable with lastError → title includes the error detail', () => {
  const d = deriveChip(
    live({ snapshot: idleSnapshot({ state: 'unreachable', lastError: 'ECONNREFUSED' }) }),
    NOW,
  )
  assert.equal(d.state, 'unreachable')
  assert.match(d.title, /ECONNREFUSED/)
})

test('unknown: snapshot.state=unknown → state=unknown, label="unknown"', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot({ state: 'unknown' }) }), NOW)
  assert.equal(d.state, 'unknown')
  assert.equal(d.label, 'unknown')
  assert.equal(d.dot, '#f59e0b')
})

test('slots auth error: slots=null, slotsError="401" → state=error, label="auth"', () => {
  const d = deriveChip(
    live({ snapshot: idleSnapshot({ slots: null, slotsError: '401 Unauthorized' }) }),
    NOW,
  )
  assert.equal(d.state, 'error')
  assert.equal(d.label, 'auth')
  assert.equal(d.dot, '#ef4444')
})

test('slots other error: slots=null, slotsError="404" → state=error, label="slots"', () => {
  const d = deriveChip(
    live({ snapshot: idleSnapshot({ slots: null, slotsError: '404 Not Found' }) }),
    NOW,
  )
  assert.equal(d.state, 'error')
  assert.equal(d.label, 'slots')
})

test('busy: one slot busy → state=busy, label stable "busy" (REVIEW §2c)', () => {
  const d = deriveChip(
    live({ snapshot: idleSnapshot({ slots: [slot(), slot({ id: 2, state: 'busy', busyAgeMs: 1250 })] }) }),
    NOW,
  )
  assert.equal(d.state, 'busy')
  // Stable label: the dock chip must not widen as the busy age advances.
  assert.equal(d.label, 'busy')
  assert.equal(d.dot, '#3b82f6')
  assert.match(d.detail, /^busy 1s/)
})

test('busy with decoded: detail carries age + decoded count', () => {
  const d = deriveChip(
    live({
      snapshot: idleSnapshot({
        slots: [slot({ id: 1, state: 'busy', busyAgeMs: 2000, decoded: 47 })],
      }),
    }),
    NOW,
  )
  assert.equal(d.state, 'busy')
  assert.equal(d.label, 'busy')
  assert.equal(d.detail, 'busy 2s · dec 47')
})

test('idle: all slots idle → state=idle, label="idle"', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot() }), NOW)
  assert.equal(d.state, 'idle')
  assert.equal(d.label, 'idle')
  assert.equal(d.dot, '#22c55e')
})

test('idle: zero slots → state=idle, label="idle"', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot({ slots: [] }) }), NOW)
  assert.equal(d.state, 'idle')
  assert.equal(d.label, 'idle')
})

test('idle: endpoint up, no slot data (slots=null, slotsError=null) → state=idle', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot({ slots: null, slotsError: null }) }), NOW)
  assert.equal(d.state, 'idle')
  assert.equal(d.label, 'idle')
})

// ---------------------------------------------------------------------------
// Staleness overlay
// ---------------------------------------------------------------------------

test('stale: sample older than STALE_MS → stale=true, state unchanged', () => {
  const d = deriveChip(
    live({ snapshot: idleSnapshot({ sampledAt: STALE }) }),
    NOW,
  )
  assert.equal(d.stale, true)
  assert.equal(d.state, 'idle') // overlay, not a top-level state
})

test('not stale: sample within STALE_MS → stale=false', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot() }), NOW)
  assert.equal(d.stale, false)
})

test('stale: exactly at STALE_MS boundary → stale=false (strictly greater)', () => {
  const d = deriveChip(
    live({ snapshot: idleSnapshot({ sampledAt: NOW - STALE_MS }) }),
    NOW,
  )
  assert.equal(d.stale, false)
})

test('stale: unreachable state can also be stale', () => {
  const d = deriveChip(
    live({ snapshot: idleSnapshot({ state: 'unreachable', sampledAt: STALE }) }),
    NOW,
  )
  assert.equal(d.state, 'unreachable')
  assert.equal(d.stale, true)
})

test('stale: title includes a stale line when stale', () => {
  const d = deriveChip(
    live({ snapshot: idleSnapshot({ sampledAt: STALE }) }),
    NOW,
  )
  assert.match(d.title, /stale/)
})

test('stale: title has no stale line when fresh', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot() }), NOW)
  assert.doesNotMatch(d.title, /stale/)
})

// ---------------------------------------------------------------------------
// ageLabel formatting
// ---------------------------------------------------------------------------

test('ageLabel: <1s → "Nms"', () => {
  assert.equal(ageLabel(0), '0ms')
  assert.equal(ageLabel(999), '999ms')
})

test('ageLabel: <60s → "Ns"', () => {
  assert.equal(ageLabel(1000), '1s')
  assert.equal(ageLabel(59_000), '59s')
})

test('ageLabel: ≥60s → "Nm" or "NmNs"', () => {
  assert.equal(ageLabel(60_000), '1m')
  assert.equal(ageLabel(90_000), '1m30s')
  assert.equal(ageLabel(120_000), '2m')
})

// ---------------------------------------------------------------------------
// STALE_MS export
// ---------------------------------------------------------------------------

test('STALE_MS is 3000', () => {
  assert.equal(STALE_MS, 3000)
})

// ---------------------------------------------------------------------------
// slotTone — P3 wedged heuristic (REVIEW2 §2c crit border)
// ---------------------------------------------------------------------------

test('slotTone: idle slot → na', () => {
  assert.equal(slotTone(slot()), 'na')
})

test('slotTone: busy under 300 s → na (any progress state)', () => {
  assert.equal(slotTone(slot({ state: 'busy', busyAgeMs: 1000, promptProgress: 1, decoded: 0 })), 'na')
})

test('slotTone: prompt still climbing at 400 s → na (healthy long prefill, never wedged)', () => {
  assert.equal(slotTone(slot({ state: 'busy', busyAgeMs: 400_000, promptProgress: 0.9, decoded: 0 })), 'na')
})

test('slotTone: prompt done + zero decoded at 400 s → crit (wedged)', () => {
  assert.equal(slotTone(slot({ state: 'busy', busyAgeMs: 400_000, promptProgress: 1, decoded: 0 })), 'crit')
})

test('slotTone: prompt done but tokens decoding at 400 s → na (legit long request)', () => {
  assert.equal(slotTone(slot({ state: 'busy', busyAgeMs: 400_000, promptProgress: 1, decoded: 5 })), 'na')
})

test('slotTone: promptProgress null at 400 s + zero decoded → na (no evidence of done)', () => {
  assert.equal(slotTone(slot({ state: 'busy', busyAgeMs: 400_000, promptProgress: null, decoded: 0 })), 'na')
})

test('WEDGED_AFTER_MS is 300_000 (DSH streamIdleTimeoutMs)', () => {
  assert.equal(WEDGED_AFTER_MS, 300_000)
})

// ---------------------------------------------------------------------------
// P8: engine prefix + Ollama states (agent/specs/ollama-backend.md)
// ---------------------------------------------------------------------------

/** An Ollama snapshot: no slots, no /health, states come from /api/ps. */
function ollamaSnapshot(state, overrides = {}) {
  return {
    state,
    backend: 'ollama',
    backendVersion: '0.22.1',
    origin: 'http://127.0.0.1:11434',
    latencyMs: 12,
    sampledAt: FRESH,
    lastError: null,
    slots: null,
    slotsError: null,
    ollama: null,
    ...overrides,
  }
}

test('P8: up-no-model → state=no-model, label="ollama · no model", green dot', () => {
  const d = deriveChip(live({ snapshot: ollamaSnapshot('up-no-model') }), NOW)
  assert.equal(d.state, 'no-model')
  assert.equal(d.label, 'ollama · no model')
  assert.equal(d.dot, '#22c55e')
  assert.match(d.title, /no model loaded/)
})

test('P8: up-loaded → state=loaded, label="ollama · loaded", detail names the model', () => {
  const d = deriveChip(
    live({
      snapshot: ollamaSnapshot('up-loaded', {
        ollama: { fresh: true, error: null, loaded: [{ name: 'mistral:latest' }], libraryCount: 12 },
      }),
    }),
    NOW,
  )
  assert.equal(d.state, 'loaded')
  assert.equal(d.label, 'ollama · loaded')
  assert.equal(d.dot, '#22c55e')
  assert.equal(d.detail, 'loaded · mistral:latest')
  assert.match(d.title, /1 model resident \(mistral:latest\)/)
})

test('P8: multiple loaded models → title counts them, detail uses the first', () => {
  const d = deriveChip(
    live({
      snapshot: ollamaSnapshot('up-loaded', {
        ollama: {
          fresh: true,
          error: null,
          loaded: [{ name: 'a:latest' }, { name: 'b:latest' }],
          libraryCount: 12,
        },
      }),
    }),
    NOW,
  )
  assert.equal(d.label, 'ollama · loaded')
  assert.equal(d.detail, 'loaded · a:latest')
  assert.match(d.title, /2 models resident/)
})

test('P8: llama snapshot → engine prefix on the idle label', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot({ backend: 'llama-cpp' }) }), NOW)
  assert.equal(d.state, 'idle')
  assert.equal(d.label, 'llama · idle')
})

test('P8: unknown backend → no engine prefix (never fabricate an engine)', () => {
  const d = deriveChip(live({ snapshot: idleSnapshot({ backend: 'unknown' }) }), NOW)
  assert.equal(d.label, 'idle')
})

test('P8: busy with an identified backend → "llama · busy", detail unchanged', () => {
  const busy = slot({ state: 'busy', busyAgeMs: 22_000, decoded: 892 })
  const d = deriveChip(live({ snapshot: idleSnapshot({ backend: 'llama-cpp', slots: [busy] }) }), NOW)
  assert.equal(d.state, 'busy')
  assert.equal(d.label, 'llama · busy')
  assert.equal(d.detail, 'busy 22s · dec 892')
})

test('P8 backendLabel: product names, ollama version appended when known', () => {
  assert.equal(backendLabel({ backend: 'llama-cpp' }), 'llama.cpp')
  assert.equal(backendLabel({ backend: 'ollama', backendVersion: '0.22.1' }), 'ollama 0.22.1')
  assert.equal(backendLabel({ backend: 'ollama', backendVersion: null }), 'ollama')
  assert.equal(backendLabel({ backend: 'vllm' }), 'vllm')
  assert.equal(backendLabel({ backend: 'unknown' }), null)
  assert.equal(backendLabel(null), null)
})
