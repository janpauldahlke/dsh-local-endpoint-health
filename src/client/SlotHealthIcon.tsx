/**
 * Slot Health guide icon (REVIEW §2d): a cardio-monitor / ECG pulse line.
 * Reads as "health" instead of the guide's default cube placeholder (which
 * GPU Monitor also lacks, so the two panes would look identical in the guide
 * list). currentColor — rides the theme like the blueprint's TerminalIcon.
 *
 * Typing: the guide's `icon` field expects `ComponentType<IconProps>` where
 * `IconProps` comes from `@deepseek-ai/dsh-client-ui-primitives`, which is
 * not in this project's node_modules (it stays a build external). We mirror
 * it structurally here — `{ size?: number; className?: string }` — and
 * return a plain element, which is assignable under the registry's (older)
 * React typings. The build erases nothing: the component is a plain value.
 */
interface GuideIconProps {
  /** Square edge in px; the guide passes 22 (no description) or 26. */
  size?: number
  /** Extra class for layout placement; color rides currentColor. */
  className?: string
}

/**
 * Render the guide's slot-health capsule glyph: an ECG heartbeat trace.
 * @param props - canvas size and layout class supplied by the guide.
 * @returns a decorative pulse line in the surrounding text color.
 */
export function SlotHealthGuideIcon({ size = 26, className }: GuideIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M3 15 h5 l3 -7 l4 14 l3 -7 h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
