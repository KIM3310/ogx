import { describe, expect, it } from "vitest";
import {
  configSchema,
  runStateSchema,
  teamStateSchema,
  taskSchema,
  workerInboxSchema,
  workerStateSchema,
  scopeSchema,
} from "../src/state/schemas.js";

describe("scopeSchema", () => {
  it("accepts 'user' and 'project'", () => {
    expect(scopeSchema.parse("user")).toBe("user");
    expect(scopeSchema.parse("project")).toBe("project");
  });

  it("rejects unknown scope values", () => {
    expect(() => scopeSchema.parse("admin")).toThrow();
    expect(() => scopeSchema.parse("")).toThrow();
    expect(() => scopeSchema.parse(123)).toThrow();
  });
});

describe("configSchema", () => {
  it("parses a minimal valid config with defaults", () => {
    const result = configSchema.parse({ version: 1 });
    expect(result.version).toBe(1);
    expect(result.notifications.discordWebhookUrl).toBe("");
    expect(result.notifications.slackWebhookUrl).toBe("");
    expect(result.runtime.geminiCommand).toBe("gemini");
    expect(result.safety.allowDangerousFlags).toBe(false);
    expect(result.team.defaultWorkers).toBe(3);
  });

  it("enforces version as a positive integer", () => {
    expect(() => configSchema.parse({ version: 0 })).toThrow();
    expect(() => configSchema.parse({ version: -1 })).toThrow();
    expect(() => configSchema.parse({ version: 1.5 })).toThrow();
    expect(() => configSchema.parse({})).toThrow();
  });

  it("rejects invalid discord webhook URL", () => {
    expect(() =>
      configSchema.parse({
        version: 1,
        notifications: { discordWebhookUrl: "not-a-url" },
      })
    ).toThrow();
  });

  it("accepts empty string for optional URL fields", () => {
    const result = configSchema.parse({
      version: 1,
      notifications: {
        discordWebhookUrl: "",
        slackWebhookUrl: "",
      },
    });
    expect(result.notifications.discordWebhookUrl).toBe("");
    expect(result.notifications.slackWebhookUrl).toBe("");
  });

  it("accepts valid gmail sub-config", () => {
    const result = configSchema.parse({
      version: 1,
      notifications: {
        gmail: {
          enabled: true,
          from: "a@b.com",
          to: "c@d.com",
          user: "a@b.com",
          appPassword: "secret",
        },
      },
    });
    expect(result.notifications.gmail.enabled).toBe(true);
    expect(result.notifications.gmail.from).toBe("a@b.com");
  });

  it("rejects non-integer defaultWorkers", () => {
    expect(() =>
      configSchema.parse({ version: 1, team: { defaultWorkers: 2.5 } })
    ).toThrow();
  });

  it("rejects zero or negative defaultWorkers", () => {
    expect(() =>
      configSchema.parse({ version: 1, team: { defaultWorkers: 0 } })
    ).toThrow();
    expect(() =>
      configSchema.parse({ version: 1, team: { defaultWorkers: -1 } })
    ).toThrow();
  });
});

describe("runStateSchema", () => {
  const validRunState = {
    args: ["-p", "hello"],
    command: "gemini",
    mode: "launch" as const,
    pid: 1234,
    scope: "project" as const,
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "running" as const,
  };

  it("parses a valid run state", () => {
    const result = runStateSchema.parse(validRunState);
    expect(result.pid).toBe(1234);
    expect(result.mode).toBe("launch");
    expect(result.status).toBe("running");
  });

  it("accepts optional stoppedAt field", () => {
    const result = runStateSchema.parse({
      ...validRunState,
      status: "stopped",
      stoppedAt: "2026-01-01T01:00:00.000Z",
    });
    expect(result.stoppedAt).toBe("2026-01-01T01:00:00.000Z");
  });

  it("rejects invalid mode", () => {
    expect(() =>
      runStateSchema.parse({ ...validRunState, mode: "exec" })
    ).toThrow();
  });

  it("rejects non-positive pid", () => {
    expect(() =>
      runStateSchema.parse({ ...validRunState, pid: 0 })
    ).toThrow();
    expect(() =>
      runStateSchema.parse({ ...validRunState, pid: -5 })
    ).toThrow();
  });

  it("rejects invalid status", () => {
    expect(() =>
      runStateSchema.parse({ ...validRunState, status: "paused" })
    ).toThrow();
  });
});

describe("taskSchema", () => {
  const validTask = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "task-1",
    payload: "do something",
    status: "pending" as const,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("parses valid task", () => {
    expect(taskSchema.parse(validTask).id).toBe("task-1");
  });

  it("accepts all four status values", () => {
    for (const status of ["pending", "running", "done", "failed"] as const) {
      expect(taskSchema.parse({ ...validTask, status }).status).toBe(status);
    }
  });

  it("rejects unknown status", () => {
    expect(() =>
      taskSchema.parse({ ...validTask, status: "cancelled" })
    ).toThrow();
  });

  it("accepts optional error field", () => {
    const result = taskSchema.parse({ ...validTask, status: "failed", error: "timeout" });
    expect(result.error).toBe("timeout");
  });
});

describe("workerStateSchema", () => {
  const valid = {
    lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
    processedTasks: 5,
    status: "idle" as const,
    teamName: "alpha",
    workerId: "w1",
  };

  it("parses valid worker state", () => {
    expect(workerStateSchema.parse(valid).processedTasks).toBe(5);
  });

  it("rejects negative processedTasks", () => {
    expect(() =>
      workerStateSchema.parse({ ...valid, processedTasks: -1 })
    ).toThrow();
  });

  it("accepts all three status values", () => {
    for (const status of ["idle", "busy", "stopped"] as const) {
      expect(workerStateSchema.parse({ ...valid, status }).status).toBe(status);
    }
  });
});

describe("workerInboxSchema", () => {
  it("parses empty tasks array", () => {
    expect(workerInboxSchema.parse({ tasks: [] }).tasks).toHaveLength(0);
  });

  it("rejects missing tasks key", () => {
    expect(() => workerInboxSchema.parse({})).toThrow();
  });
});

describe("teamStateSchema", () => {
  const valid = {
    createdAt: "2026-01-01T00:00:00.000Z",
    scope: "project" as const,
    sessionName: "ogx-alpha",
    status: "running" as const,
    teamName: "alpha",
    updatedAt: "2026-01-01T00:00:00.000Z",
    workers: [],
  };

  it("parses valid team state with empty workers", () => {
    expect(teamStateSchema.parse(valid).teamName).toBe("alpha");
  });

  it("rejects missing teamName", () => {
    const { teamName, ...rest } = valid;
    expect(() => teamStateSchema.parse(rest)).toThrow();
  });
});
