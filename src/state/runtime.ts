import { info, warn } from "../utils/logger.js";
import type { OgxPaths } from "../utils/paths.js";
import { readRunState, writeRunState } from "./store.js";
import type { RunState } from "./schemas.js";

export async function markRunStarted(
  paths: OgxPaths,
  payload: Pick<RunState, "args" | "command" | "mode" | "pid" | "scope">
): Promise<void> {
  const state: RunState = {
    ...payload,
    startedAt: new Date().toISOString(),
    status: "running",
  };
  await writeRunState(paths, state);
}

export async function markRunStopped(paths: OgxPaths): Promise<void> {
  const state = await readRunState(paths);
  if (!state) {
    return;
  }
  await writeRunState(paths, {
    ...state,
    status: "stopped",
    stoppedAt: new Date().toISOString(),
  });
}

export async function printRunStatus(paths: OgxPaths): Promise<void> {
  const state = await readRunState(paths);
  if (!state) {
    info("No active run state found.");
    return;
  }

  info(`mode=${state.mode} status=${state.status} pid=${state.pid}`);
  info(`command=${state.command} args=${state.args.join(" ")}`);
  info(`startedAt=${state.startedAt}`);
  if (state.stoppedAt) {
    info(`stoppedAt=${state.stoppedAt}`);
  }
}

export async function assertCancellable(paths: OgxPaths): Promise<RunState> {
  const state = await readRunState(paths);
  if (!state || state.status !== "running") {
    throw new Error("No running process to cancel.");
  }
  return state;
}

export function reportCancelled(pid: number): void {
  warn(`Sent SIGTERM to pid=${pid}`);
}
