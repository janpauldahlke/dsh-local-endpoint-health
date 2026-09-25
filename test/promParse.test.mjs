import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePrometheusText } from '../src/host/promParse.ts'

const SAMPLE = `# HELP llamacpp:prompt_tokens_total total prompt tokens evaluated
# TYPE llamacpp:prompt_tokens_total counter
llamacpp:prompt_tokens_total 9467
llamacpp:n_tokens_max 9635
llamacpp:n_busy_slots_per_decode 1
llamacpp:prompt_tokens_seconds 0
llamacpp:predicted_tokens_seconds 0
llamacpp:requests_processing 0
llamacpp:requests_deferred 0
llamacpp:spec_decode_num_draft_tokens_total 240
llamacpp:spec_decode_num_accepted_tokens_total 88
llamacpp:spec_decode_num_drafts_total 80
llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position="0"} 47
llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position="1"} 28
llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position="2"} 13
`

test('parses the real llama-server dump', () => {
  const samples = parsePrometheusText(SAMPLE)
  const byName = (name) => samples.filter((s) => s.name === name)
  assert.equal(byName('llamacpp:prompt_tokens_total').length, 1)
  assert.equal(byName('llamacpp:prompt_tokens_total')[0].value, 9467)
  assert.deepEqual(byName('llamacpp:prompt_tokens_total')[0].labels, {})
  assert.equal(byName('llamacpp:requests_deferred')[0].value, 0)
  const perPos = byName('llamacpp:spec_decode_num_accepted_tokens_per_pos_total')
  assert.equal(perPos.length, 3)
  assert.deepEqual(perPos.map((s) => s.labels.position).sort(), ['0', '1', '2'])
  assert.deepEqual(perPos.map((s) => s.value).sort((a, b) => a - b), [13, 28, 47])
})

test('skips comments, blank lines, and malformed lines without throwing', () => {
  const text = [
    '# HELP foo help text',
    '# TYPE foo gauge',
    '',
    'foo 42',
    'not a sample line at all {{{',
    'bar{broken',
    'baz 1.5 1700000000', // trailing timestamp is legal, must be ignored
    'qux abc',
    '  spaced   7  ',
    'nan_metric NaN',
    'inf_metric +Inf',
    'ninf_metric -Inf',
  ].join('\n')
  const samples = parsePrometheusText(text)
  const get = (name) => samples.find((s) => s.name === name)
  assert.equal(get('foo').value, 42)
  assert.equal(get('baz').value, 1.5)
  assert.equal(get('spaced').value, 7)
  assert.ok(Number.isNaN(get('nan_metric').value))
  assert.equal(get('inf_metric').value, Infinity)
  assert.equal(get('ninf_metric').value, -Infinity)
  assert.ok(!samples.some((s) => s.name === 'qux'))
  assert.ok(!samples.some((s) => s.name === 'bar'))
  // the `not a sample` line must not produce a sample named "not"
  assert.ok(!samples.some((s) => s.name === 'not'))
})

test('handles escaped quotes, commas, and newlines in label values', () => {
  const samples = parsePrometheusText(
    'm{a="he said \\"hi, there\\", ok",b="line1\\nline2\\ttab"} 1.25',
  )
  assert.equal(samples.length, 1)
  assert.equal(samples[0].value, 1.25)
  assert.equal(samples[0].labels.a, 'he said "hi, there", ok')
  assert.equal(samples[0].labels.b, 'line1\nline2\ttab')
})

test('rejects empty input, unterminated strings, and bad metric names', () => {
  assert.deepEqual(parsePrometheusText(''), [])
  assert.deepEqual(parsePrometheusText('# only comments\n'), [])
  assert.deepEqual(parsePrometheusText('m{a="unterminated 1'), [])
  assert.deepEqual(parsePrometheusText('1bad 3'), [])
  assert.deepEqual(parsePrometheusText('m{a=unquoted} 3'), [])
  // empty label block: accepted, parsed as an unlabeled sample
  const empty = parsePrometheusText('m{} 3')
  assert.equal(empty.length, 1)
  assert.deepEqual(empty[0].labels, {})
  assert.equal(empty[0].value, 3)
})

test('label-less names with colons and underscores parse', () => {
  const samples = parsePrometheusText('llamacpp:spec_decode_num_drafts_total 80\n')
  assert.equal(samples.length, 1)
  assert.equal(samples[0].name, 'llamacpp:spec_decode_num_drafts_total')
  assert.equal(samples[0].value, 80)
})
