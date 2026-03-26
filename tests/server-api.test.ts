import { describe, expect, it } from "vitest";
import {
  createApiIndexPayload,
  createAutomationBudgetBoardPayload,
  createHealthPayload,
  createMetaPayload,
  createProofMapPayload,
  createDoctorReportSchemaPayload,
  createAutomationGuardrailsPayload,
  createReviewPackPayload,
  createTeamSessionReplayPayload,
  createRuntimeBriefPayload,
  createRuntimeScorecardPayload,
  normalizeScope,
} from "../src/bin/server.js";
import { createProgram } from "../src/cli/program.js";

describe("server api payloads", () => {
  it("normalizes scope inputs safely", () => {
    expect(normalizeScope("user")).toBe("user");
    expect(normalizeScope("project")).toBe("project");
    expect(normalizeScope("anything-else")).toBe("project");
    expect(normalizeScope(undefined)).toBe("project");
  });

  it("exposes an actionable health envelope", () => {
    const payload = createHealthPayload(8080);

    expect(payload.service).toBe("oh-my-gemini-api");
    expect(payload.status).toBe("ok");
    expect((payload.links as Record<string, string>).meta).toBe("/meta");
    expect((payload.links as Record<string, string>).proof_map).toBe("/v1/proof-map");
    expect((payload.links as Record<string, string>).runtime_brief).toBe("/v1/runtime-brief");
    expect((payload.links as Record<string, string>).review_pack).toBe("/v1/review-pack");
    expect((payload.links as Record<string, string>).team_session_replay).toBe("/v1/team-session-replay");
    expect((payload.links as Record<string, string>).automation_guardrails).toBe("/v1/automation-guardrails");
    expect((payload.links as Record<string, string>).automation_budget_board).toBe("/v1/automation-budget-board");
    expect((payload.ops_contract as Record<string, string>).schema).toBe("ops-envelope-v1");
    expect((payload.readiness_contract as string)).toBe("ogx-runtime-brief-v1");
    expect(((payload.report_contract as Record<string, string>).schema)).toBe("ogx-doctor-report-v1");
    expect((payload.diagnostics as Record<string, string>).next_action).toContain("/v1/doctor");
  });

  it("reports runtime posture and capabilities from meta", () => {
    const payload = createMetaPayload(8080);

    expect((payload.runtime as Record<string, unknown>).port).toBe(8080);
    expect((payload.capabilities as Record<string, boolean>).doctor).toBe(true);
    expect((payload.diagnostics as Record<string, number>).route_count).toBeGreaterThanOrEqual(4);
    expect((payload.readiness_contract as string)).toBe("ogx-runtime-brief-v1");
    expect(((payload.report_contract as Record<string, string>).schema)).toBe("ogx-doctor-report-v1");
  });

  it("lists the public routes in the api index", () => {
    const payload = createApiIndexPayload();
    expect(payload.service).toBe("oh-my-gemini-api");
    expect(payload.status).toBe("ok");
    expect((payload.routes as string[])).toContain("/meta");
    expect((payload.routes as string[])).toContain("/v1/proof-map");
    expect((payload.routes as string[])).toContain("/v1/runtime-brief");
    expect((payload.routes as string[])).toContain("/v1/review-pack");
    expect((payload.routes as string[])).toContain("/v1/automation-guardrails");
    expect((payload.routes as string[])).toContain("/v1/automation-budget-board");
    expect((payload.routes as string[])).toContain("/v1/team-session-replay");
  });

  it("creates an operator runtime brief payload", () => {
    const payload = createRuntimeBriefPayload(8080);

    expect((payload.readiness_contract as string)).toBe("ogx-runtime-brief-v1");
    expect(((payload.report_contract as Record<string, string>).schema)).toBe("ogx-doctor-report-v1");
    expect(((payload.runtime as Record<string, unknown>).port)).toBe(8080);
    expect((payload.review_flow as string[]).length).toBeGreaterThanOrEqual(3);
    expect((payload.two_minute_review as string[]).length).toBe(4);
    expect(((payload.proof_assets as Array<Record<string, string>>)[0].path)).toBe("/health");
    expect((payload.links as Record<string, string>).automation_guardrails).toBe("/v1/automation-guardrails");
    expect((payload.links as Record<string, string>).automation_budget_board).toBe("/v1/automation-budget-board");
    expect((payload.links as Record<string, string>).team_session_replay).toBe("/v1/team-session-replay");
  });

  it("creates a proof map payload for first-click route selection", () => {
    const payload = createProofMapPayload(8080);

    expect((payload.readiness_contract as string)).toBe("ogx-proof-route-map-v1");
    expect((payload.reviewer_fast_path as string[])[0]).toBe("/v1/proof-map");
    expect(((payload.route_groups as Record<string, string[]>).posture)[0]).toBe("/health");
    expect(((payload.links as Record<string, string>).review_pack)).toBe("/v1/review-pack");
  });

  it("creates an executive status pack payload", () => {
    const payload = createReviewPackPayload(8080);

    expect((payload.readiness_contract as string)).toBe("ogx-review-pack-v1");
    expect(((payload.proof_bundle as Record<string, unknown>).runtime_mode as string).length).toBeGreaterThan(0);
    expect(((payload.proof_bundle as Record<string, string[]>).review_routes)).toContain("/v1/review-pack");
    expect(((payload.proof_bundle as Record<string, string[]>).review_routes)).toContain("/v1/automation-guardrails");
    expect(((payload.proof_bundle as Record<string, string[]>).review_routes)).toContain("/v1/automation-budget-board");
    expect(((payload.proof_bundle as Record<string, string[]>).review_routes)).toContain("/v1/team-session-replay");
    expect(
      (
        (payload.proof_bundle as Record<string, Record<string, string>>)
          .product_truth.canonical_runtime
      )
    ).toContain("ogx CLI");
    expect(
      (
        (payload.proof_bundle as Record<string, Record<string, string>>)
          .product_truth.claim_rule
      )
    ).toContain("does not prove");
    expect(
      (
        (payload.proof_bundle as Record<string, Record<string, string>>)
          .product_truth.claim_tier
      )
    ).toMatch(/cli-first-(live|local)-wrapper/);
    expect((payload.review_sequence as string[]).length).toBeGreaterThanOrEqual(3);
    expect((payload.two_minute_review as string[]).length).toBe(4);
    expect(((payload.proof_assets as Array<Record<string, string>>)[0].label)).toBe("Health Envelope");
  });

  it("creates a runtime scorecard payload with doctor telemetry", () => {
    const payload = createRuntimeScorecardPayload(8080, {
      doctorRuns: {
        byScope: {
          project: 2,
          user: 1,
        },
        failureCount: 1,
        lastDoctorAt: "2026-03-09T00:00:00.000Z",
        lastFailureAt: "2026-03-09T00:01:00.000Z",
        successCount: 2,
        total: 3,
      },
      routeCounts: {
        "/health": 2,
        "/v1/doctor": 3,
        "/v1/runtime-scorecard": 1,
      },
    }, {
      enabled: true,
      path: "/tmp/ogx-runtime-events.jsonl",
      event_count: 8,
      route_hits: 5,
      doctor_runs: 3,
      failed_doctor_runs: 1,
      last_event_at: "2026-03-09T00:01:00.000Z",
    });

    expect((payload.readiness_contract as string)).toBe("ogx-runtime-scorecard-v1");
    expect(((payload.runtime as Record<string, unknown>).port)).toBe(8080);
    expect(((payload.doctor_runs as Record<string, number>).total)).toBe(3);
    expect(((payload.doctor_runs as Record<string, number>).success_rate_pct)).toBeCloseTo(66.67, 1);
    expect(((payload.traffic as Record<string, Array<Record<string, unknown>>>).route_counts)).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/v1/doctor", count: 3 })])
    );
    expect(((payload.persistence as Record<string, unknown>).doctor_runs)).toBe(3);
    expect(((payload.runtime as Record<string, Record<string, unknown>>).operator_auth.enabled)).toBe(false);
    expect(((payload.links as Record<string, string>).runtime_scorecard)).toBe("/v1/runtime-scorecard");
    expect(((payload.links as Record<string, string>).automation_guardrails)).toBe("/v1/automation-guardrails");
    expect(((payload.links as Record<string, string>).automation_budget_board)).toBe("/v1/automation-budget-board");
    expect(((payload.links as Record<string, string>).team_session_replay)).toBe("/v1/team-session-replay");
    expect((payload.recommendations as string[]).length).toBeGreaterThanOrEqual(3);
  });

  it("creates a team session replay payload", () => {
    const payload = createTeamSessionReplayPayload({
      configuredChannels: ["discord", "gmail"],
      latestHeartbeatAt: "2026-03-11T00:00:00.000Z",
      teams: [
        {
          teamName: "alpha",
          sessionName: "ogx-alpha",
          status: "running",
          workers: [
            {
              workerId: "w1",
              status: "busy",
              processedTasks: 3,
              pendingTasks: 1,
              failedTasks: 0,
              lastHeartbeatAt: "2026-03-11T00:00:00.000Z",
            },
          ],
        },
      ],
    });

    expect((payload.schema as string)).toBe("ogx-team-session-replay-v1");
    expect(((payload.summary as Record<string, number>).visible_teams)).toBe(1);
    expect(((payload.summary as Record<string, number>).active_workers)).toBe(1);
    expect(((payload.summary as Record<string, number>).pending_tasks)).toBe(1);
    expect(((payload.links as Record<string, string>).team_session_replay)).toBe("/v1/team-session-replay");
    expect(((payload.items as Array<Record<string, unknown>>)[0].team_name)).toBe("alpha");
  });

  it("keeps CLI and server version metadata aligned", () => {
    const program = createProgram();
    const health = createHealthPayload(8080);
    const meta = createMetaPayload(8080);

    expect(health.version).toBe(program.version());
    expect(meta.version).toBe(program.version());
  });

  it("reports consistent public route counts across review surfaces", () => {
    const api = createApiIndexPayload();
    const meta = createMetaPayload(8080);
    const brief = createRuntimeBriefPayload(8080);
    const scorecard = createRuntimeScorecardPayload(8080, {
      doctorRuns: {
        byScope: {
          project: 0,
          user: 0,
        },
        failureCount: 0,
        lastDoctorAt: null,
        lastFailureAt: null,
        successCount: 0,
        total: 0,
      },
      routeCounts: {},
    });
    const expectedPublicRouteCount = ((api.routes as string[])?.length ?? 0) + 2;

    expect((meta.diagnostics as Record<string, number>).route_count).toBe(expectedPublicRouteCount);
    expect((brief.route_count as number)).toBe(expectedPublicRouteCount);
    expect(((scorecard.runtime as Record<string, number>).route_count)).toBe(expectedPublicRouteCount);
  });

  it("creates a doctor report schema payload", () => {
    const payload = createDoctorReportSchemaPayload();

    expect(payload.service).toBe("oh-my-gemini-api");
    expect((payload.schema as string)).toBe("ogx-doctor-report-v1");
    expect((payload.required_sections as string[])).toContain("stdout");
    expect((payload.operator_rules as string[]).length).toBeGreaterThanOrEqual(3);
  });

  it("creates an automation guardrails payload", () => {
    const payload = createAutomationGuardrailsPayload(8080);

    expect(payload.service).toBe("oh-my-gemini-api");
    expect((payload.readiness_contract as string)).toBe("ogx-automation-guardrails-v1");
    expect(((payload.summary as Record<string, unknown>).port)).toBe(8080);
    expect((payload.guardrails as string[]).length).toBeGreaterThanOrEqual(3);
    expect((payload.links as Record<string, string>).doctor).toBe("/v1/doctor");
  });

  it("creates an automation budget board payload", () => {
    const payload = createAutomationBudgetBoardPayload(8080);

    expect(payload.service).toBe("oh-my-gemini-api");
    expect((payload.readiness_contract as string)).toBe("ogx-automation-budget-board-v1");
    expect(((payload.summary as Record<string, unknown>).port)).toBe(8080);
    expect(
      ((payload.automation_budget as Record<string, string[]>).recommended_entrypoints)
    ).toContain("/v1/automation-budget-board");
    expect(((payload.permission_gates as Array<Record<string, string>>)[0].gate)).toBe(
      "operator-token"
    );
    expect((payload.links as Record<string, string>).automation_budget_board).toBe(
      "/v1/automation-budget-board"
    );
  });
});
