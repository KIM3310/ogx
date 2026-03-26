import { basename, resolve } from 'node:path';
import { listTeamNames, getTeamSummary, readRecentEvents } from '../state/team-store.js';
import type { TeamSummary } from '../state/types.js';

export interface HudTeamSnapshot {
  name: string;
  launchMode: 'process' | 'tmux';
  counts: TeamSummary['counts'];
  activeWorkers: number;
  waitingWorkers: number;
  readyTaskCount: number;
  readyTaskIds: string[];
  dependencyBlockedTasks: number;
  workerCount: number;
  allTerminal: boolean;
  lastEvent?: string;
  waitReasons?: string[];
  dependencyPreview?: string[];
  graphLines?: string[];
}

export interface HudSnapshot {
  projectName: string;
  cwd: string;
  teamCount: number;
  activeTeamCount: number;
  totalRunningTasks: number;
  totalCompletedTasks: number;
  totalFailedTasks: number;
  teams: HudTeamSnapshot[];
  generatedAt: string;
}

export async function readHudSnapshot(cwd: string, teamFilter?: string): Promise<HudSnapshot> {
  const resolvedCwd = resolve(cwd);
  const allNames = teamFilter ? [teamFilter] : await listTeamNames(resolvedCwd);
  const summaries = await Promise.all(allNames.map((name) => getTeamSummary(resolvedCwd, name)));
  const validSummaries = summaries.filter((summary): summary is TeamSummary => summary !== null);

  const teams = await Promise.all(validSummaries.map(async (summary) => {
    const lastEvent = (await readRecentEvents(resolvedCwd, summary.config.name, 1))[0];
    return {
      name: summary.config.name,
      launchMode: summary.config.launchMode,
      counts: summary.counts,
      activeWorkers: summary.activeWorkers,
      waitingWorkers: summary.waitingWorkers,
      readyTaskCount: summary.readyTaskCount,
      readyTaskIds: summary.readyTaskIds,
      dependencyBlockedTasks: summary.dependencyBlockedTasks,
      workerCount: summary.config.workerCount,
      allTerminal: summary.allTerminal,
      ...(summary.dependencyBlocks.length > 0
        ? {
          dependencyPreview: summary.dependencyBlocks
            .slice(0, 2)
            .map((block) => `${block.taskId}<-${block.waitingOn.join(',')}`),
        }
        : {}),
      ...(summary.tasks.length > 0
        ? {
          graphLines: summary.tasks
            .slice(0, 3)
            .map((task) => {
              const status =
                task.status === 'completed' ? 'done'
                  : task.status === 'running' ? 'run'
                    : task.status === 'failed' ? 'fail'
                      : 'pend';
              const priority = typeof task.priority === 'number' ? `p${task.priority}` : 'p0';
              const deps = (task.dependsOn ?? []).length > 0 ? ` <= ${(task.dependsOn ?? []).join(',')}` : '';
              return `${task.id}[${status}|${priority}]${deps}`;
            }),
        }
        : {}),
      ...(summary.workers.some((worker) => typeof worker.waitReason === 'string' && worker.waitReason.trim() !== '')
        ? {
          waitReasons: summary.workers
            .map((worker) => worker.waitReason?.trim())
            .filter((reason): reason is string => Boolean(reason)),
        }
        : {}),
      ...(lastEvent ? { lastEvent: lastEvent.message } : {}),
    };
  }));

  return {
    projectName: basename(resolvedCwd),
    cwd: resolvedCwd,
    teamCount: teams.length,
    activeTeamCount: teams.filter((team) => !team.allTerminal).length,
    totalRunningTasks: teams.reduce((sum, team) => sum + team.counts.running, 0),
    totalCompletedTasks: teams.reduce((sum, team) => sum + team.counts.completed, 0),
    totalFailedTasks: teams.reduce((sum, team) => sum + team.counts.failed, 0),
    teams,
    generatedAt: new Date().toISOString(),
  };
}
