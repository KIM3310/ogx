import { basename, join, resolve } from 'node:path';
import { ensureDir, readJsonFile, writeJsonFile } from '../utils/fs.js';

export type ApprovalMode = 'default' | 'auto_edit' | 'yolo' | 'plan';
export type TeamLaunchMode = 'process' | 'tmux';

export interface OmgProjectConfig {
  schemaVersion: 1;
  projectName: string;
  geminiBinary?: string;
  defaultModel?: string;
  workerCount: number;
  approvalMode: ApprovalMode;
  includeDirectories: string[];
  teamLaunchMode: TeamLaunchMode;
  hudRefreshMs: number;
  mcpServerName: string;
  deepRestartMaxAttempts: number;
}

export const DEFAULT_PROJECT_CONFIG: OmgProjectConfig = {
  schemaVersion: 1,
  projectName: '',
  workerCount: 3,
  approvalMode: 'yolo',
  includeDirectories: [],
  teamLaunchMode: 'process',
  hudRefreshMs: 1000,
  mcpServerName: 'oh-my-gemini-project',
  deepRestartMaxAttempts: 3,
};

export function omgRoot(cwd: string): string {
  return join(resolve(cwd), '.omg');
}

export function projectConfigPath(cwd: string): string {
  return join(omgRoot(cwd), 'config.json');
}

export async function loadProjectConfig(cwd: string): Promise<OmgProjectConfig> {
  const resolvedCwd = resolve(cwd);
  const existing = await readJsonFile<OmgProjectConfig>(projectConfigPath(resolvedCwd));

  return {
    ...DEFAULT_PROJECT_CONFIG,
    projectName: basename(resolvedCwd),
    ...(existing ?? {}),
  };
}

export async function saveProjectConfig(
  cwd: string,
  overrides: Partial<OmgProjectConfig> = {},
): Promise<OmgProjectConfig> {
  const resolvedCwd = resolve(cwd);
  await ensureDir(omgRoot(resolvedCwd));
  const next = {
    ...(await loadProjectConfig(resolvedCwd)),
    ...overrides,
    schemaVersion: 1 as const,
    projectName: overrides.projectName ?? basename(resolvedCwd),
  };
  await writeJsonFile(projectConfigPath(resolvedCwd), next);
  return next;
}
