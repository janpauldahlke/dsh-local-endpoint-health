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
