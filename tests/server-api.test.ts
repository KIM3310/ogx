import { describe, expect, it } from "vitest";
import {
  createApiIndexPayload,
  createHealthPayload,
  createMetaPayload,
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
    expect((payload.ops_contract as Record<string, string>).schema).toBe("ops-envelope-v1");
    expect((payload.diagnostics as Record<string, string>).next_action).toContain("/v1/doctor");
  });

  it("reports runtime posture and capabilities from meta", () => {
    const payload = createMetaPayload(8080);

    expect((payload.runtime as Record<string, unknown>).port).toBe(8080);
    expect((payload.capabilities as Record<string, boolean>).doctor).toBe(true);
    expect((payload.diagnostics as Record<string, number>).route_count).toBeGreaterThanOrEqual(4);
  });

  it("lists the public routes in the api index", () => {
    const payload = createApiIndexPayload();
    expect(payload.service).toBe("oh-my-gemini-api");
    expect(payload.status).toBe("ok");
    expect((payload.routes as string[])).toContain("/meta");
  });
});
