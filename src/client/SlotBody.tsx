/**
 * P0 placeholder pane body. Proves client activation: if the rightbar tab
 * opens and this text renders, the client half is live. Replaced by the
 * live endpoint health table in later phases.
 */
export function SlotBody() {
  return (
    <div
      style={{
        padding: 12,
        fontFamily: 'inherit',
        fontSize: 13,
        color: 'currentColor',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Slot Health</div>
      <div style={{ opacity: 0.7, lineHeight: 1.5 }}>
        Plugin active — endpoint health sampling arrives in a later phase.
      </div>
    </div>
  )
}
