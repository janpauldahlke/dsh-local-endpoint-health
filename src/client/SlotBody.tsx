/**
 * Live endpoint-health pane body.
 *
 * Pulls data via useSlotHealth — the store emits on every poll attempt
 * (~1 Hz), so the component re-renders every second and "updated N s ago"
 * advances even while the endpoint is stable. Self-contained (no props):
 * the slot registry mounts it bare.
 *
 * Pane skeleton (REVIEW2 §2a): a flat header — stable context first
 * (engine tag + origin), volatile state last (state dot + rich chip detail),
 * then the latency/updated band — and a stack of **cards**, one per slot,
 * plus the server-metrics card. Card chrome, collapse, and the collapsed
 * preview are the shared `CollapsibleCard` (GpuCard constants, REVIEW2 §2c).
 * The stable-first order keeps the per-second age/dec ticks from shifting
 * the fixed parts of the line (P8 follow-up).
 *
 * Header state → color/label comes from `slotState.deriveChip()` — the same
 * pure derivation the dock chip uses, so the two surfaces cannot disagree.
 * The header shows the rich `detail` label (`busy 22s · dec 892`); the dock
 * chip shows the stable short `label` so the dock row never shifts.
 *
 * Two distinct failure layers:
 *   transport error — the plugin route itself failed → "no data — <error>"
 *   endpoint error  — route fine, endpoint down → state chip + snapshot.lastError
 *
 * P2: per-slot rows; P7: `MetricsCard` (server-wide /metrics rows) — null
 * section ⇒ card hidden, no layout hole. REVIEW §1: every metrics field is
 * coerced before rendering (stale-host shapes degrade, never throw).
 *
 * REVIEW2: REVIEW §2's three-column rows now live inside collapsible cards
 * with a small collapsed preview (state word + key numbers, each with its
 * own native tooltip). Default expand policy: slot cards expand while busy /
 * wedged and collapse when idle; the metrics card is collapsed by default.
 * An explicit user toggle persists in localStorage and wins over the policy.
 */
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useSlotHealth } from './useSlotHealth.ts'
import type { OllamaSection, SlotSample } from '../shared/types.ts'
import { setPaneOpen } from './paneState.ts'
import { ageLabel, backendLabel, bareStateWord, deriveChip, STATE_DOT, slotTone } from './slotState.ts'
import { CollapsibleCard } from './card.tsx'
import type { CardPreviewStat } from './card.tsx'
import { MONO, Row, muted } from './row.tsx'
import { MetricsCard } from './MetricsBlock.tsx'

/** A sample older than this many ms is rendered dimmed (stale). */
const STALE_MS = 3000

const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
  color: 'inherit',
}

