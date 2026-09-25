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
  const { snapshot, error } = live;
  if (error !== null) {
    return {
      state: "error",
      dot: STATE_DOT.error,
      label: "error",
      stale: false,
      title: `slot-health \u2014 ${error}`
    };
  }
  if (snapshot === null) {
    return {
      state: "waiting",
      dot: STATE_DOT.waiting,
      label: "waiting",
      stale: false,
      title: "slot-health \u2014 waiting for first sample"
    };
  }
  const age = now - snapshot.sampledAt;
  const stale = age > STALE_MS;
  if (snapshot.state === "unreachable") {
    const detail = snapshot.lastError ? ` \u2014 ${snapshot.lastError}` : "";
    return {
      state: "unreachable",
      dot: STATE_DOT.unreachable,
      label: "down",
      stale,
      title: withStale(`slot-health \u2014 endpoint unreachable${detail}`, stale, age)
    };
  }
  if (snapshot.state === "unknown") {
    const detail = snapshot.lastError ? ` \u2014 ${snapshot.lastError}` : "";
    return {
      state: "unknown",
      dot: STATE_DOT.unknown,
      label: "unknown",
      stale,
      title: withStale(`slot-health \u2014 endpoint shape not recognized${detail}`, stale, age)
    };
  }
  if (snapshot.slots === null && snapshot.slotsError !== null) {
    const isAuth = /401|auth/i.test(snapshot.slotsError);
    return {
      state: "error",
      dot: STATE_DOT.error,
      label: isAuth ? "auth" : "slots",
      stale,
      title: withStale(`slot-health \u2014 slots: ${snapshot.slotsError}`, stale, age)
    };
  }
  const slots = snapshot.slots ?? [];
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
export {
  STALE_MS,
  ageLabel,
  deriveChip
};
//# sourceMappingURL=slotState.mjs.map
