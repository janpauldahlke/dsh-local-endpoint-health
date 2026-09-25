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
var import_react3 = require("react");

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
var WEDGED_AFTER_MS = 3e5;
function slotTone(slot) {
  if (slot.state !== "busy") return "na";
  if (slot.busyAgeMs === null || slot.busyAgeMs < WEDGED_AFTER_MS) return "na";
  const promptDone = slot.promptProgress !== null && slot.promptProgress >= 0.999;
  return promptDone && slot.decoded === 0 ? "crit" : "na";
}
function withStale(title, stale, ageMs) {
  if (!stale) return title;
  return `${title}
stale \u2014 last updated ${ageLabel(ageMs)} ago`;
}

// src/client/card.tsx
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function readOverride(key) {
  try {
    const v = localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
    return null;
  } catch {
    return null;
  }
}
var toneColor = (t) => t === "warn" ? "color-mix(in srgb, #fbbf24 75%, currentColor)" : t === "crit" ? "color-mix(in srgb, #f87171 80%, currentColor)" : void 0;
function CollapsibleCard({
  storageKey,
  label,
  tone = "na",
  defaultExpanded = false,
  headerTitle,
  accent,
  meta,
  preview,
  dim = false,
  children
}) {
  const [override, setOverride] = (0, import_react2.useState)(() => readOverride(storageKey));
  const expanded = override ?? defaultExpanded;
  const setExpanded = (next) => {
    setOverride(next);
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
    }
  };
  const [hover, setHover] = (0, import_react2.useState)(false);
  const border = tone === "crit" ? "1px solid color-mix(in srgb, #f87171 60%, transparent)" : tone === "warn" ? "1px solid color-mix(in srgb, #fbbf24 45%, transparent)" : "1px solid color-mix(in srgb, currentColor 18%, transparent)";
  const accentColor = accent !== void 0 && tone !== "na" ? toneColor(tone) : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { border, borderRadius: 8, overflow: "hidden", opacity: dim ? 0.55 : 1 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        role: "button",
        tabIndex: 0,
        "aria-expanded": expanded,
        title: headerTitle,
        onClick: () => setExpanded(!expanded),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        },
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        style: {
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          padding: "8px 10px",
          cursor: "pointer",
          userSelect: "none",
          background: hover ? "color-mix(in srgb, currentColor 6%, transparent)" : "transparent",
          transition: "background 120ms"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              "aria-hidden": true,
              style: {
                display: "inline-block",
                fontSize: 10,
                lineHeight: 1,
                transform: expanded ? "rotate(90deg)" : "none",
                transition: "transform 150ms",
                color: "color-mix(in srgb, currentColor 50%, transparent)"
              },
              children: "\u25B8"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              style: {
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.05em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "color-mix(in srgb, currentColor 12%, transparent)",
                whiteSpace: "nowrap"
              },
              children: label
            }
          ),
          accent !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              title: accent.title,
              style: {
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
                color: accentColor ?? accent.color
              },
              children: accent.text
            }
          ),
          meta !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              title: meta.title,
              style: {
                fontSize: 11,
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
                color: "color-mix(in srgb, currentColor 55%, transparent)"
              },
              children: meta.text
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              style: {
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "baseline",
                gap: 8,
                flexWrap: "wrap",
                fontVariantNumeric: "tabular-nums",
                fontSize: 11,
                color: "color-mix(in srgb, currentColor 75%, transparent)"
              },
              children: preview.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "span",
                {
                  title: s.title,
                  style: {
                    whiteSpace: "nowrap",
                    ...toneColor(s.tone ?? "na") ? { color: toneColor(s.tone ?? "na") } : {}
                  },
                  children: s.text
                },
                i
              ))
            }
          )
        ]
      }
    ),
    expanded && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "6px 10px 8px",
          borderTop: "1px solid color-mix(in srgb, currentColor 12%, transparent)"
        },
        children
      }
    )
  ] });
}

