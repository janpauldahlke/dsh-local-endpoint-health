#!/usr/bin/env node
// tools/fixture-server.mjs — canned llama-server stub for dsh-slot-health.
//
// Zero dependencies (node:http). Default port 3099 (never 3080/3081/3090/8080/11434).
// Serves the same routes the real llama-server does, from a selectable scenario,
// so every state is reproducible on demand without touching the real server.
//
//   node tools/fixture-server.mjs --scenario idle|busy-prefill|busy-decode|busy-nodecode|wedged|401|v1trap|unknown|nometrics --port 3099
//
// Age-dependent scenarios (busy-nodecode, wedged) accept ?age=<seconds> per request
// (and ?start=<epochMs> as an explicit clock anchor) so 119/121/299/301 s are
// deterministic without waiting five minutes.
//
// busy-decode is self-driving: with no query params (as the 1 Hz host sampler
// polls it) its age is the wall-clock seconds since the fixture booted, so a
// realistic prefill → decode progression (~900 tok/s prefill, ~27 tok/s
// generation) unfolds in real time and the host-side TTFT latch fires at the
// moment n_decoded first goes positive. ?age=<seconds> pins a deterministic
// moment for direct curl.

import http from 'node:http';

const DEFAULT_PORT = 3099;

// ---------------------------------------------------------------------------
// Payload shapes copied from ENV.md ("/slots payload actually available") —
// byte-compatible with the live llama-server on this host.
// ---------------------------------------------------------------------------

const N_CTX = 32768;
const RETAINED_PROMPT_TOKENS = 8369; // what the real server reports while idle

const BASE_PARAMS = {
  n_predict: -1,
  temperature: 0.8,
  top_k: 40,
  top_p: 0.9,
  min_p: 0.05,
  penalty_repeat: 1.1,
  seed: 4294967295,
};

function slot({ idTask = 'task-1', isProcessing = false, processed, total, cache = 0, decoded = 0, remain = 0, hasNext = false } = {}) {
  const nPromptTokens = total ?? (isProcessing ? 12000 : RETAINED_PROMPT_TOKENS);
  const nPromptTokensProcessed = processed ?? (isProcessing ? Math.floor(nPromptTokens / 2) : nPromptTokens);
  return {
    id: 1,
    id_task: idTask,
    is_processing: isProcessing,
    n_ctx: N_CTX,
    n_prompt_tokens: nPromptTokens,
    n_prompt_tokens_processed: Math.min(nPromptTokensProcessed, nPromptTokens),
    n_prompt_tokens_cache: Math.min(cache, nPromptTokens),
    next_token: [{ n_decoded: decoded, n_remain: remain, has_next_token: hasNext }],
    speculative: true,
    params: { ...BASE_PARAMS, speculative: { types: ['draft'] } },
  };
}

const HEALTH_OK = { status: 'ok' };

// busy-decode: a realistic turn that self-drives from fixture boot, so the
// 1 Hz host sampler walks the slot through prefill → decode in real time.
const BD_PROMPT_TOTAL = 12000; // prompt tokens to prefill
const BD_PREFILL_TPS = 900; // → prefill completes at 12000/900 ≈ 13.3 s
const BD_DECODE_TPS = 27; // ~27 tokens/s generation after prefill
const BOOT_MS = Date.now(); // age reference for the self-driving scenario

