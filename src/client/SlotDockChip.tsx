/**
 * Compact dock chip for slot-health. Renders in `conversation.composer.dock`;
 * hides itself while the rightbar pane is open (refcounted via paneState).
 * Clicking it opens the slot-health tab in the rightbar.
 *
 * State, color, label, and staleness all come from `slotState.deriveChip()`
 * — the same pure derivation the pane body uses, so the two surfaces can
 * never disagree.
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

  return (
    <button
      type="button"
      onClick={onOpen}
      title={display.title}
      aria-label={`Slot health: ${display.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '1px 8px',
        borderRadius: 999,
        border: '1px solid rgba(128,128,128,0.25)',
        background: 'transparent',
        color: 'inherit',
        fontSize: '11.5px',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        cursor: 'pointer',
        opacity: stale ? 0.55 : 1,
        transition: 'opacity 200ms',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: display.dot,
          flexShrink: 0,
        }}
      />
      {display.label}
    </button>
  )
}