// src/client/row.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
var muted = { color: "color-mix(in srgb, currentColor 55%, transparent)", margin: 0 };
function Meter({ ratio, tooltip }) {
  const w = ratio === null || !Number.isFinite(ratio) ? 0 : Math.max(0, Math.min(1, ratio)) * 100;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
function Row({
  label,
  value,
  caption,
  meter,
  tooltip
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      title: tooltip,
      style: {
        display: "flex",
        alignItems: meter !== void 0 ? "center" : "baseline",
        gap: 12,
        padding: "2.5px 0",
        cursor: "default"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 11.5, color: "color-mix(in srgb, currentColor 55%, transparent)", flexShrink: 0 }, children: label }),
        meter !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Meter, { ratio: meter.ratio, tooltip: meter.tooltip }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { textAlign: "right", flexShrink: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "span",
            {
              style: {
                fontSize: 12.5,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                overflowWrap: "anywhere"
              },
              children: value
            }
          ),
          caption !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "span",
            {
              style: {
                display: "block",
                fontSize: 10.5,
                color: "color-mix(in srgb, currentColor 45%, transparent)",
                fontVariantNumeric: "tabular-nums"
              },
              children: caption
            }
          )
        ] })
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
var import_jsx_runtime3 = require("react/jsx-runtime");
function MetricsCard({ metrics }) {
  const accLife = fmtFigure(toFigure(metrics.draftAcceptance.lifetime));
  const accLast = fmtFigure(toFigure(metrics.draftAcceptance.lastRequest));
  const lenLife = fmtFigure(toFigure(metrics.draftMeanLen.lifetime));
  const lenLast = fmtFigure(toFigure(metrics.draftMeanLen.lastRequest));
  const perPos = toPerPos(metrics.perPosLastRequest);
  const specRows = accLife !== null || accLast !== null || lenLife !== null || lenLast !== null || perPos.length > 0;
  if (!metricsHasRows(metrics)) return null;
  const preview = [];
  const promptRate = metrics.promptTokensPerSec;
  const decodeRate = metrics.tokensPerSec;
  preview.push({
    text: promptRate !== null || decodeRate !== null ? `${promptRate ?? "\u2014"}/${decodeRate ?? "\u2014"} tok/s` : "\u2014",
    title: `Prompt / decode tokens per second \u2014 counter delta over the sample window, from the server's own /metrics`
  });
  const accLifeFig = metrics.draftAcceptance.lifetime;
  if (accLifeFig !== null && accLife !== null) {
    preview.push({
      text: `acc ${Math.round(accLifeFig.value * 100)}%`,
      title: `Draft acceptance, lifetime (n=${accLifeFig.sample}) \u2014 accepted / draft tokens since server start`
    });
  }
  const windowLabel = metrics.rateWindowMs > 0 ? `${ageLabel(metrics.rateWindowMs)} window` : null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    CollapsibleCard,
    {
      storageKey: "dsh.slotHealth.card.metrics",
      label: "SERVER",
      defaultExpanded: false,
      dim: !metrics.fresh,
      headerTitle: "Click to expand: rates, queue depth, context high-water, speculative-decode rows (source: /metrics)",
      meta: windowLabel !== null ? { text: windowLabel, title: "Sample window the rates were derived over (ms since the last baseline)" } : void 0,
      preview,
      children: [
        metrics.promptTokensPerSec !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Row,
          {
            label: "prompt /s",
            value: `${metrics.promptTokensPerSec} tok/s`,
            tooltip: "Prompt-encoding rate: prompt-token counter delta across the shown sample window, from the server's own /metrics (llamacpp:prompt_tokens_total). Not a GPU figure."
          }
        ),
        metrics.tokensPerSec !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Row,
          {
            label: "decode /s",
            value: `${metrics.tokensPerSec} tok/s`,
            tooltip: "Decoding rate: predicted-token counter delta across the shown sample window, from the server's own /metrics (llamacpp:tokens_predicted_total)."
          }
        ),
        metrics.requestsDeferred !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Row,
          {
            label: "deferred",
            value: String(metrics.requestsDeferred),
            tooltip: "Server gauge: requests deferred (queued) right now, from /metrics (llamacpp:requests_deferred)."
          }
        ),
        metrics.requestsProcessing !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Row,
          {
            label: "active",
            value: String(metrics.requestsProcessing),
            tooltip: "Server gauge: requests being processed right now, from /metrics (llamacpp:requests_processing)."
          }
        ),
        metrics.contextHighWater !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Row,
          {
            label: "ctx peak",
            value: metrics.contextHighWater.toLocaleString("en-US"),
            tooltip: "Context high-water: largest token count any slot's context has reached since server start, from /metrics. Resets on server restart."
          }
        ),
        specRows && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          accLife !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            Row,
            {
              label: "acc \xB7 lifetime",
              value: accLife,
              tooltip: "Draft acceptance, cumulative since server start: accepted draft tokens / draft tokens, from /metrics spec_decode counters. (n=) is the draft-token denominator."
            }
          ),
          accLast !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            Row,
            {
              label: "acc \xB7 last req",
              value: accLast,
              tooltip: "Draft acceptance across the most recent completed request only (id_task boundary delta). (n=) is the draft-token denominator for that request."
            }
          ),
          lenLife !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            Row,
            {
              label: "len \xB7 lifetime",
              value: lenLife,
              tooltip: "Mean accepted draft length, cumulative since server start: accepted tokens / draft attempts. (n=) is the draft-attempt denominator."
            }
          ),
          lenLast !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            Row,
            {
              label: "len \xB7 last req",
              value: lenLast,
              tooltip: "Mean accepted draft length across the most recent completed request only. (n=) is the draft-attempt denominator for that request."
            }
          ),
          perPos.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            Row,
            {
              label: "per-pos \xB7 last",
              value: fmtPerPos(perPos),
              tooltip: "Per-position draft acceptance of the last completed request (MTP diagnostic): position \u2192 tokens accepted at that position."
            }
          )
        ] }),
        !metrics.fresh && metrics.error !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { ...muted, overflowWrap: "anywhere", marginTop: 2 }, children: metrics.error })
      ]
    }
  );
}

