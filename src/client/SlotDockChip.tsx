/**
 * Compact dock chip for slot-health. Renders in `conversation.composer.dock`;
 * hides itself while the rightbar pane is open (refcounted via paneState).
 * Clicking it opens the slot-health tab in the rightbar.
 *
 * State, color, label, and staleness all come from `slotState.deriveChip()`
 * — the same pure derivation the pane body uses, so the two surfaces can
 * never disagree.
 *
 * Chrome is copied from the GPU monitor's dock chip (GpuDockChip): same
 * padding / radius / font / weight / tracking, same `currentColor`-mix
 * border + background wash, glowing dot when fresh — so the two pills sit
 * in the composer dock at the same height and read as siblings.
 */
import { useEffect, useState } from 'react'
import { useSlotHealth } from './useSlotHealth.ts'
import { deriveChip } from './slotState.ts'
import { isPaneOpen, subscribePaneOpen } from './paneState.ts'

interface Props {
  /** Called when the chip is clicked (opens the rightbar tab). */
  onOpen: () => void
}

export function SlotDockChip({ onOpen }: Props): React.JSX.Element | null {
  const live = useSlotHealth()
  const [paneOpen, setPaneOpenState] = useState(isPaneOpen)
  const [now, setNow] = useState(() => Date.now())

  // Track pane-open changes (refcounted).
  useEffect(() => subscribePaneOpen(() => setPaneOpenState(isPaneOpen())), [])

  // Re-render every second so the "age" label advances even when the store
  // is quiet (e.g. the endpoint is idle and the snapshot doesn't change).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (paneOpen) return null

  const display = deriveChip(live, now)
  const stale = display.stale
  // Dot glows while we have a sample and it is fresh (GPU-chip behaviour);
  // waiting / transport-error = no data, no glow.
  const hasData = display.state !== 'waiting' && display.state !== 'error'

  return (
    <button
      type="button"
      onClick={onOpen}
      title={display.title}
      aria-label={`Slot health: ${display.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        padding: '1px 8px',
        borderRadius: 999,
        border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
        background: 'color-mix(in srgb, currentColor 6%, transparent)',
        color: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        cursor: 'pointer',
        opacity: stale ? 0.55 : 1,
        transition: 'opacity 200ms',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: display.dot,
          display: 'inline-block',
          boxShadow: hasData && !stale ? `0 0 5px ${display.dot}` : 'none',
          flexShrink: 0,
        }}
      />
      {display.label}
    </button>
  )
}
