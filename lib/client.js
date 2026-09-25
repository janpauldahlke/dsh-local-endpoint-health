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

// src/client/SlotBody.tsx
var import_react2 = require("react");

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

// src/client/paneState.ts
var openCount = 0;
var listeners2 = /* @__PURE__ */ new Set();
function setPaneOpen(open) {
  const next = open ? openCount + 1 : Math.max(0, openCount - 1);
  if (next === openCount) return;
  openCount = next;
  for (const listener of [...listeners2]) listener();
}
function isPaneOpen() {
  return openCount > 0;
}
function subscribePaneOpen(listener) {
  listeners2.add(listener);
  return () => {
    listeners2.delete(listener);
  };
}

// src/client/slotState.ts
var STALE_MS = 3e3;
var STATE_DOT = {
  waiting: "#8b93a7",
  unreachable: "#ef4444",
  error: "#ef4444",
  unknown: "#f59e0b",
  busy: "#3b82f6",
  idle: "#22c55e"
};
function ageLabel(ms) {
  if (ms < 1e3) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 6e4) return `${Math.round(ms / 1e3)}s`;
  const m = Math.floor(ms / 6e4);
  const s = Math.round(ms % 6e4 / 1e3);
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}
function deriveChip(live, now) {
  const { snapshot: snapshot2, error: error2 } = live;
  if (error2 !== null) {
    return {
      state: "error",
      dot: STATE_DOT.error,
      label: "error",
      stale: false,
      title: `slot-health \u2014 ${error2}`
    };
  }
  if (snapshot2 === null) {
    return {
      state: "waiting",
      dot: STATE_DOT.waiting,
      label: "waiting",
      stale: false,
      title: "slot-health \u2014 waiting for first sample"
    };
  }
  const age = now - snapshot2.sampledAt;
  const stale = age > STALE_MS;
  if (snapshot2.state === "unreachable") {
    const detail = snapshot2.lastError ? ` \u2014 ${snapshot2.lastError}` : "";
    return {
      state: "unreachable",
      dot: STATE_DOT.unreachable,
      label: "down",
      stale,
      title: withStale(`slot-health \u2014 endpoint unreachable${detail}`, stale, age)
    };
  }
  if (snapshot2.state === "unknown") {
    const detail = snapshot2.lastError ? ` \u2014 ${snapshot2.lastError}` : "";
    return {
      state: "unknown",
      dot: STATE_DOT.unknown,
      label: "unknown",
      stale,
      title: withStale(`slot-health \u2014 endpoint shape not recognized${detail}`, stale, age)
    };
  }
  if (snapshot2.slots === null && snapshot2.slotsError !== null) {
    const isAuth = /401|auth/i.test(snapshot2.slotsError);
    return {
      state: "error",
      dot: STATE_DOT.error,
      label: isAuth ? "auth" : "slots",
      stale,
      title: withStale(`slot-health \u2014 slots: ${snapshot2.slotsError}`, stale, age)
    };
  }
  const slots = snapshot2.slots ?? [];
  const busySlots = slots.filter((s) => s.state === "busy");
  if (busySlots.length > 0) {
    const maxAgeMs = Math.max(...busySlots.map((s) => s.busyAgeMs ?? 0));
    const totalDecoded = slots.reduce((sum, s) => sum + (s.decoded > 0 ? s.decoded : 0), 0);
    let label = `busy ${ageLabel(maxAgeMs)}`;
    if (totalDecoded > 0) label += ` \xB7 dec ${totalDecoded}`;
    const detail = totalDecoded > 0 ? `, ${totalDecoded} tokens decoded` : "";
    return {
      state: "busy",
      dot: STATE_DOT.busy,
      label,
      stale,
      title: withStale(`slot-health \u2014 busy for ${ageLabel(maxAgeMs)}${detail}`, stale, age)
    };
  }
  return {
    state: "idle",
    dot: STATE_DOT.idle,
    label: "idle",
    stale,
    title: withStale(
      `slot-health \u2014 all slots idle (${slots.length} slot${slots.length === 1 ? "" : "s"})`,
      stale,
      age
    )
  };
}
function withStale(title, stale, ageMs) {
  if (!stale) return title;
  return `${title}
stale \u2014 last updated ${ageLabel(ageMs)} ago`;
}

