import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProgram } from "../cli/program.js";
import { runCommand } from "../utils/process.js";
import { authorizeOperatorRequest, readOperatorAuthStatus } from "./operator-access.js";
import { createRuntimeStore, summarizeRuntimeStore, type OgxRuntimeStoreSummary } from "./runtime-store.js";
import {
  buildTeamSessionReplayPayload,
  summarizeTeamSessions,
  type TeamSessionReplaySnapshot,
} from "../server/team-session-replay.js";
import { OGX_API_SERVICE_NAME, OGX_VERSION } from "../meta.js";

interface JsonObject {
  [key: string]: unknown;
}

const MAX_BODY_BYTES = 512 * 1024;
const SERVICE_NAME = OGX_API_SERVICE_NAME;
const OPS_CONTRACT = { schema: "ops-envelope-v1", version: 1 } as const;
const READINESS_CONTRACT = "ogx-runtime-brief-v1";
const REVIEW_PACK_CONTRACT = "ogx-review-pack-v1";
const RUNTIME_SCORECARD_CONTRACT = "ogx-runtime-scorecard-v1";
const DOCTOR_REPORT_SCHEMA = "ogx-doctor-report-v1";
const OGX_TWO_MINUTE_REVIEW = [
  "Open /health and /meta to confirm runtime mode, command posture, and route discovery.",
  "Open /v1/runtime-brief, /v1/review-pack, and /v1/automation-budget-board before wiring automation or Cloud Run handoff.",
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
    label: "Runtime Scorecard",
    path: "/v1/runtime-scorecard",
    why: "Summarizes doctor run freshness, route pressure, and launch readiness at runtime.",
  },
  {
    label: "Automation Guardrails",
    path: "/v1/automation-guardrails",
    why: "Pins operator auth, launch gates, and team handoff requirements before external automation.",
  },
  {
    label: "Automation Budget Board",
    path: "/v1/automation-budget-board",
    why: "Makes request limits, permission gates, and reviewer-safe automation entrypoints explicit.",
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
  "/v1/proof-map",
  "/v1/runtime-brief",
  "/v1/review-pack",
  "/v1/team-session-replay",
  "/v1/runtime-scorecard",
  "/v1/automation-guardrails",
  "/v1/automation-budget-board",
  "/v1/schema/doctor-report",
  "/v1/doctor",
  "/v1/version",
] as const;
const REVIEW_ROUTES = [
  "/health",
  "/meta",
  "/v1/proof-map",
  "/v1/runtime-brief",
  "/v1/runtime-scorecard",
  "/v1/review-pack",
  "/v1/automation-guardrails",
  "/v1/automation-budget-board",
  "/v1/team-session-replay",
  "/v1/schema/doctor-report",
] as const;
const PUBLIC_ROUTES = ["/", "/api", ...API_ROUTES] as const;

export interface OgxRuntimeTelemetry {
  doctorRuns: {
    failureCount: number;
    lastDoctorAt: string | null;
    lastFailureAt: string | null;
    successCount: number;
    total: number;
    byScope: {
      project: number;
      user: number;
    };
  };
  routeCounts: Record<string, number>;
}

function buildRuntimePersistenceSummary(): OgxRuntimeStoreSummary {
  return summarizeRuntimeStore();
}

function createRuntimeTelemetry(): OgxRuntimeTelemetry {
  return {
    doctorRuns: {
      failureCount: 0,
      lastDoctorAt: null,
      lastFailureAt: null,
      successCount: 0,
      total: 0,
      byScope: {
        project: 0,
        user: 0,
      },
    },
    routeCounts: {},
  };
}

function recordRouteHit(telemetry: OgxRuntimeTelemetry, route: string): void {
  telemetry.routeCounts[route] = (telemetry.routeCounts[route] ?? 0) + 1;
}

