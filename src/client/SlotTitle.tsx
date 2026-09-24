/**
 * P0 placeholder tab title chip: a neutral (grey) dot + label. Becomes the
 * live fleet health indicator in later phases.
 */
export function SlotTitle() {
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
          background: '#8b93a7',
          display: 'inline-block',
        }}
      />
      Slot Health
    </span>
  )
}
