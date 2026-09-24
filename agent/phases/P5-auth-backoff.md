# P5 — API key config + auth-failure backoff

**Goal:** proper key handling and a poll policy that is quiet when broken and instant when healthy.

**Read:** this file only. **Not** `PLAN.md`.

**Requires:** P2 (needs the authed `/slots` path), P4 (needs the auth-error state).

---

## Decisions locked (Q2, Q10)

**Key precedence** (first that yields a value wins):
1. Explicit key in plugin config
2. Env var named by config, default **`LLAMA_API_KEY`**
3. No auth header

`process.env.LLAMA_API_KEY` already reaches the dsh host process on this machine (verified: llama-server pid and dsh pid both carry it, same value). So precedence rule 2 is the zero-config happy path — but it is *implicit*, so explicit config must override it.

**Backoff:** 1s while healthy (Q4). On 401/403, drop to **~10s**. Resume **1s immediately** once a poll succeeds. A wrong key cannot self-heal, so 1s buys nothing and adds log noise — llama.cpp logs `SRV_WRN("unauthorized: Invalid API Key")` unconditionally per unauthorized request (`tools/server/server-http.cpp:250`). A *correct* key produces zero log lines at any rate, so backoff is purely broken-state hygiene, not normal behavior.

## Hard rules

- **Never** log, print, render, or commit the key. Not in the pane, console, error message, NOTES.md, or a commit message. If you need to confirm it's set, log only its *presence* or length.
- Send it **only** as the outbound request header. Store nothing derived from it.
- Back off on **auth failure only** in this phase (per Q10 decision). Do not change the unreachable-path interval here — that stays 1s so recovery is visible. (If you believe unreachable should also back off, note it in STATUS as a proposal; don't implement it.)
- Backoff must not break the "updated N s ago" honesty — the displayed age must reflect real elapsed time, not poll count.

## Your call

- Config schema shape (field names for origin, key, env-var-name, thresholds from P3).
- Whether the key field is write-only / masked in any settings UI.
- Exact backoff timing and whether it's a fixed 10s or a small escalating sequence capped at 10s. Keep it simple enough to test.
- How the pane signals "polling slowly due to auth error" vs "auth error" (may be the same message).

## Verify

1. **Precedence:** with no explicit key configured, pane works via `process.env.LLAMA_API_KEY`. Then set an explicit *correct* key → still works. Then set an explicit *wrong* key → auth error (proves explicit beats env).
2. **AC10 timing:** with a wrong key, measure the interval between requests (server log timestamps or a local counter) → confirm ~10s spacing, not 1s.
3. **AC10 recovery:** fix the key *without restarting anything* → next poll succeeds and interval returns to 1s promptly. No permanent give-up.
4. **Key hygiene:** grep your own source and the built `lib/` for the key's value → must be absent. Trigger an auth error and read the rendered message + host JSON → no key material.
5. Confirm a 401 still renders as the *auth* state from P4, not `unreachable`.

## Then

Commit. Update `STATUS.md`.

## Likely traps

- Backing off by *skipping* polls in a way that also freezes the age display.
- Letting backoff state persist after the key is fixed (stuck at 10s forever).
- Reading the env var once at startup and caching it, so a config change needs a restart. Decide and document which you do.
- Accidentally including the key in the host route's JSON snapshot (it's a natural place to stash "current config" — don't).
