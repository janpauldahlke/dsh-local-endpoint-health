# P4 — Error section: six distinguishable failure states

**Goal:** make every way this pane can lack data *say why*, in userland, without a terminal. This is Q10's UI half and the second-most important phase after P2.

**Read:** this file + `ENV.md` §"Canonical identifiers" (for the `/v1` trap). **Not** `PLAN.md`.

**Requires:** P2.

---

## The six states (all verified live unless noted)

| # | Condition | Evidence | User must see |
| --- | --- | --- | --- |
| 1 | 401 / 403 | `/slots` noauth → 401 | **Wrong or missing API key** + which config field. Distinct from unreachable: the server is *up*. |
| 2 | `/v1` misconfiguration | `/v1/slots` → **404** while `/v1/health` → **200** | **Slots not exposed at this origin — check for a `/v1` suffix** |
| 3 | `/metrics` 501 / 404 | probed | *Not an error.* Enrichment rows absent + one-line note. |
| 4 | Refused / timeout | dead port | **Unreachable** + last good age + attempt count |
| 5 | Unrecognized backend shape | reachable, no known fields | **Reachable, but not a known server** + whatever *is* known |
| 6 | Stale (poll failing after success) | — | "updated N s ago" **plus** explicit stale marking |

**Why state 2 gets its own row:** it is the only *silent* failure. `/health` returns 200, so a naive pane reads "reachable · idle" forever, never shows meat, and reports no error. The agent would have declared success. **Silent-meatless must be impossible** (AC5b).

## Rules

- **Never render a stale sample as current.** Mark it stale; keep the last-known age visible.
- **AC11:** a single catch-all "error" string **fails** this phase. All six must be visually/verbally distinguishable, in both pane and chip.
- Auth errors must not be reported as `unreachable` (they're opposites: one means "up, I lack access", the other "nothing there").
- State 2 detection: if `/health` (or `/v1/health`) is 200 but the slots route 404s, and the configured origin ends in `/v1`, say so explicitly and suggest the stripped origin.

## Your call

- Whether the error region is always-present-but-empty or only rendered on error.
- Wording. Aim for "what to do next", not "what went wrong internally".
- Whether to show HTTP status codes. Useful for you, noise for a casual user — your judgment.
- How state 5 enumerates "whatever is known" (latency, `/v1/models` contents, server header).

## Verify

1. **State 1:** set a wrong key in config → pane names the auth problem; server log shows the 401 (that's expected, P5 adds backoff). Restore the key.
2. **State 2 (AC5b):** set origin to `http://127.0.0.1:8080/v1` → pane must show the *named misconfiguration*, **never** `idle`. This is the critical assertion.
3. **State 3:** if `/metrics` is 501 anywhere, confirm rows vanish with no error styling.
4. **State 4:** point at a dead port → `unreachable` ≤3 polls, chat UI still usable (AC1).
5. **State 5:** point at any non-llama HTTP server that answers 200 (e.g. a plain static server, or `:3090` itself) → "reachable, unknown server", no crash.
6. **State 6:** stop your acceptance polling path or block the route; confirm the last sample is marked stale rather than silently reused.
7. Confirm none of the six messages leaks the key value.

## Then

Commit. Update `STATUS.md`.

## Likely traps

- Conflating 401 with unreachable — the most damaging confusion, since it sends the operator to restart the wrong thing.
- Detecting state 2 by "slots missing" alone, which also matches state 5 and makes both messages vague.
- Letting an error state clear the last-good metric values, so the operator loses the numbers they were watching.
