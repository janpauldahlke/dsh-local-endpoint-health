/**
 * Minimal Prometheus text-exposition parser (P7).
 *
 * No dependencies — the format is trivial and a dependency is overkill.
 * Handles the subset llama-server emits and that any sane Prometheus
 * endpoint produces:
 *   - `# HELP` / `# TYPE` / any other `#` comment line (skipped);
 *   - `name value` sample lines;
 *   - `name{key="value", ...} value` labeled sample lines (label values
 *     may contain escaped quotes, backslashes, `\n`, `\t`, and commas);
 *   - an optional trailing timestamp (ignored);
 *   - special float values `NaN`, `+Inf`, `-Inf`.
 *
 * Malformed lines are skipped, never thrown on: a metrics feed must not
 * take the sampler down.
 */

export interface PromSample {
  /** Metric name, e.g. `llamacpp:requests_deferred`. */
  name: string
  /** Label key → value; empty for unlabeled series. */
  labels: Record<string, string>
  /** Sample value (`NaN`/`Infinity` possible for `NaN`/`±Inf` inputs). */
  value: number
}

const NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/
const LABEL_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * Parse Prometheus text into a flat list of samples. One entry per sample
 * line — a labeled metric yields one entry per series. Never throws.
 */
export function parsePrometheusText(text: string): PromSample[] {
  const out: PromSample[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const sample = parseSampleLine(line)
    if (sample !== null) out.push(sample)
  }
  return out
}

/** Parse one sample line; `null` when the line is not a valid sample. */
function parseSampleLine(line: string): PromSample | null {
  const brace = line.indexOf('{')
  let name: string
  let labels: Record<string, string>
  let restStart: number
  if (brace !== -1) {
    const close = findClosingBrace(line, brace)
    if (close === -1) return null
    name = line.slice(0, brace).trim()
    const parsedLabels = parseLabelBlock(line.slice(brace + 1, close))
    if (parsedLabels === null) return null
    labels = parsedLabels
    restStart = close + 1
  } else {
    const sp = line.indexOf(' ')
    name = sp === -1 ? line : line.slice(0, sp)
    labels = {}
    restStart = sp === -1 ? line.length : sp
  }
  if (!NAME_RE.test(name)) return null
  const rest = line.slice(restStart).trim().split(/\s+/)
  if (rest.length === 0 || rest[0] === '') return null
  const value = parsePromValue(rest[0])
  if (value === null) return null
  return { name, labels, value }
}

/** Index of the `}` closing the label block opened at `open`, or -1. */
function findClosingBrace(line: string, open: number): number {
  let inString = false
  for (let i = open + 1; i < line.length; i++) {
    const c = line[i]
    if (inString) {
      if (c === '\\') i++ // skip the escaped character
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
    } else if (c === '}') {
      return i
    }
  }
  return -1
}

/** Parse `key="value", ...`; `null` on malformed input. */
function parseLabelBlock(inner: string): Record<string, string> | null {
  const labels: Record<string, string> = {}
  let i = 0
  const n = inner.length
  let first = true
  while (true) {
    while (i < n && (inner[i] === ' ' || inner[i] === '\t')) i++
    if (i >= n) break
    if (!first) {
      if (inner[i] !== ',') return null
      i++
      while (i < n && (inner[i] === ' ' || inner[i] === '\t')) i++
      if (i >= n) return null
    }
    first = false
    const keyStart = i
    while (i < n && /[A-Za-z0-9_]/.test(inner[i])) i++
    const key = inner.slice(keyStart, i)
    if (!LABEL_KEY_RE.test(key)) return null
    while (i < n && (inner[i] === ' ' || inner[i] === '\t')) i++
    if (inner[i] !== '=') return null
    i++
    while (i < n && (inner[i] === ' ' || inner[i] === '\t')) i++
    if (inner[i] !== '"') return null
    i++
    let value = ''
    let closed = false
    while (i < n) {
      const c = inner[i]
      if (c === '\\') {
        const next = inner[i + 1]
        if (next === undefined) return null
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next
        i += 2
      } else if (c === '"') {
        closed = true
        i++
        break
      } else {
        value += c
        i++
      }
    }
    if (!closed) return null
    labels[key] = value
  }
  return labels
}

/** Parse a Prometheus float token; `null` on garbage. */
function parsePromValue(token: string): number | null {
  if (token === 'NaN') return NaN
  if (token === '+Inf' || token === 'Inf') return Infinity
  if (token === '-Inf') return -Infinity
  const v = Number(token)
  return Number.isFinite(v) ? v : null
}
