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
export {
  fmtFigure,
  fmtPerPos,
  metricsHasRows,
  toFigure,
  toPerPos
};
//# sourceMappingURL=metricsFmt.mjs.map
