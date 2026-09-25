/**
 * Live endpoint-health pane body.
 *
 * Pulls data via useSlotHealth — the store emits on every poll attempt
 * (~1 Hz), so the component re-renders every second and "updated N s ago"
 * advances even while the endpoint is stable. Self-contained (no props):
 * the slot registry mounts it bare.
 *
 * Header state → color/label comes from `slotState.deriveChip()` — the same
 * pure derivation the dock chip uses, so the two surfaces cannot disagree
 * (the header previously rendered the raw endpoint-level `snapshot.state`,
 * which showed green "idle" while a slot was busy). The header shows the
 * rich `detail` label (`busy 22s · dec 892`); the dock chip shows the stable
 * short `label` so the dock row never shifts (REVIEW §2c).
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
 *
 * P7: `MetricsBlock` (server-wide /metrics rows) renders below the slot
 * blocks; null section ⇒ hidden, no layout hole.
 *
 * REVIEW §2: rows use the GPU-monitor three-column layout (./row.tsx) with
 * color-mix ink — no hardcoded greys, no meter sliding under variable
 * number widths.
 */
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useSlotHealth } from './useSlotHealth.ts'
import type { SlotSample } from '../shared/types.ts'
import { setPaneOpen } from './paneState.ts'
import { deriveChip, STATE_DOT } from './slotState.ts'
import { HAIRLINE, MONO, Row, muted } from './row.tsx'
import { MetricsBlock } from './MetricsBlock.tsx'

/** A sample older than this many ms is rendered dimmed (stale). */
const STALE_MS = 3000

const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
  color: 'inherit',
}

function originLabel(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
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

/** One slot's metric rows (P2). */
function SlotBlock({ slot }: { slot: SlotSample }) {
  const busy = slot.state === 'busy'
  const promptPct = slot.promptProgress !== null ? Math.round(slot.promptProgress * 100) : null
  const ctxPct = slot.contextPressure !== null ? Math.round(slot.contextPressure * 100) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 6, borderTop: HAIRLINE }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b>slot {slot.id}</b>
        <span style={{ fontWeight: 600, color: busy ? STATE_DOT.busy : STATE_DOT.idle, fontVariantNumeric: 'tabular-nums' }}>
          {busy ? 'busy' : 'idle'}
        </span>
        {busy && slot.idTask !== null && <span style={muted}>{slot.idTask}</span>}
      </div>
      <Row
        label="prompt"
        value={`${fmtInt(slot.promptTokensProcessed)} / ${fmtInt(slot.promptTokens)}${promptPct !== null ? ` (${promptPct}%)` : ''}`}
        meter={slot.promptProgress}
        tooltip="Prompt tokens processed vs total for this request, from /slots (prompt_tokens / prompt_tokens_total). The bar is the processed share."
      />
      <Row
        label="decoded"
        value={fmtInt(slot.decoded)}
        tooltip="Decoded (generated) tokens so far in this request, from /slots."
      />
      <Row
        label="busy"
        value={fmtMs(slot.busyAgeMs)}
        tooltip="How long this slot has been busy, latched host-side at the idle→busy transition. Null until the host has observed the transition."
      />
      <Row
        label="ttft"
        value={fmtMs(slot.ttftMs)}
        tooltip="Time to first token: host-latched elapsed time from the busy transition to the first decoded token. Null until the first decode is observed."
      />
      <Row
        label="context"
        value={`${fmtInt(slot.contextUsed)} / ${fmtInt(slot.contextSize)}${ctxPct !== null ? ` (${ctxPct}%)` : ''}`}
        meter={slot.contextPressure}
        tooltip="Context used vs the slot's configured n_ctx, from /slots. The bar is the pressure share."
      />
    </div>
  )
}

export function SlotBody() {
  const { snapshot, error, lastAttempt } = useSlotHealth()

  // Report mount/unmount to paneState so the dock chip hides while this
  // pane is open (refcounted — safe with multiple sessions).
  useEffect(() => {
    setPaneOpen(true)
    return () => setPaneOpen(false)
  }, [])

  const now = lastAttempt ?? Date.now()
  const ageMs = snapshot ? now - snapshot.sampledAt : null
  const stale = ageMs !== null && ageMs > STALE_MS
  const age = ageMs === null ? null : `${Math.max(0, Math.round(ageMs / 1000))} s ago`

  // Transport-level failure: the plugin route itself is down.
  if (error !== null) {
    return (
      <div style={container}>
        {snapshot !== null && (
          <span style={{ fontFamily: MONO, fontSize: 12 }}>
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

  const chip = deriveChip({ snapshot, error, lastAttempt }, now)
  const latency = snapshot.latencyMs === null ? '—' : snapshot.latencyMs < 1 ? '<1 ms' : `${snapshot.latencyMs} ms`

  return (
    <div style={{ ...container, opacity: stale ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          title={chip.title}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: chip.dot }}
        >
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: chip.dot, flexShrink: 0 }} />
          {chip.detail ?? chip.label}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'color-mix(in srgb, currentColor 70%, transparent)' }}>
          {originLabel(snapshot.origin)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, fontVariantNumeric: 'tabular-nums' }}>
        <span>
          latency{' '}
          <b style={{ fontWeight: 600 }}>{latency}</b>
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
      {/* P7: server-wide /metrics rows (null ⇒ section hidden, no hole). */}
      {snapshot.metrics !== null && <MetricsBlock metrics={snapshot.metrics} />}
    </div>
  )
}
