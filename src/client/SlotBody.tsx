/**
 * Live endpoint-health pane body.
 *
 * Pulls data via useSlotHealth — the store emits on every poll attempt
 * (~1 Hz), so the component re-renders every second and "updated N s ago"
 * advances even while the endpoint is stable. Self-contained (no props):
 * the slot registry mounts it bare.
 *
 * State → color (shared/types.ts):
 *   idle        → green  (endpoint up and serving)
 *   unreachable → red    (route refused / timeout / 5xx)
 *   unknown     → gray   (reachable, but response not recognizable)
 *
 * Two distinct failure layers:
 *   transport error — the plugin route itself failed → "no data — <error>"
 *   endpoint error  — route fine, endpoint down → state chip + snapshot.lastError
 *
 * P2: per-slot metric rows below the P1 rows. `snapshot.slots` is an array
 * (possibly empty) when `/slots` worked; `null` when it could not be used
 * (401/404/5xx/garbage), in which case `slotsError` is shown. Busy age and
 * TTFT come from host-side latches (`busyAgeMs`, `ttftMs`) — the `/slots`
 * payload has no timestamps, so these are null until the host has seen the
 * state across at least one transition (or the first decode).
 */
import type { CSSProperties, ReactNode } from 'react'
import { useSlotHealth } from './useSlotHealth.ts'
import type { EndpointState, SlotSample } from '../shared/types.ts'

/** A sample older than this many ms is rendered dimmed (stale). */
const STALE_MS = 3000

const STATE_COLOR: Record<EndpointState, string> = {
  idle: '#22c55e',
  unreachable: '#ef4444',
  unknown: '#8b93a7',
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
}

const muted: CSSProperties = { color: '#8b93a7', margin: 0 }

const rowLabel: CSSProperties = { color: '#8b93a7', width: 64, flexShrink: 0 }

const rowValue: CSSProperties = { fontFamily: MONO, color: '#c3c9d6' }

const slotHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  paddingTop: 6,
  borderTop: '1px solid rgba(139,147,167,0.2)',
}

function originLabel(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** Colored state chip (dot + label). */
function StateChip({ state }: { state: EndpointState }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: STATE_COLOR[state] }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLOR[state] }} />
      {state}
    </span>
  )
}

/** Thin inline meter bar for a 0..1 ratio. */
function Meter({ ratio, color = '#60a5fa' }: { ratio: number | null; color?: string }) {
  if (ratio === null) return null
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 72,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        background: 'rgba(139,147,167,0.25)',
        verticalAlign: 'middle',
      }}
    >
      <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: color }} />
    </span>
  )
}

/** ms → "185 ms" / "12.4 s" / "1 m 32 s"; null → "—". */
function fmtMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return `${m} m ${rem} s`
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

/** One label/value row in a slot block. */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={rowLabel}>{label}</span>
      <span style={rowValue}>{value}</span>
    </div>
  )
}

/** One slot's metric rows (P2). */
function SlotBlock({ slot }: { slot: SlotSample }) {
  const busy = slot.state === 'busy'
  const progressPct =
    slot.promptProgress !== null ? ` (${Math.round(slot.promptProgress * 100)}%)` : ''
  const pressurePct =
    slot.contextPressure !== null ? ` (${Math.round(slot.contextPressure * 100)}%)` : ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={slotHeader}>
        <b>slot {slot.id}</b>
        <span style={{ fontWeight: 600, color: busy ? '#f59e0b' : '#22c55e' }}>{busy ? 'busy' : 'idle'}</span>
        {busy && slot.idTask !== null && <span style={muted}>{slot.idTask}</span>}
      </div>
      <Row
        label="prompt"
        value={
          <>
            {fmtInt(slot.promptTokensProcessed)} / {fmtInt(slot.promptTokens)}
            {progressPct} <Meter ratio={slot.promptProgress} color="#f59e0b" />
          </>
        }
      />
      <Row label="decoded" value={fmtInt(slot.decoded)} />
      <Row label="busy" value={fmtMs(slot.busyAgeMs)} />
      <Row label="ttft" value={fmtMs(slot.ttftMs)} />
      <Row
        label="context"
        value={
          <>
            {fmtInt(slot.contextUsed)} / {fmtInt(slot.contextSize)}
            {pressurePct} <Meter ratio={slot.contextPressure} />
          </>
        }
      />
    </div>
  )
}

export function SlotBody() {
  const { snapshot, error, lastAttempt } = useSlotHealth()

  const now = lastAttempt ?? Date.now()
  const ageMs = snapshot ? now - snapshot.sampledAt : null
  const stale = ageMs !== null && ageMs > STALE_MS
  const age = ageMs === null ? null : `${Math.max(0, Math.round(ageMs / 1000))} s ago`

  // Transport-level failure: the plugin route itself is down.
  if (error !== null) {
    return (
      <div style={container}>
        {snapshot !== null && (
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#c3c9d6' }}>
            {originLabel(snapshot.origin)}
          </span>
        )}
        <p style={muted}>no data — {error}</p>
      </div>
    )
  }

  // No sample yet (poller just started, first attempt still in flight).
  if (snapshot === null) {
    return (
      <div style={container}>
        <p style={muted}>waiting for first sample…</p>
      </div>
    )
  }

  return (
    <div style={{ ...container, opacity: stale ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StateChip state={snapshot.state} />
        <span style={{ fontFamily: MONO, fontSize: 12, color: '#c3c9d6' }}>
          {originLabel(snapshot.origin)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <span>
          latency{' '}
          <b style={{ fontWeight: 600 }}>{snapshot.latencyMs === null ? '—' : `${snapshot.latencyMs} ms`}</b>
        </span>
        <span>
          updated{' '}
          <b style={{ fontWeight: 600 }}>
            {age}
            {stale ? ' (stale)' : ''}
          </b>
        </span>
      </div>
      {snapshot.lastError !== null && (
        <p style={{ ...muted, overflowWrap: 'anywhere' }}>{snapshot.lastError}</p>
      )}
      {snapshot.slots === null
        ? snapshot.slotsError !== null && (
            <p style={{ ...muted, overflowWrap: 'anywhere' }}>slots: {snapshot.slotsError}</p>
          )
        : snapshot.slots.map((slot) => <SlotBlock key={slot.id} slot={slot} />)}
    </div>
  )
}