// src/client/metricsFmt.ts
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function toFigure(v) {
  if (isFiniteNumber(v)) return { value: v, sample: 0 };
  if (v !== null && typeof v === "object") {
    const f = v;
    if (isFiniteNumber(f.value) && isFiniteNumber(f.sample)) return { value: f.value, sample: f.sample };
  }
  return null;
}
function fmtFigure(figure) {
  if (figure === null) return null;
  return figure.sample > 0 ? `${figure.value} (n=${figure.sample})` : `${figure.value}`;
}
function toPerPos(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const entry of v) {
    if (entry === null || typeof entry !== "object") continue;
    const p = entry;
    if (isFiniteNumber(p.position) && isFiniteNumber(p.acceptance)) {
      out.push({ position: p.position, acceptance: p.acceptance });
    }
  }
  return out;
}
function fmtPerPos(perPos) {
  return perPos.map((p) => `p${p.position} ${p.acceptance}`).join(" \xB7 ");
}
function metricsHasRows(m) {
  if (m === null || typeof m !== "object") return false;
  const s = m;
  for (const key of ["promptTokensPerSec", "tokensPerSec", "requestsDeferred", "requestsProcessing", "contextHighWater"]) {
    if (isFiniteNumber(s[key])) return true;
  }
  for (const scope of ["draftAcceptance", "draftMeanLen"]) {
    const d = s[scope];
    if (d !== null && typeof d === "object") {
      const dd = d;
      if (toFigure(dd.lifetime) !== null || toFigure(dd.lastRequest) !== null) return true;
    }
  }
  return toPerPos(s.perPosLastRequest).length > 0;
}

// src/client/MetricsBlock.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
var block = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  paddingTop: 6,
  borderTop: "1px solid rgba(139,147,167,0.2)"
};
var sectionHeader = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  marginBottom: 2
};
var muted = { color: "#8b93a7", margin: 0 };
var rowLabel = { color: "#8b93a7", width: 96, flexShrink: 0 };
var rowValue = { fontFamily: MONO, color: "#c3c9d6" };
function Row({ label, value }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: rowLabel, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: rowValue, children: value })
  ] });
}
function MetricsBlock({ metrics }) {
  const accLife = fmtFigure(toFigure(metrics.draftAcceptance.lifetime));
  const accLast = fmtFigure(toFigure(metrics.draftAcceptance.lastRequest));
  const lenLife = fmtFigure(toFigure(metrics.draftMeanLen.lifetime));
  const lenLast = fmtFigure(toFigure(metrics.draftMeanLen.lastRequest));
  const perPos = toPerPos(metrics.perPosLastRequest);
  const specRows = accLife !== null || accLast !== null || lenLife !== null || lenLast !== null || perPos.length > 0;
  const hasRows = metricsHasRows(metrics);
  if (!hasRows) return null;
  const windowLabel = metrics.rateWindowMs > 0 ? `${ageLabel(metrics.rateWindowMs)} window` : null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...block, opacity: metrics.fresh ? 1 : 0.55 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: sectionHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "server metrics" }),
      windowLabel !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: muted, children: windowLabel })
    ] }),
    metrics.promptTokensPerSec !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "prompt /s", value: metrics.promptTokensPerSec }),
    metrics.tokensPerSec !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "decode /s", value: metrics.tokensPerSec }),
    metrics.requestsDeferred !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "deferred", value: metrics.requestsDeferred }),
    metrics.requestsProcessing !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "active", value: metrics.requestsProcessing }),
    metrics.contextHighWater !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "ctx peak", value: metrics.contextHighWater.toLocaleString("en-US") }),
    specRows && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      accLife !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "acc \xB7 lifetime", value: accLife }),
      accLast !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "acc \xB7 last req", value: accLast }),
      lenLife !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "len \xB7 lifetime", value: lenLife }),
      lenLast !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "len \xB7 last req", value: lenLast }),
      perPos.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { label: "per-pos \xB7 last", value: fmtPerPos(perPos) })
    ] }),
    !metrics.fresh && metrics.error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { ...muted, overflowWrap: "anywhere", marginTop: 2 }, children: metrics.error })
  ] });
}

