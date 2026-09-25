/**
 * P7 + REVIEW2 — server-wide `/metrics` rows as a collapsible card.
 *
 * Renders a `MetricsSection` inside the shared `CollapsibleCard` (GpuCard
 * chrome). Collapsed by default (noisy when idle); the collapsed preview
 * carries the key numbers — `prompt/decode tok/s` and lifetime draft
 * acceptance — each with its own native tooltip (REVIEW2 §2b/§2d).
 *
 * Every value is null-able and a row renders only for a non-null value
 * (types.ts contract), so the whole card can vanish without leaving a layout
 * hole — capability `no`, endpoint down, or spec off all just mean fewer
 * rows. AC6: these are the *server's own* counters (counter-delta rates,
 * queue depth, context high-water, spec diagnostics) — not a tok/s clone of
 * the GPU monitor. AC12: acceptance / mean length rows are labeled lifetime
 * vs last req and show their denominator (`0.87 (n=30)`).
 *
 * A not-fresh section (transient fetch failure while capability is `yes`)
 * keeps its last values but the card is dimmed, with the error shown.
 *
 * REVIEW §1 (hardening): every field is coerced through `./metricsFmt.ts`
 * (pure, unit-tested) before rendering — stale-host shapes degrade to fewer
 * rows instead of throwing.
 */
import type { MetricsSection } from '../shared/types.ts'
import { ageLabel } from './slotState.ts'
import { CollapsibleCard } from './card.tsx'
import type { CardPreviewStat } from './card.tsx'
import { Row, muted } from './row.tsx'
import { fmtFigure, fmtPerPos, metricsHasRows, toFigure, toPerPos } from './metricsFmt.ts'

export function MetricsCard({ metrics }: { metrics: MetricsSection }) {
  // Skip empty sections before touching nested fields (a partial/stale payload
  // must never throw on the way to "no rows").
  if (!metricsHasRows(metrics)) return null

  // Coerce before rendering — see the module doc (REVIEW §1). Optional
  // chaining: a stale host may omit draftAcceptance/draftMeanLen entirely.
  const accLifeFig = toFigure(metrics.draftAcceptance?.lifetime)
  const accLastFig = toFigure(metrics.draftAcceptance?.lastRequest)
  const lenLifeFig = toFigure(metrics.draftMeanLen?.lifetime)
  const lenLastFig = toFigure(metrics.draftMeanLen?.lastRequest)
  const accLife = fmtFigure(accLifeFig)
  const accLast = fmtFigure(accLastFig)
  const lenLife = fmtFigure(lenLifeFig)
  const lenLast = fmtFigure(lenLastFig)
  const perPos = toPerPos(metrics.perPosLastRequest)
  const specRows =
    accLife !== null || accLast !== null || lenLife !== null || lenLast !== null || perPos.length > 0

  // --- Collapsed preview (REVIEW2 §2b) ---
  const preview: CardPreviewStat[] = []
  const promptRate = metrics.promptTokensPerSec
  const decodeRate = metrics.tokensPerSec
  preview.push({
    text:
      promptRate !== null || decodeRate !== null
        ? `${promptRate ?? '—'}/${decodeRate ?? '—'} tok/s`
        : '—',
    title: `Prompt / decode tokens per second — counter delta over the sample window, from the server's own /metrics`,
  })
  // Use the coerced figure — raw `.lifetime` may be a bare number on a stale
  // host, and `bare.value` is undefined → "acc NaN%" in the preview.
  if (accLifeFig !== null) {
    preview.push({
      text: `acc ${Math.round(accLifeFig.value * 100)}%`,
      title: `Draft acceptance, lifetime (n=${accLifeFig.sample}) — accepted / draft tokens since server start`,
    })
  }

  const windowLabel = metrics.rateWindowMs > 0 ? `${ageLabel(metrics.rateWindowMs)} window` : null

  return (
    <CollapsibleCard
      storageKey="dsh.slotHealth.card.metrics"
      label="SERVER"
      defaultExpanded={false}
      dim={!metrics.fresh}
      headerTitle="Click to expand: rates, queue depth, context high-water, speculative-decode rows (source: /metrics)"
      meta={
        windowLabel !== null
          ? { text: windowLabel, title: 'Sample window the rates were derived over (ms since the last baseline)' }
          : undefined
      }
      preview={preview}
    >
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
          tooltip="Context high-water: largest token count any slot's context has reached since server start, from /metrics. Resets on server restart."
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
    </CollapsibleCard>
  )
}
