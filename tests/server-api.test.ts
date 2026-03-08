import { describe, expect, it } from "vitest";
import {
  createApiIndexPayload,
  createHealthPayload,
  createMetaPayload,
  createDoctorReportSchemaPayload,
  createReviewPackPayload,
  createRuntimeBriefPayload,
  normalizeScope,
} from "../src/bin/server.js";

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
    expect((payload.links as Record<string, string>).runtime_brief).toBe("/v1/runtime-brief");
    expect((payload.links as Record<string, string>).review_pack).toBe("/v1/review-pack");
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
    expect((payload.routes as string[])).toContain("/v1/runtime-brief");
    expect((payload.routes as string[])).toContain("/v1/review-pack");
  });

  it("creates an operator runtime brief payload", () => {
    const payload = createRuntimeBriefPayload(8080);

    expect((payload.readiness_contract as string)).toBe("ogx-runtime-brief-v1");
    expect(((payload.report_contract as Record<string, string>).schema)).toBe("ogx-doctor-report-v1");
    expect(((payload.runtime as Record<string, unknown>).port)).toBe(8080);
    expect((payload.review_flow as string[]).length).toBeGreaterThanOrEqual(3);
  });

  it("creates an executive review pack payload", () => {
    const payload = createReviewPackPayload(8080);

    expect((payload.readiness_contract as string)).toBe("ogx-review-pack-v1");
    expect(((payload.proof_bundle as Record<string, unknown>).runtime_mode as string).length).toBeGreaterThan(0);
    expect(((payload.proof_bundle as Record<string, string[]>).review_routes)).toContain("/v1/review-pack");
    expect((payload.review_sequence as string[]).length).toBeGreaterThanOrEqual(3);
  });

  it("creates a doctor report schema payload", () => {
    const payload = createDoctorReportSchemaPayload();

    expect(payload.service).toBe("oh-my-gemini-api");
    expect((payload.schema as string)).toBe("ogx-doctor-report-v1");
    expect((payload.required_sections as string[])).toContain("stdout");
    expect((payload.operator_rules as string[]).length).toBeGreaterThanOrEqual(3);
  });
});
