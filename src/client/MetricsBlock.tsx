/**
 * P7 — server-wide `/metrics` rows in the pane.
 *
 * Renders a `MetricsSection` from the snapshot. Every value is null-able and
 * a row renders only for a non-null value (types.ts contract), so the whole
 * block can vanish without leaving a layout hole — capability `no`, endpoint
 * down, or spec off all just mean fewer rows.
 *
 * AC6 (not a tok/s clone): the rows are the *server's own* counters —
 * counter-delta rates over the sample window, queue depth, context high-water,
 * and speculative-decode diagnostics. There is no per-GPU throughput here.
 *
 * AC12 (acceptance labeled lifetime vs delta): the draft acceptance / mean
 * length rows carry an explicit scope label — `life` (cumulative since server
 * start) vs `last` (the delta across the most recent completed request's
 * id_task boundary) — and each figure shows its denominator: `0.87 (n=30)`.
 * A bare ratio without n is untrustworthy (NOTES §Cause A FROZEN).
 *
 * A not-fresh section (transient fetch failure while capability is `yes`)
 * keeps its last values but is dimmed, with the error shown.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { DraftFigure, MetricsSection } from '../shared/types.ts'
import { ageLabel } from './slotState.ts'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const block: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  paddingTop: 6,
  borderTop: '1px solid rgba(139,147,167,0.2)',
}

const sectionHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  marginBottom: 2,
}

const muted: CSSProperties = { color: '#8b93a7', margin: 0 }

const rowLabel: CSSProperties = { color: '#8b93a7', width: 96, flexShrink: 0 }

const rowValue: CSSProperties = { fontFamily: MONO, color: '#c3c9d6' }

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={rowLabel}>{label}</span>
      <span style={rowValue}>{value}</span>
    </div>
  )
}

/** `0.867 (n=30)` — the figure plus the denominator that backs it. */
function fmtFigure(figure: DraftFigure | null): string | null {
  if (figure === null) return null
  return `${figure.value} (n=${figure.sample})`
}

export function MetricsBlock({ metrics }: { metrics: MetricsSection }) {
  const accLife = fmtFigure(metrics.draftAcceptance.lifetime)
  const accLast = fmtFigure(metrics.draftAcceptance.lastRequest)
  const lenLife = fmtFigure(metrics.draftMeanLen.lifetime)
  const lenLast = fmtFigure(metrics.draftMeanLen.lastRequest)
  const perPos = metrics.perPosLastRequest
  const specRows = [accLife, accLast, lenLife, lenLast].some((v) => v !== null) || perPos.length > 0
  const anyRate = metrics.promptTokensPerSec !== null || metrics.tokensPerSec !== null
  const anyGauge =
    metrics.requestsDeferred !== null ||
    metrics.requestsProcessing !== null ||
    metrics.contextHighWater !== null
  const hasRows = anyRate || anyGauge || specRows

  if (!hasRows) return null

  const windowLabel = metrics.rateWindowMs > 0 ? `${ageLabel(metrics.rateWindowMs)} window` : null

  return (
    <div style={{ ...block, opacity: metrics.fresh ? 1 : 0.55 }}>
      <div style={sectionHeader}>
        <b>server metrics</b>
        {windowLabel !== null && <span style={muted}>{windowLabel}</span>}
      </div>
      {metrics.promptTokensPerSec !== null && (
        <Row label="prompt /s" value={metrics.promptTokensPerSec} />
      )}
      {metrics.tokensPerSec !== null && <Row label="decode /s" value={metrics.tokensPerSec} />}
      {metrics.requestsDeferred !== null && <Row label="deferred" value={metrics.requestsDeferred} />}
      {metrics.requestsProcessing !== null && <Row label="active" value={metrics.requestsProcessing} />}
      {metrics.contextHighWater !== null && (
        <Row label="ctx peak" value={metrics.contextHighWater.toLocaleString('en-US')} />
      )}
      {specRows && (
        <>
          {accLife !== null && <Row label="acc · lifetime" value={accLife} />}
          {accLast !== null && <Row label="acc · last req" value={accLast} />}
          {lenLife !== null && <Row label="len · lifetime" value={lenLife} />}
          {lenLast !== null && <Row label="len · last req" value={lenLast} />}
          {perPos.length > 0 && (
            <Row
              label="per-pos · last"
              value={perPos.map((p) => `p${p.position} ${p.acceptance}`).join(' · ')}
            />
          )}
        </>
      )}
      {!metrics.fresh && metrics.error !== null && (
        <p style={{ ...muted, overflowWrap: 'anywhere', marginTop: 2 }}>{metrics.error}</p>
      )}
    </div>
  )
}