// src/client/SlotBody.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
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
function pctOf(ratio) {
  return ratio === null ? null : `${Math.round(ratio * 100)}%`;
}
function SlotRows({ slot }) {
  const promptPct = pctOf(slot.promptProgress);
  const ctxPct = pctOf(slot.contextPressure);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    slot.state === "busy" && slot.idTask !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: muted, children: [
      "task ",
      slot.idTask
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      Row,
      {
        label: "prompt",
        value: `${fmtInt(slot.promptTokensProcessed)} / ${fmtInt(slot.promptTokens)}${promptPct !== null ? ` (${promptPct})` : ""}`,
        meter: {
          ratio: slot.promptProgress,
          tooltip: promptPct !== null ? `Prompt ${promptPct} of ${fmtInt(slot.promptTokens)} tokens` : "Prompt progress \u2014 no prompt to progress through"
        },
        tooltip: "Prompt tokens processed vs total for this request, from /slots (prompt_tokens / prompt_tokens_total). The meter is the processed share."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      Row,
      {
        label: "decoded",
        value: fmtInt(slot.decoded),
        tooltip: "Decoded (generated) tokens so far in this request, from /slots."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      Row,
      {
        label: "busy",
        value: fmtMs(slot.busyAgeMs),
        tooltip: "How long this slot has been busy, latched host-side at the idle\u2192busy transition. Null until the host has observed the transition."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      Row,
      {
        label: "ttft",
        value: fmtMs(slot.ttftMs),
        tooltip: "Time to first token: host-latched elapsed time from the busy transition to the first decoded token. Null until the first decode is observed."
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      Row,
      {
        label: "context",
        value: `${fmtInt(slot.contextUsed)} / ${fmtInt(slot.contextSize)}${ctxPct !== null ? ` (${ctxPct})` : ""}`,
        caption: slot.contextSize > slot.contextUsed ? `${fmtInt(slot.contextSize - slot.contextUsed)} free` : void 0,
        meter: {
          ratio: slot.contextPressure,
          tooltip: ctxPct !== null ? `Context ${ctxPct} of n_ctx ${fmtInt(slot.contextSize)}` : "Context pressure \u2014 n_ctx not positive"
        },
        tooltip: "Context used vs the slot's configured n_ctx, from /slots. The caption is the free remainder."
      }
    )
  ] });
}
function slotPreview(slot, wedged) {
  const out = [];
  const ctxPct = pctOf(slot.contextPressure);
  if (ctxPct !== null) {
    out.push({
      text: `ctx ${ctxPct}`,
      title: "Context used / n_ctx, from /slots",
      ...wedged ? { tone: "crit" } : {}
    });
  }
  if (slot.state === "busy") {
    out.push({
      text: `busy ${slot.busyAgeMs !== null ? ageLabel(slot.busyAgeMs) : "\u2014"}`,
      title: wedged ? "Wedged: prompt fully processed, nothing decoded, busy 300 s+ (P3 heuristic)" : "How long this slot has been busy (host-latched)",
      ...wedged ? { tone: "crit" } : {}
    });
    out.push({
      text: `dec ${fmtInt(slot.decoded)}`,
      title: "Decoded tokens so far in this request, from /slots"
    });
    const promptPct = pctOf(slot.promptProgress);
    if (promptPct !== null) {
      out.push({
        text: `prompt ${promptPct}`,
        title: "Prompt tokens processed / total, from /slots"
      });
    }
  } else {
    out.push({
      text: `dec ${fmtInt(slot.decoded)}`,
      title: "Decoded tokens so far in this request, from /slots"
    });
    out.push({ text: "busy \u2014", title: "Not busy right now" });
  }
  return out;
}
function SlotCard({ slot }) {
  const tone = slotTone(slot);
  const busy = slot.state === "busy";
  const accent = tone === "crit" ? {
    text: "wedged",
    color: STATE_DOT.busy,
    // the card overrides with the crit tone color
    title: "Prompt fully processed, nothing decoded, busy 300 s+ (P3 wedged heuristic)"
  } : busy ? { text: "busy", color: STATE_DOT.busy, title: "is_processing \u2014 a request is in flight" } : { text: "idle", color: STATE_DOT.idle, title: "No request in flight" };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    CollapsibleCard,
    {
      storageKey: `dsh.slotHealth.card.slot.${slot.id}`,
      label: `SLOT ${slot.id}`,
      tone,
      defaultExpanded: busy,
      headerTitle: "Click to expand: prompt, decoded, busy, ttft, context rows (source: /slots)",
      accent,
      preview: slotPreview(slot, tone === "crit"),
      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SlotRows, { slot })
    }
  );
}
function SlotsErrorCard({ slotsError }) {
  const isAuth = /401|auth/i.test(slotsError);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    CollapsibleCard,
    {
      storageKey: "dsh.slotHealth.card.slots",
      label: "SLOTS",
      tone: "crit",
      defaultExpanded: true,
      headerTitle: "Click to expand: why slot data is unavailable",
      preview: [{ text: isAuth ? "auth" : "slots", title: slotsError, tone: "crit" }],
      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...muted, overflowWrap: "anywhere" }, children: slotsError })
    }
  );
}
function SlotBody() {
  const { snapshot: snapshot2, error: error2, lastAttempt: lastAttempt2 } = useSlotHealth();
  (0, import_react3.useEffect)(() => {
    setPaneOpen(true);
    return () => setPaneOpen(false);
  }, []);
  const now = lastAttempt2 ?? Date.now();
  const ageMs = snapshot2 ? now - snapshot2.sampledAt : null;
  const stale = ageMs !== null && ageMs > STALE_MS2;
  const age = ageMs === null ? null : `${Math.max(0, Math.round(ageMs / 1e3))} s ago`;
  if (error2 !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: container, children: [
      snapshot2 !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontFamily: MONO, fontSize: 12 }, children: originLabel(snapshot2.origin) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { style: muted, children: [
        "no data \u2014 ",
        error2
      ] })
    ] });
  }
  if (snapshot2 === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: container, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: muted, children: "waiting for first sample\u2026" }) });
  }
  const chip = deriveChip({ snapshot: snapshot2, error: error2, lastAttempt: lastAttempt2 }, now);
  const latency = snapshot2.latencyMs === null ? "\u2014" : snapshot2.latencyMs < 1 ? "<1 ms" : `${snapshot2.latencyMs} ms`;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { ...container, opacity: stale ? 0.55 : 1 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "span",
        {
          title: chip.title,
          style: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: chip.dot },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { "aria-hidden": true, style: { width: 8, height: 8, borderRadius: "50%", background: chip.dot, flexShrink: 0 } }),
            chip.detail ?? chip.label
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontFamily: MONO, fontSize: 12, color: "color-mix(in srgb, currentColor 70%, transparent)" }, children: originLabel(snapshot2.origin) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: 16, fontVariantNumeric: "tabular-nums" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
        "latency",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { style: { fontWeight: 600 }, children: latency })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
        "updated",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("b", { style: { fontWeight: 600 }, children: [
          age,
          stale ? " (stale)" : ""
        ] })
      ] })
    ] }),
    snapshot2.lastError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...muted, overflowWrap: "anywhere" }, children: snapshot2.lastError }),
    snapshot2.slots === null ? snapshot2.slotsError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SlotsErrorCard, { slotsError: snapshot2.slotsError }) : snapshot2.slots.map((slot) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SlotCard, { slot }, slot.id)),
    snapshot2.metrics !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MetricsCard, { metrics: snapshot2.metrics })
  ] });
}

