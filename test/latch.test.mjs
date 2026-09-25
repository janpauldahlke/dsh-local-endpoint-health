/**
 * Unit tests for the P2 busy-age / TTFT latch state machine (`src/host/latch.ts`,
 * bundled to `lib/latch.mjs`).
 *
 * The latch is the only place busy age and TTFT are computed — `/slots` has no
 * timestamps — so these tests are the P2 verification for:
 *   - busy age latches on `is_processing` true and survives ticks (host-owned,
 *     independent of any client);
 *   - `id_task` change restarts the age (a second request must not look like
 *     the first one ageing);
 *   - TTFT latches at the first `n_decoded > 0` and does not grow after;
 *   - idle clears everything;
 *   - `slots === null` (e.g. a 401 tick) preserves prior latch state.
 *
 * Run: `npm test` (node --test) or `node --test test/latch.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { freshSlotLatch, stampSlotLatches } from '../lib/latch.mjs'

const T0 = 1_000_000_000 // fixed epoch base so all arithmetic is exact

/** A minimal slot sample; only `state`, `idTask` and `decoded` matter to the latch. */
function slot(overrides = {}) {
  return {
    id: 1,
    state: 'idle',
    idTask: null,
    promptTokens: 0,
    promptTokensProcessed: 0,
    promptProgress: null,
    promptTokensCache: 0,
    decoded: 0,
    remain: 0,
    hasNextToken: false,
    contextSize: 4096,
    contextUsed: 0,
    contextPressure: null,
    busySinceMs: null,
    busyAgeMs: null,
    ttftMs: null,
    speculative: false,
    ...overrides,
  }
}

const idleSlot = () => slot()
const busySlot = (overrides = {}) => slot({ state: 'busy', idTask: 'task-a', ...overrides })

test('freshSlotLatch is all-clear', () => {
  assert.deepEqual(freshSlotLatch(), {
    busy: false,
    idTask: null,
    busySinceMs: null,
    firstDecodedAtMs: null,
  })
})

test('idle slot: no latch values, latch stays idle', () => {
  const { slots, latches } = stampSlotLatches([idleSlot()], new Map(), T0)
  const s = slots[0]
  assert.equal(s.busySinceMs, null)
  assert.equal(s.busyAgeMs, null)
  assert.equal(s.ttftMs, null)
  assert.equal(latches.get(1).busy, false)
})

test('busy start: age 0 at the starting tick, no TTFT until decode', () => {
  const { slots, latches } = stampSlotLatches([busySlot()], new Map(), T0)
  const s = slots[0]
  assert.equal(s.busySinceMs, T0)
  assert.equal(s.busyAgeMs, 0)
  assert.equal(s.ttftMs, null)
  assert.equal(latches.get(1).busy, true)
})

test('busy age survives ticks and is owned host-side (no client involved)', () => {
  let latches = new Map()
  let last = null
  for (const offset of [0, 1000, 2000]) {
    const stamped = stampSlotLatches([busySlot()], latches, T0 + offset)
    latches = stamped.latches
    last = stamped.slots[0]
  }
  // The latch was carried across ticks purely host-side: busySinceMs pinned at
  // the first tick, age grown tick-by-tick.
  assert.equal(last.busySinceMs, T0)
  assert.equal(last.busyAgeMs, 2000)
})

test('TTFT latches at the first decode and never grows', () => {
  let latches = new Map()
  // tick 0: busy start, no decode yet
  let r = stampSlotLatches([busySlot({ decoded: 0 })], latches, T0)
  latches = r.latches
  assert.equal(r.slots[0].ttftMs, null)
  // tick +1000 ms: first decode appears
  r = stampSlotLatches([busySlot({ decoded: 5 })], latches, T0 + 1000)
  latches = r.latches
  assert.equal(r.slots[0].ttftMs, 1000)
  // tick +2000 ms: more decode, same request → TTFT stays 1000, age grows
  r = stampSlotLatches([busySlot({ decoded: 9 })], latches, T0 + 2000)
  assert.equal(r.slots[0].ttftMs, 1000)
  assert.equal(r.slots[0].busyAgeMs, 2000)
})

test('joining mid-request: fresh latch with decode already present → TTFT 0', () => {
  const { slots } = stampSlotLatches([busySlot({ decoded: 12 })], new Map(), T0)
  assert.equal(slots[0].busyAgeMs, 0)
  assert.equal(slots[0].ttftMs, 0)
})

