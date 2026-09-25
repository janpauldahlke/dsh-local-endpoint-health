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
 * length rows carry an explicit scope label — `lifetime` (cumulative since
 * server start) vs `last req` (the delta across the most recent completed
 * request's id_task boundary) — and each figure shows its denominator:
 * `0.87 (n=30)`. A bare ratio without n is untrustworthy (NOTES §Cause A
 * FROZEN).
 *
 * A not-fresh section (transient fetch failure while capability is `yes`)
 * keeps its last values but is dimmed, with the error shown.
 *
 * REVIEW §1 (hardening): every field is coerced through `./metricsFmt.ts`
 * (pure, unit-tested) before rendering. A pre-P7 host serves
 * `perPosLastRequest: null` and bare-number draft figures; the coercers
 * degrade those to "fewer rows" instead of throwing (the old code crashed
 * the whole pane on `null.length`).
 *
 * REVIEW §2 (visual language): rows come from ./row.tsx — same three-column
 * rhythm and color-mix ink as the slot rows.
 */
import type { CSSProperties } from 'react'
import type { MetricsSection } from '../shared/types.ts'
import { ageLabel } from './slotState.ts'
import { HAIRLINE, Row, muted } from './row.tsx'
import { fmtFigure, fmtPerPos, metricsHasRows, toFigure, toPerPos } from './metricsFmt.ts'

const block: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  paddingTop: 6,
  borderTop: HAIRLINE,
}

const sectionHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  marginBottom: 2,
}

export function MetricsBlock({ metrics }: { metrics: MetricsSection }) {
  // Coerce before rendering — see the module doc (REVIEW §1).
  const accLife = fmtFigure(toFigure(metrics.draftAcceptance.lifetime))
  const accLast = fmtFigure(toFigure(metrics.draftAcceptance.lastRequest))
  const lenLife = fmtFigure(toFigure(metrics.draftMeanLen.lifetime))
  const lenLast = fmtFigure(toFigure(metrics.draftMeanLen.lastRequest))
  const perPos = toPerPos(metrics.perPosLastRequest)
  const specRows =
    accLife !== null || accLast !== null || lenLife !== null || lenLast !== null || perPos.length > 0

  const hasRows = metricsHasRows(metrics)
  if (!hasRows) return null

  const windowLabel = metrics.rateWindowMs > 0 ? `${ageLabel(metrics.rateWindowMs)} window` : null

  return (
    <div style={{ ...block, opacity: metrics.fresh ? 1 : 0.55 }}>
      <div style={sectionHeader}>
        <b>server metrics</b>
        {windowLabel !== null && <span style={muted}>{windowLabel}</span>}
      </div>
      {metrics.promptTokensPerSec !== null && (
        <Row
          label="prompt /s"
          value={`${metrics.promptTokensPerSec} tok/s`}
          tooltip="Prompt-encoding rate: prompt-token counter delta across the shown sample window, from the server's own /metrics (llamacpp:prompt_tokens_total). Not a GPU figure."
        />
      )}
      {metrics.tokensPerSec !== null && (
        <Row
          label="decode /s"
          value={`${metrics.tokensPerSec} tok/s`}
          tooltip="Decoding rate: predicted-token counter delta across the shown sample window, from the server's own /metrics (llamacpp:tokens_predicted_total)."
        />
      )}
      {metrics.requestsDeferred !== null && (
        <Row
          label="deferred"
          value={String(metrics.requestsDeferred)}
          tooltip="Server gauge: requests deferred (queued) right now, from /metrics (llamacpp:requests_deferred)."
        />
      )}
      {metrics.requestsProcessing !== null && (
        <Row
          label="active"
          value={String(metrics.requestsProcessing)}
          tooltip="Server gauge: requests being processed right now, from /metrics (llamacpp:requests_processing)."
        />
      )}
      {metrics.contextHighWater !== null && (
        <Row
          label="ctx peak"
          value={metrics.contextHighWater.toLocaleString('en-US')}
          tooltip="Context high-water: largest token count any slot's context has reached since server start, from /metrics (llamacpp:context_peeked_total-style gauge). Resets on server restart."
        />
      )}
      {specRows && (
        <>
          {accLife !== null && (
            <Row
              label="acc · lifetime"
              value={accLife}
              tooltip="Draft acceptance, cumulative since server start: accepted draft tokens / draft tokens, from /metrics spec_decode counters. (n=) is the draft-token denominator."
            />
          )}
          {accLast !== null && (
            <Row
              label="acc · last req"
              value={accLast}
              tooltip="Draft acceptance across the most recent completed request only (id_task boundary delta). (n=) is the draft-token denominator for that request."
            />
          )}
          {lenLife !== null && (
            <Row
              label="len · lifetime"
              value={lenLife}
              tooltip="Mean accepted draft length, cumulative since server start: accepted tokens / draft attempts. (n=) is the draft-attempt denominator."
            />
          )}
          {lenLast !== null && (
            <Row
              label="len · last req"
              value={lenLast}
              tooltip="Mean accepted draft length across the most recent completed request only. (n=) is the draft-attempt denominator for that request."
            />
          )}
          {perPos.length > 0 && (
            <Row
              label="per-pos · last"
              value={fmtPerPos(perPos)}
              tooltip="Per-position draft acceptance of the last completed request (MTP diagnostic): position → tokens accepted at that position."
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