function recordDoctorRun(
  telemetry: OgxRuntimeTelemetry,
  scope: "project" | "user",
  ok: boolean
): void {
  telemetry.doctorRuns.total += 1;
  telemetry.doctorRuns.byScope[scope] += 1;
  telemetry.doctorRuns.lastDoctorAt = new Date().toISOString();
  if (ok) {
    telemetry.doctorRuns.successCount += 1;
    return;
  }
  telemetry.doctorRuns.failureCount += 1;
  telemetry.doctorRuns.lastFailureAt = telemetry.doctorRuns.lastDoctorAt;
}

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
    proof_map: "/v1/proof-map",
    api: "/api",
    runtime_brief: "/v1/runtime-brief",
    review_pack: "/v1/review-pack",
    team_session_replay: "/v1/team-session-replay",
    runtime_scorecard: "/v1/runtime-scorecard",
    automation_guardrails: "/v1/automation-guardrails",
    automation_budget_board: "/v1/automation-budget-board",
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

function createProductTruth(): JsonObject {
  return {
    canonical_runtime:
      "ogx CLI commands (`ogx setup`, `ogx doctor`, `ogx launch`, `ogx team`)",
    optional_wrapper:
      "Cloud Run HTTP API and static docs are companion status pages, not the product core.",
    claim_tier: readRuntimeMode() === "cloud-run" ? "cli-first-live-wrapper" : "cli-first-local-wrapper",
    claim_rule:
      "A healthy wrapper helps reviewer triage but does not prove the target shell already satisfies Gemini, tmux, or notification prerequisites.",
  };
}

export function normalizeScope(scope: unknown): "project" | "user" {
  return typeof scope === "string" && scope.trim() === "user" ? "user" : "project";
}

export function createHealthPayload(port: number): JsonObject {
  const operatorAuth = readOperatorAuthStatus();
  const persistence = buildRuntimePersistenceSummary();
  return {
    ok: true,
    status: "ok",
    service: SERVICE_NAME,
    version: OGX_VERSION,
    readiness_contract: READINESS_CONTRACT,
    report_contract: createDoctorReportSchema(),
    diagnostics: {
      runtime_mode: readRuntimeMode(),
      port,
      body_limit_bytes: MAX_BODY_BYTES,
      operator_auth_enabled: operatorAuth.enabled,
      runtime_store_path: persistence.path,
      persisted_event_count: persistence.event_count,
      next_action: 'Open /v1/review-pack and run POST /v1/doctor with {"scope":"project"} before trusting a fresh environment.',
    },
    links: buildLinks(),
    ops_contract: OPS_CONTRACT,
  };
}

