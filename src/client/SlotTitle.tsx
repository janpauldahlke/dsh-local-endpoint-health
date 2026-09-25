/**
 * Live tab title chip: state-colored dot + label. Subscribes to the same
 * refcounted store as SlotBody, so the dot tracks the latest sample even if
 * the pane body is not currently mounted.
 */
import { useSlotHealth } from './useSlotHealth.ts'
import type { EndpointState } from '../shared/types.ts'

const STATE_COLOR: Record<EndpointState, string> = {
  idle: '#22c55e',
  unreachable: '#ef4444',
  unknown: '#8b93a7',
}

/** Grey while there is no data yet, or the transport itself is failing. */
const NO_DATA_COLOR = '#8b93a7'

export function SlotTitle() {
  const { snapshot, error } = useSlotHealth()
  const dot = error !== null || snapshot === null ? NO_DATA_COLOR : STATE_COLOR[snapshot.state]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dot,
          display: 'inline-block',
        }}
      />
      Slot Health
    </span>
  )
}
