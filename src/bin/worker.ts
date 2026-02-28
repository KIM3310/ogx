import path from "node:path";
import { dispatchTurnComplete } from "../hooks/dispatcher.js";
import { type Task } from "../state/schemas.js";
import {
  readWorkerInbox,
  readConfig,
  readWorkerState,
  writeWorkerInbox,
  writeWorkerState,
} from "../state/store.js";
import { ensureDir } from "../utils/fs.js";
import { info, warn } from "../utils/logger.js";
import { buildOgxPathsFromRoot, ensureOgxBaseDirs } from "../utils/paths.js";
import { runCommand } from "../utils/process.js";
import { assertSafeTeamName, assertSafeWorkerId, parseScope, type Scope } from "../utils/validate.js";

interface WorkerArgs {
  intervalMs: number;
  rootDir: string;
  scope: Scope;
  teamName: string;
  workerId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseWorkerArgs(argv: string[]): WorkerArgs {
  const values: Record<string, string> = {};

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    values[key] = value;
    i += 1;
  }

  const scope = parseScope(values.scope);
  const rootDir = values.root;
  const teamName = assertSafeTeamName(values.team ?? "");
  const workerId = assertSafeWorkerId(values.worker ?? "");
  const intervalMs = values.interval ? Number(values.interval) : 2000;

  if (!rootDir) {
    throw new Error("--root is required");
  }
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new Error("--interval must be a positive integer");
  }

  return {
    scope,
    rootDir: path.resolve(rootDir),
    teamName,
    workerId,
    intervalMs,
  };
}

async function executeTaskPayload(
  payload: string,
  args: WorkerArgs,
  workerHome: string,
  geminiCommand: string
): Promise<string> {
  const mode = process.env.OGX_WORKER_MODE ?? "echo";
  if (mode !== "gemini") {
    return `echo:${payload.slice(0, 120)}`;
  }

  const env = {
    ...process.env,
    HOME: args.scope === "project" ? workerHome : process.env.HOME,
    OGX_SCOPE: args.scope,
    OGX_HOME: args.rootDir,
  };

  const result = await runCommand(geminiCommand, ["-p", payload], {
    timeoutMs: 120000,
    env,
  });

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `Gemini failed with code ${result.code}`);
  }

  return result.stdout.slice(0, 400);
}

function markTaskRunning(task: Task): void {
  task.status = "running";
  task.updatedAt = nowIso();
}

function markTaskDone(task: Task): void {
  task.status = "done";
  task.updatedAt = nowIso();
  delete task.error;
}

function markTaskFailed(task: Task, reason: string): void {
  task.status = "failed";
  task.updatedAt = nowIso();
  task.error = reason;
}

async function main(): Promise<void> {
  const args = parseWorkerArgs(process.argv);
  const paths = buildOgxPathsFromRoot(args.scope, args.rootDir);
  await ensureOgxBaseDirs(paths);
  const config = await readConfig(paths);
  const geminiCommand =
    process.env.OGX_GEMINI_CMD ?? config?.runtime.geminiCommand ?? "gemini";

  if (args.scope === "project") {
    await ensureDir(paths.homeDir);
  }

  let stopRequested = false;
  process.on("SIGINT", () => {
    stopRequested = true;
  });
  process.on("SIGTERM", () => {
    stopRequested = true;
  });

  const existingState = await readWorkerState(paths, args.teamName, args.workerId);
  await writeWorkerState(paths, args.teamName, args.workerId, {
    teamName: args.teamName,
    workerId: args.workerId,
    status: "idle",
    processedTasks: existingState?.processedTasks ?? 0,
    lastHeartbeatAt: nowIso(),
  });

  info(`worker started team=${args.teamName} worker=${args.workerId}`);

  while (!stopRequested) {
    const inbox = (await readWorkerInbox(paths, args.teamName, args.workerId)) ?? { tasks: [] };
    const index = inbox.tasks.findIndex((task) => task.status === "pending");

    if (index < 0) {
      const state = await readWorkerState(paths, args.teamName, args.workerId);
      await writeWorkerState(paths, args.teamName, args.workerId, {
        teamName: args.teamName,
        workerId: args.workerId,
        status: "idle",
        processedTasks: state?.processedTasks ?? 0,
        lastHeartbeatAt: nowIso(),
      });
      await sleep(args.intervalMs);
      continue;
    }

    const task = inbox.tasks[index];
    if (!task) {
      await sleep(args.intervalMs);
      continue;
    }

    markTaskRunning(task);
    await writeWorkerInbox(paths, args.teamName, args.workerId, inbox);

    const currentState = await readWorkerState(paths, args.teamName, args.workerId);
    await writeWorkerState(paths, args.teamName, args.workerId, {
      teamName: args.teamName,
      workerId: args.workerId,
      status: "busy",
      currentTaskId: task.id,
      processedTasks: currentState?.processedTasks ?? 0,
      lastHeartbeatAt: nowIso(),
    });

    try {
      const summary = await executeTaskPayload(
        task.payload,
        args,
        paths.homeDir,
        geminiCommand
      );
      markTaskDone(task);
      await writeWorkerInbox(paths, args.teamName, args.workerId, inbox);

      const latestState = await readWorkerState(paths, args.teamName, args.workerId);
      await writeWorkerState(paths, args.teamName, args.workerId, {
        teamName: args.teamName,
        workerId: args.workerId,
        status: "idle",
        processedTasks: (latestState?.processedTasks ?? 0) + 1,
        lastHeartbeatAt: nowIso(),
      });

      await dispatchTurnComplete(paths, {
        actor: `${args.teamName}/${args.workerId}`,
        eventId: task.id,
        summary,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warn(`task failed id=${task.id} reason=${reason}`);
      markTaskFailed(task, reason);
      await writeWorkerInbox(paths, args.teamName, args.workerId, inbox);

      const latestState = await readWorkerState(paths, args.teamName, args.workerId);
      await writeWorkerState(paths, args.teamName, args.workerId, {
        teamName: args.teamName,
        workerId: args.workerId,
        status: "idle",
        processedTasks: (latestState?.processedTasks ?? 0) + 1,
        lastHeartbeatAt: nowIso(),
      });
    }
  }

  const beforeStop = await readWorkerState(paths, args.teamName, args.workerId);
  await writeWorkerState(paths, args.teamName, args.workerId, {
    teamName: args.teamName,
    workerId: args.workerId,
    status: "stopped",
    processedTasks: beforeStop?.processedTasks ?? 0,
    lastHeartbeatAt: nowIso(),
  });

  info(`worker stopped team=${args.teamName} worker=${args.workerId}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ogx-worker] ${message}`);
  process.exitCode = 1;
});