// src/client/SlotBody.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var STALE_MS2 = 3e3;
var MONO2 = "ui-monospace, SFMono-Regular, Menlo, monospace";
var container = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5
};
var muted2 = { color: "#8b93a7", margin: 0 };
var rowLabel2 = { color: "#8b93a7", width: 64, flexShrink: 0 };
var rowValue2 = { fontFamily: MONO2, color: "#c3c9d6" };
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
function Meter({ ratio, color = "#60a5fa" }) {
  if (ratio === null) return null;
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { display: "block", height: "100%", width: `${pct}%`, background: color } })
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
function Row2({ label, value }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: rowLabel2, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: rowValue2, children: value })
  ] });
}
function SlotBlock({ slot }) {
  const busy = slot.state === "busy";
  const progressPct = slot.promptProgress !== null ? ` (${Math.round(slot.promptProgress * 100)}%)` : "";
  const pressurePct = slot.contextPressure !== null ? ` (${Math.round(slot.contextPressure * 100)}%)` : "";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: slotHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { children: [
        "slot ",
        slot.id
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontWeight: 600, color: busy ? "#f59e0b" : "#22c55e" }, children: busy ? "busy" : "idle" }),
      busy && slot.idTask !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: muted2, children: slot.idTask })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Row2,
      {
        label: "prompt",
        value: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          fmtInt(slot.promptTokensProcessed),
          " / ",
          fmtInt(slot.promptTokens),
          progressPct,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Meter, { ratio: slot.promptProgress, color: "#f59e0b" })
        ] })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row2, { label: "decoded", value: fmtInt(slot.decoded) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row2, { label: "busy", value: fmtMs(slot.busyAgeMs) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Row2, { label: "ttft", value: fmtMs(slot.ttftMs) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Row2,
      {
        label: "context",
        value: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          fmtInt(slot.contextUsed),
          " / ",
          fmtInt(slot.contextSize),
          pressurePct,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Meter, { ratio: slot.contextPressure })
        ] })
      }
    )
  ] });
}
function SlotBody() {
  const { snapshot: snapshot2, error: error2, lastAttempt: lastAttempt2 } = useSlotHealth();
  (0, import_react2.useEffect)(() => {
    setPaneOpen(true);
    return () => setPaneOpen(false);
  }, []);
  const now = lastAttempt2 ?? Date.now();
  const ageMs = snapshot2 ? now - snapshot2.sampledAt : null;
  const stale = ageMs !== null && ageMs > STALE_MS2;
  const age = ageMs === null ? null : `${Math.max(0, Math.round(ageMs / 1e3))} s ago`;
  if (error2 !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: container, children: [
      snapshot2 !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontFamily: MONO2, fontSize: 12, color: "#c3c9d6" }, children: originLabel(snapshot2.origin) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: muted2, children: [
        "no data \u2014 ",
        error2
      ] })
    ] });
  }
  if (snapshot2 === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: container, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: muted2, children: "waiting for first sample\u2026" }) });
  }
  const chip = deriveChip({ snapshot: snapshot2, error: error2, lastAttempt: lastAttempt2 }, now);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...container, opacity: stale ? 0.55 : 1 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "span",
        {
          title: chip.title,
          style: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: chip.dot },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": true, style: { width: 8, height: 8, borderRadius: "50%", background: chip.dot, flexShrink: 0 } }),
            chip.label
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontFamily: MONO2, fontSize: 12, color: "#c3c9d6" }, children: originLabel(snapshot2.origin) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 16 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "latency",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { style: { fontWeight: 600 }, children: snapshot2.latencyMs === null ? "\u2014" : `${snapshot2.latencyMs} ms` })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "updated",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { style: { fontWeight: 600 }, children: [
          age,
          stale ? " (stale)" : ""
        ] })
      ] })
    ] }),
    snapshot2.lastError !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...muted2, overflowWrap: "anywhere" }, children: snapshot2.lastError }),
    snapshot2.slots === null ? snapshot2.slotsError !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: { ...muted2, overflowWrap: "anywhere" }, children: [
      "slots: ",
      snapshot2.slotsError
    ] }) : snapshot2.slots.map((slot) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SlotBlock, { slot }, slot.id)),
    snapshot2.metrics !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MetricsBlock, { metrics: snapshot2.metrics })
  ] });
}

// src/client/SlotTitle.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var STATE_COLOR = {
  idle: "#22c55e",
  unreachable: "#ef4444",
  unknown: "#8b93a7"
};
var NO_DATA_COLOR = "#8b93a7";
function SlotTitle() {
  const { snapshot: snapshot2, error: error2 } = useSlotHealth();
  const dot = error2 !== null || snapshot2 === null ? NO_DATA_COLOR : STATE_COLOR[snapshot2.state];
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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

// src/client/SlotDockChip.tsx
var import_react3 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function SlotDockChip({ onOpen }) {
  const live = useSlotHealth();
  const [paneOpen, setPaneOpenState] = (0, import_react3.useState)(isPaneOpen);
  const [now, setNow] = (0, import_react3.useState)(() => Date.now());
  (0, import_react3.useEffect)(() => subscribePaneOpen(() => setPaneOpenState(isPaneOpen())), []);
  (0, import_react3.useEffect)(() => {
    const id = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(id);
  }, []);
  if (paneOpen) return null;
  const display = deriveChip(live, now);
  const stale = display.stale;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "button",
    {
      type: "button",
      onClick: onOpen,
      title: display.title,
      "aria-label": `Slot health: ${display.label}`,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "1px 8px",
        borderRadius: 999,
        border: "1px solid rgba(128,128,128,0.25)",
        background: "transparent",
        color: "inherit",
        fontSize: "11.5px",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        cursor: "pointer",
        opacity: stale ? 0.55 : 1,
        transition: "opacity 200ms",
        whiteSpace: "nowrap"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "span",
          {
            "aria-hidden": true,
            style: {
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: display.dot,
              flexShrink: 0
            }
          }
        ),
        display.label
      ]
    }
  );
}

// src/client/index.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
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
  const SlotDockSeat = () => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SlotDockChip, { onOpen: () => ctx.sidebarRight.openTab("slot-health") });
  const disposeDock = ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register(
    { name: "conversation.composer.dock", id: "slot-health", order: -10 },
    SlotDockSeat
  ));
  ctx.effect(() => () => {
    disposeDock();
    disposeTitle();
    disposeBody();
    disposeType();
  }, "slot-health: rightbar tab type");
}
return module.exports; } });
//# sourceMappingURL=client.js.map
