// src/host/fingerprint.ts
function fingerprintBackend(input) {
  if (input.healthOk) return { backend: "llama-cpp", version: null };
  if (input.ollamaVersion !== null) return { backend: "ollama", version: input.ollamaVersion };
  if (input.vllmMetrics) return { backend: "vllm", version: null };
  return { backend: "unknown", version: null };
}
function parseOllamaVersion(body) {
  if (typeof body !== "object" || body === null) return null;
  const v = body.version;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}
function looksLikeVllmMetrics(body) {
  if (typeof body !== "string") return false;
  return body.includes("vllm:");
}

// src/host/ollama.ts
function str(v) {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function parseLoadedModel(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw;
  const name2 = str(m.name) ?? str(m.model);
  if (name2 === null) return null;
  const details = typeof m.details === "object" && m.details !== null ? m.details : null;
  return {
    name: name2,
    size: numOrNull(m.size) ?? 0,
    sizeVram: numOrNull(m.size_vram),
    expiresAt: str(m.expires_at),
    family: details !== null ? str(details.family) : null,
    parameterSize: details !== null ? str(details.parameter_size) : null,
    quantization: details !== null ? str(details.quantization_level) : null
  };
}
function parseOllamaPs(body) {
  if (typeof body !== "object" || body === null) return null;
  const models = body.models;
  if (!Array.isArray(models)) return null;
  const out = [];
  for (const raw of models) {
    const model = parseLoadedModel(raw);
    if (model !== null) out.push(model);
  }
  return out;
}
function parseOllamaTagsCount(body) {
  if (typeof body !== "object" || body === null) return null;
  const models = body.models;
  if (!Array.isArray(models)) return null;
  return models.length;
}

// src/host/collect.ts
var HEALTH_PATH = "/health";
var SLOTS_PATH = "/slots";
var API_VERSION_PATH = "/api/version";
var API_PS_PATH = "/api/ps";
var API_TAGS_PATH = "/api/tags";
var METRICS_PATH = "/metrics";
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
async function fetchOllamaSection(base, snapshot) {
  const ps = await probe(`${base}${API_PS_PATH}`, void 0);
  let loaded = null;
  let psError = null;
  if (ps.error !== void 0) {
    psError = `GET ${API_PS_PATH} failed: ${ps.error}`;
  } else if (ps.status === void 0 || ps.status < 200 || ps.status >= 300) {
    psError = `HTTP ${ps.status} from ${API_PS_PATH}`;
  } else {
    loaded = parseOllamaPs(ps.body);
    if (loaded === null) psError = `unrecognized ${API_PS_PATH} payload`;
  }
  let libraryCount = null;
  const tags = await probe(`${base}${API_TAGS_PATH}`, void 0);
  if (tags.error === void 0 && tags.status !== void 0 && tags.status >= 200 && tags.status < 300) {
    libraryCount = parseOllamaTagsCount(tags.body);
  }
  if (loaded === null) {
    snapshot.ollama = { fresh: false, error: psError, loaded: [], libraryCount };
  } else {
    snapshot.ollama = { fresh: true, error: null, loaded, libraryCount };
    snapshot.state = loaded.length > 0 ? "up-loaded" : "up-no-model";
    snapshot.lastError = null;
  }
}
function unreachableSnapshot(lastError, latencyMs) {
  return {
    ok: false,
    state: "unreachable",
    backend: "unknown",
    backendVersion: null,
    latencyMs,
    lastError,
    sampledAt: Date.now(),
    slots: null,
    slotsError: null,
    metrics: null,
    ollama: null
  };
}
async function collectHealth(origin, opts = {}) {
  const base = normalizeOrigin(origin);
  const t0 = performance.now();
  const health = await probe(`${base}${HEALTH_PATH}`, void 0);
  const latencyMs = Math.round(performance.now() - t0);
  if (health.error !== void 0) {
    return unreachableSnapshot(health.error, null);
  }
  const status = health.status;
  if (status >= 500) {
    return unreachableSnapshot(`HTTP ${status} from ${HEALTH_PATH}`, latencyMs);
  }
  let state = "unknown";
  let lastError = status >= 400 ? `HTTP ${status} from ${HEALTH_PATH}` : "unrecognized /health response";
  let healthOk = false;
  if (status >= 200 && status < 300) {
    let body = health.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
      }
    }
    if (body !== null && typeof body === "object" && body.status === "ok") {
      healthOk = true;
      state = "idle";
      lastError = null;
    }
  }
  const snapshot = {
    ok: status >= 200 && status < 400,
    state,
    backend: "unknown",
    backendVersion: null,
    latencyMs,
    lastError,
    sampledAt: Date.now(),
    slots: null,
    slotsError: null,
    metrics: null,
    ollama: null
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
  if (!healthOk) {
    let ollamaVersion = null;
    const apiVersion = await probe(`${base}${API_VERSION_PATH}`, void 0);
    if (apiVersion.status !== void 0 && apiVersion.status >= 200 && apiVersion.status < 300) {
      ollamaVersion = parseOllamaVersion(apiVersion.body);
    }
    let vllmMetrics = false;
    if (ollamaVersion === null && status >= 200 && status < 300) {
      const metrics = await probe(`${base}${METRICS_PATH}`, void 0);
      if (metrics.status !== void 0 && metrics.status >= 200 && metrics.status < 300) {
        vllmMetrics = looksLikeVllmMetrics(metrics.body);
      }
    }
    const fingerprint = fingerprintBackend({ healthOk, ollamaVersion, vllmMetrics });
    snapshot.backend = fingerprint.backend;
    snapshot.backendVersion = fingerprint.version;
    if (snapshot.backend === "ollama") {
      await fetchOllamaSection(base, snapshot);
    }
  } else {
    snapshot.backend = "llama-cpp";
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
  let name2;
  let labels;
  let restStart;
  if (brace !== -1) {
    const close = findClosingBrace(line, brace);
    if (close === -1) return null;
    name2 = line.slice(0, brace).trim();
    const parsedLabels = parseLabelBlock(line.slice(brace + 1, close));
    if (parsedLabels === null) return null;
    labels = parsedLabels;
    restStart = close + 1;
  } else {
    const sp = line.indexOf(" ");
    name2 = sp === -1 ? line : line.slice(0, sp);
    labels = {};
    restStart = sp === -1 ? line.length : sp;
  }
  if (!NAME_RE.test(name2)) return null;
  const rest = line.slice(restStart).trim().split(/\s+/);
  if (rest.length === 0 || rest[0] === "") return null;
  const value = parsePromValue(rest[0]);
  if (value === null) return null;
  return { name: name2, labels, value };
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
function advanceMetrics(state, probe2, snapshot, nowMs) {
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
  if (state.capability === "no") return null;
  if (probe2 === null) {
    if (state.capability === "yes" && state.lastSection !== null) {
      return staleSection(state, "metrics not available on this tick");
    }
    return null;
  }
  if (probe2.status === null) {
    if (state.capability === "yes") return staleSection(state, probe2.error ?? "fetch failed");
    return null;
  }
  if (probe2.status === 501 || probe2.status === 404 || probe2.status === 401) {
    if (state.capability === "yes") {
      state.downAfterYes += 1;
      if (state.downAfterYes >= 2) {
        state.capability = "no";
        resetDerived(state);
        return null;
      }
      return staleSection(state, `HTTP ${probe2.status} from /metrics`);
    }
    state.capability = "no";
    resetDerived(state);
    return null;
  }
  if (probe2.status !== 200 || probe2.text === null) {
    if (state.capability === "yes") return staleSection(state, `HTTP ${probe2.status} from /metrics`);
    return null;
  }
  const samples = parsePrometheusText(probe2.text);
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
function round3(x) {
  return Math.round(x * 1e3) / 1e3;
}
function round1(x) {
  return Math.round(x * 10) / 10;
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
  let perPosLastRequest = [];
  if (counters.draftTokens > 0) {
    draftAcceptance.lifetime = {
      value: round3(counters.accepted / counters.draftTokens),
      sample: counters.draftTokens
    };
  }
  if (counters.drafts > 0) {
    draftMeanLen.lifetime = {
      value: round1(sumPerPos(counters.perPos) / counters.drafts),
      sample: counters.drafts
    };
  }
  const span = state.lastRequest;
  if (span !== null) {
    const dDraft = span.end.draftTokens - span.start.draftTokens;
    const dAccepted = span.end.accepted - span.start.accepted;
    const dDrafts = span.end.drafts - span.start.drafts;
    if (dDraft > 0) {
      draftAcceptance.lastRequest = { value: round3(dAccepted / dDraft), sample: dDraft };
    }
    if (dDrafts > 0) {
      draftMeanLen.lastRequest = { value: round1(perPosSumDelta(span) / dDrafts), sample: dDrafts };
      const delta = perPosDelta(span.start.perPos, span.end.perPos);
      perPosLastRequest = Object.keys(delta).map(Number).sort((x, y) => x - y).map((position) => ({ position, acceptance: round1(delta[position] / dDrafts) }));
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
var METRICS_TIMEOUT_MS = 2e3;
var latest = {
  ok: false,
  state: "unknown",
  backend: "unknown",
  backendVersion: null,
  latencyMs: null,
  lastError: "sampling\u2026",
  sampledAt: Date.now(),
  slots: null,
  slotsError: null,
  metrics: null,
  ollama: null
};
var metricsState = createMetricsState();
var latches = /* @__PURE__ */ new Map();
var apiKey = void 0;
var sampling = false;
async function fetchMetrics(base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METRICS_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/metrics`, {
      signal: controller.signal,
      headers: apiKey !== void 0 ? { authorization: `Bearer ${apiKey}` } : void 0
    });
    if (res.status >= 200 && res.status < 300) {
      const text = await res.text();
      return { status: res.status, text, error: null };
    }
    return { status: res.status, text: null, error: null };
  } catch (err) {
    const name2 = err?.name;
    const cause = err?.cause;
    const reason = name2 === "TimeoutError" || name2 === "AbortError" || cause?.code === "ETIMEDOUT" ? `timed out after ${METRICS_TIMEOUT_MS} ms` : cause?.code === "ECONNREFUSED" ? "connection refused" : String(err);
    return { status: null, text: null, error: reason.length > 120 ? `${reason.slice(0, 120)}\u2026` : reason };
  } finally {
    clearTimeout(timer);
  }
}
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
    const probe2 = snap.ok && shouldFetchMetrics(metricsState) ? await fetchMetrics(normalizeOrigin(origin)) : null;
    snap.metrics = advanceMetrics(metricsState, probe2, snap, Date.now());
    latest = snap;
  } catch (err) {
    latest = {
      ok: false,
      state: "unreachable",
      backend: "unknown",
      backendVersion: null,
      latencyMs: null,
      lastError: String(err),
      sampledAt: Date.now(),
      slots: null,
      slotsError: null,
      metrics: null,
      ollama: null
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
