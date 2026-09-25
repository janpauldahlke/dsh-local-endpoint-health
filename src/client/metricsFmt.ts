/**
 * P7 (REVIEW §1) — pure coercion + formatting for the metrics pane section.
 *
 * No React. `MetricsBlock` renders exactly what this module returns, so the
 * render path cannot throw on a stale-host shape: pre-P7 hosts serve
 * `perPosLastRequest: null` and bare-number draft figures (`0.657`) instead
 * of the `{value, sample}` contract. Every coercer here accepts `unknown`
 * and degrades to "no row" instead of throwing. Unit-tested against the old
 * shape (test/metricsFmt.test.mjs).
 */
import type { DraftFigure } from '../shared/types.ts'

/** One per-position acceptance pair (position → accepted ratio). */
export interface PosFigure {
  position: number
  acceptance: number
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Coerce a draft figure to the `{value, sample}` shape:
 *  - `{value, sample}` object (current contract) → passthrough
 *  - bare finite number (pre-P7 legacy) → sample 0 (denominator unknown)
 *  - anything else → null (no row)
 */
export function toFigure(v: unknown): DraftFigure | null {
  if (isFiniteNumber(v)) return { value: v, sample: 0 }
  if (v !== null && typeof v === 'object') {
    const f = v as Partial<DraftFigure>
    if (isFiniteNumber(f.value) && isFiniteNumber(f.sample)) return { value: f.value, sample: f.sample }
  }
  return null
}

/**
 * `0.867 (n=30)` — the figure plus the denominator that backs it. A figure
 * without a known sample (legacy bare number) renders bare `0.867`, never
 * `undefined (n=undefined)`.
 */
export function fmtFigure(figure: DraftFigure | null): string | null {
  if (figure === null) return null
  return figure.sample > 0 ? `${figure.value} (n=${figure.sample})` : `${figure.value}`
}

/**
 * Coerce the per-position list. `null` (pre-P7 host) → `[]`; entries with a
 * missing/non-numeric field are dropped (the old contract allowed
 * `acceptance: null` per entry). Always returns an array.
 */
export function toPerPos(v: unknown): PosFigure[] {
  if (!Array.isArray(v)) return []
  const out: PosFigure[] = []
  for (const entry of v) {
    if (entry === null || typeof entry !== 'object') continue
    const p = entry as Partial<PosFigure>
    if (isFiniteNumber(p.position) && isFiniteNumber(p.acceptance)) {
      out.push({ position: p.position, acceptance: p.acceptance })
    }
  }
  return out
}

/** `p0 9 · p1 4` — one segment per position; `''` when empty. */
export function fmtPerPos(perPos: PosFigure[]): string {
  return perPos.map((p) => `p${p.position} ${p.acceptance}`).join(' · ')
}

/**
 * True when at least one metrics row would render. Accepts the raw section
 * in *any* shape (new or legacy) so the pane can skip the whole block without
 * touching fields a stale host may not have in the expected shape.
 */
export function metricsHasRows(m: unknown): boolean {
  if (m === null || typeof m !== 'object') return false
  const s = m as Record<string, unknown>
  for (const key of ['promptTokensPerSec', 'tokensPerSec', 'requestsDeferred', 'requestsProcessing', 'contextHighWater']) {
    if (isFiniteNumber(s[key])) return true
  }
  for (const scope of ['draftAcceptance', 'draftMeanLen']) {
    const d = s[scope]
    if (d !== null && typeof d === 'object') {
      const dd = d as Record<string, unknown>
      if (toFigure(dd.lifetime) !== null || toFigure(dd.lastRequest) !== null) return true
    }
  }
  return toPerPos(s.perPosLastRequest).length > 0
}
