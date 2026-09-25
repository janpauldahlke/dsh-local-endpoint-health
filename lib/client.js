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
      detail: null,
      stale: false,
      title: `slot-health \u2014 ${error2}`
    };
  }
  if (snapshot2 === null) {
    return {
      state: "waiting",
      dot: STATE_DOT.waiting,
      label: "waiting",
      detail: null,
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
      detail: null,
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
      detail: null,
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
      detail: null,
      stale,
      title: withStale(`slot-health \u2014 slots: ${snapshot2.slotsError}`, stale, age)
    };
  }
  const slots = snapshot2.slots ?? [];
  const busySlots = slots.filter((s) => s.state === "busy");
  if (busySlots.length > 0) {
    const maxAgeMs = Math.max(...busySlots.map((s) => s.busyAgeMs ?? 0));
    const totalDecoded = slots.reduce((sum, s) => sum + (s.decoded > 0 ? s.decoded : 0), 0);
    const decodedDetail = totalDecoded > 0 ? `, ${totalDecoded} tokens decoded` : "";
    return {
      state: "busy",
      dot: STATE_DOT.busy,
      // Stable: the dock chip must not widen every second as the age advances.
      // The pane header shows `detail` instead (REVIEW §2c).
      label: "busy",
      detail: `busy ${ageLabel(maxAgeMs)}${totalDecoded > 0 ? ` \xB7 dec ${totalDecoded}` : ""}`,
      stale,
      title: withStale(`slot-health \u2014 busy for ${ageLabel(maxAgeMs)}${decodedDetail}`, stale, age)
    };
  }
  return {
    state: "idle",
    dot: STATE_DOT.idle,
    label: "idle",
    detail: null,
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

// src/client/row.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
var muted = { color: "color-mix(in srgb, currentColor 55%, transparent)", margin: 0 };
var HAIRLINE = "1px solid color-mix(in srgb, currentColor 22%, transparent)";
function Meter({ ratio, tooltip }) {
  const w = ratio === null || !Number.isFinite(ratio) ? 0 : Math.max(0, Math.min(1, ratio)) * 100;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      title: tooltip,
      style: {
        flex: 1,
        height: 4,
        borderRadius: 2,
        background: "color-mix(in srgb, currentColor 10%, transparent)",
        overflow: "hidden",
        cursor: "default"
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          style: {
            width: `${w}%`,
            height: "100%",
            borderRadius: 2,
            background: "color-mix(in srgb, currentColor 60%, transparent)",
            transition: "width 0.6s linear"
          }
        }
      )
    }
  );
}
function Row({ label, value, meter, tooltip }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      title: tooltip,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "2.5px 0",
        cursor: "default"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11.5, color: "color-mix(in srgb, currentColor 55%, transparent)", flexShrink: 0 }, children: label }),
        meter !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meter, { ratio: meter, tooltip: tooltip ?? "" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "span",
          {
            style: {
              fontSize: 12.5,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              textAlign: "right",
              flexShrink: 1,
              minWidth: 0,
              overflowWrap: "anywhere"
            },
            children: value
          }
        )
      ]
    }
  );
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
var import_jsx_runtime2 = require("react/jsx-runtime");
var block = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  paddingTop: 6,
  borderTop: HAIRLINE
};
var sectionHeader = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  marginBottom: 2
};
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...block, opacity: metrics.fresh ? 1 : 0.55 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: sectionHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: "server metrics" }),
      windowLabel !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: muted, children: windowLabel })
    ] }),
    metrics.promptTokensPerSec !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Row,
      {
        label: "prompt /s",
        value: `${metrics.promptTokensPerSec} tok/s`,
        tooltip: "Prompt-encoding rate: prompt-token counter delta across the shown sample window, from the server's own /metrics (llamacpp:prompt_tokens_total). Not a GPU figure."
      }
    ),
    metrics.tokensPerSec !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Row,
      {
        label: "decode /s",
        value: `${metrics.tokensPerSec} tok/s`,
        tooltip: "Decoding rate: predicted-token counter delta across the shown sample window, from the server's own /metrics (llamacpp:tokens_predicted_total)."
      }
    ),
    metrics.requestsDeferred !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Row,
      {
        label: "deferred",
        value: String(metrics.requestsDeferred),
        tooltip: "Server gauge: requests deferred (queued) right now, from /metrics (llamacpp:requests_deferred)."
      }
    ),
    metrics.requestsProcessing !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Row,
      {
        label: "active",
        value: String(metrics.requestsProcessing),
        tooltip: "Server gauge: requests being processed right now, from /metrics (llamacpp:requests_processing)."
      }
    ),
    metrics.contextHighWater !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Row,
      {
        label: "ctx peak",
        value: metrics.contextHighWater.toLocaleString("en-US"),
        tooltip: "Context high-water: largest token count any slot's context has reached since server start, from /metrics (llamacpp:context_peeked_total-style gauge). Resets on server restart."
      }
    ),
    specRows && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      accLife !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Row,
        {
          label: "acc \xB7 lifetime",
          value: accLife,
          tooltip: "Draft acceptance, cumulative since server start: accepted draft tokens / draft tokens, from /metrics spec_decode counters. (n=) is the draft-token denominator."
        }
      ),
      accLast !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Row,
        {
          label: "acc \xB7 last req",
          value: accLast,
          tooltip: "Draft acceptance across the most recent completed request only (id_task boundary delta). (n=) is the draft-token denominator for that request."
        }
      ),
      lenLife !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Row,
        {
          label: "len \xB7 lifetime",
          value: lenLife,
          tooltip: "Mean accepted draft length, cumulative since server start: accepted tokens / draft attempts. (n=) is the draft-attempt denominator."
        }
      ),
      lenLast !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Row,
        {
          label: "len \xB7 last req",
          value: lenLast,
          tooltip: "Mean accepted draft length across the most recent completed request only. (n=) is the draft-attempt denominator for that request."
        }
      ),
      perPos.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Row,
        {
          label: "per-pos \xB7 last",
          value: fmtPerPos(perPos),
          tooltip: "Per-position draft acceptance of the last completed request (MTP diagnostic): position \u2192 tokens accepted at that position."
        }
      )
    ] }),
    !metrics.fresh && metrics.error !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...muted, overflowWrap: "anywhere", marginTop: 2 }, children: metrics.error })
  ] });
}

