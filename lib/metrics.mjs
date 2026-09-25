// src/host/promParse.ts
var NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
var LABEL_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function parsePrometheusText(text) {
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const sample = parseSampleLine(line);
    if (sample !== null) out.push(sample);
  }
  return out;
}
function parseSampleLine(line) {
  const brace = line.indexOf("{");
  let name;
  let labels;
  let restStart;
  if (brace !== -1) {
    const close = findClosingBrace(line, brace);
    if (close === -1) return null;
    name = line.slice(0, brace).trim();
    const parsedLabels = parseLabelBlock(line.slice(brace + 1, close));
    if (parsedLabels === null) return null;
    labels = parsedLabels;
    restStart = close + 1;
  } else {
    const sp = line.indexOf(" ");
    name = sp === -1 ? line : line.slice(0, sp);
    labels = {};
    restStart = sp === -1 ? line.length : sp;
  }
  if (!NAME_RE.test(name)) return null;
  const rest = line.slice(restStart).trim().split(/\s+/);
  if (rest.length === 0 || rest[0] === "") return null;
  const value = parsePromValue(rest[0]);
  if (value === null) return null;
  return { name, labels, value };
}
function findClosingBrace(line, open) {
  let inString = false;
  for (let i = open + 1; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "}") {
      return i;
    }
  }
  return -1;
}
function parseLabelBlock(inner) {
  const labels = {};
  let i = 0;
  const n = inner.length;
  let first = true;
  while (true) {
    while (i < n && (inner[i] === " " || inner[i] === "	")) i++;
    if (i >= n) break;
    if (!first) {
      if (inner[i] !== ",") return null;
      i++;
      while (i < n && (inner[i] === " " || inner[i] === "	")) i++;
      if (i >= n) return null;
    }
    first = false;
    const keyStart = i;
    while (i < n && /[A-Za-z0-9_]/.test(inner[i])) i++;
    const key = inner.slice(keyStart, i);
    if (!LABEL_KEY_RE.test(key)) return null;
    while (i < n && (inner[i] === " " || inner[i] === "	")) i++;
    if (inner[i] !== "=") return null;
    i++;
    while (i < n && (inner[i] === " " || inner[i] === "	")) i++;
    if (inner[i] !== '"') return null;
    i++;
    let value = "";
    let closed = false;
    while (i < n) {
      const c = inner[i];
      if (c === "\\") {
        const next = inner[i + 1];
        if (next === void 0) return null;
        value += next === "n" ? "\n" : next === "t" ? "	" : next;
        i += 2;
      } else if (c === '"') {
        closed = true;
        i++;
        break;
      } else {
        value += c;
        i++;
      }
    }
    if (!closed) return null;
    labels[key] = value;
  }
  return labels;
}
function parsePromValue(token) {
  if (token === "NaN") return NaN;
  if (token === "+Inf" || token === "Inf") return Infinity;
  if (token === "-Inf") return -Infinity;
  const v = Number(token);
  return Number.isFinite(v) ? v : null;
}

