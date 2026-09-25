// src/client/slotState.ts
var STALE_MS = 3e3;
var STATE_DOT = {
  waiting: "#8b93a7",
  unreachable: "#ef4444",
  error: "#ef4444",
  unknown: "#f59e0b",
  // P8 Ollama up-states: both healthy (green); the label carries the
  // distinction (no model / loaded), the dot says "server is fine".
  "no-model": "#22c55e",
  loaded: "#22c55e",
  busy: "#3b82f6",
  idle: "#22c55e"
};
function backendWord(backend) {
  switch (backend) {
    case "llama-cpp":
      return "llama";
    case "ollama":
      return "ollama";
    case "vllm":
      return "vllm";
    default:
      return null;
  }
}
function backendLabel(snapshot) {
  if (snapshot === null) return null;
  switch (snapshot.backend) {
    case "llama-cpp":
      return "llama.cpp";
    case "ollama":
      return snapshot.backendVersion !== null && snapshot.backendVersion !== "" ? `ollama ${snapshot.backendVersion}` : "ollama";
    case "vllm":
      return "vllm";
    default:
      return null;
  }
}
function ageLabel(ms) {
  if (ms < 1e3) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 6e4) return `${Math.round(ms / 1e3)}s`;
  const m = Math.floor(ms / 6e4);
  const s = Math.round(ms % 6e4 / 1e3);
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}
function deriveChip(live, now) {
  const { snapshot, error } = live;
  if (error !== null) {
    return {
      state: "error",
      dot: STATE_DOT.error,
      label: "error",
      detail: null,
      stale: false,
      title: `slot-health \u2014 ${error}`
    };
  }
  if (snapshot === null) {
    return {
      state: "waiting",
      dot: STATE_DOT.waiting,
      label: "waiting",
      detail: null,
      stale: false,
      title: "slot-health \u2014 waiting for first sample"
    };
  }
  const age = now - snapshot.sampledAt;
  const stale = age > STALE_MS;
  const engine = backendWord(snapshot.backend);
  const label = (base) => engine === null ? base : `${engine} \xB7 ${base}`;
  if (snapshot.state === "unreachable") {
    const detail = snapshot.lastError ? ` \u2014 ${snapshot.lastError}` : "";
    return {
      state: "unreachable",
      dot: STATE_DOT.unreachable,
      label: label("down"),
      detail: null,
      stale,
      title: withStale(`slot-health \u2014 endpoint unreachable${detail}`, stale, age)
    };
  }
  if (snapshot.state === "unknown") {
    const detail = snapshot.lastError ? ` \u2014 ${snapshot.lastError}` : "";
    return {
      state: "unknown",
      dot: STATE_DOT.unknown,
      label: label("unknown"),
      detail: null,
      stale,
      title: withStale(`slot-health \u2014 endpoint shape not recognized${detail}`, stale, age)
    };
  }
  if (snapshot.state === "up-no-model") {
    return {
      state: "no-model",
      dot: STATE_DOT["no-model"],
      label: label("no model"),
      detail: null,
      stale,
      title: withStale("slot-health \u2014 Ollama is up, no model loaded", stale, age)
    };
  }
  if (snapshot.state === "up-loaded") {
    const loaded = snapshot.ollama?.loaded ?? [];
    const first = loaded.length > 0 ? loaded[0].name : null;
    return {
      state: "loaded",
      dot: STATE_DOT.loaded,
      label: label("loaded"),
      detail: first !== null ? `loaded \xB7 ${first}` : "loaded",
      stale,
      title: withStale(
        `slot-health \u2014 Ollama: ${loaded.length} model${loaded.length === 1 ? "" : "s"} resident` + (first !== null ? ` (${first})` : ""),
        stale,
        age
      )
    };
  }
  if (snapshot.slots === null && snapshot.slotsError !== null) {
    const isAuth = /401|auth/i.test(snapshot.slotsError);
    return {
      state: "error",
      dot: STATE_DOT.error,
      label: label(isAuth ? "auth" : "slots"),
      detail: null,
      stale,
      title: withStale(`slot-health \u2014 slots: ${snapshot.slotsError}`, stale, age)
    };
  }
  const slots = snapshot.slots ?? [];
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
      label: label("busy"),
      detail: `busy ${ageLabel(maxAgeMs)}${totalDecoded > 0 ? ` \xB7 dec ${totalDecoded}` : ""}`,
      stale,
      title: withStale(`slot-health \u2014 busy for ${ageLabel(maxAgeMs)}${decodedDetail}`, stale, age)
    };
  }
  return {
    state: "idle",
    dot: STATE_DOT.idle,
    label: label("idle"),
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
export {
  STALE_MS,
  STATE_DOT,
  WEDGED_AFTER_MS,
  ageLabel,
  backendLabel,
  backendWord,
  deriveChip,
  slotTone
};
//# sourceMappingURL=slotState.mjs.map
