/**
 * Shared types for the slot health plugin.
 *
 * Dependency-free: the host (Node/ESM) and client (browser/CJS) bundles both
 * import from here at build time; nothing may pull in a runtime dep here.
 */

/** One host sample of the local endpoint fleet. */
export interface SlotHealthSnapshot {
  /** Whether the last sample completed successfully. */
  ok: boolean
  /** Wall-clock time of the sample (epoch ms). */
  sampledAt: number
  /** Human-readable error text when ok is false. */
  error?: string
}
