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
 *   no-model    — P8 Ollama: up, `/api/ps` → `{"models":[]}` (distinct honest
 *                 state — not idle, not an error)
 *   loaded      — P8 Ollama: up, ≥1 model resident (resident ≠ busy)
 *   error       — slots 401/404/5xx (endpoint up, slot data unavailable)
 *   busy        — at least one slot is processing
 *   idle        — all slots idle (or endpoint up with no slot data)
 *
 * P8: when `snapshot.backend` names an engine (`llama` / `ollama` / `vllm`),
 * the stable label is prefixed with it (`ollama · loaded`) so the engine is
 * visible even from the collapsed dock chip. `unknown` never gets a prefix —
 * the label must not fabricate an engine.
 *
 * `stale` is an overlay, not a top-level state: the chip dims when the
 * latest sample is older than STALE_MS, regardless of which state it's in.
 */
import type { SlotHealthLive } from './useSlotHealth.ts'
import type { Backend, SlotSample } from '../shared/types.ts'

/** Milliseconds after which a sample is considered stale (3 missed polls at 1 Hz). */
export const STALE_MS = 3000

export type ChipState =
  | 'waiting'
  | 'unreachable'
  | 'error'
  | 'unknown'
  | 'no-model'
  | 'loaded'
  | 'busy'
  | 'idle'

export interface ChipDisplay {
  /** Which top-level state the chip is in. */
  state: ChipState
  /** Dot color (hex). */
  dot: string
  /**
   * Stable short label shown on the dock chip (`idle` / `busy` / `down` …).
   * Never changes while the state persists — a variable-width label (age,
   * decoded count) would widen the chip and shove the dock row every second
   * (REVIEW §2c). The rich reading goes in `detail`/`title` instead.
   */
  label: string
  /**
   * Richer label for surfaces with room (the pane header), e.g.
   * `busy 22s · dec 892`; null when it adds nothing over `label`.
   */
  detail: string | null
  /** True when the latest sample is older than STALE_MS (dim the chip). */
  stale: boolean
  /** Tooltip text (multi-line, ends with a stale line when stale). */
  title: string
}

/** Hex colors per state, matching STYLE.md palette. Exported so the pane's
 *  per-slot state word uses the same colors the chip does (one palette). */
export const STATE_DOT: Record<ChipState, string> = {
  waiting: '#8b93a7',
  unreachable: '#ef4444',
  error: '#ef4444',
  unknown: '#f59e0b',
  // P8 Ollama up-states: both healthy (green); the label carries the
  // distinction (no model / loaded), the dot says "server is fine".
  'no-model': '#22c55e',
  loaded: '#22c55e',
  busy: '#3b82f6',
  idle: '#22c55e',
}

/**
 * P8: the short engine word for the chip label prefix, or null when the
 * backend is not recognized (no prefix — never fabricate an engine).
 * `llama-cpp` renders as `llama` (short, stable-width, matches the chip's
 * small type).
 */
export function backendWord(backend: Backend): string | null {
  switch (backend) {
    case 'llama-cpp':
      return 'llama'
    case 'ollama':
      return 'ollama'
    case 'vllm':
      return 'vllm'
    default:
      return null
  }
}

/**
 * P8: the friendly engine name for the pane top (spec §4.1) — the long
 * product spelling, plus the backend version when it is known (Ollama
 * exposes one; llama-server does not through the /health oracle). Returns
 * `null` when the backend is not recognized so the pane shows nothing rather
 * than a fabricated engine.
 */
