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
export {
  fingerprintBackend,
  looksLikeVllmMetrics,
  parseOllamaVersion
};
//# sourceMappingURL=fingerprint.mjs.map
