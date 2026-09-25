/**
 * Unit tests for the P8 Ollama parsers (`src/host/ollama.ts`, bundled to
 * `lib/ollama.mjs`).
 *
 * Spec: `agent/specs/ollama-backend.md` §5–§6. Fixtures are the exact
 * response shapes from the Ollama API reference (main branch), plus the
 * live-verified keys from `:11434` (v0.22.1). The contract under test is the
 * REVIEW §1 coercion rule: every field nullable, malformed payloads → null
 * (never throw), and `{"models":[]}` is a VALID empty result, not an error.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOllamaPs, parseOllamaTagsCount } from '../lib/ollama.mjs'

/** The doc example from the Ollama API reference (`GET /api/ps`). */
const PS_LOADED = {
  models: [
    {
      name: 'mistral:latest',
      model: 'mistral:latest',
      size: 5137025024,
      digest: '2ae6f6dd7a3dd734790bbbf58b8909a606e0e7e97e94b7604e0aa7ae4490e6d8',
      details: {
        parent_model: '',
        format: 'gguf',
        family: 'llama',
        families: ['llama'],
        parameter_size: '7.2B',
        quantization_level: 'Q4_0',
      },
      expires_at: '2024-06-04T14:38:31.83753-07:00',
      size_vram: 5137025024,
    },
  ],
}

// ---------------------------------------------------------------------------
// parseOllamaPs
// ---------------------------------------------------------------------------

test('/api/ps doc example → full parse (name, sizes, expiry, details)', () => {
  const models = parseOllamaPs(PS_LOADED)
  assert.notEqual(models, null)
  assert.equal(models.length, 1)
  assert.deepEqual(models[0], {
    name: 'mistral:latest',
    size: 5137025024,
    sizeVram: 5137025024,
    expiresAt: '2024-06-04T14:38:31.83753-07:00',
    family: 'llama',
    parameterSize: '7.2B',
    quantization: 'Q4_0',
  })
})

test('/api/ps {"models":[]} → [] (valid: up, nothing loaded — not an error)', () => {
  assert.deepEqual(parseOllamaPs({ models: [] }), [])
})

test('/api/ps malformed payloads → null (distinct from a valid empty list)', () => {
  assert.equal(parseOllamaPs(null), null)
  assert.equal(parseOllamaPs('{"models":[]}'), null) // raw text, not parsed JSON
  assert.equal(parseOllamaPs(42), null)
  assert.equal(parseOllamaPs({ models: 'nope' }), null)
  assert.equal(parseOllamaPs({}), null)
})

test('/api/ps elements without a usable name are dropped, not fatal', () => {
  const models = parseOllamaPs({
    models: [42, { model: null }, { model: 'qwen:0.5b' }],
  })
  assert.deepEqual(models, [
    { name: 'qwen:0.5b', size: 0, sizeVram: null, expiresAt: null, family: null, parameterSize: null, quantization: null },
  ])
})

test('/api/ps name falls back to the model field', () => {
  const models = parseOllamaPs({ models: [{ model: 'llama3:70b' }] })
  assert.equal(models[0].name, 'llama3:70b')
})

test('/api/ps missing optional fields → null (sizes default to 0, never NaN)', () => {
  const models = parseOllamaPs({ models: [{ name: 'a:latest', size: 'garbage', size_vram: null }] })
  assert.equal(models[0].size, 0)
  assert.equal(models[0].sizeVram, null)
  assert.equal(models[0].expiresAt, null)
  assert.equal(models[0].family, null)
  assert.equal(models[0].parameterSize, null)
  assert.equal(models[0].quantization, null)
})

test('/api/ps malformed details object → details fields null, model still parsed', () => {
  const models = parseOllamaPs({ models: [{ name: 'b:latest', details: 'nope' }] })
  assert.equal(models[0].name, 'b:latest')
  assert.equal(models[0].family, null)
  assert.equal(models[0].parameterSize, null)
  assert.equal(models[0].quantization, null)
})

// ---------------------------------------------------------------------------
// parseOllamaTagsCount
// ---------------------------------------------------------------------------

test('/api/tags → count of the models array', () => {
  assert.equal(parseOllamaTagsCount({ models: [{}, {}, {}] }), 3)
})

test('/api/tags {"models":[]} → 0 (valid: empty library)', () => {
  assert.equal(parseOllamaTagsCount({ models: [] }), 0)
})

test('/api/tags malformed → null (distinct from a valid 0)', () => {
  assert.equal(parseOllamaTagsCount(null), null)
  assert.equal(parseOllamaTagsCount({}), null)
  assert.equal(parseOllamaTagsCount({ models: 'nope' }), null)
  assert.equal(parseOllamaTagsCount('text'), null)
})
