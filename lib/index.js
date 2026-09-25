// src/host/collect.ts
var HEALTH_PATH = "/health";
var SLOTS_PATH = "/slots";
var PROBE_TIMEOUT_MS = 2e3;
function normalizeOrigin(origin) {
  let s = origin.trim().replace(/\/+$/, "");
  if (s.endsWith("/v1")) s = s.slice(0, -"/v1".length);
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s;
}
function describeFailure(err) {
  const name2 = err?.name;
  const cause = err?.cause;
  if (name2 === "TimeoutError" || name2 === "AbortError" || cause?.code === "ETIMEDOUT") {
    return `timed out after ${PROBE_TIMEOUT_MS} ms`;
  }
  switch (cause?.code) {
    case "ECONNREFUSED":
      return "connection refused";
    case "ECONNRESET":
      return "connection reset";
    case "ENOTFOUND":
      return "host not found";
    default:
      break;
  }
  const msg = cause?.message || (err instanceof Error ? err.message : String(err));
  return msg.length > 120 ? `${msg.slice(0, 120)}\u2026` : msg;
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function parseSlot(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw;
  const idRaw = s.id;
  const id = typeof idRaw === "number" && Number.isFinite(idRaw) ? idRaw : typeof idRaw === "string" && idRaw.trim() !== "" ? Number(idRaw) : null;
  if (id === null || !Number.isFinite(id)) return null;
  const promptTokens = num(s.n_prompt_tokens);
  const promptTokensProcessed = num(s.n_prompt_tokens_processed);
  const promptProgress = promptTokens > 0 && promptTokensProcessed >= 0 ? Math.min(1, promptTokensProcessed / promptTokens) : null;
  const contextSize = num(s.n_ctx);
  const nextToken = Array.isArray(s.next_token) ? s.next_token[0] ?? {} : {};
  const decoded = num(nextToken.n_decoded);
  const contextUsed = promptTokens + decoded;
  const contextPressure = contextSize > 0 ? Math.min(1, contextUsed / contextSize) : null;
  return {
    id,
    // The ONLY busy/idle source of truth is `is_processing` (NOTES.md "the
    // idle detection trap").
    state: s.is_processing === true ? "busy" : "idle",
    idTask: typeof s.id_task === "string" ? s.id_task : null,
    promptTokens,
    promptTokensProcessed,
    promptProgress,
    promptTokensCache: num(s.n_prompt_tokens_cache),
    decoded,
    remain: num(nextToken.n_remain),
    hasNextToken: nextToken.has_next_token === true,
    contextSize,
    contextUsed,
    contextPressure,
    // Host-side latches — stamped by stampSlotLatches() in index.ts.
    busySinceMs: null,
    busyAgeMs: null,
    ttftMs: null,
    speculative: s.speculative === true
  };
}
function parseSlots(payload) {
  if (!Array.isArray(payload)) return null;
  const slots = [];
  for (const raw of payload) {
    const slot = parseSlot(raw);
    if (slot !== null) slots.push(slot);
  }
  return slots;
}
async function probe(url, apiKey2) {
  const headers = { accept: "application/json" };
  if (apiKey2 !== void 0 && apiKey2 !== "") headers.authorization = `Bearer ${apiKey2}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store"
    });
    const text = await res.text();
    let body = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: res.status, body };
  } catch (err) {
    return { body: null, error: describeFailure(err) };
  }
}
async function collectHealth(origin, opts = {}) {
  const base = normalizeOrigin(origin);
  const t0 = performance.now();
  const health = await probe(`${base}${HEALTH_PATH}`, void 0);
  const latencyMs = Math.round(performance.now() - t0);
  if (health.error !== void 0) {
    return {
      ok: false,
      state: "unreachable",
      latencyMs: null,
      lastError: health.error,
      sampledAt: Date.now(),
      slots: null,
      slotsError: null
    };
  }
  const status = health.status;
  if (status >= 500) {
    return {
      ok: false,
      state: "unreachable",
      latencyMs,
      lastError: `HTTP ${status} from ${HEALTH_PATH}`,
      sampledAt: Date.now(),
      slots: null,
      slotsError: null
    };
  }
  let state = "unknown";
  let lastError = status >= 400 ? `HTTP ${status} from ${HEALTH_PATH}` : "unrecognized /health response";
  if (status >= 200 && status < 300) {
    let body = health.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
      }
    }
    if (body !== null && typeof body === "object" && body.status === "ok") {
      state = "idle";
      lastError = null;
    }
  }
  const snapshot = {
    ok: status >= 200 && status < 400,
    state,
    latencyMs,
    lastError,
    sampledAt: Date.now(),
    slots: null,
    slotsError: null
  };
  if (snapshot.ok) {
    const slots = await probe(`${base}${SLOTS_PATH}`, opts.apiKey);
    if (slots.error !== void 0) {
      snapshot.slotsError = `GET ${SLOTS_PATH} failed: ${slots.error}`;
    } else if (slots.status === 401) {
      snapshot.slotsError = "auth required (401) \u2014 set LLAMA_API_KEY";
    } else if (slots.status === 404) {
      snapshot.slotsError = "endpoint does not expose /slots (404)";
    } else if (slots.status !== void 0 && slots.status >= 400) {
      snapshot.slotsError = `HTTP ${slots.status} from ${SLOTS_PATH}`;
    } else {
      const parsed = parseSlots(slots.body);
      if (parsed === null) {
        snapshot.slotsError = "unrecognized /slots payload (expected a JSON array)";
      } else {
        snapshot.slots = parsed;
      }
    }
  }
  return snapshot;
}

// src/host/latch.ts
function freshSlotLatch() {
  return { busy: false, idTask: null, busySinceMs: null, firstDecodedAtMs: null };
}
function advanceSlotLatch(prev, slot, nowMs) {
  const busy = slot.state === "busy";
  if (!busy) {
    return { busy: false, idTask: slot.idTask, busySinceMs: null, firstDecodedAtMs: null };
  }
  const taskChanged = prev.busy && prev.idTask !== null && slot.idTask !== null && prev.idTask !== slot.idTask;
  if (!prev.busy || taskChanged) {
    return {
      busy: true,
      idTask: slot.idTask,
      busySinceMs: nowMs,
      // If decode already happened in this very sample (we joined
      // mid-request), TTFT is 0 ms relative to the busy start.
      firstDecodedAtMs: slot.decoded > 0 ? nowMs : null
    };
  }
  const firstDecodedAtMs = prev.firstDecodedAtMs !== null ? prev.firstDecodedAtMs : slot.decoded > 0 ? nowMs : null;
  return { busy: true, idTask: slot.idTask, busySinceMs: prev.busySinceMs, firstDecodedAtMs };
}
function stampSlotLatches(slots, previous, nowMs) {
  const latches2 = new Map(previous);
  if (slots === null) {
    return { slots: null, latches: latches2 };
  }
  const seen = /* @__PURE__ */ new Set();
  const stamped = slots.map((slot) => {
    seen.add(slot.id);
    const next = advanceSlotLatch(previous.get(slot.id) ?? freshSlotLatch(), slot, nowMs);
    latches2.set(slot.id, next);
    const busySinceMs = next.busy ? next.busySinceMs : null;
    return {
      ...slot,
      busySinceMs,
      busyAgeMs: busySinceMs !== null ? Math.max(0, nowMs - busySinceMs) : null,
      ttftMs: next.busy && next.firstDecodedAtMs !== null && next.busySinceMs !== null ? Math.max(0, next.firstDecodedAtMs - next.busySinceMs) : null
    };
  });
  for (const id of [...latches2.keys()]) {
    if (!seen.has(id)) latches2.delete(id);
  }
  return { slots: stamped, latches: latches2 };
}

// src/host/route.ts
var ROUTE = "/api/dsh-slot-health";

// src/host/config.ts
var DEFAULT_ORIGIN = "http://127.0.0.1:8080";
function stripV1Prefix(origin) {
  let s = origin.trim().replace(/\/+$/, "");
  if (s.endsWith("/v1")) s = s.slice(0, -"/v1".length);
  return s;
}
var Config = {
  "~standard": {
    version: 1,
    vendor: "dsh-slot-health",
    validate(input) {
      const raw = input ?? {};
      if (raw.origin !== void 0 && (typeof raw.origin !== "string" || raw.origin.trim() === "")) {
        return { issues: [{ message: "origin must be a non-empty string", path: ["origin"] }] };
      }
      const origin = stripV1Prefix(raw.origin !== void 0 ? raw.origin.trim() : DEFAULT_ORIGIN);
      return { value: { origin } };
    }
  }
};

// src/host/index.ts
var name = "dsh-slot-health";
var inject = ["webServer"];
var SAMPLE_INTERVAL_MS = 1e3;
var latest = {
  ok: false,
  state: "unknown",
  latencyMs: null,
  lastError: "sampling\u2026",
  sampledAt: Date.now(),
  slots: null,
  slotsError: null
};
var latches = /* @__PURE__ */ new Map();
var apiKey = void 0;
var sampling = false;
async function tick(origin) {
  if (sampling) return;
  sampling = true;
  try {
    const snap = await collectHealth(origin, { apiKey });
    if (snap.slots !== null) {
      const stamped = stampSlotLatches(snap.slots, latches, Date.now());
      snap.slots = stamped.slots;
      latches.clear();
      for (const [id, latch] of stamped.latches) latches.set(id, latch);
    }
    latest = snap;
  } catch (err) {
    latest = {
      ok: false,
      state: "unreachable",
      latencyMs: null,
      lastError: String(err),
      sampledAt: Date.now(),
      slots: null,
      slotsError: null
    };
  } finally {
    sampling = false;
  }
}
function apply(ctx, config) {
  const origin = config.origin;
  const envKey = typeof process !== "undefined" && process.env ? process.env.LLAMA_API_KEY : void 0;
  apiKey = typeof envKey === "string" && envKey !== "" ? envKey : void 0;
  void tick(origin);
  const unregister = ctx.webServer.register({
    kind: "exact",
    path: ROUTE,
    handler: (req, res) => {
      if (req.method !== "GET") {
        res.writeHead(405, { "content-type": "application/json", allow: "GET" });
        res.end(JSON.stringify({ error: "method not allowed; use GET" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      const snap = latest;
      res.end(JSON.stringify({ ...snap, slots: snap.slots ? [...snap.slots] : null, origin }));
    }
  });
  ctx.effect(() => {
    const timer = setInterval(() => {
      void tick(origin);
    }, SAMPLE_INTERVAL_MS);
    timer.unref?.();
    return () => {
      clearInterval(timer);
    };
  }, "slot-health: sampler");
  ctx.effect(() => unregister, "slot-health: /api/dsh-slot-health route");
}
export {
  Config,
  ROUTE,
  SAMPLE_INTERVAL_MS,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
