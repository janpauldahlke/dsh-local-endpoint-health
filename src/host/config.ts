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

/** Default endpoint under watch (the local llama-server; see `agent/ENV.md`). */
export const DEFAULT_ORIGIN = 'http://127.0.0.1:8080'

/**
 * Strip a trailing OpenAI-compat `/v1` segment and trailing slashes, at the
 * config boundary (P2, applied exactly once here — the collector must not
 * re-derive the prefix).
 *
 * Why: llama-server serves `/slots` and `/props` at the process **root**, not
 * under the OpenAI-compat prefix (see `agent/ENV.md` "the `/v1` prefix
 * trap"). Probing `{origin}/v1/slots` gets a 404 and the pane shows no slots.
 * So a configured origin of `http://127.0.0.1:8080/v1/` is stored as
 * `http://127.0.0.1:8080` and every probe hangs off the root.
 */
export function stripV1Prefix(origin: string): string {
  let s = origin.trim().replace(/\/+$/, '')
  if (s.endsWith('/v1')) s = s.slice(0, -'/v1'.length)
  return s
}

/** Resolved plugin configuration, as injected into `apply`. */
export interface ResolvedConfig {
  /**
   * Base URL of the local inference server. Trailing `/v1` and `/` are
   * already stripped by the validator; the collector appends probe paths
   * directly.
   */
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
      const origin = stripV1Prefix(raw.origin !== undefined ? raw.origin.trim() : DEFAULT_ORIGIN)
      return { value: { origin } }
    },
  },
}
