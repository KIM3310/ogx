import type { TeamDependencyBlock, TeamTaskRecord } from './types.js';

function dependentCount(taskId: string, tasks: TeamTaskRecord[]): number {
  return tasks.filter((task) => (task.dependsOn ?? []).includes(taskId)).length;
}

function explicitPriority(task: TeamTaskRecord): number {
  return typeof task.priority === 'number' && Number.isFinite(task.priority) ? task.priority : 0;
}

function createdAtTime(task: TeamTaskRecord): number {
  const value = Date.parse(task.createdAt);
  return Number.isFinite(value) ? value : 0;
}

export function compareTaskPriority(a: TeamTaskRecord, b: TeamTaskRecord, tasks: TeamTaskRecord[]): number {
  const aPriority = explicitPriority(a);
  const bPriority = explicitPriority(b);
  if (aPriority !== bPriority) return bPriority - aPriority;

  const aDependents = dependentCount(a.id, tasks);
  const bDependents = dependentCount(b.id, tasks);
  if (aDependents !== bDependents) return bDependents - aDependents;

  const aDeps = a.dependsOn?.length ?? 0;
  const bDeps = b.dependsOn?.length ?? 0;
  if (aDeps !== bDeps) return aDeps - bDeps;

  const aCreated = createdAtTime(a);
  const bCreated = createdAtTime(b);
  if (aCreated !== bCreated) return aCreated - bCreated;

  return a.id.localeCompare(b.id);
}

export function getDependencyBlocks(tasks: TeamTaskRecord[]): TeamDependencyBlock[] {
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  return tasks
    .filter((task) => task.status === 'pending' && (task.dependsOn?.length ?? 0) > 0)
    .map((task) => {
      const waitingOn = (task.dependsOn ?? []).filter((dependencyId) => taskById.get(dependencyId)?.status !== 'completed');
      return {
        taskId: task.id,
        waitingOn,
      };
    })
    .filter((block) => block.waitingOn.length > 0)
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export function getReadyPendingTasks(tasks: TeamTaskRecord[]): TeamTaskRecord[] {
  const blockedIds = new Set(getDependencyBlocks(tasks).map((block) => block.taskId));
  return tasks
    .filter((task) => task.status === 'pending' && !task.lease && !blockedIds.has(task.id))
    .sort((a, b) => compareTaskPriority(a, b, tasks));
}
