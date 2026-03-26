import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTeamState,
  readTeamConfig,
  readTask,
  writeTask,
  listTasks,
  readWorker,
  writeWorker,
  listWorkers,
  appendEvent,
  readRecentEvents,
  listTeamNames,
  getTeamSummary,
  cleanupTeamState,
} from "../src/state/team-store.js";
import type { TeamConfig, TeamTaskRecord, TeamWorkerRecord } from "../src/state/types.js";
import { ensureDir } from "../src/utils/fs.js";

const tempDirs: string[] = [];

async function mkTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ogx-team-store-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

function makeConfig(name: string): TeamConfig {
  return {
    schemaVersion: 1,
    name,
    rootTask: "root",
    createdAt: "2026-01-01T00:00:00.000Z",
    cwd: "/tmp",
    workerCount: 2,
    taskCount: 2,
    approvalMode: "yolo",
    includeDirectories: [],
    launchMode: "process",
  };
}

function makeTask(id: string, overrides?: Partial<TeamTaskRecord>): TeamTaskRecord {
  return {
    id,
    subject: `Task ${id}`,
    description: "",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeWorker(name: string, overrides?: Partial<TeamWorkerRecord>): TeamWorkerRecord {
  return {
    name,
    status: "idle",
    ...overrides,
  };
}

describe("team-store", () => {
  it("creates team state and reads back config", async () => {
    const cwd = await mkTempDir();
    const config = makeConfig("alpha");
    await createTeamState({ cwd, config, tasks: [], workers: [] });

    const readBack = await readTeamConfig(cwd, "alpha");
    expect(readBack).not.toBeNull();
    expect(readBack!.name).toBe("alpha");
  });

  it("writes and reads individual tasks", async () => {
    const cwd = await mkTempDir();
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks: [], workers: [] });

    const task = makeTask("t1", { status: "running" });
    await writeTask(cwd, "alpha", task);

    const readBack = await readTask(cwd, "alpha", "t1");
    expect(readBack).not.toBeNull();
    expect(readBack!.status).toBe("running");
  });

  it("lists all tasks in a team", async () => {
    const cwd = await mkTempDir();
    const tasks = [makeTask("t1"), makeTask("t2"), makeTask("t3")];
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks, workers: [] });

    const listed = await listTasks(cwd, "alpha");
    expect(listed).toHaveLength(3);
    expect(listed.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("writes and reads individual workers", async () => {
    const cwd = await mkTempDir();
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks: [], workers: [] });

    const worker = makeWorker("w1", { status: "running", taskId: "t1" });
    await writeWorker(cwd, "alpha", worker);

    const readBack = await readWorker(cwd, "alpha", "w1");
    expect(readBack).not.toBeNull();
    expect(readBack!.taskId).toBe("t1");
  });

  it("lists all workers in a team", async () => {
    const cwd = await mkTempDir();
    const workers = [makeWorker("w1"), makeWorker("w2")];
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks: [], workers });

    const listed = await listWorkers(cwd, "alpha");
    expect(listed).toHaveLength(2);
  });

  it("appends and reads events", async () => {
    const cwd = await mkTempDir();
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks: [], workers: [] });

    await appendEvent(cwd, "alpha", {
      at: "2026-01-01T00:00:00.000Z",
      type: "task_started",
      message: "Task t1 started",
      taskId: "t1",
    });
    await appendEvent(cwd, "alpha", {
      at: "2026-01-01T00:01:00.000Z",
      type: "task_completed",
      message: "Task t1 completed",
      taskId: "t1",
    });

    const events = await readRecentEvents(cwd, "alpha", 10);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("task_started");
    expect(events[1].type).toBe("task_completed");
  });

  it("readRecentEvents respects limit", async () => {
    const cwd = await mkTempDir();
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks: [], workers: [] });

    for (let i = 0; i < 5; i++) {
      await appendEvent(cwd, "alpha", {
        at: `2026-01-01T00:0${i}:00.000Z`,
        type: "ping",
        message: `event ${i}`,
      });
    }

    const events = await readRecentEvents(cwd, "alpha", 2);
    expect(events).toHaveLength(2);
    expect(events[0].message).toBe("event 3");
    expect(events[1].message).toBe("event 4");
  });

  it("readRecentEvents returns empty for missing team", async () => {
    const cwd = await mkTempDir();
    const events = await readRecentEvents(cwd, "nonexistent", 10);
    expect(events).toEqual([]);
  });

  it("listTeamNames returns sorted team names", async () => {
    const cwd = await mkTempDir();
    await createTeamState({ cwd, config: makeConfig("bravo"), tasks: [], workers: [] });
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks: [], workers: [] });

    const names = await listTeamNames(cwd);
    expect(names).toEqual(["alpha", "bravo"]);
  });

  it("listTeamNames returns empty for no teams", async () => {
    const cwd = await mkTempDir();
    const names = await listTeamNames(cwd);
    expect(names).toEqual([]);
  });

  it("getTeamSummary returns null for nonexistent team", async () => {
    const cwd = await mkTempDir();
    const summary = await getTeamSummary(cwd, "nonexistent");
    expect(summary).toBeNull();
  });

  it("getTeamSummary computes correct counts", async () => {
    const cwd = await mkTempDir();
    const tasks = [
      makeTask("t1", { status: "pending" }),
      makeTask("t2", { status: "running" }),
      makeTask("t3", { status: "completed" }),
      makeTask("t4", { status: "failed" }),
    ];
    const workers = [
      makeWorker("w1", { status: "running" }),
      makeWorker("w2", { status: "waiting" }),
      makeWorker("w3", { status: "idle" }),
    ];
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks, workers });

    const summary = await getTeamSummary(cwd, "alpha");
    expect(summary).not.toBeNull();
    expect(summary!.counts.total).toBe(4);
    expect(summary!.counts.pending).toBe(1);
    expect(summary!.counts.running).toBe(1);
    expect(summary!.counts.completed).toBe(1);
    expect(summary!.counts.failed).toBe(1);
    expect(summary!.activeWorkers).toBe(2);
    expect(summary!.waitingWorkers).toBe(1);
    expect(summary!.allTerminal).toBe(false);
  });

  it("getTeamSummary detects allTerminal state", async () => {
    const cwd = await mkTempDir();
    const tasks = [
      makeTask("t1", { status: "completed" }),
      makeTask("t2", { status: "failed" }),
    ];
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks, workers: [] });

    const summary = await getTeamSummary(cwd, "alpha");
    expect(summary!.allTerminal).toBe(true);
  });

  it("getTeamSummary computes dependency blocks and ready tasks", async () => {
    const cwd = await mkTempDir();
    const tasks = [
      makeTask("t1", { status: "pending" }),
      makeTask("t2", { status: "pending", dependsOn: ["t1"] }),
      makeTask("t3", { status: "pending" }),
    ];
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks, workers: [] });

    const summary = await getTeamSummary(cwd, "alpha");
    expect(summary!.dependencyBlockedTasks).toBe(1);
    expect(summary!.readyTaskCount).toBe(2);
    expect(summary!.readyTaskIds).toContain("t1");
    expect(summary!.readyTaskIds).toContain("t3");
    expect(summary!.readyTaskIds).not.toContain("t2");
  });

  it("cleanupTeamState removes team directory", async () => {
    const cwd = await mkTempDir();
    await createTeamState({ cwd, config: makeConfig("alpha"), tasks: [], workers: [] });
    await cleanupTeamState(cwd, "alpha");

    const config = await readTeamConfig(cwd, "alpha");
    expect(config).toBeNull();
  });
});