// src/client/SlotTitle.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var STATE_COLOR = {
  idle: "#22c55e",
  unreachable: "#ef4444",
  unknown: "#8b93a7"
};
var NO_DATA_COLOR = "#8b93a7";
function SlotTitle() {
  const { snapshot: snapshot2, error: error2 } = useSlotHealth();
  const dot = error2 !== null || snapshot2 === null ? NO_DATA_COLOR : STATE_COLOR[snapshot2.state];
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
var import_react4 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function SlotDockChip({ onOpen }) {
  const live = useSlotHealth();
  const [paneOpen, setPaneOpenState] = (0, import_react4.useState)(isPaneOpen);
  const [now, setNow] = (0, import_react4.useState)(() => Date.now());
  (0, import_react4.useEffect)(() => subscribePaneOpen(() => setPaneOpenState(isPaneOpen())), []);
  (0, import_react4.useEffect)(() => {
    const id = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(id);
  }, []);
  if (paneOpen) return null;
  const display = deriveChip(live, now);
  const stale = display.stale;
  const hasData = display.state !== "waiting" && display.state !== "error";
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "button",
    {
      type: "button",
      onClick: onOpen,
      title: display.title,
      "aria-label": `Slot health: ${display.label}`,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
        padding: "1px 8px",
        borderRadius: 999,
        border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
        background: "color-mix(in srgb, currentColor 6%, transparent)",
        color: "inherit",
        fontVariantNumeric: "tabular-nums",
        cursor: "pointer",
        opacity: stale ? 0.55 : 1,
        transition: "opacity 200ms"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "span",
          {
            "aria-hidden": true,
            style: {
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: display.dot,
              display: "inline-block",
              boxShadow: hasData && !stale ? `0 0 5px ${display.dot}` : "none",
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
var import_jsx_runtime7 = require("react/jsx-runtime");
function SlotHealthGuideIcon({ size = 26, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { width: size, height: size, className, viewBox: "0 0 28 28", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
var import_jsx_runtime8 = require("react/jsx-runtime");
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
  const SlotDockSeat = () => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(SlotDockChip, { onOpen: () => ctx.sidebarRight.openTab("slot-health") });
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
