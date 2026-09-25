/**
 * Busy-age / TTFT latches (P2).
 *
 * The llama-server `/slots` payload contains **no timestamps**, so "how long
 * has this slot been busy" and "time-to-first-token" cannot be read off the
 * wire — they have to be *computed* host-side from tick-to-tick deltas. This
 * module is the pure state machine for that: given the previous latch state
 * and the current slot sample, it returns the new latch state plus the values
 * the snapshot should display.
 *
 * Latch rules (see `agent/NOTES.md` "P2 latch design"):
 *   - busy starts when `is_processing` is observed true; a slot first seen
 *     mid-request can only be timed from the moment we first saw it;
 *   - a busy slot whose `id_task` changed is a *new* request: the busy-age
 *     latch restarts from now, and the TTFT latch clears (unless decode has
 *     already happened in this same sample);
 *   - idle clears both latches;
 *   - the latches live in the host sampler's memory, independent of any
 *     client connection — client reconnects never reset busy age.
 */

import type { SlotSample } from '../shared/types'

/** One slot's latch state, held host-side in a `Map<number, SlotLatch>`. */
export interface SlotLatch {
  busy: boolean
  /** Last `id_task` seen; a change while busy marks a new request. */
  idTask: string | null
  /** Epoch ms when the current busy spell started; null while idle. */
  busySinceMs: number | null
  /** Epoch ms when the first `n_decoded > 0` was observed for the current request. */
  firstDecodedAtMs: number | null
}

/** A fresh latch for a slot we have never observed. */
export function freshSlotLatch(): SlotLatch {
  return { busy: false, idTask: null, busySinceMs: null, firstDecodedAtMs: null }
}

/**
 * Advance one slot's latch by one tick.
 *
 * Pure: takes the previous latch plus the raw sample (only `state`, `idTask`
 * and `decoded` are read) and returns a new latch. Never throws.
 */
function advanceSlotLatch(prev: SlotLatch, slot: SlotSample, nowMs: number): SlotLatch {
  const busy = slot.state === 'busy'
  if (!busy) {
    // Idle: everything resets. `idTask` is kept (harmless: a later fresh
    // busy spell restarts its age via the !prev.busy branch regardless).
    return { busy: false, idTask: slot.idTask, busySinceMs: null, firstDecodedAtMs: null }
  }
  const taskChanged =
    prev.busy &&
    prev.idTask !== null &&
    slot.idTask !== null &&
    prev.idTask !== slot.idTask
  if (!prev.busy || taskChanged) {
    // First observed busy, or a new request on the same busy slot.
    return {
      busy: true,
      idTask: slot.idTask,
      busySinceMs: nowMs,
      // If decode already happened in this very sample (we joined
      // mid-request), TTFT is 0 ms relative to the busy start.
      firstDecodedAtMs: slot.decoded > 0 ? nowMs : null,
    }
  }
  // Same request, still busy: keep the busy-start time; latch TTFT once.
  const firstDecodedAtMs =
    prev.firstDecodedAtMs !== null ? prev.firstDecodedAtMs : slot.decoded > 0 ? nowMs : null
  return { busy: true, idTask: slot.idTask, busySinceMs: prev.busySinceMs, firstDecodedAtMs }
}

/**
 * Stamp a whole snapshot's slots with latch-derived values, and advance the
 * per-slot latch map.
 *
 * Pure with respect to `slots`: the returned array contains **new** objects
 * with `busySinceMs` / `busyAgeMs` / `ttftMs` filled in (the collector emits
 * those three as `null`). The returned `latches` map is the state to carry
 * into the next tick; slot ids that disappeared are pruned.
 */
export function stampSlotLatches(
  slots: SlotSample[] | null,
  previous: ReadonlyMap<number, SlotLatch>,
  nowMs: number,
): { slots: SlotSample[] | null; latches: Map<number, SlotLatch> } {
  const latches = new Map(previous)
  if (slots === null) {
    // /slots unavailable this tick: keep the old latch state (the server may
    // be transiently failing) but do not stamp anything.
    return { slots: null, latches }
  }
  const seen = new Set<number>()
  const stamped: SlotSample[] = slots.map((slot) => {
    seen.add(slot.id)
    const next = advanceSlotLatch(previous.get(slot.id) ?? freshSlotLatch(), slot, nowMs)
    latches.set(slot.id, next)
    const busySinceMs = next.busy ? next.busySinceMs : null
    return {
      ...slot,
      busySinceMs,
      busyAgeMs: busySinceMs !== null ? Math.max(0, nowMs - busySinceMs) : null,
      ttftMs:
        next.busy && next.firstDecodedAtMs !== null && next.busySinceMs !== null
          ? Math.max(0, next.firstDecodedAtMs - next.busySinceMs)
          : null,
    }
  })
  for (const id of [...latches.keys()]) {
    if (!seen.has(id)) latches.delete(id)
  }
  return { slots: stamped, latches }
}
