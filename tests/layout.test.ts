import { describe, expect, it } from "vitest";
import {
  teamsRoot,
  normalizeTeamName,
  teamRoot,
  teamConfigPath,
  teamEventsPath,
  teamTasksDir,
  teamWorkersDir,
  teamArtifactsDir,
  omgStateRoot,
  taskFilePath,
  workerFilePath,
  artifactFilePath,
} from "../src/state/layout.js";

describe("layout paths", () => {
  const cwd = "/projects/myapp";

  it("teamsRoot returns correct path", () => {
    expect(teamsRoot(cwd)).toContain(".omg/state/teams");
  });

  it("normalizeTeamName slugifies the name", () => {
    expect(normalizeTeamName("My Team")).toBe("my-team");
    expect(normalizeTeamName("alpha")).toBe("alpha");
  });

  it("teamRoot includes normalized team name", () => {
    const root = teamRoot(cwd, "My Team");
    expect(root).toContain("my-team");
    expect(root).toContain(".omg/state/teams");
  });

  it("teamConfigPath ends with config.json", () => {
    expect(teamConfigPath(cwd, "alpha")).toMatch(/config\.json$/);
  });

  it("teamEventsPath ends with events.jsonl", () => {
    expect(teamEventsPath(cwd, "alpha")).toMatch(/events\.jsonl$/);
  });

  it("teamTasksDir ends with tasks", () => {
    expect(teamTasksDir(cwd, "alpha")).toMatch(/\/tasks$/);
  });

  it("teamWorkersDir ends with workers", () => {
    expect(teamWorkersDir(cwd, "alpha")).toMatch(/\/workers$/);
  });

  it("teamArtifactsDir ends with artifacts", () => {
    expect(teamArtifactsDir(cwd, "alpha")).toMatch(/\/artifacts$/);
  });

  it("omgStateRoot returns .omg/state path", () => {
    expect(omgStateRoot(cwd)).toContain(".omg/state");
  });

  it("taskFilePath includes task id", () => {
    expect(taskFilePath(cwd, "alpha", "task-1")).toMatch(/task-1\.json$/);
  });

  it("workerFilePath includes worker name", () => {
    expect(workerFilePath(cwd, "alpha", "w1")).toMatch(/w1\.json$/);
  });

  it("artifactFilePath includes task id", () => {
    expect(artifactFilePath(cwd, "alpha", "task-1")).toMatch(/task-1\.json$/);
    expect(artifactFilePath(cwd, "alpha", "task-1")).toContain("artifacts");
  });
});