export function createMetaPayload(port: number): JsonObject {
  const operatorAuth = readOperatorAuthStatus();
  const persistence = buildRuntimePersistenceSummary();
  return {
    service: SERVICE_NAME,
    status: "ok",
    version: OGX_VERSION,
    readiness_contract: READINESS_CONTRACT,
    report_contract: createDoctorReportSchema(),
    runtime: {
      mode: readRuntimeMode(),
      port,
      node: process.version,
      operator_auth: operatorAuth,
      persistence,
    },
    capabilities: {
      home_page: true,
      doctor: true,
      version: true,
      api_index: true,
      review_pack: true,
      automation_budget_board: true,
      proof_map: true,
    },
    diagnostics: {
      route_count: PUBLIC_ROUTES.length,
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

export function createProofMapPayload(port: number): JsonObject {
  return {
    service: SERVICE_NAME,
    status: "ok",
    generated_at: new Date().toISOString(),
    readiness_contract: "ogx-proof-route-map-v1",
    headline:
      "Front-door route map for choosing the shortest ogx proof path before launch or team orchestration.",
    runtime: {
      mode: readRuntimeMode(),
      port,
      route_count: PUBLIC_ROUTES.length,
    },
    reviewer_fast_path: [
      "/v1/proof-map",
      "/health",
      "/meta",
      "/v1/runtime-brief",
      "/v1/review-pack",
      "/v1/runtime-scorecard",
      "/v1/doctor",
    ],
    route_groups: {
      posture: ["/health", "/meta", "/v1/runtime-brief"],
      reviewer: ["/v1/review-pack", "/v1/runtime-scorecard", "/v1/automation-budget-board"],
      execution: ["/v1/doctor", "/v1/team-session-replay"],
    },
    decision_support: [
      {
        need: "런타임 posture와 wrapper boundary를 먼저 설명해야 할 때",
        route: "/v1/runtime-brief",
      },
      {
        need: "review-safe approval surface를 먼저 설명해야 할 때",
        route: "/v1/review-pack",
      },
      {
        need: "dependency freshness를 실제로 증명해야 할 때",
        route: "/v1/doctor",
      },
    ],
    links: buildLinks(),
  };
}

export function createRuntimeBriefPayload(port: number): JsonObject {
  const operatorAuth = readOperatorAuthStatus();
  const persistence = buildRuntimePersistenceSummary();
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
      operator_auth: operatorAuth,
      persistence,
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
    route_count: PUBLIC_ROUTES.length,
    links: buildLinks(),
  };
}

export function createRuntimeScorecardPayload(
  port: number,
  telemetry: OgxRuntimeTelemetry,
  persisted: OgxRuntimeStoreSummary = buildRuntimePersistenceSummary()
): JsonObject {
  const operatorAuth = readOperatorAuthStatus();
  const reviewRoutes = [...REVIEW_ROUTES];
  const routeCounts = Object.entries(telemetry.routeCounts)
    .map(([path, count]) => ({ path, count }))
    .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path));

  return {
    service: SERVICE_NAME,
    status: "ok",
    generated_at: new Date().toISOString(),
    readiness_contract: RUNTIME_SCORECARD_CONTRACT,
    headline:
      "Runtime scorecard for launch posture, doctor freshness, and route pressure across the ogx operator API.",
    runtime: {
      mode: readRuntimeMode(),
      port,
      node: process.version,
      route_count: PUBLIC_ROUTES.length,
      review_routes: reviewRoutes,
      operator_auth: operatorAuth,
    },
    doctor_runs: {
      ...telemetry.doctorRuns,
      success_rate_pct:
        telemetry.doctorRuns.total > 0
          ? Math.round(
              (telemetry.doctorRuns.successCount / telemetry.doctorRuns.total) *
                10_000
            ) / 100
          : 0,
    },
    traffic: {
      total_requests: routeCounts.reduce((total, item) => total + item.count, 0),
      route_counts: routeCounts,
    },
    persistence: persisted,
    recommendations: [
      telemetry.doctorRuns.total > 0
        ? "Doctor telemetry is populated. Re-run doctor after any shell, Gemini CLI, or notification drift."
        : 'Run POST /v1/doctor with {"scope":"project"} to populate live launch evidence.',
      telemetry.doctorRuns.failureCount > 0
        ? "Investigate failed doctor runs before claiming launch readiness."
        : "No failed doctor runs are recorded in this process yet.",
      "Keep runtime brief and status pack paired with the latest doctor evidence during handoff.",
      "Use /v1/automation-budget-board before exposing the wrapper to external automation or scheduled runs.",
    ],
    links: buildLinks(),
  };
}

