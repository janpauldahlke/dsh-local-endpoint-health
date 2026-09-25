/**
 * Plugin configuration for dsh-slot-health.
 *
 * Cordis resolves the named `Config` export before `apply()` runs: the harness
 * calls `Config['~standard'].validate(rawConfig)` synchronously and injects
 * `result.value` as the second `apply(ctx, config)` argument. `rawConfig` is
 * whatever sits under the yml entry's `config:` block — or `undefined` when
 * the key is absent.
 *
 * Hand-rolled minimal Standard Schema v1 object: one string field, no deps.
 */

/** Default endpoint under watch (the local llama-server slot). */
export const DEFAULT_ORIGIN = 'http://127.0.0.1:59999' // AC1: dead port

/** Resolved plugin configuration, as injected into `apply`. */
export interface ResolvedConfig {
  /** Base URL of the local inference server; trailing `/v1` and `/` are stripped by the collector. */
  origin: string
}

/** Raw user-supplied config (the yml `config:` block, unvalidated). */
export type RawConfig = { origin?: unknown }

/** Minimal Standard Schema v1 surface — the only member the harness reads. */
export interface StandardSchemaV1<I, O> {
  '~standard': {
    version: 1
    vendor: string
    validate(input: I | undefined): { value: O } | { issues: Array<{ message: string; path?: Array<string | number> }> }
  }
}

export const Config: StandardSchemaV1<RawConfig, ResolvedConfig> = {
  '~standard': {
    version: 1,
    vendor: 'dsh-slot-health',
    validate(input) {
      const raw = (input ?? {}) as RawConfig
      if (raw.origin !== undefined && (typeof raw.origin !== 'string' || raw.origin.trim() === '')) {
        return { issues: [{ message: 'origin must be a non-empty string', path: ['origin'] }] }
      }
      return { value: { origin: raw.origin !== undefined ? raw.origin.trim() : DEFAULT_ORIGIN } }
    },
  },
}
