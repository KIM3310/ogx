import { existsSync } from "node:fs";
import path from "node:path";
import type { TeamState } from "../state/schemas.js";
import {
  buildWorkerInboxPath,
  buildWorkerStatePath,
  readTeamState,
  readWorkerState,
  writeTeamState,
  writeWorkerInbox,
  writeWorkerState,
} from "../state/store.js";
import { info } from "../utils/logger.js";
import type { OgxPaths } from "../utils/paths.js";
import { resolvePackageRoot } from "../utils/paths.js";
import { buildShellCommand } from "../utils/shell.js";
import {
  assertPositiveInt,
  assertSafeTeamName,
  assertSafeWorkerId,
  type Scope,
} from "../utils/validate.js";
import {
  isTmuxAvailable,
  tmuxCreateSession,
  tmuxCreateWindow,
  tmuxKillSession,
  tmuxSessionExists,
} from "./tmux.js";

export interface TeamStartOptions {
  paths: OgxPaths;
  scope: Scope;
  teamName: string;
  workers: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sessionName(teamName: string): string {
  return `ogx-${teamName}`;
}

function workerCommand(
  packageRoot: string,
  paths: OgxPaths,
  scope: Scope,
  teamName: string,
  workerId: string
): string {
  const distWorker = path.join(packageRoot, "dist", "bin", "worker.js");
  if (!existsSync(distWorker)) {
    throw new Error("Worker entrypoint not found. Run `npm run build` first.");
  }

  const tokens = [
    process.execPath,
    distWorker,
    "--scope",
    scope,
    "--root",
    paths.rootDir,
    "--team",
    teamName,
    "--worker",
    workerId,
  ];
  return buildShellCommand(tokens);
}

export async function teamStart(options: TeamStartOptions): Promise<TeamState> {
  const workers = assertPositiveInt(options.workers, "workers");
  const teamName = assertSafeTeamName(options.teamName);

  if (!(await isTmuxAvailable())) {
    throw new Error("tmux is not available. Install tmux first.");
  }

  const packageRoot = resolvePackageRoot(import.meta.url);
  const tmuxSession = sessionName(teamName);
  if (await tmuxSessionExists(tmuxSession)) {
    throw new Error(`tmux session already exists: ${tmuxSession}`);
  }

  const workerRefs: TeamState["workers"] = [];
  for (let i = 0; i < workers; i += 1) {
    const workerId = assertSafeWorkerId(`w${i + 1}`);
    const inboxPath = buildWorkerInboxPath(options.paths, teamName, workerId);
    const statePath = buildWorkerStatePath(options.paths, teamName, workerId);
    const windowName = workerId;

    workerRefs.push({ inboxPath, statePath, windowName, workerId });

    await writeWorkerInbox(options.paths, teamName, workerId, { tasks: [] });
    await writeWorkerState(options.paths, teamName, workerId, {
      teamName,
      workerId,
      status: "idle",
      processedTasks: 0,
      lastHeartbeatAt: nowIso(),
    });
  }

  const first = workerRefs[0];
  if (!first) {
    throw new Error("No workers initialized");
  }

  await tmuxCreateSession(
    tmuxSession,
    first.windowName,
    workerCommand(packageRoot, options.paths, options.scope, teamName, first.workerId)
  );

  for (let i = 1; i < workerRefs.length; i += 1) {
    const worker = workerRefs[i];
    if (!worker) {
      continue;
    }
    await tmuxCreateWindow(
      tmuxSession,
      worker.windowName,
      workerCommand(packageRoot, options.paths, options.scope, teamName, worker.workerId)
    );
  }

  const state: TeamState = {
    teamName,
    scope: options.scope,
    sessionName: tmuxSession,
    status: "running",
    workers: workerRefs,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await writeTeamState(options.paths, teamName, state);
  info(`Team started: ${teamName} (${workers} workers)`);
  return state;
}

export async function teamStatus(
  paths: OgxPaths,
  teamName: string
): Promise<{
  sessionAlive: boolean;
  state: TeamState | null;
  workers: Array<{ workerId: string; status: string; processedTasks: number }>;
}> {
  const name = assertSafeTeamName(teamName);
  const state = await readTeamState(paths, name);
  if (!state) {
    return { sessionAlive: false, state: null, workers: [] };
  }

  const sessionAlive = await tmuxSessionExists(state.sessionName);
  const workers: Array<{ workerId: string; status: string; processedTasks: number }> = [];

  for (const worker of state.workers) {
    const workerState = await readWorkerState(paths, name, worker.workerId);
    workers.push({
      workerId: worker.workerId,
      status: workerState?.status ?? "unknown",
      processedTasks: workerState?.processedTasks ?? 0,
    });
  }

  return { sessionAlive, state, workers };
}

export async function teamResume(paths: OgxPaths, teamName: string): Promise<TeamState> {
  const name = assertSafeTeamName(teamName);
  const state = await readTeamState(paths, name);
  if (!state) {
    throw new Error(`No saved team state: ${name}`);
  }

  if (await tmuxSessionExists(state.sessionName)) {
    info(`Team already running: ${name}`);
    return state;
  }

  return teamStart({
    paths,
    scope: state.scope,
    teamName: name,
    workers: state.workers.length,
  });
}

export async function teamShutdown(paths: OgxPaths, teamName: string): Promise<void> {
  const name = assertSafeTeamName(teamName);
  const state = await readTeamState(paths, name);
  if (!state) {
    throw new Error(`No saved team state: ${name}`);
  }

  if (await tmuxSessionExists(state.sessionName)) {
    await tmuxKillSession(state.sessionName);
  }

  await writeTeamState(paths, name, {
    ...state,
    status: "stopped",
    updatedAt: nowIso(),
  });

  info(`Team shutdown: ${name}`);
}
