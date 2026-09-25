/**
 * REVIEW2 §2c — `CollapsibleCard`: the card chrome copied from the GPU
 * monitor's `GpuCard` (same constants, hover wash, chevron, keyboard/a11y,
 * per-card `localStorage` persistence). One shared component for the slot
 * card(s) and the server-metrics card — no forked card styles.
 *
 * Expand policy (REVIEW2 §2a): the caller supplies `defaultExpanded`, which
 * applies only until the user explicitly toggles the card (the choice is then
 * persisted under `storageKey` and wins forever after). The slot cards pass
 * a *live* default (expanded while busy/wedged, collapsed while idle); the
 * metrics card passes a static `false` (collapsed by default).
 *
 * Chrome (GpuCard constants, don't invent):
 *   shell    borderRadius 8, overflow hidden, border currentColor 18%
 *            (warn/crit borders for escalating tones)
 *   header   padding 8px 10px, hover wash currentColor 6%, chevron ▸
 *            rotates 90° when open, label chip (10.5/700, 12% fill)
 *   body     padding 6px 10px 8px, top hairline (currentColor 12%),
 *            rendered only while expanded
 *   a11y     role=button, tabIndex 0, Enter/Space toggles, aria-expanded
 *
 * All ink is currentColor-derived (color-mix) so the card rides the theme.
 * The "popover" feel is native `title` attributes — header, accent, and each
 * preview stat carry their own (REVIEW2 §2d); no floating popover library.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'

export type CardTone = 'na' | 'warn' | 'crit'

/** One short tabular number in the collapsed preview, with its own title. */
export interface CardPreviewStat {
  text: string
  /** One-liner, source-honest (e.g. "Context used / n_ctx — from /slots"). */
  title: string
  tone?: CardTone
}

function readOverride(key: string): boolean | null {
  try {
    const v = localStorage.getItem(key)
    if (v === '1') return true
    if (v === '0') return false
    return null
  } catch {
    return null
  }
}

const toneColor = (t: CardTone): string | undefined =>
  t === 'warn'
    ? 'color-mix(in srgb, #fbbf24 75%, currentColor)'
    : t === 'crit'
      ? 'color-mix(in srgb, #f87171 80%, currentColor)'
      : undefined

export function CollapsibleCard({
  storageKey,
  label,
  tone = 'na',
  defaultExpanded = false,
  headerTitle,
  accent,
  meta,
  preview,
  dim = false,
  children,
}: {
  /** localStorage key for the user's explicit expand/collapse choice. */
  storageKey: string
  /** Label chip text, e.g. `SLOT 0` / `SERVER`. */
  label: string
  /** Border + preview tone; `crit` for wedged / auth / slots errors. */
  tone?: CardTone
  /** Expand state when the user has not toggled this card yet. */
  defaultExpanded?: boolean
  /** Tooltip on the whole header (what expanding reveals). */
  headerTitle: string
  /** Optional state word after the label chip (e.g. `busy` in blue). */
  accent?: { text: string; color: string; title?: string }
  /** Optional muted meta after the label chip (e.g. the metrics window). */
  meta?: { text: string; title?: string }
  /** Right-aligned preview cluster; each stat gets its own `title`. */
  preview: CardPreviewStat[]
  /** Dim the whole card (stale sample / not-fresh metrics). */
  dim?: boolean
  children: ReactNode
}) {
  // null = the user has not toggled yet → follow the (possibly live) policy.
  const [override, setOverride] = useState<boolean | null>(() => readOverride(storageKey))
  const expanded = override ?? defaultExpanded
  const setExpanded = (next: boolean) => {
    setOverride(next)
    try {
      localStorage.setItem(storageKey, next ? '1' : '0')
    } catch {
      // storage unavailable; in-memory only
    }
  }
  const [hover, setHover] = useState(false)
  const border =
    tone === 'crit'
      ? '1px solid color-mix(in srgb, #f87171 60%, transparent)'
      : tone === 'warn'
        ? '1px solid color-mix(in srgb, #fbbf24 45%, transparent)'
        : '1px solid color-mix(in srgb, currentColor 18%, transparent)'
  // The accent word is state-colored (e.g. busy → blue); an escalating card
  // tone overrides it (wedged / auth / slots error → red / amber).
  const accentColor = accent !== undefined && tone !== 'na' ? toneColor(tone) : undefined

  return (
    <div style={{ border, borderRadius: 8, overflow: 'hidden', opacity: dim ? 0.55 : 1 }}>
      {/* Collapsible header: chevron + label chip + accent + preview cluster */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        title={headerTitle}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          padding: '8px 10px',
          cursor: 'pointer',
          userSelect: 'none',
          background: hover ? 'color-mix(in srgb, currentColor 6%, transparent)' : 'transparent',
          transition: 'background 120ms',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            fontSize: 10,
            lineHeight: 1,
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 150ms',
            color: 'color-mix(in srgb, currentColor 50%, transparent)',
          }}
        >
          ▸
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.05em',
            padding: '1px 6px',
            borderRadius: 4,
            background: 'color-mix(in srgb, currentColor 12%, transparent)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {accent !== undefined && (
          <span
            title={accent.title}
            style={{
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: accentColor ?? accent.color,
            }}
          >
            {accent.text}
          </span>
        )}
        {meta !== undefined && (
          <span
            title={meta.title}
            style={{
              fontSize: 11,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              color: 'color-mix(in srgb, currentColor 55%, transparent)',
            }}
          >
            {meta.text}
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 8,
            flexWrap: 'wrap',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 11,
            color: 'color-mix(in srgb, currentColor 75%, transparent)',
          }}
        >
          {preview.map((s, i) => (
            <span
              key={i}
              title={s.title}
              style={{
                whiteSpace: 'nowrap',
                ...(toneColor(s.tone ?? 'na') ? { color: toneColor(s.tone ?? 'na') } : {}),
              }}
            >
              {s.text}
            </span>
          ))}
        </span>
      </div>

      {/* Expanded body (hidden while collapsed): hairline + rows */}
      {expanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '6px 10px 8px',
            borderTop: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
