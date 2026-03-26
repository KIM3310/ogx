import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { teamArtifactsDir, teamConfigPath, teamEventsPath, teamRoot, teamTasksDir, teamWorkersDir, taskFilePath, workerFilePath } from './layout.js';
import type { TeamConfig, TeamDependencyBlock, TeamEvent, TeamSummary, TeamTaskRecord, TeamWorkerRecord } from './types.js';
import { getDependencyBlocks, getReadyPendingTasks } from './task-graph.js';
import { ensureDir, listFiles, readJsonFile, removeDir, writeJsonFile } from '../utils/fs.js';

export async function createTeamState(input: {
  cwd: string;
  config: TeamConfig;
  tasks: TeamTaskRecord[];
  workers: TeamWorkerRecord[];
}): Promise<void> {
  await ensureDir(teamRoot(input.cwd, input.config.name));
  await ensureDir(teamTasksDir(input.cwd, input.config.name));
  await ensureDir(teamWorkersDir(input.cwd, input.config.name));
  await ensureDir(teamArtifactsDir(input.cwd, input.config.name));

  await writeJsonFile(teamConfigPath(input.cwd, input.config.name), input.config);
  for (const task of input.tasks) {
    await writeJsonFile(taskFilePath(input.cwd, input.config.name, task.id), task);
  }
  for (const worker of input.workers) {
    await writeJsonFile(workerFilePath(input.cwd, input.config.name, worker.name), worker);
  }
}

export async function readTeamConfig(cwd: string, teamName: string): Promise<TeamConfig | null> {
  return readJsonFile<TeamConfig>(teamConfigPath(cwd, teamName));
}

export async function writeTeamConfig(cwd: string, teamName: string, config: TeamConfig): Promise<void> {
  await writeJsonFile(teamConfigPath(cwd, teamName), config);
}

export async function readTask(cwd: string, teamName: string, taskId: string): Promise<TeamTaskRecord | null> {
  return readJsonFile<TeamTaskRecord>(taskFilePath(cwd, teamName, taskId));
}

export async function writeTask(cwd: string, teamName: string, task: TeamTaskRecord): Promise<void> {
  await writeJsonFile(taskFilePath(cwd, teamName, task.id), task);
}

export async function writeTasks(cwd: string, teamName: string, tasks: TeamTaskRecord[]): Promise<void> {
  for (const task of tasks) {
    await writeTask(cwd, teamName, task);
  }
}

export async function readWorker(cwd: string, teamName: string, workerName: string): Promise<TeamWorkerRecord | null> {
  return readJsonFile<TeamWorkerRecord>(workerFilePath(cwd, teamName, workerName));
}

export async function writeWorker(cwd: string, teamName: string, worker: TeamWorkerRecord): Promise<void> {
  await writeJsonFile(workerFilePath(cwd, teamName, worker.name), worker);
}

export async function writeWorkers(cwd: string, teamName: string, workers: TeamWorkerRecord[]): Promise<void> {
  for (const worker of workers) {
    await writeWorker(cwd, teamName, worker);
  }
}

export async function listTasks(cwd: string, teamName: string): Promise<TeamTaskRecord[]> {
  const files = (await listFiles(teamTasksDir(cwd, teamName))).filter((file) => file.endsWith('.json')).sort();
  const tasks = await Promise.all(files.map((file) => readJsonFile<TeamTaskRecord>(taskFilePath(cwd, teamName, file.replace(/\.json$/, '')))));
  return tasks.filter((task): task is TeamTaskRecord => task !== null);
}

export async function listWorkers(cwd: string, teamName: string): Promise<TeamWorkerRecord[]> {
  const files = (await listFiles(teamWorkersDir(cwd, teamName))).filter((file) => file.endsWith('.json')).sort();
  const workers = await Promise.all(files.map((file) => readJsonFile<TeamWorkerRecord>(workerFilePath(cwd, teamName, file.replace(/\.json$/, '')))));
  return workers.filter((worker): worker is TeamWorkerRecord => worker !== null);
}

export async function appendEvent(cwd: string, teamName: string, event: TeamEvent): Promise<void> {
  await ensureDir(teamRoot(cwd, teamName));
  await appendFile(teamEventsPath(cwd, teamName), `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readRecentEvents(cwd: string, teamName: string, limit = 20): Promise<TeamEvent[]> {
  try {
    const raw = await readFile(teamEventsPath(cwd, teamName), 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as TeamEvent);
  } catch {
    return [];
  }
}

export async function listTeamNames(cwd: string): Promise<string[]> {
  const root = join(cwd, '.omg', 'state', 'teams');
  const names = await listFiles(root);
  return names.sort();
}

export async function getTeamSummary(cwd: string, teamName: string): Promise<TeamSummary | null> {
  const config = await readTeamConfig(cwd, teamName);
  if (!config) return null;

  const [tasks, workers] = await Promise.all([
    listTasks(cwd, teamName),
    listWorkers(cwd, teamName),
  ]);

  const counts = {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === 'pending').length,
    running: tasks.filter((task) => task.status === 'running').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  };

  const dependencyBlocks: TeamDependencyBlock[] = getDependencyBlocks(tasks);
  const readyTaskIds = getReadyPendingTasks(tasks).map((task) => task.id);

  return {
    config,
    tasks,
    workers,
    counts,
    activeWorkers: workers.filter((worker) => worker.status === 'running' || worker.status === 'waiting').length,
    waitingWorkers: workers.filter((worker) => worker.status === 'waiting').length,
    readyTaskCount: readyTaskIds.length,
    readyTaskIds,
    dependencyBlockedTasks: dependencyBlocks.length,
    dependencyBlocks,
    allTerminal: tasks.every((task) => task.status === 'completed' || task.status === 'failed'),
  };
}

export async function cleanupTeamState(cwd: string, teamName: string): Promise<void> {
  await removeDir(teamRoot(cwd, teamName));
}
