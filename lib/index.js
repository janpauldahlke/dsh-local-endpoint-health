// src/host/collect.ts
var PROBE_PATH = "/health";
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
async function collectHealth(origin) {
  const url = `${normalizeOrigin(origin)}${PROBE_PATH}`;
  const t0 = performance.now();
  const sampledAt = () => Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    const latencyMs = Math.round(performance.now() - t0);
    const status = res.status;
    if (status >= 500) {
      return {
        ok: false,
        state: "unreachable",
        latencyMs,
        lastError: `HTTP ${status}`,
        sampledAt: sampledAt()
      };
    }
    let state = "unknown";
    let lastError = status >= 400 ? `HTTP ${status} from ${PROBE_PATH}` : "unrecognized /health response";
    if (status >= 200 && status < 300) {
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        if (body !== null && typeof body === "object" && body.status === "ok") {
          state = "idle";
          lastError = null;
        }
      } catch {
      }
    }
    return {
      ok: status >= 200 && status < 400,
      state,
      latencyMs,
      lastError,
      sampledAt: sampledAt()
    };
  } catch (err) {
    return {
      ok: false,
      state: "unreachable",
      latencyMs: null,
      lastError: describeFailure(err),
      sampledAt: sampledAt()
    };
  }
}

// src/host/route.ts
var ROUTE = "/api/dsh-slot-health";

// src/host/config.ts
var DEFAULT_ORIGIN = "http://127.0.0.1:59999";
var Config = {
  "~standard": {
    version: 1,
    vendor: "dsh-slot-health",
    validate(input) {
      const raw = input ?? {};
      if (raw.origin !== void 0 && (typeof raw.origin !== "string" || raw.origin.trim() === "")) {
        return { issues: [{ message: "origin must be a non-empty string", path: ["origin"] }] };
      }
      return { value: { origin: raw.origin !== void 0 ? raw.origin.trim() : DEFAULT_ORIGIN } };
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
  sampledAt: Date.now()
};
var sampling = false;
async function tick(origin) {
  if (sampling) return;
  sampling = true;
  try {
    latest = await collectHealth(origin);
  } catch (err) {
    latest = { ok: false, state: "unreachable", latencyMs: null, lastError: String(err), sampledAt: Date.now() };
  } finally {
    sampling = false;
  }
}
function apply(ctx, config) {
  const origin = config.origin;
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
      res.end(JSON.stringify({ ...latest, origin }));
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
