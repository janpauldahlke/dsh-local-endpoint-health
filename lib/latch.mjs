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
  const latches = new Map(previous);
  if (slots === null) {
    return { slots: null, latches };
  }
  const seen = /* @__PURE__ */ new Set();
  const stamped = slots.map((slot) => {
    seen.add(slot.id);
    const next = advanceSlotLatch(previous.get(slot.id) ?? freshSlotLatch(), slot, nowMs);
    latches.set(slot.id, next);
    const busySinceMs = next.busy ? next.busySinceMs : null;
    return {
      ...slot,
      busySinceMs,
      busyAgeMs: busySinceMs !== null ? Math.max(0, nowMs - busySinceMs) : null,
      ttftMs: next.busy && next.firstDecodedAtMs !== null && next.busySinceMs !== null ? Math.max(0, next.firstDecodedAtMs - next.busySinceMs) : null
    };
  });
  for (const id of [...latches.keys()]) {
    if (!seen.has(id)) latches.delete(id);
  }
  return { slots: stamped, latches };
}
export {
  freshSlotLatch,
  stampSlotLatches
};
//# sourceMappingURL=latch.mjs.map