// src/client/SlotBody.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var STALE_MS2 = 3e3;
var container = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
  color: "inherit"
};
function originLabel(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
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
function SlotBlock({ slot }) {
  const busy = slot.state === "busy";
  const promptPct = slot.promptProgress !== null ? Math.round(slot.promptProgress * 100) : null;
  const ctxPct = slot.contextPressure !== null ? Math.round(slot.contextPressure * 100) : null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 2, paddingTop: 6, borderTop: HAIRLINE }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("b", { children: [
        "slot ",
        slot.id
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontWeight: 600, color: busy ? STATE_DOT.busy : STATE_DOT.idle, fontVariantNumeric: "tabular-nums" }, children: busy ? "busy" : "idle" }),
      busy && slot.idTask !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: muted, children: slot.idTask })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      Row,
      {
        label: "prompt",
        value: `${fmtInt(slot.promptTokensProcessed)} / ${fmtInt(slot.promptTokens)}${promptPct !== null ? ` (${promptPct}%)` : ""}`,
        meter: slot.promptProgress,
        tooltip: "Prompt tokens processed vs total for this request, from /slots (prompt_tokens / prompt_tokens_total). The bar is the processed share."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      Row,
      {
        label: "decoded",
        value: fmtInt(slot.decoded),
        tooltip: "Decoded (generated) tokens so far in this request, from /slots."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      Row,
      {
        label: "busy",
        value: fmtMs(slot.busyAgeMs),
        tooltip: "How long this slot has been busy, latched host-side at the idle\u2192busy transition. Null until the host has observed the transition."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      Row,
      {
        label: "ttft",
        value: fmtMs(slot.ttftMs),
        tooltip: "Time to first token: host-latched elapsed time from the busy transition to the first decoded token. Null until the first decode is observed."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      Row,
      {
        label: "context",
        value: `${fmtInt(slot.contextUsed)} / ${fmtInt(slot.contextSize)}${ctxPct !== null ? ` (${ctxPct}%)` : ""}`,
        meter: slot.contextPressure,
        tooltip: "Context used vs the slot's configured n_ctx, from /slots. The bar is the pressure share."
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
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: container, children: [
      snapshot2 !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontFamily: MONO, fontSize: 12 }, children: originLabel(snapshot2.origin) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: muted, children: [
        "no data \u2014 ",
        error2
      ] })
    ] });
  }
  if (snapshot2 === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: container, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: muted, children: "waiting for first sample\u2026" }) });
  }
  const chip = deriveChip({ snapshot: snapshot2, error: error2, lastAttempt: lastAttempt2 }, now);
  const latency = snapshot2.latencyMs === null ? "\u2014" : snapshot2.latencyMs < 1 ? "<1 ms" : `${snapshot2.latencyMs} ms`;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...container, opacity: stale ? 0.55 : 1 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "span",
        {
          title: chip.title,
          style: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: chip.dot },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { "aria-hidden": true, style: { width: 8, height: 8, borderRadius: "50%", background: chip.dot, flexShrink: 0 } }),
            chip.detail ?? chip.label
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontFamily: MONO, fontSize: 12, color: "color-mix(in srgb, currentColor 70%, transparent)" }, children: originLabel(snapshot2.origin) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: 16, fontVariantNumeric: "tabular-nums" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
        "latency",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { style: { fontWeight: 600 }, children: latency })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
        "updated",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("b", { style: { fontWeight: 600 }, children: [
          age,
          stale ? " (stale)" : ""
        ] })
      ] })
    ] }),
    snapshot2.lastError !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { ...muted, overflowWrap: "anywhere" }, children: snapshot2.lastError }),
    snapshot2.slots === null ? snapshot2.slotsError !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: { ...muted, overflowWrap: "anywhere" }, children: [
      "slots: ",
      snapshot2.slotsError
    ] }) : snapshot2.slots.map((slot) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SlotBlock, { slot }, slot.id)),
    snapshot2.metrics !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(MetricsBlock, { metrics: snapshot2.metrics })
  ] });
}

// src/client/SlotTitle.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var STATE_COLOR = {
  idle: "#22c55e",
  unreachable: "#ef4444",
  unknown: "#8b93a7"
};
var NO_DATA_COLOR = "#8b93a7";
function SlotTitle() {
  const { snapshot: snapshot2, error: error2 } = useSlotHealth();
  const dot = error2 !== null || snapshot2 === null ? NO_DATA_COLOR : STATE_COLOR[snapshot2.state];
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
var import_jsx_runtime5 = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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

// src/client/SlotHealthIcon.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function SlotHealthGuideIcon({ size = 26, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("svg", { width: size, height: size, className, viewBox: "0 0 28 28", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "path",
    {
      d: "M3 15 h5 l3 -7 l4 14 l3 -7 h7",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}

// src/client/index.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
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
      description: () => "Live health of local llama.cpp and Ollama endpoints",
      // REVIEW §2d: without an icon the guide draws its default cube — the
      // same placeholder GPU Monitor uses, so the capsules collided. The ECG
      // pulse reads as "health".
      icon: SlotHealthGuideIcon
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
  const SlotDockSeat = () => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(SlotDockChip, { onOpen: () => ctx.sidebarRight.openTab("slot-health") });
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
