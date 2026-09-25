/**
 * Shared row primitives for the pane (REVIEW §2a — the GPU monitor's visual
 * language, per STYLE.md):
 *
 *   [label]  [meter flex:1]  [value right, tabular-nums]
 *
 * The meter grows in the middle and the value is always right-aligned, so a
 * changing number width never shifts the bar (the old inline meter slid
 * every tick). All ink is derived from `currentColor` via `color-mix`, so
 * the rows read correctly in light and dark themes alike. Both SlotBody and
 * MetricsBlock build rows from these so the two sections share one rhythm.
 */
import type { CSSProperties } from 'react'

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** Muted text (labels, separators, error notes): 55% of the theme ink. */
export const muted: CSSProperties = { color: 'color-mix(in srgb, currentColor 55%, transparent)', margin: 0 }

/** Hairline for section separators (STYLE.md border rule). */
export const HAIRLINE = '1px solid color-mix(in srgb, currentColor 22%, transparent)'

/**
 * A meter with its own native tooltip, separate from the row's long
 * explanation (REVIEW2 §2d — the GPU Row API: `meter: { ratio, tooltip }`).
 */
export interface MeterSpec {
  /** 0..1 share of the scale; null renders an empty track (no data yet). */
  ratio: number | null
  /** Short exact share, e.g. `Prompt 5% of 42,437 tokens`. */
  tooltip: string
}

/**
 * Thin horizontal meter for a 0..1 ratio (GPU `Meter` geometry: 4px track,
 * flex middle). The fill is a currentColor mix so it inherits the theme.
 * `ratio` null (no data yet) renders an empty track, never a hole.
 */
export function Meter({ ratio, tooltip }: { ratio: number | null; tooltip: string }) {
  const w = ratio === null || !Number.isFinite(ratio) ? 0 : Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div
      title={tooltip}
      style={{
        flex: 1,
        height: 4,
        borderRadius: 2,
        background: 'color-mix(in srgb, currentColor 10%, transparent)',
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      <div
        style={{
          width: `${w}%`,
          height: '100%',
          borderRadius: 2,
          background: 'color-mix(in srgb, currentColor 60%, transparent)',
          transition: 'width 0.6s linear',
        }}
      />
    </div>
  )
}

/**
 * One labeled metric row: muted name on the left, an optional meter in the
 * middle, the value right-aligned in tabular figures, and an optional
 * caption line under the value (GPU Row API). `tooltip` explains the metric
 * and where it comes from (STYLE.md: a tooltip on every row).
 */
export function Row({
  label,
  value,
  caption,
  meter,
  tooltip,
}: {
  label: string
  value: string
  /** Small muted line under the value (e.g. `75,466 free`). */
  caption?: string
  /** Optional meter; carries its own short tooltip (distinct from `tooltip`). */
  meter?: MeterSpec
  tooltip?: string
}) {
  return (
    <div
      title={tooltip}
      style={{
        display: 'flex',
        alignItems: meter !== undefined ? 'center' : 'baseline',
        gap: 12,
        padding: '2.5px 0',
        cursor: 'default',
      }}
    >
      <span style={{ fontSize: 11.5, color: 'color-mix(in srgb, currentColor 55%, transparent)', flexShrink: 0 }}>
        {label}
      </span>
      {meter !== undefined && <Meter ratio={meter.ratio} tooltip={meter.tooltip} />}
      <span style={{ textAlign: 'right', flexShrink: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </span>
        {caption !== undefined && (
          <span
            style={{
              display: 'block',
              fontSize: 10.5,
              color: 'color-mix(in srgb, currentColor 45%, transparent)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {caption}
          </span>
        )}
      </span>
    </div>
  )
}