// /metrics — Prometheus text format. Subset of the live dump shape (ENV.md);
// enough for P7 counters: loaded model name, slots, requests, token counts.
const METRICS_BODY = [
  '# HELP llama_loaded_model_name The loaded model name',
  '# TYPE llama_loaded_model_name gauge',
  'llama_loaded_model_name{name="qwen3.8-27b",n_gpu_layers=99} 1',
  '# HELP llama_n_slots Number of slots',
  '# TYPE llama_n_slots gauge',
  'llama_n_slots 1',
  '# HELP llama_n_requests_total Total number of requests',
  '# TYPE llama_n_requests_total counter',
  'llama_n_requests_total 3',
  '# HELP llama_n_tokens_total Total tokens processed',
  '# TYPE llama_n_tokens_total counter',
  'llama_n_tokens_total 214748',
  '# HELP llama_n_prompt_tokens_total Prompt tokens',
  '# TYPE llama_n_prompt_tokens_total counter',
  'llama_n_prompt_tokens_total 178000',
  '# HELP llama_n_decode_tokens_total Decode tokens',
  '# TYPE llama_n_decode_tokens_total counter',
  'llama_n_decode_tokens_total 36748',
  '# HELP llama_n_cache_prompt_tokens_total Cache prompt tokens',
  '# TYPE llama_n_cache_prompt_tokens_total counter',
  'llama_n_cache_prompt_tokens_total 92000',
  '# HELP llama_time_us Microseconds since server start',
  '# TYPE llama_time_us gauge',
  'llama_time_us 86400000000',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Scenarios. Each returns the route table for the scenario; age-dependent
// scenarios take (ageSeconds, wallNow) so busy age is deterministic.
// ---------------------------------------------------------------------------

function scenarioRoutes(name) {
  switch (name) {
    case 'idle':
      return {
        '/health': [200, HEALTH_OK],
        '/v1/health': [200, HEALTH_OK],
        '/slots': [200, [slot({})]],
        '/metrics': [200, METRICS_BODY],
      };
    case 'busy-prefill':
      return {
        '/health': [200, HEALTH_OK],
        '/slots': [200, [slot({ isProcessing: true, total: 12000, processed: 7420, cache: 4000, idTask: 'task-bp' })]],
        '/metrics': [200, METRICS_BODY],
      };
    case 'busy-decode':
      // Self-driving prefill → decode. No ?age → wall-clock age since boot,
      // so successive 1 Hz samples see: prefill (processed 0→12000, decoded 0)
      // for ~13.3 s, then decode (processed 12000, decoded +27/s).
      return {
        '/health': [200, HEALTH_OK],
        '/slots': (ageS, nowMs, url) => {
          const t = Math.max(0, url.searchParams.has('age') ? ageS : (nowMs - BOOT_MS) / 1000);
          const prefillDone = BD_PROMPT_TOTAL / BD_PREFILL_TPS;
          const processed = Math.min(BD_PROMPT_TOTAL, Math.floor(t * BD_PREFILL_TPS));
          const decoded = t > prefillDone ? Math.floor((t - prefillDone) * BD_DECODE_TPS) : 0;
          return [
            200,
            [
              slot({
                idTask: 'task-bd',
                isProcessing: true,
                total: BD_PROMPT_TOTAL,
                processed,
                decoded,
              }),
            ],
          ];
        },
        '/metrics': [200, METRICS_BODY],
      };
    case 'busy-nodecode':
    case 'wedged':
      return {
        '/health': [200, HEALTH_OK],
        '/slots': (ageS, nowMs) => [200, [slot({
          isProcessing: true,
          total: 9500,
          processed: 9500, // prompt complete
          cache: 8369,
          decoded: 0, // but not a single token decoded
          idTask: 'task-bn',
          busySinceOverride: nowMs - Math.round(ageS * 1000),
        })]],
        '/metrics': [200, METRICS_BODY],
      };
    case '401':
      return {
        '/health': [200, HEALTH_OK],
        '/slots': [401, { error: 'Authorization: Bearer <key> is required' }],
        '/metrics': [200, METRICS_BODY],
      };
    case 'v1trap':
      return {
        '/health': [200, HEALTH_OK],
        '/v1/health': [200, HEALTH_OK],
        '/slots': [200, [slot({})]],
        '/v1/slots': [404, { error: 'not found' }],
        '/v1/models': [200, [{ id: 'qwen3.8-27b', object: 'model' }]],
      };
    case 'unknown':
      return {
        '/health': [200, { hello: 'world' }], // 200 but not status:"ok"
        '/slots': [200, 'not json'],
        '/metrics': [200, 'metrics are a mystery'],
      };
    case 'nometrics':
      return {
        '/health': [200, HEALTH_OK],
        '/slots': [200, [slot({})]],
        '/metrics': [501, { error: 'not implemented' }],
      };
    default:
      throw new Error(`unknown scenario: ${name}`);
  }
}

function resolveEntry(entry, url, wallNow) {
  let ageS = 0;
  let nowMs = wallNow;
  if (typeof entry === 'function') {
    const ageParam = url.searchParams.get('age');
    const startParam = url.searchParams.get('start');
    if (startParam !== null && Number.isFinite(Number(startParam))) {
      nowMs = Number(startParam);
      ageS = Math.max(0, (nowMs - 0) / 1000); // unused; function uses nowMs
    } else if (ageParam !== null && Number.isFinite(Number(ageParam))) {
      ageS = Number(ageParam);
    }
    // Third arg: the request URL, so a scenario can tell "explicit ?age"
    // apart from "no params" (busy-decode's self-driving mode).
    return entry(ageS, nowMs, url);
  }
  void url;
  void nowMs;
  return entry;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function buildServer(scenario) {
  const routes = scenarioRoutes(scenario);
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const entry = routes[url.pathname];
    if (!entry) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `not found: ${url.pathname}` }));
      return;
    }
    const [status, body] = resolveEntry(entry, url, Date.now());
    const isText = typeof body === 'string';
    res.writeHead(status, { 'content-type': isText ? 'text/plain; version=0.0.4' : 'application/json' });
    res.end(isText ? body : JSON.stringify(body));
  });
}

function parseArgs(argv) {
  const args = { scenario: 'idle', port: DEFAULT_PORT };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--scenario') args.scenario = argv[(i += 1)];
    else if (a === '--port') args.port = Number(argv[(i += 1)]);
    else if (a === '--help' || a === '-h') {
      console.log('usage: node tools/fixture-server.mjs --scenario idle|busy-prefill|busy-decode|busy-nodecode|wedged|401|v1trap|unknown|nometrics [--port 3099]');
      console.log('  age-dependent scenarios accept ?age=<seconds> per request.');
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
    console.error(`bad port: ${args.port}`);
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const server = buildServer(args.scenario);

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(args.port, '127.0.0.1', resolve);
});
console.log(`fixture-server: scenario=${args.scenario} listening on http://127.0.0.1:${args.port} pid=${process.pid}`);
