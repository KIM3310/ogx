import path from "node:path";
import { z } from "zod";
import { copyDirectoryRecursive, pathExists, readJsonFile, writeJsonFile } from "../utils/fs.js";
import type { OgxPaths } from "../utils/paths.js";
import {
  configSchema,
  runStateSchema,
  teamStateSchema,
  workerInboxSchema,
  workerStateSchema,
  type OgxConfig,
  type RunState,
  type TeamState,
  type WorkerInbox,
  type WorkerState,
} from "./schemas.js";

async function readWithSchema<S extends z.ZodTypeAny>(
  filePath: string,
  schema: S
): Promise<z.output<S> | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }

  const raw = await readJsonFile<unknown>(filePath);
  return schema.parse(raw) as z.output<S>;
}

export async function readConfig(paths: OgxPaths): Promise<OgxConfig | null> {
  return readWithSchema(paths.configPath, configSchema);
}

export async function writeConfig(paths: OgxPaths, config: OgxConfig): Promise<void> {
  await writeJsonFile(paths.configPath, configSchema.parse(config));
}

export async function ensureInstalledAssets(
  packageRoot: string,
  paths: OgxPaths,
  options?: { force?: boolean }
): Promise<void> {
  const force = options?.force ?? false;
  await copyDirectoryRecursive(path.join(packageRoot, "prompts"), paths.promptsDir, {
    force,
  });
  await copyDirectoryRecursive(path.join(packageRoot, "skills"), paths.skillsDir, {
    force,
  });
  await copyDirectoryRecursive(path.join(packageRoot, "templates"), paths.templatesDir, {
    force,
  });

  if (!(await pathExists(paths.configPath)) || force) {
    const templatePath = path.join(packageRoot, "templates", "config.template.json");
    const template = await readJsonFile<unknown>(templatePath);
    await writeConfig(paths, configSchema.parse(template));
  }
}

function teamStatePath(paths: OgxPaths, teamName: string): string {
  return path.join(paths.stateDir, `team.${teamName}.json`);
}

function workerStatePath(paths: OgxPaths, teamName: string, workerId: string): string {
  return path.join(paths.stateDir, `worker.${teamName}.${workerId}.json`);
}

function workerInboxPath(paths: OgxPaths, teamName: string, workerId: string): string {
  return path.join(paths.stateDir, `inbox.${teamName}.${workerId}.json`);
}

export function buildWorkerStatePath(paths: OgxPaths, teamName: string, workerId: string): string {
  return workerStatePath(paths, teamName, workerId);
}

export function buildWorkerInboxPath(paths: OgxPaths, teamName: string, workerId: string): string {
  return workerInboxPath(paths, teamName, workerId);
}

export async function readRunState(paths: OgxPaths): Promise<RunState | null> {
  return readWithSchema(path.join(paths.stateDir, "run.json"), runStateSchema);
}

export async function writeRunState(paths: OgxPaths, state: RunState): Promise<void> {
  await writeJsonFile(path.join(paths.stateDir, "run.json"), runStateSchema.parse(state));
}

export async function readTeamState(paths: OgxPaths, teamName: string): Promise<TeamState | null> {
  return readWithSchema(teamStatePath(paths, teamName), teamStateSchema);
}

export async function writeTeamState(
  paths: OgxPaths,
  teamName: string,
  state: TeamState
): Promise<void> {
  await writeJsonFile(teamStatePath(paths, teamName), teamStateSchema.parse(state));
}

export async function readWorkerState(
  paths: OgxPaths,
  teamName: string,
  workerId: string
): Promise<WorkerState | null> {
  return readWithSchema(workerStatePath(paths, teamName, workerId), workerStateSchema);
}

export async function writeWorkerState(
  paths: OgxPaths,
  teamName: string,
  workerId: string,
  state: WorkerState
): Promise<void> {
  await writeJsonFile(
    workerStatePath(paths, teamName, workerId),
    workerStateSchema.parse(state)
  );
}

export async function readWorkerInbox(
  paths: OgxPaths,
  teamName: string,
  workerId: string
): Promise<WorkerInbox | null> {
  return readWithSchema(workerInboxPath(paths, teamName, workerId), workerInboxSchema);
}

export async function writeWorkerInbox(
  paths: OgxPaths,
  teamName: string,
  workerId: string,
  inbox: WorkerInbox
): Promise<void> {
  await writeJsonFile(
    workerInboxPath(paths, teamName, workerId),
    workerInboxSchema.parse(inbox)
  );
}
