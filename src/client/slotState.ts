/**
 * Pure state→label derivation for the slot-health surfaces. Both the dock
 * chip and the rightbar pane consume this module so they can never disagree
 * on what a snapshot means. No React, no I/O — just data in, display out.
 *
 * Top-level states (priority order, first match wins):
 *   error       — transport error (the plugin route itself failed)
 *   waiting     — no snapshot yet, no error (before the first poll lands)
 *   unreachable — endpoint down (route refused / timeout / 5xx)
 *   unknown     — reachable, but not a recognizable server shape
 *   error       — slots 401/404/5xx (endpoint up, slot data unavailable)
 *   busy        — at least one slot is processing
 *   idle        — all slots idle (or endpoint up with no slot data)
 *
 * `stale` is an overlay, not a top-level state: the chip dims when the
 * latest sample is older than STALE_MS, regardless of which state it's in.
 */
import type { SlotHealthLive } from './useSlotHealth.ts'

/** Milliseconds after which a sample is considered stale (3 missed polls at 1 Hz). */
export const STALE_MS = 3000

export type ChipState =
  | 'waiting'
  | 'unreachable'
  | 'error'
  | 'unknown'
  | 'busy'
  | 'idle'

export interface ChipDisplay {
  /** Which top-level state the chip is in. */
  state: ChipState
  /** Dot color (hex). */
  dot: string
  /** Short text label shown on the chip (the "meat"). */
  label: string
  /** True when the latest sample is older than STALE_MS (dim the chip). */
  stale: boolean
  /** Tooltip text (multi-line, ends with a stale line when stale). */
  title: string
}

/** Hex colors per state, matching STYLE.md palette. */
const STATE_DOT: Record<ChipState, string> = {
  waiting: '#8b93a7',
  unreachable: '#ef4444',
  error: '#ef4444',
  unknown: '#f59e0b',
  busy: '#3b82f6',
  idle: '#22c55e',
}

/**
 * Format a duration in ms as a short human-readable label.
 * Exported so the pane and chip share one formatter.
 */
export function ageLabel(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s > 0 ? `${m}m${s}s` : `${m}m`
}

/**
 * Derive the chip's display from the live health state and a reference clock.
 * Pure function — no React, no I/O. `now` is the reference time for staleness
 * (the caller passes `Date.now()`; tests pass a fixed value).
 */
export function deriveChip(live: SlotHealthLive, now: number): ChipDisplay {
  const { snapshot, error } = live

  // --- 1. Transport error: the plugin route itself failed ---
  if (error !== null) {
    return {
      state: 'error',
      dot: STATE_DOT.error,
      label: 'error',
      stale: false,
      title: `slot-health — ${error}`,
    }
  }

  // --- 2. Waiting: no snapshot yet (before the first poll lands) ---
  if (snapshot === null) {
    return {
      state: 'waiting',
      dot: STATE_DOT.waiting,
      label: 'waiting',
      stale: false,
      title: 'slot-health — waiting for first sample',
    }
  }

  // --- 3. Staleness overlay (computed once, applied at the end) ---
  const age = now - snapshot.sampledAt
  const stale = age > STALE_MS

  // --- 4. Endpoint unreachable ---
  if (snapshot.state === 'unreachable') {
    const detail = snapshot.lastError ? ` — ${snapshot.lastError}` : ''
    return {
      state: 'unreachable',
      dot: STATE_DOT.unreachable,
      label: 'down',
      stale,
      title: withStale(`slot-health — endpoint unreachable${detail}`, stale, age),
    }
  }

  // --- 5. Endpoint reachable but unrecognized shape ---
  if (snapshot.state === 'unknown') {
    const detail = snapshot.lastError ? ` — ${snapshot.lastError}` : ''
    return {
      state: 'unknown',
      dot: STATE_DOT.unknown,
      label: 'unknown',
      stale,
      title: withStale(`slot-health — endpoint shape not recognized${detail}`, stale, age),
    }
  }

  // --- 6. Endpoint up (state === 'idle'): inspect slots ---

  // 6a. Slots unavailable (401 auth, 404, 5xx, fetch failure)
  if (snapshot.slots === null && snapshot.slotsError !== null) {
    const isAuth = /401|auth/i.test(snapshot.slotsError)
    return {
      state: 'error',
      dot: STATE_DOT.error,
      label: isAuth ? 'auth' : 'slots',
      stale,
      title: withStale(`slot-health — slots: ${snapshot.slotsError}`, stale, age),
    }
  }

  const slots = snapshot.slots ?? []

  // 6b. At least one slot is busy
  const busySlots = slots.filter(s => s.state === 'busy')
  if (busySlots.length > 0) {
    // Longest-running busy slot gives the headline age.
    const maxAgeMs = Math.max(...busySlots.map(s => s.busyAgeMs ?? 0))
    const totalDecoded = slots.reduce((sum, s) => sum + (s.decoded > 0 ? s.decoded : 0), 0)
    let label = `busy ${ageLabel(maxAgeMs)}`
    if (totalDecoded > 0) label += ` · dec ${totalDecoded}`
    const detail = totalDecoded > 0 ? `, ${totalDecoded} tokens decoded` : ''
    return {
      state: 'busy',
      dot: STATE_DOT.busy,
      label,
      stale,
      title: withStale(`slot-health — busy for ${ageLabel(maxAgeMs)}${detail}`, stale, age),
    }
  }

  // 6c. All slots idle (or zero slots, or no slot data)
  return {
    state: 'idle',
    dot: STATE_DOT.idle,
    label: 'idle',
    stale,
    title: withStale(
      `slot-health — all slots idle (${slots.length} slot${slots.length === 1 ? '' : 's'})`,
      stale, age,
    ),
  }
}

/** Append a stale line to a tooltip string when the sample is stale. */
function withStale(title: string, stale: boolean, ageMs: number): string {
  if (!stale) return title
  return `${title}\nstale — last updated ${ageLabel(ageMs)} ago`
}
