import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProgram } from "../cli/program.js";
import { runCommand } from "../utils/process.js";

interface JsonObject {
  [key: string]: unknown;
}

const MAX_BODY_BYTES = 512 * 1024;
const APP_VERSION = "0.1.1";
const SERVICE_NAME = "oh-my-gemini-api";
const OPS_CONTRACT = { schema: "ops-envelope-v1", version: 1 } as const;
const READINESS_CONTRACT = "ogx-runtime-brief-v1";
const REVIEW_PACK_CONTRACT = "ogx-review-pack-v1";
const DOCTOR_REPORT_SCHEMA = "ogx-doctor-report-v1";
const OGX_TWO_MINUTE_REVIEW = [
  "Open /health and /meta to confirm runtime mode, command posture, and route discovery.",
  "Open /v1/runtime-brief and /v1/review-pack before wiring automation or Cloud Run handoff.",
  'Run POST /v1/doctor with {"scope":"project"} and inspect stdout/stderr before launch.',
  "Treat doctor evidence as a freshness check and rerun it after environment drift or notification changes.",
] as const;
const OGX_PROOF_ASSETS = [
  {
    label: "Health Envelope",
    path: "/health",
    why: "Shows runtime mode, body limit, next action, and report contract.",
  },
  {
    label: "Runtime Brief",
    path: "/v1/runtime-brief",
    why: "Summarizes launch readiness, review flow, and watchouts before orchestration.",
  },
  {
    label: "Review Pack",
    path: "/v1/review-pack",
    why: "Packages approval gate, trust boundary, and reviewer sequence in one payload.",
  },
  {
    label: "Doctor Schema",
    path: "/v1/schema/doctor-report",
    why: "Pins the doctor report contract for launch and team automation.",
  },
  {
    label: "Doctor Run",
    path: "/v1/doctor",
    why: "Generates request-level dependency evidence before launch or team handoff.",
  },
] as const;
const API_ROUTES = [
  "/health",
  "/meta",
  "/v1/runtime-brief",
  "/v1/review-pack",
  "/v1/schema/doctor-report",
  "/v1/doctor",
  "/v1/version",
] as const;

function readPort(): number {
  const parsed = Number.parseInt(process.env.PORT ?? "8080", 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    return 8080;
  }
  return parsed;
}

function sendJson(response: ServerResponse, statusCode: number, body: JsonObject): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
}

function readRuntimeMode(): string {
  return process.env.K_SERVICE ? "cloud-run" : "local";
}

function buildLinks(): JsonObject {
  return {
    home: "/",
    health: "/health",
    meta: "/meta",
    api: "/api",
    runtime_brief: "/v1/runtime-brief",
    review_pack: "/v1/review-pack",
    doctor_schema: "/v1/schema/doctor-report",
    version: "/v1/version",
    doctor: "/v1/doctor",
  };
}

function createDoctorReportSchema(): JsonObject {
  return {
    schema: DOCTOR_REPORT_SCHEMA,
    required_sections: ["scope_used", "ok", "stdout", "stderr", "duration_ms"],
    operator_rules: [
      "Run doctor before trusting a fresh project or user environment.",
      "Treat missing tmux, Gemini CLI, or notification channels as launch blockers when team mode is required.",
      "Keep doctor evidence attached to the same runtime envelope that serves launch and team commands.",
    ],
  };
}

export function normalizeScope(scope: unknown): "project" | "user" {
  return typeof scope === "string" && scope.trim() === "user" ? "user" : "project";
}

export function createHealthPayload(port: number): JsonObject {
  return {
    ok: true,
    status: "ok",
    service: SERVICE_NAME,
    version: APP_VERSION,
    readiness_contract: READINESS_CONTRACT,
    report_contract: createDoctorReportSchema(),
    diagnostics: {
      runtime_mode: readRuntimeMode(),
      port,
      body_limit_bytes: MAX_BODY_BYTES,
      next_action: 'Open /v1/review-pack and run POST /v1/doctor with {"scope":"project"} before trusting a fresh environment.',
    },
    links: buildLinks(),
    ops_contract: OPS_CONTRACT,
  };
}