export function backendLabel(
  snapshot: { backend: Backend; backendVersion?: string | null } | null,
): string | null {
  if (snapshot === null) return null
  switch (snapshot.backend) {
    case 'llama-cpp':
      return 'llama.cpp'
    case 'ollama':
      return snapshot.backendVersion !== null && snapshot.backendVersion !== ''
        ? `ollama ${snapshot.backendVersion}`
        : 'ollama'
    case 'vllm':
      return 'vllm'
    default:
      return null
  }
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
      detail: null,
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
      detail: null,
      stale: false,
      title: 'slot-health — waiting for first sample',
    }
  }

  // --- 3. Staleness overlay (computed once, applied at the end) ---
  const age = now - snapshot.sampledAt
  const stale = age > STALE_MS

  // P8: prefix the stable label with the engine word (`ollama · loaded`).
  // `backend` is stable per endpoint, so the chip never changes width.
  const engine = backendWord(snapshot.backend)
  const label = (base: string): string => (engine === null ? base : `${engine} · ${base}`)

  // --- 4. Endpoint unreachable ---
  if (snapshot.state === 'unreachable') {
    const detail = snapshot.lastError ? ` — ${snapshot.lastError}` : ''
    return {
      state: 'unreachable',
      dot: STATE_DOT.unreachable,
      label: label('down'),
      detail: null,
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
      label: label('unknown'),
      detail: null,
      stale,
      title: withStale(`slot-health — endpoint shape not recognized${detail}`, stale, age),
    }
  }

  // --- 5a. P8 Ollama: up, nothing loaded (distinct honest state) ---
  if (snapshot.state === 'up-no-model') {
    return {
      state: 'no-model',
      dot: STATE_DOT['no-model'],
      label: label('no model'),
      detail: null,
      stale,
      title: withStale('slot-health — Ollama is up, no model loaded', stale, age),
    }
  }

  // --- 5b. P8 Ollama: up, ≥1 model resident (resident ≠ busy) ---
  if (snapshot.state === 'up-loaded') {
    const loaded = snapshot.ollama?.loaded ?? []
    const first = loaded.length > 0 ? loaded[0].name : null
    return {
      state: 'loaded',
      dot: STATE_DOT.loaded,
      label: label('loaded'),
      detail: first !== null ? `loaded · ${first}` : 'loaded',
      stale,
      title: withStale(
        `slot-health — Ollama: ${loaded.length} model${loaded.length === 1 ? '' : 's'} resident` +
          (first !== null ? ` (${first})` : ''),
        stale, age,
      ),
    }
  }

  // --- 6. Endpoint up (state === 'idle'): inspect slots ---

  // 6a. Slots unavailable (401 auth, 404, 5xx, fetch failure)
  if (snapshot.slots === null && snapshot.slotsError !== null) {
    const isAuth = /401|auth/i.test(snapshot.slotsError)
    return {
      state: 'error',
      dot: STATE_DOT.error,
      label: label(isAuth ? 'auth' : 'slots'),
      detail: null,
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
    const decodedDetail = totalDecoded > 0 ? `, ${totalDecoded} tokens decoded` : ''
    return {
      state: 'busy',
      dot: STATE_DOT.busy,
      // Stable: the dock chip must not widen every second as the age advances.
      // The pane header shows `detail` instead (REVIEW §2c).
      label: label('busy'),
      detail: `busy ${ageLabel(maxAgeMs)}${totalDecoded > 0 ? ` · dec ${totalDecoded}` : ''}`,
      stale,
      title: withStale(`slot-health — busy for ${ageLabel(maxAgeMs)}${decodedDetail}`, stale, age),
    }
  }

  // 6c. All slots idle (or zero slots, or no slot data)
  return {
    state: 'idle',
    dot: STATE_DOT.idle,
    label: label('idle'),
    detail: null,
    stale,
    title: withStale(
      `slot-health — all slots idle (${slots.length} slot${slots.length === 1 ? '' : 's'})`,
      stale, age,
    ),
  }
}

/**
 * P3: how long a busy slot may hold with nothing decoded before it reads as
 * wedged. 300 s is DSH's `streamIdleTimeoutMs` — the moment the client gives
 * up while the server still holds the slot. Evidence-based, not a bare timer
 * (phases/P3-wedged.md): the prompt must be fully processed AND zero tokens
 * decoded. Busy with prompt still climbing is healthy prefill; busy with
 * decodes flowing is a long (legitimate) request — neither is wedged.
 */
export const WEDGED_AFTER_MS = 300_000

/** Tone for a single slot card (REVIEW2 §2c border/preview escalation). */
export function slotTone(slot: SlotSample): 'na' | 'crit' {
  if (slot.state !== 'busy') return 'na'
  if (slot.busyAgeMs === null || slot.busyAgeMs < WEDGED_AFTER_MS) return 'na'
  const promptDone = slot.promptProgress !== null && slot.promptProgress >= 0.999
  return promptDone && slot.decoded === 0 ? 'crit' : 'na'
}

/** Append a stale line to a tooltip string when the sample is stale. */
function withStale(title: string, stale: boolean, ageMs: number): string {
  if (!stale) return title
  return `${title}\nstale — last updated ${ageLabel(ageMs)} ago`
}
