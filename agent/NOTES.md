# NOTES — frozen evidence & seams

**Purpose:** facts verified against reality that must never be re-derived, and decisions frozen mid-run. Append-only in spirit; edit only to correct something that turned out false (and say it was false).

**Keep entries short.** This file is read on demand (`rg -n <keyword> agent/NOTES.md`), not read wholesale.

---

## Format for new entries

```
## <short claim>  (verified <date> / decided <date>)
Evidence: <the command you ran, or the doc+line you read>
Consequence: <what a future implementer must therefore do>
```

---

## Pre-seeded by the human session of 2026-09-24

Everything already verified lives in [`ENV.md`](ENV.md) (endpoint matrix, `/slots` payload, `/metrics` dump, canonical identifiers, sacred processes) and [`STYLE.md`](STYLE.md) (palette, geometry, threshold-model convention). **Do not duplicate it here** — link to it. Use NOTES.md for things discovered *during the build*.

Two things worth restating because they are the run-killers:

## The agent shares the monitored slot  (decided 2026-09-24)
Evidence: `llama-server` runs `-np 1`; the overnight agent is served by that same process (`~/.dsh/settings.yaml` → `llama-local` → `http://127.0.0.1:8080/v1`).
Consequence: **never POST to `:8080`.** It occupies the only slot, so the agent's own next inference queues behind its test and the run hangs with no way to recover unattended. Use [`phases/FIXTURES.md`](phases/FIXTURES.md).

## The agent has no browser  (decided 2026-09-24)
Evidence: headless overnight run; the dsh web UI on `:3090` cannot be looked at.
Consequence: all visual ACs (AC9 chip legibility, theme contrast, tab actually appearing) are **`pending-human`**. Verify the machine-checkable part (build output, `--dump-config`, `curl` on the host route, unit tests on pure modules) and write precise human steps into `ACCEPTANCE.md`. **Never mark a visual AC as passed.**

---

<!-- Append build-time findings below this line. -->

## P1 snapshot semantics  (decided 2026-09-25)
Evidence: `agent/phases/P1-vertical-slice.md` state table + llama-server live check (`/health` → `{"status":"ok"}`).
Consequence:
- `HealthSnapshot` lives in `src/shared/types.ts` — single source of truth for the JSON shape both halves share.
- State table (locked): fetch exception / timeout / status ≥ 500 → `unreachable`; 2xx/3xx + body JSON `status === "ok"` → `idle`; 2xx/3xx anything else (incl. 4xx) → `unknown`.
- `latencyMs` measured on completed requests only; `null` when unreachable (a refused connect has no meaningful round-trip).
- `lastError` carries the most recent failure reason; reset to `null` on a good sample.
- `collect.ts` must **never throw** — every failure becomes a snapshot. Timeout is a module constant (2 s), not config.
- P2 extends `HealthSnapshot` with optional per-slot data; base fields are never reinterpreted.

## `cordis.patch.yml` config overrides `DEFAULT_ORIGIN`  (verified 2026-09-25)
Evidence: changed `src/host/config.ts` `DEFAULT_ORIGIN` to `:59999` — route still reported origin `:8080`; the harness passes `cordis.patch.yml` `config.origin` to `Config.validate` as `raw.origin`, which wins over the code default. Editing the patch file (not the code) is the only way to change the live origin.
Consequence: to retarget the origin (e.g. AC1 dead port) edit **`cordis.patch.yml`** `config.origin`, rebuild, restart `:3090`. `DEFAULT_ORIGIN` is a fallback only. Revert the patch file after tests; the 8080 value is the shipped default.

## AC1 / AC2 host-side verification  (verified 2026-09-25)
Evidence:
- AC1: `cordis.patch.yml` origin → `http://127.0.0.1:59999` (dead port); route → `{"ok":false,"state":"unreachable","lastError":"connection refused",…}` on **poll 1** (≤3).
- AC2 (host side): origin → `:8080`; route → `state:idle, ok:true, latencyMs:1`, `sampledAt` advancing ~1 s per poll (…32608 → …33610 → …35611).
- Served client bundle `plugins/??dsh-slot-health/client.js&rev=10987e59041cc1f8-50` = 8881 B, contains all current markers (`waiting for first sample`, `sidebar.right.pane.tab`, `sampledAt|lastAttempt`).
Consequence: browser-side AC2 (1 Hz re-render / "updated N s ago" advancing) and AC1 pane visuals are **pending-human** — server side is proven. Client bundle is served via the `??` combo URL only (flat path 404s by design).

## Auth token extraction  (verified 2026-09-25)
Evidence: the `:3090` boot token contains `-` characters; grep `[A-Za-z0-9_]*` truncates at the first dash. Use `sed 's/.*token=\([A-Za-z0-9_-]*\).*/\1/p'` on `/tmp/dsh-3090.log`.
Consequence: token URL is `?token=<full>` → 303 `/` with `Set-Cookie: dsh-auth-<hash>=v1.<jwt>`; then GET `/` with the cookie returns the ~31868-byte shell page.
