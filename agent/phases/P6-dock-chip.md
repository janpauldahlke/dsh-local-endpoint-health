# P6 — Dock chip (readable with the pane closed)

**Goal:** make health visible *without* the user knowing they need to look. In the incident that motivated this project, the pane was closed.

**Read:** this file only. **Not** `PLAN.md`.

**Requires:** P3 (labels) and P4 (error states) — the chip renders their output.

---

## Decision locked (Q9)

**Both** surfaces: rightbar tab **and** dock chip. The chip is not a convenience — it's the actual fix. A tab the user must deliberately open cannot prevent the panic, because the panic is *not knowing*.

**AC9:** with the rightbar tab **closed**, the chip alone must distinguish at minimum: busy, idle, error/auth, unreachable, stale.

## Blueprint

`/home/hagbard/dev/dsh-gpu-monitor-nvml/src/client/GpuDockChip.tsx` — a working dock chip. Its registration pattern (verified in the built client):

```js
{ name: "conversation.composer.dock", id: "gpu-monitor", order: -10 }
```

So the seat is **`conversation.composer.dock`** with an `id` and an `order`. For this plugin use id **`slot-health`**. Inspect the live slot list for the pinned dsh version before assuming; fall back rather than fight it (SKILL: "Use `cordis_inspect_*` / slot list … don't rewrite the harness").

## What to build

- A compact chip in the composer dock showing current state + minimal meat.
- It must be **legible at a glance** and **distinguishable in all six-plus states** from P3/P4.
- Clicking it should open/focus the pane (blueprint's chip does this via an `onOpen` prop).
- Share one state source with the pane — do not build a second polling path. Both read the same host route / store.
- **Match [`STYLE.md`](../STYLE.md) exactly**: chip geometry, palette, `tabular-nums`, `color-mix(in srgb, currentColor …)` theming, 3s stale dim, and the reference-counted `paneState.ts` hide-while-pane-open behavior. All were extracted from the shipped blueprint — copy, don't approximate.

## Your call

- Exactly what the chip shows in each state. Suggestion to react to, not obey: busy → `busy 187s · dec 0`; idle → `idle`; auth → `key?`; unreachable → `down`; wedged → `wedged 5m`. Keep it short enough not to wrap.
- Color/weight conventions. Must be readable in the light theme (DSH default) *and* dark.
- Whether the chip animates (e.g. pulse while busy). Restraint: it lives next to the composer, where the user is typing.
- Whether to show a percentage or token count on the chip, or state + age only.

## Verify

1. **AC9's core test is visual — you cannot perform it.** You have no browser. So this phase splits: build it correctly, verify what is machine-checkable, and hand the rest to the human as a precise checklist.
2. **Machine-checkable, do these:** chip renders in the DOM with the right slot registration (`conversation.composer.dock`, id `slot-health`); `lib/client.js` contains the chip code after rebuild; `--dump-config` shows the row; state-to-label mapping matches the pane's (share the pure `aggregate`-style module from `STYLE.md` so they *cannot* disagree — then assert it with a unit test instead of by looking).
3. **Use [`FIXTURES.md`](FIXTURES.md)** to drive each state (busy-prefill, idle, 401, v1trap, unreachable, stale) and verify the chip's *derived* props/label per state programmatically, even though you can't see the pixels.
4. **`pending-human` — write these exact steps into `ACCEPTANCE.md`:** open `:3090`, close the rightbar pane entirely, confirm the chip alone distinguishes busy / idle / error / unreachable / stale; send a real message and watch the chip go idle → busy → idle in sync with the pane; check light **and** dark theme legibility; confirm no jitter while typing in the composer; confirm gpu-monitor's chip still works alongside.
5. Coexistence check you *can* partly do: with gpu-monitor installed, `--dump-config` shows both rows and both clients load without a slot-id collision.

## Then

Commit. Update `STATUS.md`.

## Likely traps

- Building a second polling loop for the chip → doubled request rate, divergent state, worse backoff behavior.
- A chip so wide it wraps or pushes the composer.
- States that are only distinguishable by color (fails for colorblind users and in a dim room) — pair color with a word or glyph.
- Registering in the dock but not cleaning up on unload → ghost chip.
