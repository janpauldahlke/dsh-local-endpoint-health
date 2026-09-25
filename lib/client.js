window.__ModuleLoader__.load({ id: "dsh-slot-health", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/useSlotHealth.ts
var import_react = require("react");

// src/client/store.ts
var API_PATH = "/api/dsh-slot-health";
var POLL_MS = 1e3;
var TIMEOUT_MS = 2500;
var snapshot = null;
var error = null;
var lastOk = null;
var lastAttempt = null;
var listeners = /* @__PURE__ */ new Set();
var timer = null;
var inFlight = false;
var controller = null;
function emit() {
  for (const l of [...listeners]) l();
}
function start() {
  if (timer !== null || inFlight) return;
  void tick();
}
function stopIfIdle() {
  if (listeners.size > 0) return;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  controller?.abort("stopped");
}
async function tick() {
  if (inFlight) return;
  inFlight = true;
  controller = new AbortController();
  const timeout = setTimeout(() => controller?.abort("timeout"), TIMEOUT_MS);
  try {
    const res = await fetch(API_PATH, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`poll failed: HTTP ${res.status}`);
    snapshot = await res.json();
    error = null;
    lastOk = Date.now();
  } catch (err) {
    const reason = controller?.signal.reason;
    if (reason === "stopped") {
    } else if (reason === "timeout") {
      error = `poll timed out after ${TIMEOUT_MS} ms`;
    } else {
      error = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearTimeout(timeout);
    lastAttempt = Date.now();
    inFlight = false;
    controller = null;
    emit();
    if (listeners.size > 0 && timer === null) {
      timer = setTimeout(() => {
        timer = null;
        void tick();
      }, POLL_MS);
    }
  }
}
function subscribe(listener) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    stopIfIdle();
  };
}
function getSnapshot() {
  return snapshot;
}
function getPollError() {
  return error;
}
function getLastAttempt() {
  return lastAttempt;
}

// src/client/useSlotHealth.ts
function readLive() {
  return {
    snapshot: getSnapshot(),
    error: getPollError(),
    lastAttempt: getLastAttempt()
  };
}
function useSlotHealth() {
  const [live, setLive] = (0, import_react.useState)(readLive);
  (0, import_react.useEffect)(() => {
    return subscribe(() => setLive(readLive()));
  }, []);
  return live;
}

// src/client/SlotBody.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var STALE_MS = 3e3;
var STATE_COLOR = {
  idle: "#22c55e",
  unreachable: "#ef4444",
  unknown: "#8b93a7"
};
var MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
var container = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5
};
var muted = { color: "#8b93a7", margin: 0 };
var rowLabel = { color: "#8b93a7", width: 64, flexShrink: 0 };
var rowValue = { fontFamily: MONO, color: "#c3c9d6" };
var slotHeader = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingTop: 6,
  borderTop: "1px solid rgba(139,147,167,0.2)"
};
function originLabel(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
function StateChip({ state }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: STATE_COLOR[state] }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { width: 8, height: 8, borderRadius: "50%", background: STATE_COLOR[state] } }),
    state
  ] });
}
function Meter({ ratio, color = "#60a5fa" }) {
  if (ratio === null) return null;
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      "aria-hidden": true,
      style: {
        display: "inline-block",
        width: 72,
        height: 6,
        borderRadius: 3,
        overflow: "hidden",
        background: "rgba(139,147,167,0.25)",
        verticalAlign: "middle"
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { display: "block", height: "100%", width: `${pct}%`, background: color } })
    }
  );
}
function fmtMs(ms) {
  if (ms === null) return "\u2014";
  if (ms < 1e3) return `${Math.round(ms)} ms`;
  const s = ms / 1e3;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m} m ${rem} s`;
}
function fmtInt(n) {
  return n.toLocaleString("en-US");
}
function Row({ label, value }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: rowLabel, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: rowValue, children: value })
  ] });
}
function SlotBlock({ slot }) {
  const busy = slot.state === "busy";
  const progressPct = slot.promptProgress !== null ? ` (${Math.round(slot.promptProgress * 100)}%)` : "";
  const pressurePct = slot.contextPressure !== null ? ` (${Math.round(slot.contextPressure * 100)}%)` : "";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: slotHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
        "slot ",
        slot.id
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600, color: busy ? "#f59e0b" : "#22c55e" }, children: busy ? "busy" : "idle" }),
      busy && slot.idTask !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: muted, children: slot.idTask })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      Row,
      {
        label: "prompt",
        value: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          fmtInt(slot.promptTokensProcessed),
          " / ",
          fmtInt(slot.promptTokens),
          progressPct,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meter, { ratio: slot.promptProgress, color: "#f59e0b" })
        ] })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "decoded", value: fmtInt(slot.decoded) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "busy", value: fmtMs(slot.busyAgeMs) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "ttft", value: fmtMs(slot.ttftMs) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      Row,
      {
        label: "context",
        value: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          fmtInt(slot.contextUsed),
          " / ",
          fmtInt(slot.contextSize),
          pressurePct,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meter, { ratio: slot.contextPressure })
        ] })
      }
    )
  ] });
}
function SlotBody() {
  const { snapshot: snapshot2, error: error2, lastAttempt: lastAttempt2 } = useSlotHealth();
  const now = lastAttempt2 ?? Date.now();
  const ageMs = snapshot2 ? now - snapshot2.sampledAt : null;
  const stale = ageMs !== null && ageMs > STALE_MS;
  const age = ageMs === null ? null : `${Math.max(0, Math.round(ageMs / 1e3))} s ago`;
  if (error2 !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: container, children: [
      snapshot2 !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontFamily: MONO, fontSize: 12, color: "#c3c9d6" }, children: originLabel(snapshot2.origin) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: muted, children: [
        "no data \u2014 ",
        error2
      ] })
    ] });
  }
  if (snapshot2 === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: container, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: "waiting for first sample\u2026" }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...container, opacity: stale ? 0.55 : 1 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StateChip, { state: snapshot2.state }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontFamily: MONO, fontSize: 12, color: "#c3c9d6" }, children: originLabel(snapshot2.origin) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 16 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        "latency",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { style: { fontWeight: 600 }, children: snapshot2.latencyMs === null ? "\u2014" : `${snapshot2.latencyMs} ms` })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        "updated",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { style: { fontWeight: 600 }, children: [
          age,
          stale ? " (stale)" : ""
        ] })
      ] })
    ] }),
    snapshot2.lastError !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { ...muted, overflowWrap: "anywhere" }, children: snapshot2.lastError }),
    snapshot2.slots === null ? snapshot2.slotsError !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { ...muted, overflowWrap: "anywhere" }, children: [
      "slots: ",
      snapshot2.slotsError
    ] }) : snapshot2.slots.map((slot) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlotBlock, { slot }, slot.id))
  ] });
}

// src/client/SlotTitle.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var STATE_COLOR2 = {
  idle: "#22c55e",
  unreachable: "#ef4444",
  unknown: "#8b93a7"
};
var NO_DATA_COLOR = "#8b93a7";
function SlotTitle() {
  const { snapshot: snapshot2, error: error2 } = useSlotHealth();
  const dot = error2 !== null || snapshot2 === null ? NO_DATA_COLOR : STATE_COLOR2[snapshot2.state];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "span",
          {
            style: {
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: dot,
              display: "inline-block"
            }
          }
        ),
        "Slot Health"
      ]
    }
  );
}

// src/client/index.tsx
var TAB_ID = "dsh-slot-health";
var inject = ["slots", "sidebarRight", "sidebarRightTabs"];
function apply(ctx) {
  const definition = {
    id: TAB_ID,
    kind: "slot-health",
    title: () => "Slot Health",
    guide: [{
      id: "slot-health",
      order: 300,
      title: () => "Slot Health",
      description: () => "Live health of local llama.cpp and Ollama endpoints"
    }]
  };
  const disposeType = ctx.sidebarRightTabs.register(definition);
  const disposeBody = ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register(
    { name: "sidebar.right.pane.tab", key: TAB_ID },
    SlotBody
  ));
  const disposeTitle = ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register(
    { name: "sidebar.right.pane.tab.title", key: TAB_ID },
    SlotTitle
  ));
  ctx.effect(() => () => {
    disposeTitle();
    disposeBody();
    disposeType();
  }, "slot-health: rightbar tab type");
}
return module.exports; } });
//# sourceMappingURL=client.js.map