function originLabel(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** ms → "185 ms" / "12.4 s" / "1 m 32 s"; null → "—". */
function fmtMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return `${m} m ${rem} s`
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

function pctOf(ratio: number | null): string | null {
  return ratio === null ? null : `${Math.round(ratio * 100)}%`
}

/** One slot's rows (P2) — rendered in the card body. */
function SlotRows({ slot }: { slot: SlotSample }) {
  const promptPct = pctOf(slot.promptProgress)
  const ctxPct = pctOf(slot.contextPressure)
  return (
    <>
      {slot.state === 'busy' && slot.idTask !== null && (
        <span style={muted}>task {slot.idTask}</span>
      )}
      <Row
        label="prompt"
        value={`${fmtInt(slot.promptTokensProcessed)} / ${fmtInt(slot.promptTokens)}${promptPct !== null ? ` (${promptPct})` : ''}`}
        meter={{
          ratio: slot.promptProgress,
          tooltip:
            promptPct !== null
              ? `Prompt ${promptPct} of ${fmtInt(slot.promptTokens)} tokens`
              : 'Prompt progress — no prompt to progress through',
        }}
        tooltip="Prompt tokens processed vs total for this request, from /slots (prompt_tokens / prompt_tokens_total). The meter is the processed share."
      />
      <Row
        label="decoded"
        value={fmtInt(slot.decoded)}
        tooltip="Decoded (generated) tokens so far in this request, from /slots."
      />
      <Row
        label="busy"
        value={fmtMs(slot.busyAgeMs)}
        tooltip="How long this slot has been busy, latched host-side at the idle→busy transition. Null until the host has observed the transition."
      />
      <Row
        label="ttft"
        value={fmtMs(slot.ttftMs)}
        tooltip="Time to first token: host-latched elapsed time from the busy transition to the first decoded token. Null until the first decode is observed."
      />
      <Row
        label="context"
        value={`${fmtInt(slot.contextUsed)} / ${fmtInt(slot.contextSize)}${ctxPct !== null ? ` (${ctxPct})` : ''}`}
        caption={slot.contextSize > slot.contextUsed ? `${fmtInt(slot.contextSize - slot.contextUsed)} free` : undefined}
        meter={{
          ratio: slot.contextPressure,
          tooltip:
            ctxPct !== null
              ? `Context ${ctxPct} of n_ctx ${fmtInt(slot.contextSize)}`
              : 'Context pressure — n_ctx not positive',
        }}
        tooltip="Context used vs the slot's configured n_ctx, from /slots. The caption is the free remainder."
      />
    </>
  )
}

/** One slot's collapsed preview (REVIEW2 §2b). */
function slotPreview(slot: SlotSample, wedged: boolean): CardPreviewStat[] {
  const out: CardPreviewStat[] = []
  const ctxPct = pctOf(slot.contextPressure)
  if (ctxPct !== null) {
    out.push({
      text: `ctx ${ctxPct}`,
      title: 'Context used / n_ctx, from /slots',
      ...(wedged ? { tone: 'crit' as const } : {}),
    })
  }
  if (slot.state === 'busy') {
    out.push({
      text: `busy ${slot.busyAgeMs !== null ? ageLabel(slot.busyAgeMs) : '—'}`,
      title: wedged
        ? 'Wedged: prompt fully processed, nothing decoded, busy 300 s+ (P3 heuristic)'
        : 'How long this slot has been busy (host-latched)',
      ...(wedged ? { tone: 'crit' as const } : {}),
    })
    out.push({
      text: `dec ${fmtInt(slot.decoded)}`,
      title: 'Decoded tokens so far in this request, from /slots',
    })
    const promptPct = pctOf(slot.promptProgress)
    if (promptPct !== null) {
      out.push({
        text: `prompt ${promptPct}`,
        title: 'Prompt tokens processed / total, from /slots',
      })
    }
  } else {
    out.push({
      text: `dec ${fmtInt(slot.decoded)}`,
      title: 'Decoded tokens so far in this request, from /slots',
    })
    out.push({ text: 'busy —', title: 'Not busy right now' })
  }
  return out
}

function SlotCard({ slot }: { slot: SlotSample }) {
  const tone = slotTone(slot)
  const busy = slot.state === 'busy'
  const accent =
    tone === 'crit'
      ? {
          text: 'wedged',
          color: STATE_DOT.busy, // the card overrides with the crit tone color
          title: 'Prompt fully processed, nothing decoded, busy 300 s+ (P3 wedged heuristic)',
        }
      : busy
        ? { text: 'busy', color: STATE_DOT.busy, title: 'is_processing — a request is in flight' }
        : { text: 'idle', color: STATE_DOT.idle, title: 'No request in flight' }
  return (
    <CollapsibleCard
      storageKey={`dsh.slotHealth.card.slot.${slot.id}`}
      label={`SLOT ${slot.id}`}
      tone={tone}
      defaultExpanded={busy}
      headerTitle="Click to expand: prompt, decoded, busy, ttft, context rows (source: /slots)"
      accent={accent}
      preview={slotPreview(slot, tone === 'crit')}
    >
      <SlotRows slot={slot} />
    </CollapsibleCard>
  )
}

/** Endpoint up but /slots unusable (401 auth / 404 / 5xx / garbage). */
function SlotsErrorCard({ slotsError }: { slotsError: string }) {
  const isAuth = /401|auth/i.test(slotsError)
  return (
    <CollapsibleCard
      storageKey="dsh.slotHealth.card.slots"
      label="SLOTS"
      tone="crit"
      defaultExpanded
      headerTitle="Click to expand: why slot data is unavailable"
      preview={[{ text: isAuth ? 'auth' : 'slots', title: slotsError, tone: 'crit' }]}
    >
      <p style={{ ...muted, overflowWrap: 'anywhere' }}>{slotsError}</p>
    </CollapsibleCard>
  )
}

/** Bytes → "5.00 GB" / "832 MB" / "1.2 KB"; 0 → "—". */
function fmtBytes(n: number | null): string {
  if (n === null || n === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/** RFC3339 expiry → "in 4 m 32 s" / "expired 12 s ago"; null → "—". */
function fmtExpiry(iso: string | null, now: number): string {
  if (iso === null) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const d = t - now
  if (d <= 0) {
    const s = Math.round(-d / 1000)
    return s < 60 ? `expired ${s} s ago` : `expired ${Math.floor(s / 60)} m ago`
  }
  const s = Math.round(d / 1000)
  if (s < 60) return `in ${s} s`
  return `in ${Math.floor(s / 60)} m ${s % 60} s`
}

/**
 * P8 Ollama: the resident-models card (spec §4.2 / §6). Ollama has no slots,
 * so this is the pane's primary card. Shows `/api/ps` (what's loaded in VRAM
 * right now) with the library count from `/api/tags` as muted meta. A
 * `fresh: false` section (transient /api/ps failure) renders dimmed with the
 * error — the last-known resident state is simply not claimed.
 */
function OllamaCard({ ollama, now }: { ollama: OllamaSection; now: number }) {
  const count = ollama.loaded.length
  const first = count > 0 ? ollama.loaded[0].name : null
  return (
    <CollapsibleCard
      storageKey="dsh.slotHealth.card.ollama"
      label="MODELS"
      tone="na"
      defaultExpanded
      dim={!ollama.fresh}
      headerTitle="Click to expand: models resident in VRAM (source: /api/ps) and the local library count (source: /api/tags)"
      accent={{
        text: count > 0 ? `loaded ${count}` : 'no model',
        color: '#22c55e',
        title: count > 0 ? `${count} model${count === 1 ? '' : 's'} resident in VRAM` : 'Ollama is up but nothing is loaded',
      }}
      meta={
        ollama.libraryCount !== null
          ? { text: `${ollama.libraryCount} in library`, title: 'Local library size, from /api/tags' }
          : undefined
      }
      preview={[
        {
          // `first` is null exactly when count === 0, so this is equivalent
          // and keeps the string type.
          text: first ?? '—',
          title: count > 0 ? 'First resident model' : 'No resident model',
        },
      ]}
    >
      {!ollama.fresh && ollama.error !== null && (
        <p style={{ ...muted, overflowWrap: 'anywhere' }}>{ollama.error}</p>
      )}
      {count === 0 && ollama.fresh && (
        <p style={muted}>
          Nothing loaded. Ollama evicts idle models after their keep-alive
          (default 5 m); run a model to see it here.
        </p>
      )}
      {ollama.loaded.map((m) => (
        <div key={m.name} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{m.name}</span>
            <span style={{ ...muted, fontSize: 12 }}>
              {[m.family, m.parameterSize, m.quantization].filter((x) => x !== null).join(' · ') || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            <span title="Total model size, from /api/ps (size)">size {fmtBytes(m.size)}</span>
            <span title="Bytes resident in VRAM, from /api/ps (size_vram)">vram {fmtBytes(m.sizeVram)}</span>
            <span title="When Ollama will evict this model (keep_alive), from /api/ps (expires_at)">
              keeps {fmtExpiry(m.expiresAt, now)}
            </span>
          </div>
        </div>
      ))}
    </CollapsibleCard>
  )
}

export function SlotBody() {
  const { snapshot, error, lastAttempt } = useSlotHealth()

  // Report mount/unmount to paneState so the dock chip hides while this
  // pane is open (refcounted — safe with multiple sessions).
  useEffect(() => {
    setPaneOpen(true)
    return () => setPaneOpen(false)
  }, [])

  const now = lastAttempt ?? Date.now()
  const ageMs = snapshot ? now - snapshot.sampledAt : null
  const stale = ageMs !== null && ageMs > STALE_MS
  const age = ageMs === null ? null : `${Math.max(0, Math.round(ageMs / 1000))} s ago`

  // Transport-level failure: the plugin route itself is down.
  if (error !== null) {
    return (
      <div style={container}>
        {snapshot !== null && (
          <span style={{ fontFamily: MONO, fontSize: 12 }}>
            {originLabel(snapshot.origin)}
          </span>
        )}
        <p style={muted}>no data — {error}</p>
      </div>
    )
  }

  // No sample yet (poller just started, first attempt still in flight).
  if (snapshot === null) {
    return (
      <div style={container}>
        <p style={muted}>waiting for first sample…</p>
      </div>
    )
  }

  const chip = deriveChip({ snapshot, error, lastAttempt }, now)
  const latency = snapshot.latencyMs === null ? '—' : snapshot.latencyMs < 1 ? '<1 ms' : `${snapshot.latencyMs} ms`

  return (
    <div style={{ ...container, opacity: stale ? 0.55 : 1 }}>
      {/* Pane header (not a card): stable context FIRST (engine + origin),
          volatile state LAST — the age/dec ticks only extend the line's right
          edge and never shift the fixed parts (P8 follow-up: reorder to kill
          the per-second layout jump). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* P8: engine tag (spec §4.1). Always shown when the engine is known —
            `bareStateWord` strips the engine prefix from the state text below,
            so the engine never appears twice in the same row. */}
        {backendLabel(snapshot) !== null && (
          <span
            title={`engine: ${backendLabel(snapshot)}`}
            style={{ fontSize: 12, color: 'color-mix(in srgb, currentColor 55%, transparent)' }}
          >
            · {backendLabel(snapshot)}
          </span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'color-mix(in srgb, currentColor 70%, transparent)' }}>
          {originLabel(snapshot.origin)}
        </span>
        <span
          title={chip.title}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: chip.dot }}
        >
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: chip.dot, flexShrink: 0 }} />
          {chip.detail !== null ? chip.detail : bareStateWord(chip, snapshot)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, fontVariantNumeric: 'tabular-nums' }}>
        <span>
          latency{' '}
          <b style={{ fontWeight: 600 }}>{latency}</b>
        </span>
        <span>
          updated{' '}
          <b style={{ fontWeight: 600 }}>
            {age}
            {stale ? ' (stale)' : ''}
          </b>
        </span>
      </div>
      {snapshot.lastError !== null && (
        <p style={{ ...muted, overflowWrap: 'anywhere' }}>{snapshot.lastError}</p>
      )}
      {/* One card per slot; null slots → the crit error card; [] → nothing */}
      {snapshot.slots === null
        ? snapshot.slotsError !== null && <SlotsErrorCard slotsError={snapshot.slotsError} />
        : snapshot.slots.map((slot) => <SlotCard key={slot.id} slot={slot} />)}
      {/* P8 Ollama: resident-models card (null ⇒ hidden, no hole). */}
      {snapshot.ollama !== null && <OllamaCard ollama={snapshot.ollama} now={now} />}
      {/* P7: server-wide /metrics card (null ⇒ hidden, no hole). */}
      {snapshot.metrics !== null && <MetricsCard metrics={snapshot.metrics} />}
    </div>
  )
}
