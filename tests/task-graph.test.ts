import { describe, expect, it } from "vitest";
import {
  compareTaskPriority,
  getDependencyBlocks,
  getReadyPendingTasks,
} from "../src/state/task-graph.js";
import type { TeamTaskRecord } from "../src/state/types.js";

function makeTask(overrides: Partial<TeamTaskRecord> & { id: string }): TeamTaskRecord {
  return {
    subject: overrides.id,
    description: "",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("compareTaskPriority", () => {
  it("sorts higher explicit priority first", () => {
    const a = makeTask({ id: "a", priority: 1 });
    const b = makeTask({ id: "b", priority: 5 });
    const tasks = [a, b];
    expect(compareTaskPriority(a, b, tasks)).toBeGreaterThan(0);
    expect(compareTaskPriority(b, a, tasks)).toBeLessThan(0);
  });

  it("uses dependent count as tiebreaker when priorities match", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    const c = makeTask({ id: "c", dependsOn: ["a"] });
    const d = makeTask({ id: "d", dependsOn: ["a"] });
    const tasks = [a, b, c, d];
    // a has 2 dependents, b has 0
    expect(compareTaskPriority(a, b, tasks)).toBeLessThan(0);
  });

  it("uses fewer own dependencies as next tiebreaker", () => {
    const a = makeTask({ id: "a", dependsOn: ["x"] });
    const b = makeTask({ id: "b", dependsOn: ["x", "y"] });
    const tasks = [a, b];
    expect(compareTaskPriority(a, b, tasks)).toBeLessThan(0);
  });

  it("uses createdAt as next tiebreaker", () => {
    const a = makeTask({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = makeTask({ id: "b", createdAt: "2026-01-02T00:00:00.000Z" });
    const tasks = [a, b];
    expect(compareTaskPriority(a, b, tasks)).toBeLessThan(0);
  });

  it("falls back to id alphabetical ordering", () => {
    const a = makeTask({ id: "alpha" });
    const b = makeTask({ id: "beta" });
    const tasks = [a, b];
    expect(compareTaskPriority(a, b, tasks)).toBeLessThan(0);
  });

  it("treats missing priority as 0", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b", priority: 0 });
    const tasks = [a, b];
    // Both priority 0, same dependents/deps, same time, "a" < "b"
    expect(compareTaskPriority(a, b, tasks)).toBeLessThan(0);
  });
});

describe("getDependencyBlocks", () => {
  it("returns empty when no tasks have dependencies", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    expect(getDependencyBlocks(tasks)).toEqual([]);
  });

  it("identifies tasks blocked by incomplete dependencies", () => {
    const tasks = [
      makeTask({ id: "a", status: "pending" }),
      makeTask({ id: "b", status: "pending", dependsOn: ["a"] }),
    ];
    const blocks = getDependencyBlocks(tasks);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].taskId).toBe("b");
    expect(blocks[0].waitingOn).toEqual(["a"]);
  });

  it("does not block when dependency is completed", () => {
    const tasks = [
      makeTask({ id: "a", status: "completed" }),
      makeTask({ id: "b", status: "pending", dependsOn: ["a"] }),
    ];
    expect(getDependencyBlocks(tasks)).toHaveLength(0);
  });

  it("ignores non-pending tasks even if they have unmet deps", () => {
    const tasks = [
      makeTask({ id: "a", status: "pending" }),
      makeTask({ id: "b", status: "running", dependsOn: ["a"] }),
    ];
    expect(getDependencyBlocks(tasks)).toHaveLength(0);
  });

  it("handles multiple unmet dependencies", () => {
    const tasks = [
      makeTask({ id: "a", status: "pending" }),
      makeTask({ id: "b", status: "pending" }),
      makeTask({ id: "c", status: "pending", dependsOn: ["a", "b"] }),
    ];
    const blocks = getDependencyBlocks(tasks);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].waitingOn).toContain("a");
    expect(blocks[0].waitingOn).toContain("b");
  });

  it("sorts blocks by taskId", () => {
    const tasks = [
      makeTask({ id: "x", status: "pending" }),
      makeTask({ id: "c", status: "pending", dependsOn: ["x"] }),
      makeTask({ id: "a", status: "pending", dependsOn: ["x"] }),
    ];
    const blocks = getDependencyBlocks(tasks);
    expect(blocks[0].taskId).toBe("a");
    expect(blocks[1].taskId).toBe("c");
  });
});

describe("getReadyPendingTasks", () => {
  it("returns pending tasks with no dependencies", () => {
    const tasks = [
      makeTask({ id: "a", status: "pending" }),
      makeTask({ id: "b", status: "running" }),
      makeTask({ id: "c", status: "completed" }),
    ];
    const ready = getReadyPendingTasks(tasks);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("a");
  });

  it("excludes leased tasks", () => {
    const tasks = [
      makeTask({
        id: "a",
        status: "pending",
        lease: { owner: "w1", token: "tok", leasedUntil: "2099-01-01T00:00:00Z" },
      }),
      makeTask({ id: "b", status: "pending" }),
    ];
    const ready = getReadyPendingTasks(tasks);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("b");
  });

  it("excludes dependency-blocked tasks", () => {
    const tasks = [
      makeTask({ id: "a", status: "pending" }),
      makeTask({ id: "b", status: "pending", dependsOn: ["a"] }),
    ];
    const ready = getReadyPendingTasks(tasks);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("a");
  });

  it("returns tasks sorted by priority", () => {
    const tasks = [
      makeTask({ id: "low", status: "pending", priority: 1 }),
      makeTask({ id: "high", status: "pending", priority: 10 }),
    ];
    const ready = getReadyPendingTasks(tasks);
    expect(ready[0].id).toBe("high");
    expect(ready[1].id).toBe("low");
  });

  it("returns empty when all tasks are terminal", () => {
    const tasks = [
      makeTask({ id: "a", status: "completed" }),
      makeTask({ id: "b", status: "failed" }),
    ];
    expect(getReadyPendingTasks(tasks)).toHaveLength(0);
  });
});
