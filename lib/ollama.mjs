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
  const name = str(m.name) ?? str(m.model);
  if (name === null) return null;
  const details = typeof m.details === "object" && m.details !== null ? m.details : null;
  return {
    name,
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
export {
  parseOllamaPs,
  parseOllamaTagsCount
};
//# sourceMappingURL=ollama.mjs.map
