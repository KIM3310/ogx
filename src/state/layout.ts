import { join, resolve } from 'node:path';
import { slugify } from '../utils/strings.js';

export function teamsRoot(cwd: string): string {
  return join(resolve(cwd), '.omg', 'state', 'teams');
}

export function normalizeTeamName(name: string): string {
  return slugify(name);
}

export function teamRoot(cwd: string, teamName: string): string {
  return join(teamsRoot(cwd), normalizeTeamName(teamName));
}

export function teamConfigPath(cwd: string, teamName: string): string {
  return join(teamRoot(cwd, teamName), 'config.json');
}

export function teamEventsPath(cwd: string, teamName: string): string {
  return join(teamRoot(cwd, teamName), 'events.jsonl');
}

export function teamTasksDir(cwd: string, teamName: string): string {
  return join(teamRoot(cwd, teamName), 'tasks');
}

export function teamWorkersDir(cwd: string, teamName: string): string {
  return join(teamRoot(cwd, teamName), 'workers');
}

export function teamArtifactsDir(cwd: string, teamName: string): string {
  return join(teamRoot(cwd, teamName), 'artifacts');
}

export function omgStateRoot(cwd: string): string {
  return join(resolve(cwd), '.omg', 'state');
}

export function taskFilePath(cwd: string, teamName: string, taskId: string): string {
  return join(teamTasksDir(cwd, teamName), `${taskId}.json`);
}

export function workerFilePath(cwd: string, teamName: string, workerName: string): string {
  return join(teamWorkersDir(cwd, teamName), `${workerName}.json`);
}

export function artifactFilePath(cwd: string, teamName: string, taskId: string): string {
  return join(teamArtifactsDir(cwd, teamName), `${taskId}.json`);
}
