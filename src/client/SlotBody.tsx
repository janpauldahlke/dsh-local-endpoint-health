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
 */
import type { CSSProperties } from 'react'
import { useSlotHealth } from './useSlotHealth.ts'
import type { EndpointState } from '../shared/types.ts'

/** A sample older than this many ms is rendered dimmed (stale). */
const STALE_MS = 3000

const STATE_COLOR: Record<EndpointState, string> = {
  idle: '#22c55e',
  unreachable: '#ef4444',
  unknown: '#8b93a7',
}

const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
}

const muted: CSSProperties = { color: '#8b93a7', margin: 0 }

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
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#c3c9d6' }}>
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
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#c3c9d6' }}>
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
    </div>
  )
}