test('id_task change on a busy slot restarts the age and clears TTFT', () => {
  let latches = new Map()
  // request A: busy for 1000 ms, decoded at +500
  let r = stampSlotLatches([busySlot({ idTask: 'a' })], latches, T0)
  latches = r.latches
  r = stampSlotLatches([busySlot({ idTask: 'a', decoded: 4 })], latches, T0 + 500)
  latches = r.latches
  assert.equal(r.slots[0].ttftMs, 500)
  r = stampSlotLatches([busySlot({ idTask: 'a', decoded: 6 })], latches, T0 + 1000)
  latches = r.latches
  assert.equal(r.slots[0].busyAgeMs, 1000)
  // request B lands on the same slot one tick later
  r = stampSlotLatches([busySlot({ idTask: 'b', decoded: 0 })], latches, T0 + 2000)
  const s = r.slots[0]
  assert.equal(s.busySinceMs, T0 + 2000) // restarted, not continued from T0
  assert.equal(s.busyAgeMs, 0)
  assert.equal(s.ttftMs, null) // new request: no first decode yet
})

test('idle clears the latches; a later busy starts fresh', () => {
  let latches = new Map()
  let r = stampSlotLatches([busySlot({ decoded: 3 })], latches, T0)
  latches = r.latches
  assert.equal(r.slots[0].busyAgeMs, 0)
  r = stampSlotLatches([busySlot({ decoded: 3 })], latches, T0 + 1500)
  latches = r.latches
  assert.equal(r.slots[0].busyAgeMs, 1500)
  // slot goes idle (is_processing false, retained token counts irrelevant)
  r = stampSlotLatches([idleSlot()], latches, T0 + 5000)
  latches = r.latches
  const s = r.slots[0]
  assert.equal(s.busySinceMs, null)
  assert.equal(s.busyAgeMs, null)
  assert.equal(s.ttftMs, null)
  assert.equal(latches.get(1).busy, false)
  // a new busy spell must not inherit the old one
  r = stampSlotLatches([busySlot({ idTask: 'fresh' })], latches, T0 + 6000)
  assert.equal(r.slots[0].busySinceMs, T0 + 6000)
  assert.equal(r.slots[0].busyAgeMs, 0)
})

test('slots === null keeps prior latch state untouched (transient /slots failure)', () => {
  let latches = new Map()
  let r = stampSlotLatches([busySlot()], latches, T0)
  latches = r.latches
  assert.equal(r.slots[0].busyAgeMs, 0)
  // two ticks where /slots is unavailable (e.g. 401 or 404)
  r = stampSlotLatches(null, latches, T0 + 1000)
  assert.equal(r.slots, null)
  latches = r.latches
  r = stampSlotLatches(null, latches, T0 + 2000)
  latches = r.latches
  assert.equal(r.slots, null)
  // slots come back: the busy spell continues from the original start
  r = stampSlotLatches([busySlot({ decoded: 2 })], latches, T0 + 3000)
  const s = r.slots[0]
  assert.equal(s.busySinceMs, T0)
  assert.equal(s.busyAgeMs, 3000)
  assert.equal(s.ttftMs, 3000) // first decode observed now
})

test('disappeared slot ids are pruned from the latch map', () => {
  let latches = new Map()
  let r = stampSlotLatches([busySlot({ id: 1 }), busySlot({ id: 2 })], latches, T0)
  latches = r.latches
  assert.equal(latches.size, 2)
  r = stampSlotLatches([busySlot({ id: 1 })], latches, T0 + 1000)
  assert.deepEqual([...r.latches.keys()], [1])
})

test('stamping is pure: input slots are not mutated', () => {
  const input = [busySlot()]
  const r = stampSlotLatches(input, new Map(), T0)
  assert.equal(input[0].busySinceMs, null) // collector-emitted null stays null
  assert.equal(input[0].busyAgeMs, null)
  assert.notEqual(r.slots[0], input[0]) // stamped array holds new objects
  assert.equal(r.slots[0].busyAgeMs, 0)
  // previous latch map is not mutated either (stampSlotLatches copies it)
  const prev = new Map()
  prev.set(1, freshSlotLatch())
  stampSlotLatches([busySlot()], prev, T0)
  assert.equal(prev.get(1).busy, false)
  assert.equal(prev.get(1).busySinceMs, null)
})

test('multiple slots are stamped independently', () => {
  const r = stampSlotLatches(
    [idleSlot({ id: 1 }), busySlot({ id: 2, idTask: 'x' })],
    new Map(),
    T0,
  )
  const [a, b] = r.slots
  assert.equal(a.busyAgeMs, null)
  assert.equal(b.busyAgeMs, 0)
  assert.equal(b.busySinceMs, T0)
})

test('clock going backwards clamps age at 0 instead of negative', () => {
  let latches = new Map()
  let r = stampSlotLatches([busySlot()], latches, T0 + 5000)
  latches = r.latches
  r = stampSlotLatches([busySlot()], latches, T0 + 4000)
  assert.equal(r.slots[0].busySinceMs, T0 + 5000)
  assert.equal(r.slots[0].busyAgeMs, 0)
})