export function createMetaPayload(port: number): JsonObject {
  return {
    service: SERVICE_NAME,
    status: "ok",
    version: APP_VERSION,
    readiness_contract: READINESS_CONTRACT,
    report_contract: createDoctorReportSchema(),
    runtime: {
      mode: readRuntimeMode(),
      port,
      node: process.version,
    },
    capabilities: {
      home_page: true,
      doctor: true,
      version: true,
      api_index: true,
      review_pack: true,
    },
    diagnostics: {
      route_count: API_ROUTES.length + 1,
      body_limit_bytes: MAX_BODY_BYTES,
      next_action:
        "Use /v1/runtime-brief for operator posture and /v1/doctor for dependency validation.",
    },
    links: buildLinks(),
    ops_contract: OPS_CONTRACT,
  };
}

export function createApiIndexPayload(): JsonObject {
  return {
    message: "oh-my-gemini Cloud Run API",
    service: SERVICE_NAME,
    status: "ok",
    readiness_contract: READINESS_CONTRACT,
    report_contract: createDoctorReportSchema(),
    routes: [...API_ROUTES],
    links: buildLinks(),
    ops_contract: OPS_CONTRACT,
  };
}

export function createRuntimeBriefPayload(port: number): JsonObject {
  return {
    service: SERVICE_NAME,
    status: "ok",
    generated_at: new Date().toISOString(),
    readiness_contract: READINESS_CONTRACT,
    headline:
      "Operator-grade Gemini orchestration CLI wrapper with explicit doctor, launch, and team readiness surfaces.",
    report_contract: createDoctorReportSchema(),
    runtime: {
      mode: readRuntimeMode(),
      port,
      node: process.version,
      gemini_command: process.env.OGX_GEMINI_CMD || "gemini",
    },
    review_flow: [
      "Run doctor before launch or team orchestration on a fresh machine.",
      "Use health/meta/runtime-brief to confirm service posture before wiring external automation.",
      "Treat team and launch state as separate operator steps even after doctor passes.",
    ],
    two_minute_review: [...OGX_TWO_MINUTE_REVIEW],
    watchouts: [
      "A green API wrapper does not guarantee tmux or Gemini CLI availability inside the target environment.",
      "Notification channels may be optional for local launch but required for multi-agent operational handoff.",
    ],
    proof_assets: [...OGX_PROOF_ASSETS],
    route_count: API_ROUTES.length,
    links: buildLinks(),
  };
}

export function createReviewPackPayload(port: number): JsonObject {
  return {
    service: SERVICE_NAME,
    status: "ok",
    generated_at: new Date().toISOString(),
    readiness_contract: REVIEW_PACK_CONTRACT,
    headline:
      "Executive review pack for ogx: doctor validation, runtime posture, and launch handoff surfaces in one API contract.",
    proof_bundle: {
      runtime_mode: readRuntimeMode(),
      port,
      gemini_command: process.env.OGX_GEMINI_CMD || "gemini",
      review_routes: ["/health", "/meta", "/v1/runtime-brief", "/v1/review-pack", "/v1/schema/doctor-report"],
      doctor_scope_defaults: ["project", "user"],
    },
    approval_gate: {
      doctor_required_before_launch: true,
      health_required_before_automation: true,
      team_handoff_requires_notification_checks: true,
    },
    trust_boundary: [
      "This API is a wrapper around local CLI/runtime checks and does not replace Gemini CLI or tmux availability in the target environment.",
      "Doctor output is evidence for operator review, not a guarantee that downstream launch goals have already succeeded.",
      "Notification and team orchestration surfaces may be optional locally but become operational gates for shared handoff.",
    ],
    review_sequence: [
      "Open /health, /meta, and /v1/runtime-brief to confirm runtime mode and command posture.",
      "Read /v1/review-pack before wiring the service into external automation or Cloud Run handoff.",
      "Run POST /v1/doctor with the right scope and inspect stdout/stderr before launch or team commands.",
    ],
    two_minute_review: [...OGX_TWO_MINUTE_REVIEW],
    watchouts: [
      "A green HTTP wrapper does not prove the target shell has the correct Gemini authentication state.",
      "Cloud Run availability does not eliminate local environment drift when the operator later runs CLI commands elsewhere.",
      "Doctor evidence can go stale quickly if shell tools or notification channels change after validation.",
    ],
    proof_assets: [...OGX_PROOF_ASSETS],
    links: buildLinks(),
  };
}