// src/host/metrics.ts
var RESTART_DOWN_TICKS = 3;
var MIN_RATE_WINDOW_MS = 1e3;
function createMetricsState() {
  return {
    capability: "unknown",
    downAfterYes: 0,
    endpointDownTicks: 0,
    baselineAtMs: null,
    baseline: null,
    lastRequest: null,
    activeTask: null,
    lastSection: null
  };
}
function shouldFetchMetrics(state) {
  return state.capability !== "no";
}
function advanceMetrics(state, probe, snapshot, nowMs) {
  if (snapshot.state === "unreachable") {
    state.endpointDownTicks += 1;
    return null;
  }
  if (state.endpointDownTicks >= RESTART_DOWN_TICKS) {
    state.capability = "unknown";
    state.downAfterYes = 0;
    resetDerived(state);
  }
  state.endpointDownTicks = 0;
  if (probe === null) return null;
  if (probe.status === null) {
    if (state.capability === "yes") return staleSection(state, probe.error ?? "fetch failed");
    return null;
  }
  if (probe.status === 501 || probe.status === 404 || probe.status === 401) {
    if (state.capability === "yes") {
      state.downAfterYes += 1;
      if (state.downAfterYes >= 2) {
        state.capability = "no";
        resetDerived(state);
        return null;
      }
      return staleSection(state, `HTTP ${probe.status} from /metrics`);
    }
    state.capability = "no";
    resetDerived(state);
    return null;
  }
  if (probe.status !== 200 || probe.text === null) {
    if (state.capability === "yes") return staleSection(state, `HTTP ${probe.status} from /metrics`);
    return null;
  }
  const samples = parsePrometheusText(probe.text);
  state.capability = "yes";
  state.downAfterYes = 0;
  if (samples.length === 0) {
    if (state.capability === "yes" && state.lastSection !== null) {
      return staleSection(state, "/metrics returned no parseable samples");
    }
    return null;
  }
  const counters = extractCounters(samples);
  const gauges = extractGauges(samples);
  const processing = gauges.processing ?? 0;
  if (state.baseline !== null && countersDecreased(state.baseline, counters)) {
    resetDerived(state);
  }
  const busySlots = snapshot.slots !== null ? busySlotTasks(snapshot.slots) : null;
  const busyNow = busySlots !== null ? Object.keys(busySlots).length > 0 : processing > 0;
  const active = state.activeTask;
  if (active !== null && requestEnded(active, snapshot, busySlots, processing)) {
    state.lastRequest = { startMs: active.atMs, endMs: nowMs, start: active.counters, end: counters };
    state.activeTask = null;
  }
  if (state.activeTask === null && busyNow) {
    state.activeTask = { atMs: nowMs, counters, tasks: busySlots ?? {} };
  }
  if (state.baselineAtMs === null || state.baseline === null) {
    state.baselineAtMs = nowMs;
    state.baseline = counters;
  }
  const section = buildSection(state, counters, gauges, nowMs);
  state.lastSection = section;
  return section;
}
function resetDerived(state) {
  state.baselineAtMs = null;
  state.baseline = null;
  state.lastRequest = null;
  state.activeTask = null;
  state.lastSection = null;
}
function staleSection(state, error) {
  if (state.lastSection === null) return null;
  const section = { ...state.lastSection, fresh: false, error };
  state.lastSection = section;
  return section;
}
function busySlotTasks(slots) {
  const tasks = {};
  for (const slot of slots) {
    if (slot.state === "busy" && slot.idTask !== null) tasks[slot.id] = slot.idTask;
  }
  return tasks;
}
function requestEnded(active, snapshot, busySlots, processing) {
  if (busySlots !== null) {
    const keys = Object.keys(active.tasks);
    if (keys.length === 0) {
      return Object.keys(busySlots).length === 0;
    }
    return keys.some((k) => {
      const slot = snapshot.slots?.find((s) => s.id === Number(k));
      return slot === void 0 || slot.state !== "busy" || slot.idTask !== active.tasks[Number(k)];
    });
  }
  return processing === 0;
}
function extractCounters(samples) {
  const c = { prompt: 0, predict: 0, draftTokens: 0, accepted: 0, drafts: 0, perPos: {} };
  for (const s of samples) {
    if (!Number.isFinite(s.value)) continue;
    switch (s.name) {
      case "llamacpp:prompt_tokens_total":
        c.prompt = s.value;
        break;
      case "llamacpp:tokens_predicted_total":
        c.predict = s.value;
        break;
      case "llamacpp:spec_decode_num_draft_tokens_total":
        c.draftTokens = s.value;
        break;
      case "llamacpp:spec_decode_num_accepted_tokens_total":
        c.accepted = s.value;
        break;
      case "llamacpp:spec_decode_num_drafts_total":
        c.drafts = s.value;
        break;
      case "llamacpp:spec_decode_num_accepted_tokens_per_pos_total": {
        const pos = Number(s.labels.position);
        if (Number.isInteger(pos) && pos >= 0) c.perPos[pos] = s.value;
        break;
      }
      default:
        break;
    }
  }
  return c;
}
function extractGauges(samples) {
  const g = { processing: null, deferred: null, nTokensMax: null };
  for (const s of samples) {
    if (!Number.isFinite(s.value)) continue;
    switch (s.name) {
      case "llamacpp:requests_processing":
        g.processing = s.value;
        break;
      case "llamacpp:requests_deferred":
        g.deferred = s.value;
        break;
      case "llamacpp:n_tokens_max":
        g.nTokensMax = s.value;
        break;
      default:
        break;
    }
  }
  return g;
}
function countersDecreased(a, b) {
  if (a.prompt > b.prompt || a.predict > b.predict || a.draftTokens > b.draftTokens) return true;
  if (a.accepted > b.accepted || a.drafts > b.drafts) return true;
  for (const pos of Object.keys(a.perPos)) {
    if (a.perPos[Number(pos)] > (b.perPos[Number(pos)] ?? 0)) return true;
  }
  return false;
}
function sumPerPos(perPos) {
  let sum = 0;
  for (const key of Object.keys(perPos)) sum += perPos[Number(key)];
  return sum;
}
function perPosDelta(a, b) {
  const out = {};
  const positions = /* @__PURE__ */ new Set([...Object.keys(a).map(Number), ...Object.keys(b).map(Number)]);
  for (const pos of positions) out[pos] = (b[pos] ?? 0) - (a[pos] ?? 0);
  return out;
}
function buildSection(state, counters, gauges, nowMs) {
  const baseline = state.baseline;
  const windowMs = nowMs - state.baselineAtMs;
  const dtSec = windowMs / 1e3;
  let promptTokensPerSec = null;
  let tokensPerSec = null;
  if (windowMs >= MIN_RATE_WINDOW_MS) {
    const dPrompt = counters.prompt - baseline.prompt;
    const dPredict = counters.predict - baseline.predict;
    if (dPrompt > 0) promptTokensPerSec = Math.round(dPrompt / dtSec * 10) / 10;
    if (dPredict > 0) tokensPerSec = Math.round(dPredict / dtSec * 10) / 10;
  }
  let draftAcceptance = { lifetime: null, lastRequest: null };
  let draftMeanLen = { lifetime: null, lastRequest: null };
  let perPosLastRequest = null;
  if (counters.draftTokens > 0) {
    draftAcceptance.lifetime = counters.accepted / counters.draftTokens;
  }
  if (counters.drafts > 0) {
    draftMeanLen.lifetime = sumPerPos(counters.perPos) / counters.drafts;
  }
  const span = state.lastRequest;
  if (span !== null) {
    const dDraft = span.end.draftTokens - span.start.draftTokens;
    const dAccepted = span.end.accepted - span.start.accepted;
    const dDrafts = span.end.drafts - span.start.drafts;
    if (dDraft > 0) draftAcceptance.lastRequest = dAccepted / dDraft;
    if (dDrafts > 0) {
      draftMeanLen.lastRequest = perPosSumDelta(span) / dDrafts;
      const delta = perPosDelta(span.start.perPos, span.end.perPos);
      perPosLastRequest = Object.keys(delta).map(Number).sort((x, y) => x - y).map((position) => ({ position, acceptance: delta[position] / dDrafts }));
    }
  }
  return {
    fresh: true,
    error: null,
    promptTokensPerSec,
    tokensPerSec,
    rateWindowMs: windowMs,
    requestsDeferred: gauges.deferred,
    requestsProcessing: gauges.processing,
    contextHighWater: gauges.nTokensMax,
    draftAcceptance,
    draftMeanLen,
    perPosLastRequest
  };
}
function perPosSumDelta(span) {
  let sum = 0;
  const positions = /* @__PURE__ */ new Set([
    ...Object.keys(span.end.perPos).map(Number),
    ...Object.keys(span.start.perPos).map(Number)
  ]);
  for (const pos of positions) sum += (span.end.perPos[pos] ?? 0) - (span.start.perPos[pos] ?? 0);
  return sum;
}
export {
  advanceMetrics,
  createMetricsState,
  shouldFetchMetrics
};
//# sourceMappingURL=metrics.mjs.map