export function createReviewPackPayload(port: number): JsonObject {
  const operatorAuth = readOperatorAuthStatus();
  const persistence = buildRuntimePersistenceSummary();
  const productTruth = createProductTruth();
  return {
    service: SERVICE_NAME,
    status: "ok",
    generated_at: new Date().toISOString(),
    readiness_contract: REVIEW_PACK_CONTRACT,
    headline:
      "Executive status pack for ogx: doctor validation, runtime posture, and launch handoff surfaces in one API contract.",
    proof_bundle: {
      runtime_mode: readRuntimeMode(),
      port,
      gemini_command: process.env.OGX_GEMINI_CMD || "gemini",
      operator_auth: operatorAuth,
      persistence,
      product_truth: productTruth,
      review_routes: [...REVIEW_ROUTES],
      doctor_scope_defaults: ["project", "user"],
    },
    approval_gate: {
      doctor_required_before_launch: true,
      health_required_before_automation: true,
      team_handoff_requires_notification_checks: true,
      operator_token_required_for_doctor: operatorAuth.enabled,
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

export function createAutomationGuardrailsPayload(port: number): JsonObject {
  const operatorAuth = readOperatorAuthStatus();
  return {
    service: SERVICE_NAME,
    status: "ok",
    generated_at: new Date().toISOString(),
    readiness_contract: "ogx-automation-guardrails-v1",
    headline:
      "Automation guardrails for ogx: operator auth, doctor freshness, and team handoff gates before external workflows.",
    summary: {
      runtime_mode: readRuntimeMode(),
      port,
      operator_auth_enabled: operatorAuth.enabled,
      doctor_required_before_launch: true,
      health_required_before_automation: true,
      team_handoff_requires_notification_checks: true,
    },
    guardrails: [
      "Read /health, /meta, and /v1/runtime-brief before trusting this wrapper as an automation entrypoint.",
      'Run POST /v1/doctor with {"scope":"project"} after shell or dependency drift.',
      "Treat team handoff as a separate gate from local launch, especially when notifications are expected.",
    ],
    failure_modes: [
      "Wrapper availability does not prove Gemini CLI auth, tmux, or notification channels are healthy on the target shell.",
      "Doctor evidence can go stale quickly after shell, PATH, or token changes.",
      "Shared automation should not bypass operator-token requirements when the runtime enables them.",
    ],
    links: buildLinks(),
  };
}

export function createAutomationBudgetBoardPayload(port: number): JsonObject {
  const operatorAuth = readOperatorAuthStatus();
  const persistence = buildRuntimePersistenceSummary();
  const runtimeMode = readRuntimeMode();

  return {
    service: SERVICE_NAME,
    status: "ok",
    generated_at: new Date().toISOString(),
    readiness_contract: "ogx-automation-budget-board-v1",
    headline:
      "Automation budget and permission board for ogx: token gates, review surfaces, and CLI/runtime boundaries before external workflows.",
    summary: {
      runtime_mode: runtimeMode,
      port,
      operator_auth_enabled: operatorAuth.enabled,
      max_http_body_bytes: MAX_BODY_BYTES,
      review_route_count: REVIEW_ROUTES.length,
      persisted_event_count: persistence.event_count,
      cloud_run_wrapper: runtimeMode === "cloud-run",
    },
    automation_budget: {
      read_only_review_routes: [...REVIEW_ROUTES],
      mutable_routes: ["/v1/doctor"],
      doctor_scopes: ["project", "user"],
      recommended_entrypoints: [
        "/health",
        "/meta",
        "/v1/runtime-brief",
        "/v1/runtime-scorecard",
        "/v1/review-pack",
        "/v1/automation-budget-board",
      ],
    },
    permission_gates: [
      {
        gate: "operator-token",
        state: operatorAuth.enabled ? "required" : "optional",
        why: "Controls whether doctor execution can be triggered by shared automation.",
      },
      {
        gate: "doctor-freshness",
        state: "required",
        why: "Fresh dependency evidence is required before launch or team orchestration claims.",
      },
      {
        gate: "team-notification-handoff",
        state: "required-for-team-mode",
        why: "Shared team workflows need notification checks even when local launch is green.",
      },
    ],
    review_actions: [
      "Treat this board as the permission map before exposing ogx through automation or remote wrappers.",
      "Keep /v1/review-pack and /v1/automation-budget-board together when explaining CLI-vs-wrapper boundaries.",
      'Re-run POST /v1/doctor with {"scope":"project"} after shell drift before reusing automation approval.',
    ],
    links: buildLinks(),
  };
}

export const createTeamSessionReplayPayload = buildTeamSessionReplayPayload;

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
  const productTruthBox = createProductTruth() as Record<string, string>;
  const runtimeMode = readRuntimeMode();
  const badgeLabel = runtimeMode === "cloud-run" ? "Cloud Run Live" : "Local Review Wrapper";
  const runtimeLead =
    runtimeMode === "cloud-run"
      ? "This URL is running on Cloud Run. Runtime brief, doctor contract, and launch readiness routes are available."
      : "This local wrapper is running. Runtime brief, doctor contract, and launch readiness routes are available for review.";
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
      .reality-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .reality-card {
        border: 1px solid #e1e9f7;
        border-radius: 10px;
        padding: 12px;
        background: #f9fcff;
      }
      .reality-card strong {
        display: block;
        margin-bottom: 6px;
      }
      .reality-card small {
        display: inline-block;
        margin-bottom: 8px;
        color: #0b4da2;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .reality-card p {
        margin: 0;
        color: #476082;
        line-height: 1.6;
      }
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
        <span class="badge">${badgeLabel}</span>
        <h1>ogx Operator API</h1>
        <p class="muted">${runtimeLead}</p>
        <div class="grid">
          <div class="box"><strong>Health</strong><br /><code>/health</code></div>
          <div class="box"><strong>Meta</strong><br /><code>/meta</code></div>
          <div class="box"><strong>Runtime Brief</strong><br /><code>/v1/runtime-brief</code></div>
          <div class="box"><strong>Runtime Scorecard</strong><br /><code>/v1/runtime-scorecard</code></div>
          <div class="box"><strong>Automation Guardrails</strong><br /><code>/v1/automation-guardrails</code></div>
          <div class="box"><strong>Review Pack</strong><br /><code>/v1/review-pack</code></div>
          <div class="box"><strong>Team Session Replay</strong><br /><code>/v1/team-session-replay</code></div>
          <div class="box"><strong>Doctor Schema</strong><br /><code>/v1/schema/doctor-report</code></div>
          <div class="box"><strong>Version</strong><br /><code>/v1/version</code></div>
          <div class="box"><strong>Doctor (POST)</strong><br /><code>/v1/doctor</code></div>
        </div>
        <div class="grid">
          <div class="box">
            <strong>Review Flow</strong>
            <ul>${twoMinuteList}</ul>
          </div>
          <div class="box">
            <strong>Product Truth</strong>
            <ul>
              <li>${productTruthBox.canonical_runtime ?? ""}</li>
              <li>${productTruthBox.optional_wrapper ?? ""}</li>
              <li>${productTruthBox.claim_rule ?? ""}</li>
            </ul>
          </div>
          <div class="box">
            <strong>Proof Assets</strong>
            <ul>${proofAssetList}</ul>
          </div>
        </div>
        <div class="row">
          <strong>Runtime reality check</strong>
          <div id="runtimeRealityGrid" class="reality-grid">
            <div class="reality-card"><small>Status</small><strong>Doctor evidence</strong><p>Loading current runtime posture.</p></div>
            <div class="reality-card"><small>Gate</small><strong>Operator access</strong><p>Loading auth and launch posture.</p></div>
            <div class="reality-card"><small>Action</small><strong>Next move</strong><p>Loading review guidance.</p></div>
          </div>
        </div>
        <div class="row">
          <button id="btnHealth">Check Health</button>
          <button id="btnMeta">Check Meta</button>
          <button id="btnBrief">Check Brief</button>
          <button id="btnScorecard">Check Scorecard</button>
          <button id="btnReview">Check Review Pack</button>
          <button id="btnReplay">Check Team Replay</button>
          <button id="btnCopyRoutes">Copy Review Routes</button>
          <button id="btnCopyRuntimeHandoff">Copy Runtime Handoff</button>
          <button id="btnCopyDoctorSnapshot">Copy Doctor Snapshot</button>
          <button id="btnSchema">Check Schema</button>
          <button id="btnVersion">Check Version</button>
          <button id="btnDoctor">Run Doctor</button>
          <button id="btnDoctorUser">Run User Doctor</button>
        </div>
        <div id="output"><pre>Ready for health, runtime brief, or doctor validation.</pre></div>
        <div class="row muted">
          API index JSON: <a href="/api">/api</a>
        </div>
      </section>
    </main>
    <script>
      const output = document.getElementById("output");
      const runtimeRealityGrid = document.getElementById("runtimeRealityGrid");
      const reviewRoutes = ${JSON.stringify(REVIEW_ROUTES)};
      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }
      function show(data) {
        output.innerHTML = "<pre>" + JSON.stringify(data, null, 2) + "</pre>";
      }
      function renderRuntimeReality(cards) {
        if (!runtimeRealityGrid) return;
        runtimeRealityGrid.innerHTML = cards.map((card) =>
          '<div class="reality-card"><small>' + escapeHtml(card.label || "Status") + '</small><strong>' + escapeHtml(card.title) + '</strong><p>' + escapeHtml(card.body) + '</p></div>'
        ).join("");
      }
      async function loadRuntimeReality() {
        try {
          const [healthResponse, scorecardResponse, reviewResponse] = await Promise.all([
            fetch("/health"),
            fetch("/v1/runtime-scorecard"),
            fetch("/v1/review-pack"),
          ]);
          const health = await healthResponse.json();
          const scorecard = await scorecardResponse.json();
          const review = await reviewResponse.json();
          const doctorRuns = scorecard.doctor_runs || {};
          const approvalGate = review.approval_gate || {};
          const recommendations = Array.isArray(scorecard.recommendations) ? scorecard.recommendations : [];
          renderRuntimeReality([
            {
              label: "Status",
              title: "Doctor evidence",
              body: doctorRuns.total > 0
                ? doctorRuns.failureCount > 0
                  ? doctorRuns.failureCount + " failed doctor run(s) recorded. Re-run before claiming launch readiness."
                  : doctorRuns.successCount + " successful doctor run(s) recorded in this process."
                : "No doctor runs recorded yet. Treat this as an honest unvalidated runtime.",
            },
            {
              label: "Gate",
              title: "Operator access",
              body: approvalGate.operator_token_required_for_doctor
                ? "Doctor is token-gated. Keep operator credentials ready before reviewer demos."
                : "Doctor is open in the current runtime. CLI and tmux availability still need real validation.",
            },
            {
              label: "Claim tier",
              title: "Wrapper posture",
              body: review.proof_bundle?.product_truth?.claim_tier === "cli-first-live-wrapper"
                ? "Hosted wrapper is live, but CLI commands remain the product proof."
                : "Local wrapper is available for review, but CLI commands remain the product proof.",
            },
            {
              label: "Action",
              title: "Next move",
              body: (health.diagnostics && health.diagnostics.next_action) || recommendations[0] || "Open /v1/review-pack before launch.",
            },
          ]);
        } catch (_error) {
          renderRuntimeReality([
            {
              label: "Action",
              title: "Runtime reality check",
              body: "Failed to load live posture. Use the route buttons below for direct inspection.",
            },
          ]);
        }
      }
      async function copyReviewRoutes() {
        const body = ["ogx review routes", ...reviewRoutes.map((route) => "- " + route)].join("\\n");
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          show({ ok: false, message: "Clipboard is not available.", review_routes: reviewRoutes });
          return;
        }
        await navigator.clipboard.writeText(body);
        show({ ok: true, copied: "review_routes", review_routes: reviewRoutes });
      }
      async function copyRuntimeHandoff() {
        const [healthResponse, scorecardResponse] = await Promise.all([
          fetch("/health"),
          fetch("/v1/runtime-scorecard"),
        ]);
        const health = await healthResponse.json();
        const scorecard = await scorecardResponse.json();
        const doctorRuns = scorecard.doctor_runs || {};
        const body = [
          "ogx runtime handoff",
          "Runtime mode: " + String((health.diagnostics || {}).runtime_mode || "-"),
          "Doctor runs: " + String(doctorRuns.total || 0),
          "Doctor failures: " + String(doctorRuns.failureCount || 0),
          "Next move: " + String((health.diagnostics || {}).next_action || "Open /v1/review-pack"),
          "",
          "Review routes",
          ...reviewRoutes.map((route) => "- " + route),
        ].join("\\n");
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          show({ ok: false, message: "Clipboard is not available.", runtime_handoff: body });
          return;
        }
        await navigator.clipboard.writeText(body);
        show({ ok: true, copied: "runtime_handoff", runtime_handoff: body });
      }
      async function copyDoctorSnapshot() {
        const [briefResponse, reviewResponse] = await Promise.all([
          fetch("/v1/runtime-brief"),
          fetch("/v1/review-pack")
        ]);
        const brief = await briefResponse.json();
        const review = await reviewResponse.json();
        const proof = review.proof_bundle || {};
        const approval = review.approval_gate || {};
        const body = [
          "ogx doctor snapshot",
          "Runtime mode: " + (proof.runtime_mode || brief.runtime?.mode || "-"),
          "Port: " + String(proof.port || brief.runtime?.port || "-"),
          "Gemini command: " + String(proof.gemini_command || brief.runtime?.gemini_command || "-"),
          "Doctor before launch: " + (approval.doctor_required_before_launch ? "yes" : "no"),
          "Default scopes: " + ((proof.doctor_scope_defaults || []).join(", ") || "-"),
          "",
          "Review routes",
          ...reviewRoutes.map((route) => "- " + route)
        ].join("\\n");
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          show({ ok: false, message: "Clipboard is not available.", doctor_snapshot: body });
          return;
        }
        await navigator.clipboard.writeText(body);
        show({ ok: true, copied: "doctor_snapshot", doctor_snapshot: body });
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
      document.getElementById("btnReplay").addEventListener("click", async () => {
        const r = await fetch("/v1/team-session-replay");
        show(await r.json());
      });
      document.getElementById("btnScorecard").addEventListener("click", async () => {
        const r = await fetch("/v1/runtime-scorecard");
        show(await r.json());
      });
      document.getElementById("btnCopyRoutes").addEventListener("click", async () => {
        await copyReviewRoutes();
      });
      document.getElementById("btnCopyRuntimeHandoff").addEventListener("click", async () => {
        await copyRuntimeHandoff();
      });
      document.getElementById("btnCopyDoctorSnapshot").addEventListener("click", async () => {
        await copyDoctorSnapshot();
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
      document.getElementById("btnDoctorUser").addEventListener("click", async () => {
        const r = await fetch("/v1/doctor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope: "user" })
        });
        show(await r.json());
      });
      loadRuntimeReality();
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

export async function runDoctor(scope: "project" | "user"): Promise<JsonObject> {
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
  const telemetry = createRuntimeTelemetry();
  const runtimeStore = createRuntimeStore();
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = request.url ?? "/";
    recordRouteHit(telemetry, url);
    runtimeStore.append({
      at: new Date().toISOString(),
      event_type: "route_hit",
      method,
      route: url,
    });

    if (method === "GET" && url === "/health") {
      sendJson(response, 200, createHealthPayload(port));
      return;
    }

    if (method === "GET" && url === "/favicon.ico") {
      response.statusCode = 204;
      response.end();
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

    if (method === "GET" && url === "/v1/proof-map") {
      sendJson(response, 200, createProofMapPayload(port));
      return;
    }

    if (method === "GET" && url === "/v1/review-pack") {
      sendJson(response, 200, createReviewPackPayload(port));
      return;
    }

    if (method === "GET" && url === "/v1/team-session-replay") {
      const snapshot = await summarizeTeamSessions();
      sendJson(response, 200, buildTeamSessionReplayPayload(snapshot));
      return;
    }

    if (method === "GET" && url === "/v1/runtime-scorecard") {
      sendJson(response, 200, createRuntimeScorecardPayload(port, telemetry, summarizeRuntimeStore()));
      return;
    }

    if (method === "GET" && url === "/v1/automation-guardrails") {
      sendJson(response, 200, createAutomationGuardrailsPayload(port));
      return;
    }

    if (method === "GET" && url === "/v1/automation-budget-board") {
      sendJson(response, 200, createAutomationBudgetBoardPayload(port));
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
        if (!authorizeOperatorRequest(request)) {
          sendJson(response, 401, {
            ok: false,
            error: "operator token required",
            required_header: readOperatorAuthStatus().header,
          });
          return;
        }
        const body = await readJsonBody(request);
        const scope = normalizeScope(body.scope);
        const doctor = await runDoctor(scope);
        recordDoctorRun(telemetry, scope, doctor.ok === true);
        runtimeStore.append({
          at: new Date().toISOString(),
          event_type: "doctor_run",
          method,
          route: url,
          scope,
          ok: doctor.ok === true,
          duration_ms: Number(doctor.duration_ms ?? 0),
        });
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