export function createDoctorReportSchemaPayload(): JsonObject {
  return {
    service: SERVICE_NAME,
    status: "ok",
    generated_at: new Date().toISOString(),
    ...createDoctorReportSchema(),
  };
}

function renderHomePage(): string {
  const twoMinuteList = OGX_TWO_MINUTE_REVIEW.map((item) => `<li>${item}</li>`).join("");
  const proofAssetList = OGX_PROOF_ASSETS.map(
    (item) => `<li><strong>${item.label}</strong> <code>${item.path}</code><br />${item.why}</li>`,
  ).join("");
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ogx API</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif;
        background: linear-gradient(135deg, #f5f7ff 0%, #edf9ff 100%);
        color: #0d1b2a;
      }
      .wrap {
        max-width: 980px;
        margin: 40px auto;
        padding: 24px;
      }
      .card {
        background: #fff;
        border: 1px solid #dce8ff;
        border-radius: 14px;
        box-shadow: 0 16px 28px rgba(17, 40, 89, 0.08);
        padding: 24px;
      }
      h1 { margin: 0 0 6px; font-size: 30px; }
      .muted { color: #476082; margin: 0 0 18px; }
      .badge {
        display: inline-block;
        background: #e7f3ff;
        color: #0b4da2;
        border: 1px solid #c6ddff;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 10px;
        margin-bottom: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin: 18px 0;
      }
      .box {
        border: 1px solid #e1e9f7;
        border-radius: 10px;
        padding: 12px;
        background: #f9fcff;
      }
      code {
        background: #f3f7ff;
        border: 1px solid #dce6fa;
        border-radius: 8px;
        padding: 2px 6px;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
      }
      .row { margin-top: 14px; }
      ul {
        margin: 8px 0 0;
        padding-left: 18px;
      }
      li + li { margin-top: 6px; }
      button {
        background: #1155cc;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px 14px;
        cursor: pointer;
        font-weight: 600;
      }
      button:hover { background: #0d47ae; }
      #output {
        margin-top: 12px;
        border: 1px solid #dce6fa;
        border-radius: 10px;
        padding: 12px;
        background: #f6f9ff;
        min-height: 56px;
      }
      a { color: #0d47ae; text-decoration: none; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card">
        <span class="badge">Cloud Run Live</span>
        <h1>ogx Operator API</h1>
        <p class="muted">This URL is running. Runtime brief, doctor contract, and launch readiness routes are available.</p>
        <div class="grid">
          <div class="box"><strong>Health</strong><br /><code>/health</code></div>
          <div class="box"><strong>Meta</strong><br /><code>/meta</code></div>
          <div class="box"><strong>Runtime Brief</strong><br /><code>/v1/runtime-brief</code></div>
          <div class="box"><strong>Review Pack</strong><br /><code>/v1/review-pack</code></div>
          <div class="box"><strong>Doctor Schema</strong><br /><code>/v1/schema/doctor-report</code></div>
          <div class="box"><strong>Version</strong><br /><code>/v1/version</code></div>
          <div class="box"><strong>Doctor (POST)</strong><br /><code>/v1/doctor</code></div>
        </div>
        <div class="grid">
          <div class="box">
            <strong>2-Minute Review</strong>
            <ul>${twoMinuteList}</ul>
          </div>
          <div class="box">
            <strong>Proof Assets</strong>
            <ul>${proofAssetList}</ul>
          </div>
        </div>
        <div class="row">
          <button id="btnHealth">Check Health</button>
          <button id="btnMeta">Check Meta</button>
          <button id="btnBrief">Check Brief</button>
          <button id="btnReview">Check Review Pack</button>
          <button id="btnSchema">Check Schema</button>
          <button id="btnVersion">Check Version</button>
          <button id="btnDoctor">Run Doctor</button>
        </div>
        <div id="output"><pre>Ready for health, runtime brief, or doctor validation.</pre></div>
        <div class="row muted">
          API index JSON: <a href="/api">/api</a>
        </div>
      </section>
    </main>
    <script>
      const output = document.getElementById("output");
      function show(data) {
        output.innerHTML = "<pre>" + JSON.stringify(data, null, 2) + "</pre>";
      }
      document.getElementById("btnHealth").addEventListener("click", async () => {
        const r = await fetch("/health");
        show(await r.json());
      });
      document.getElementById("btnMeta").addEventListener("click", async () => {
        const r = await fetch("/meta");
        show(await r.json());
      });
      document.getElementById("btnBrief").addEventListener("click", async () => {
        const r = await fetch("/v1/runtime-brief");
        show(await r.json());
      });
      document.getElementById("btnReview").addEventListener("click", async () => {
        const r = await fetch("/v1/review-pack");
        show(await r.json());
      });
      document.getElementById("btnSchema").addEventListener("click", async () => {
        const r = await fetch("/v1/schema/doctor-report");
        show(await r.json());
      });
      document.getElementById("btnVersion").addEventListener("click", async () => {
        const r = await fetch("/v1/version");
        show(await r.json());
      });
      document.getElementById("btnDoctor").addEventListener("click", async () => {
        const r = await fetch("/v1/doctor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope: "project" })
        });
        show(await r.json());
      });
    </script>
  </body>
</html>`;
}

function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
        resolve(parsed ?? {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

async function runDoctor(scope: "project" | "user"): Promise<JsonObject> {
  const startedAt = Date.now();
  const result = await runCommand("node", ["dist/bin/ogx.js", "doctor", "--scope", scope], {
    timeoutMs: 20_000,
  });
  return {
    code: result.code,
    ok: result.code === 0,
    stderr: result.stderr,
    stdout: result.stdout,
    scope_used: scope,
    duration_ms: Date.now() - startedAt,
  };
}

export function createApiServer(port = readPort()) {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = request.url ?? "/";

    if (method === "GET" && url === "/health") {
      sendJson(response, 200, createHealthPayload(port));
      return;
    }

    if (method === "GET" && url === "/meta") {
      sendJson(response, 200, createMetaPayload(port));
      return;
    }

    if (method === "GET" && url === "/v1/runtime-brief") {
      sendJson(response, 200, createRuntimeBriefPayload(port));
      return;
    }

    if (method === "GET" && url === "/v1/review-pack") {
      sendJson(response, 200, createReviewPackPayload(port));
      return;
    }

    if (method === "GET" && url === "/v1/schema/doctor-report") {
      sendJson(response, 200, createDoctorReportSchemaPayload());
      return;
    }

    if (method === "GET" && url === "/") {
      sendHtml(response, 200, renderHomePage());
      return;
    }

    if (method === "GET" && url === "/api") {
      sendJson(response, 200, createApiIndexPayload());
      return;
    }

    if (method === "GET" && url === "/v1/version") {
      const program = createProgram();
      sendJson(response, 200, {
        name: program.name(),
        version: program.version(),
        description: program.description(),
      });
      return;
    }

    if (method === "POST" && url === "/v1/doctor") {
      try {
        const body = await readJsonBody(request);
        const scope = normalizeScope(body.scope);
        const doctor = await runDoctor(scope);
        sendJson(response, 200, {
          ok: true,
          status: doctor.ok ? "ok" : "degraded",
          result: doctor,
          diagnostics: {
            next_action: doctor.ok
              ? "Doctor passed. The runtime is ready for launch or team workflows."
              : "Inspect result.stderr and re-run /v1/doctor after fixing missing dependencies.",
          },
          links: buildLinks(),
          ops_contract: OPS_CONTRACT,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, {
          ok: false,
          error: message,
        });
        return;
      }
    }

    sendJson(response, 404, {
      ok: false,
      error: "not found",
    });
  });
}

export function startServer(port = readPort()): void {
  const server = createApiServer(port);
  server.listen(port, "0.0.0.0", () => {
    // Keep startup output concise for Cloud Run logs.
    // eslint-disable-next-line no-console
    console.info(`[ogx-api] listening on 0.0.0.0:${port}`);
  });
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  startServer();
}
