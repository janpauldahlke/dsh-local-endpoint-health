// src/host/collect.ts
function collectSnapshot() {
  return { ok: true, sampledAt: Date.now() };
}

// src/host/route.ts
var ROUTE = "/api/dsh-slot-health";

// src/host/index.ts
var name = "dsh-slot-health";
var inject = ["webServer"];
var SAMPLE_INTERVAL_MS = 1e3;
var latest = collectSnapshot();
var timer;
function tick() {
  try {
    latest = collectSnapshot();
  } catch (err) {
    latest = { ok: false, sampledAt: Date.now(), error: String(err) };
  }
}
function apply(ctx) {
  const unregister = ctx.webServer.register({
    kind: "exact",
    path: ROUTE,
    handler: (req, res) => {
      if (req.method !== "GET") {
        res.writeHead(405, { "content-type": "text/plain" });
        res.end("method not allowed");
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(latest));
    }
  });
  ctx.effect(() => {
    tick();
    timer = setInterval(tick, SAMPLE_INTERVAL_MS);
    timer.unref?.();
    return () => {
      if (timer !== void 0) clearInterval(timer);
      timer = void 0;
    };
  }, "slot-health: sampler");
  ctx.effect(() => unregister, "slot-health: /api/dsh-slot-health route");
}
export {
  ROUTE,
  SAMPLE_INTERVAL_MS,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
