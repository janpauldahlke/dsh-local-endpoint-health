/**
 * Unit tests for P8 engine fingerprinting (`src/host/fingerprint.ts`,
 * bundled to `lib/fingerprint.mjs`).
 *
 * Spec: `agent/specs/ollama-backend.md` §3 — fingerprint by response shape,
 * never guess silently. Rule order (first match wins): llama oracle →
 * Ollama /api/version → vLLM metrics series → unknown.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fingerprintBackend,
  parseOllamaVersion,
  looksLikeVllmMetrics,
} from '../lib/fingerprint.mjs'

// ---------------------------------------------------------------------------
// fingerprintBackend — rule order
// ---------------------------------------------------------------------------

test('llama oracle (/health ok shape) → llama-cpp, no version', () => {
  const f = fingerprintBackend({ healthOk: true, ollamaVersion: null, vllmMetrics: false })
  assert.equal(f.backend, 'llama-cpp')
  assert.equal(f.version, null)
})

test('rule order: llama oracle wins even if other probes would match', () => {
  const f = fingerprintBackend({ healthOk: true, ollamaVersion: '0.1.0', vllmMetrics: true })
  assert.equal(f.backend, 'llama-cpp')
})

test('ollama: /api/version string present → ollama + that version', () => {
  const f = fingerprintBackend({ healthOk: false, ollamaVersion: '0.22.1', vllmMetrics: false })
  assert.equal(f.backend, 'ollama')
  assert.equal(f.version, '0.22.1')
})

test('rule order: ollama wins over the vllm stub check', () => {
  const f = fingerprintBackend({ healthOk: false, ollamaVersion: '0.22.1', vllmMetrics: true })
  assert.equal(f.backend, 'ollama')
  assert.equal(f.version, '0.22.1')
})

test('vllm: vllm: metrics series → vllm, no version', () => {
  const f = fingerprintBackend({ healthOk: false, ollamaVersion: null, vllmMetrics: true })
  assert.equal(f.backend, 'vllm')
  assert.equal(f.version, null)
})

test('nothing matches → unknown, no version', () => {
  const f = fingerprintBackend({ healthOk: false, ollamaVersion: null, vllmMetrics: false })
  assert.equal(f.backend, 'unknown')
  assert.equal(f.version, null)
})

// ---------------------------------------------------------------------------
// parseOllamaVersion — defensive
// ---------------------------------------------------------------------------

test('parseOllamaVersion: {"version":"0.22.1"} → "0.22.1"', () => {
  assert.equal(parseOllamaVersion({ version: '0.22.1' }), '0.22.1')
})

test('parseOllamaVersion: trims surrounding whitespace', () => {
  assert.equal(parseOllamaVersion({ version: ' 0.22.1 ' }), '0.22.1')
})

test('parseOllamaVersion: missing key → null', () => {
  assert.equal(parseOllamaVersion({}), null)
})

test('parseOllamaVersion: non-string version → null', () => {
  assert.equal(parseOllamaVersion({ version: 22 }), null)
  assert.equal(parseOllamaVersion({ version: null }), null)
})

test('parseOllamaVersion: empty / blank string → null', () => {
  assert.equal(parseOllamaVersion({ version: '' }), null)
  assert.equal(parseOllamaVersion({ version: '   ' }), null)
})

test('parseOllamaVersion: non-object bodies → null (never throws)', () => {
  assert.equal(parseOllamaVersion(null), null)
  assert.equal(parseOllamaVersion('{"version":"x"}'), null) // raw text, not parsed
  assert.equal(parseOllamaVersion([1, 2]), null)
  assert.equal(parseOllamaVersion(42), null)
})

// ---------------------------------------------------------------------------
// looksLikeVllmMetrics — the doc-sourced stub check (Tier 3)
// ---------------------------------------------------------------------------

test('vllm: series in Prometheus text → true', () => {
  assert.equal(
    looksLikeVllmMetrics(
      '# HELP vllm:num_requests_running Number of requests currently running\n' +
        'vllm:num_requests_running 0\n' +
        'vllm:kv_cache_usage_perc 0.0\n',
    ),
    true,
  )
})

test('llamacpp: series → false', () => {
  assert.equal(
    looksLikeVllmMetrics(
      '# HELP llamacpp:tokens_total Total tokens\nllamacpp:tokens_total 5\n',
    ),
    false,
  )
})

test('non-string bodies → false (never throws)', () => {
  assert.equal(looksLikeVllmMetrics(null), false)
  assert.equal(looksLikeVllmMetrics(42), false)
  assert.equal(looksLikeVllmMetrics({}), false)
  assert.equal(looksLikeVllmMetrics(''), false)
})
