/**
 * P8 (Ollama tier 2): pure, defensive parsers for the Ollama reporting
 * surface (`GET /api/ps`, `GET /api/tags`). Spec:
 * `agent/specs/ollama-backend.md` §5–§6.
 *
 * Every field is nullable where the API omits it; malformed payloads never
 * throw — they return `null` (the caller degrades to "no data", the way the
 * REVIEW §1 coercion rule requires for every field we consume).
 */

import type { OllamaLoadedModel } from '../shared/types'

/** Defensive string: non-empty strings pass through, anything else → null. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Defensive number: finite numbers pass through, anything else → null. */
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** One element of the `/api/ps` models array; `null` when it has no usable name. */
function parseLoadedModel(raw: unknown): OllamaLoadedModel | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  const name = str(m.name) ?? str(m.model)
  if (name === null) return null
  const details = typeof m.details === 'object' && m.details !== null
    ? (m.details as Record<string, unknown>)
    : null
  return {
    name,
    size: numOrNull(m.size) ?? 0,
    sizeVram: numOrNull(m.size_vram),
    expiresAt: str(m.expires_at),
    family: details !== null ? str(details.family) : null,
    parameterSize: details !== null ? str(details.parameter_size) : null,
    quantization: details !== null ? str(details.quantization_level) : null,
  }
}

/**
 * Parse the `GET /api/ps` payload (`{"models":[…]}`). `null` when the payload
 * is malformed (not an object with a `models` array). An **empty array is a
 * valid result** — "Ollama is up, nothing loaded" — and must not be
 * conflated with a parse failure.
 */
export function parseOllamaPs(body: unknown): OllamaLoadedModel[] | null {
  if (typeof body !== 'object' || body === null) return null
  const models = (body as { models?: unknown }).models
  if (!Array.isArray(models)) return null
  const out: OllamaLoadedModel[] = []
  for (const raw of models) {
    const model = parseLoadedModel(raw)
    if (model !== null) out.push(model)
  }
  return out
}

/**
 * Parse the `GET /api/tags` payload into a library count. `null` when
 * malformed. Count only — the full library is deliberately not kept in the
 * snapshot (spec §6: "do not ship the full library").
 */
export function parseOllamaTagsCount(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null
  const models = (body as { models?: unknown }).models
  if (!Array.isArray(models)) return null
  return models.length
}
