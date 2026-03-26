import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadProjectConfig, type ApprovalMode, type TeamLaunchMode } from '../config/project.js';
import { runHarness } from '../harness/runner.js';
import { appendEvent, cleanupTeamState, createTeamState, getTeamSummary, listTasks, listWorkers, readTask, readTeamConfig, readWorker, writeTask, writeTasks, writeTeamConfig, writeWorker, writeWorkers } from '../state/team-store.js';
import type { TeamConfig, TeamTaskLease, TeamTaskRecord, TeamWorkerRecord, TeamSummary, WorkerStatus } from '../state/types.js';
import { getReadyPendingTasks } from '../state/task-graph.js';
import { artifactFilePath, normalizeTeamName } from '../state/layout.js';
import { buildPlanCriticPrompt, buildPlanVerifierPrompt, buildPlannerPrompt, buildWorkerPrompt, parsePlanValidation, parsePlannedTasks, parseWorkerOutcome, type PlannedTask, type PlanValidation } from './prompts.js';
import { ensureDir, writeJsonFile } from '../utils/fs.js';
import { nowIso, slugify, timestampTag } from '../utils/strings.js';
import { createTmuxTeamSession, isTmuxInstalled, killTmuxSession, listTmuxPanes, listTmuxWindows, tmuxSessionExists } from '../tmux/session.js';

const LEASE_STALE_HEARTBEAT_MS = 20_000;
const LEASE_HARD_RECLAIM_MS = 60_000;

function cliEntryPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), '..', 'cli', 'index.js');
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function buildFallbackTasks(rootTask: string, workerCount: number): PlannedTask[] {
  const taskCount = Math.max(1, workerCount);
  return Array.from({ length: taskCount }, (_value, index) => ({
    id: `task-${index + 1}`,
    subject: `Workstream ${index + 1}`,
    description: `${rootTask} (focus area ${index + 1})`,
  }));
}

function normalizeTaskId(raw: string | undefined, index: number): string {
  const fallback = `task-${index + 1}`;
  if (!raw) return fallback;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
}

function createLease(owner: string): TeamTaskLease {
  return {
    owner,
    token: randomUUID(),
    leasedUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

function isLeaseActive(lease: TeamTaskLease | undefined): boolean {
  if (!lease) return false;
  return new Date(lease.leasedUntil).getTime() > Date.now();
}

function requireTaskWorkerName(task: TeamTaskRecord): string {
  if (!task.workerName) {
    throw new Error(`task_worker_unassigned:${task.id}`);
  }
  return task.workerName;
}

async function recordWorkerPulse(
  cwd: string,
  teamName: string,
  workerName: string,
  taskId: string,
  leaseToken: string,
  updates: Partial<TeamWorkerRecord> = {},
): Promise<void> {
  const [worker, task] = await Promise.all([
    readWorker(cwd, teamName, workerName),
    readTask(cwd, teamName, taskId),
  ]);
  const heartbeatAt = nowIso();

  if (worker) {
    await writeWorker(cwd, teamName, {
      ...worker,
      ...updates,
      lastHeartbeatAt: heartbeatAt,
      heartbeatCount: (worker.heartbeatCount ?? 0) + 1,
    });
  }

  if (task?.lease?.token === leaseToken) {
    await writeTask(cwd, teamName, {
      ...task,
      lease: {
        ...task.lease,
        leasedUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
      },
    });
  }
}

function startWorkerRuntimePulse(input: {
  cwd: string;
  teamName: string;
  workerName: string;
  taskId: string;
  leaseToken: string;
}) {
  let stopped = false;
  const tick = async (updates: Partial<TeamWorkerRecord> = {}) => {
    if (stopped) return;
    await recordWorkerPulse(input.cwd, input.teamName, input.workerName, input.taskId, input.leaseToken, updates);
  };
  const timer = setInterval(() => {
    void tick();
  }, 5000);
  return {
    tick,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

async function planTasks(input: {
  cwd: string;
  rootTask: string;
  maxTaskCount: number;
  model?: string;
  approvalMode: ApprovalMode;
  includeDirectories: string[];
  refinementNotes?: string[];
}): Promise<PlannedTask[]> {
  const result = await runHarness({
    cwd: input.cwd,
    prompt: buildPlannerPrompt(input.rootTask, input.maxTaskCount, input.refinementNotes ?? []),
    model: input.model,
    approvalMode: input.approvalMode,
    includeDirectories: input.includeDirectories,
    parseJsonResponse: false,
  });

  return parsePlannedTasks(result.responseText, input.maxTaskCount);
}

async function validatePlannedTasks(input: {
  cwd: string;
  rootTask: string;
  tasks: PlannedTask[];
  model?: string;
  approvalMode: ApprovalMode;
  includeDirectories: string[];
}): Promise<PlanValidation> {
  const result = await runHarness({
    cwd: input.cwd,
    prompt: buildPlanCriticPrompt(input.rootTask, input.tasks),
    model: input.model,
    approvalMode: input.approvalMode,
    includeDirectories: input.includeDirectories,
    parseJsonResponse: false,
  });
  return parsePlanValidation(result.responseText);
}

async function verifyPlannedTasks(input: {
  cwd: string;
  rootTask: string;
  tasks: PlannedTask[];
  model?: string;
  approvalMode: ApprovalMode;
  includeDirectories: string[];
}): Promise<PlanValidation> {
  const result = await runHarness({
    cwd: input.cwd,
    prompt: buildPlanVerifierPrompt(input.rootTask, input.tasks),
    model: input.model,
    approvalMode: input.approvalMode,
    includeDirectories: input.includeDirectories,
    parseJsonResponse: false,
  });
  return parsePlanValidation(result.responseText);
}

function createTaskRecords(tasks: PlannedTask[], _teamName: string): TeamTaskRecord[] {
  const resolvedIds = tasks.map((task, index) => normalizeTaskId(task.id, index));
  const idSet = new Set(resolvedIds);
  return tasks.map((task, index) => ({
    id: resolvedIds[index] ?? `task-${index + 1}`,
    subject: task.subject,
    description: task.description,
    ...(typeof task.priority === 'number' ? { priority: task.priority } : {}),
    ...(task.depends_on && task.depends_on.length > 0
      ? {
        dependsOn: task.depends_on
          .map((dep, depIndex) => normalizeTaskId(dep, depIndex))
          .filter((dep) => dep !== (resolvedIds[index] ?? '') && idSet.has(dep)),
      }
      : {}),
    status: 'pending',
    createdAt: nowIso(),
  }));
}

function createWorkerRecords(workerCount: number): TeamWorkerRecord[] {
  return Array.from({ length: Math.max(1, workerCount) }, (_value, index) => ({
    name: `worker-${index + 1}`,
    status: 'idle',
    taskId: undefined,
  }));
}

export interface StartTeamOptions {
  cwd: string;
  task: string;
  name?: string;
  workers?: number;
  model?: string;
  approvalMode?: ApprovalMode;
  includeDirectories?: string[];
  launchMode?: TeamLaunchMode;
}

interface RuntimeDependencies {
  planTasksFn: typeof planTasks;
  validatePlannedTasksFn: typeof validatePlannedTasks;
  verifyPlannedTasksFn: typeof verifyPlannedTasks;
}

const runtimeDependencies: RuntimeDependencies = {
  planTasksFn: planTasks,
  validatePlannedTasksFn: validatePlannedTasks,
  verifyPlannedTasksFn: verifyPlannedTasks,
};

export function setPlanTasksForTests(fn: typeof planTasks): void {
  runtimeDependencies.planTasksFn = fn;
}

export function resetPlanTasksForTests(): void {
  runtimeDependencies.planTasksFn = planTasks;
}

export function setValidatePlannedTasksForTests(fn: typeof validatePlannedTasks): void {
  runtimeDependencies.validatePlannedTasksFn = fn;
}

export function resetValidatePlannedTasksForTests(): void {
  runtimeDependencies.validatePlannedTasksFn = validatePlannedTasks;
}

export function setVerifyPlannedTasksForTests(fn: typeof verifyPlannedTasks): void {
  runtimeDependencies.verifyPlannedTasksFn = fn;
}

export function resetVerifyPlannedTasksForTests(): void {
  runtimeDependencies.verifyPlannedTasksFn = verifyPlannedTasks;
}

interface PreparedTeamPlan {
  config: TeamConfig;
  taskRecords: TeamTaskRecord[];
  workerRecords: TeamWorkerRecord[];
  planningNotes: string[];
}

function collectValidationFeedback(source: 'critic' | 'verifier', validation: PlanValidation): string[] {
  const feedback = [`${source}: ${validation.reason}`];
  for (const issue of validation.issues) {
    feedback.push(`${source} issue: ${issue}`);
  }
  return feedback;
}

async function prepareTeamPlan(input: {
  cwd: string;
  teamName: string;
  rootTask: string;
  workers?: number;
  model?: string;
  approvalMode?: ApprovalMode;
  includeDirectories?: string[];
  launchMode?: TeamLaunchMode;
}): Promise<PreparedTeamPlan> {
  const cwd = resolve(input.cwd);
  const projectConfig = await loadProjectConfig(cwd);
  const workerCount = Math.max(1, input.workers ?? projectConfig.workerCount);
  const maxTaskCount = Math.max(workerCount, workerCount * 3);
  const includeDirectories = Array.from(new Set([cwd, ...(input.includeDirectories ?? projectConfig.includeDirectories)]));
  const approvalMode = input.approvalMode ?? projectConfig.approvalMode;
  const launchMode = input.launchMode ?? projectConfig.teamLaunchMode;

  if (launchMode === 'tmux' && !isTmuxInstalled()) {
    throw new Error('tmux launch mode requested but tmux is not installed');
  }

  let plannedTasks: PlannedTask[];
  const planningNotes: string[] = [];
  const refinementNotes: string[] = [];
  const maxAttempts = Math.max(1, projectConfig.deepRestartMaxAttempts);
  try {
    let approvedTasks: PlannedTask[] | null = null;
    let lastAttemptTasks: PlannedTask[] | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const candidateTasks = await runtimeDependencies.planTasksFn({
      cwd,
      rootTask: input.rootTask,
      maxTaskCount,
      model: input.model ?? projectConfig.defaultModel,
      approvalMode,
      includeDirectories,
        refinementNotes,
      });
      lastAttemptTasks = candidateTasks;
      planningNotes.push(`planner attempt ${attempt}/${maxAttempts}: produced ${candidateTasks.length} task(s)`);

      let rejected = false;

      try {
        const validation = await runtimeDependencies.validatePlannedTasksFn({
          cwd,
          rootTask: input.rootTask,
          tasks: candidateTasks,
          model: input.model ?? projectConfig.defaultModel,
          approvalMode,
          includeDirectories,
        });
        planningNotes.push(`critic ${validation.verdict}: ${validation.reason}`);
        if (validation.verdict === 'reject') {
          refinementNotes.push(...collectValidationFeedback('critic', validation));
          rejected = true;
        }
      } catch (error) {
        planningNotes.push(`critic unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (rejected) {
        if (attempt < maxAttempts) {
          planningNotes.push('critic rejected plan; replanning with feedback');
          continue;
        }
      } else {
        try {
          const verification = await runtimeDependencies.verifyPlannedTasksFn({
            cwd,
            rootTask: input.rootTask,
            tasks: candidateTasks,
            model: input.model ?? projectConfig.defaultModel,
            approvalMode,
            includeDirectories,
          });
          planningNotes.push(`verifier ${verification.verdict}: ${verification.reason}`);
          if (verification.verdict === 'reject') {
            refinementNotes.push(...collectValidationFeedback('verifier', verification));
            rejected = true;
          }
        } catch (error) {
          planningNotes.push(`verifier unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (rejected) {
        if (attempt < maxAttempts) {
          planningNotes.push('verification gate rejected plan; replanning with feedback');
          continue;
        }
      } else {
        approvedTasks = candidateTasks;
        break;
      }
    }

    plannedTasks = approvedTasks ?? buildFallbackTasks(input.rootTask, workerCount);
    if (!approvedTasks) {
      if (lastAttemptTasks) {
        planningNotes.push('all planning attempts rejected; fallback graph applied');
      } else {
        planningNotes.push('planner attempts produced no accepted graph; fallback graph applied');
      }
    }
  } catch {
    plannedTasks = buildFallbackTasks(input.rootTask, workerCount);
    planningNotes.push('planner unavailable; fallback graph applied');
  }

  const taskRecords = createTaskRecords(plannedTasks, input.teamName);
  const workerRecords = createWorkerRecords(workerCount);
  const config: TeamConfig = {
    schemaVersion: 1,
    name: input.teamName,
    rootTask: input.rootTask,
    createdAt: nowIso(),
    cwd,
    workerCount,
    taskCount: taskRecords.length,
    model: input.model ?? projectConfig.defaultModel,
    approvalMode,
    includeDirectories,
    launchMode,
  };

  return {
    config,
    taskRecords,
    workerRecords,
    planningNotes,
  };
}

async function launchPreparedTeam(cwd: string, prepared: PreparedTeamPlan): Promise<void> {
  const teamName = prepared.config.name;
  let taskRecords = prepared.taskRecords;

  await createTeamState({
    cwd,
    config: prepared.config,
    tasks: taskRecords,
    workers: prepared.workerRecords,
  });
  await appendEvent(cwd, teamName, {
    at: nowIso(),
    type: 'team_started',
    message: `Started team ${teamName} with ${taskRecords.length} task(s)`,
  });
  for (const note of prepared.planningNotes) {
    await appendEvent(cwd, teamName, {
      at: nowIso(),
      type: 'planning_note',
      message: note,
    });
  }

  if (prepared.config.launchMode === 'tmux') {
    const sessionName = `omg-${teamName}`;
    const tmux = createTmuxTeamSession({
      sessionName,
      cwd,
      teamName,
      workers: prepared.workerRecords.map((worker) => ({
        workerName: worker.name,
        taskId: '',
      })),
    });

    await writeTeamConfig(cwd, teamName, {
      ...prepared.config,
      tmuxSession: tmux.sessionName,
      leaderWindow: tmux.leaderWindowName,
      tmuxWindow: 'workers',
      hudWindow: tmux.hudWindowName,
    });
    for (let index = 0; index < prepared.workerRecords.length; index += 1) {
      const worker = prepared.workerRecords[index];
      const paneId = tmux.workerPaneIds[index];
      if (!worker || !paneId) continue;
      await writeWorker(cwd, teamName, {
        ...worker,
        status: 'idle',
        paneId,
      });
    }
    await appendEvent(cwd, teamName, {
      at: nowIso(),
      type: 'tmux_session_started',
      message: `Started tmux session ${tmux.sessionName}`,
    });
  }

  await scheduleReadyTasks(cwd, teamName);
}

export async function startTeam(options: StartTeamOptions): Promise<{ teamName: string; taskCount: number }> {
  const cwd = resolve(options.cwd);
  const teamName = normalizeTeamName(options.name ?? `${slugify(options.task)}-${timestampTag().toLowerCase()}`);
  const prepared = await prepareTeamPlan({
    cwd,
    teamName,
    rootTask: options.task,
    workers: options.workers,
    model: options.model,
    approvalMode: options.approvalMode,
    includeDirectories: options.includeDirectories,
    launchMode: options.launchMode,
  });
  await launchPreparedTeam(cwd, prepared);

  return {
    teamName,
    taskCount: prepared.taskRecords.length,
  };
}

async function waitForTaskDependencies(cwd: string, teamName: string, taskId: string, leaseToken: string): Promise<{ ready: true } | { ready: false; reason: string }> {
  const task = await readTask(cwd, teamName, taskId);
  if (!task) {
    return { ready: false, reason: 'task_missing' };
  }
  if (task.lease?.token !== leaseToken) {
    return { ready: false, reason: 'lease_replaced' };
  }
  if (!isLeaseActive(task.lease)) {
    return { ready: false, reason: 'lease_expired' };
  }

  const dependsOn = task.dependsOn ?? [];
  if (dependsOn.length === 0) {
    return { ready: true };
  }

  const waitingOn: string[] = [];
  for (const dependencyId of dependsOn) {
    const dependency = await readTask(cwd, teamName, dependencyId);
    if (!dependency) {
      return { ready: false, reason: `missing_dependency:${dependencyId}` };
    }
    if (dependency.status === 'failed') {
      return { ready: false, reason: `failed_dependency:${dependencyId}` };
    }
    if (dependency.status !== 'completed') {
      waitingOn.push(dependencyId);
    }
  }

  if (waitingOn.length === 0) {
    return { ready: true };
  }

  return { ready: false, reason: `waiting_on:${waitingOn.join(',')}` };
}

function isWorkerRunnable(worker: TeamWorkerRecord): boolean {
  return worker.status !== 'running' && worker.status !== 'waiting';
}

async function recoverLeases(cwd: string, teamName: string): Promise<void> {
  const [tasks, workers] = await Promise.all([
    listTasks(cwd, teamName),
    listWorkers(cwd, teamName),
  ]);
  const workerByName = new Map(workers.map((worker) => [worker.name, worker] as const));
  const activeLeaseCountByOwner = new Map<string, number>();
  for (const task of tasks) {
    if (!task.lease) continue;
    activeLeaseCountByOwner.set(task.lease.owner, (activeLeaseCountByOwner.get(task.lease.owner) ?? 0) + 1);
  }

  for (const task of tasks) {
    const lease = task.lease;
    if (!lease) continue;
    const owner = workerByName.get(lease.owner);
    const ownerAlive = owner?.pid ? isPidAlive(owner.pid) : false;
    const lastHeartbeatAgeMs = owner?.lastHeartbeatAt ? (Date.now() - new Date(owner.lastHeartbeatAt).getTime()) : Number.POSITIVE_INFINITY;
    const staleHeartbeat = !Number.isFinite(lastHeartbeatAgeMs) || lastHeartbeatAgeMs > LEASE_STALE_HEARTBEAT_MS;
    const hardStale = !Number.isFinite(lastHeartbeatAgeMs) || lastHeartbeatAgeMs > LEASE_HARD_RECLAIM_MS;
    const expired = !isLeaseActive(lease);
    const orphaned = !owner || (owner.status !== 'running' && owner.status !== 'waiting' && !ownerAlive);
    const ownerMismatch = task.workerName !== undefined && task.workerName !== lease.owner;
    const taskPointerMismatch = Boolean(owner && owner.taskId && owner.taskId !== task.id);
    const duplicateLeaseOwner = (activeLeaseCountByOwner.get(lease.owner) ?? 0) > 1;
    if (!expired && !orphaned && !staleHeartbeat && !ownerMismatch && !taskPointerMismatch && !duplicateLeaseOwner) continue;

    const recoveryReason = expired
      ? 'expired'
      : ownerMismatch
        ? 'owner_mismatch'
        : taskPointerMismatch
          ? 'worker_task_mismatch'
          : duplicateLeaseOwner
            ? 'duplicate_owner'
            : orphaned
              ? 'orphaned'
              : hardStale
                ? 'hard_stale'
                : 'stale';
    await writeTask(cwd, teamName, {
      ...task,
      status: task.status === 'completed' ? 'completed' : 'pending',
      startedAt: task.status === 'completed' ? task.startedAt : undefined,
      completedAt: task.status === 'completed' ? task.completedAt : undefined,
      artifactPath: task.status === 'completed' ? task.artifactPath : undefined,
      result: task.status === 'completed' ? task.result : undefined,
      error: task.status === 'completed' ? task.error : undefined,
      lease: undefined,
    });
    if (owner) {
      await writeWorker(cwd, teamName, {
        ...owner,
        status: owner.status === 'completed' ? 'completed' : 'idle',
        taskId: owner.taskId === task.id ? undefined : owner.taskId,
        pid: undefined,
        waitReason: `lease_${recoveryReason}`,
      });
    }
    await appendEvent(cwd, teamName, {
      at: nowIso(),
      type: 'lease_recovered',
      message: `${task.id} recovered from ${recoveryReason} lease`,
      taskId: task.id,
      workerName: lease.owner,
    });
  }
}

export async function readTeamGraph(cwd: string, teamName: string): Promise<{
  nodes: Array<{ id: string; subject: string; status: string; workerName?: string; priority?: number }>;
  edges: Array<{ from: string; to: string }>;
  ready: string[];
  blocked: Array<{ taskId: string; waitingOn: string[] }>;
} | null> {
  const summary = await getTeamSummary(cwd, teamName);
  if (!summary) return null;
  return {
    nodes: summary.tasks.map((task) => ({
      id: task.id,
      subject: task.subject,
      status: task.status,
      ...(task.workerName ? { workerName: task.workerName } : {}),
      ...(typeof task.priority === 'number' ? { priority: task.priority } : {}),
    })),
    edges: summary.tasks.flatMap((task) => (task.dependsOn ?? []).map((dependencyId) => ({
      from: dependencyId,
      to: task.id,
    }))),
    ready: summary.readyTaskIds,
    blocked: summary.dependencyBlocks,
  };
}

async function loadReadyPendingTasks(cwd: string, teamName: string): Promise<TeamTaskRecord[]> {
  return getReadyPendingTasks(await listTasks(cwd, teamName));
}

async function spawnProcessWorker(cwd: string, teamName: string, task: TeamTaskRecord): Promise<void> {
  const child = spawn(process.execPath, [cliEntryPath(), 'team', 'run-worker', '--team', teamName, '--task-id', task.id, '--lease-token', task.lease?.token ?? ''], {
    cwd,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
}

async function respawnTmuxWorker(cwd: string, teamName: string, task: TeamTaskRecord, worker: TeamWorkerRecord): Promise<void> {
  if (!worker.paneId) return;
  const { respawnTmuxPaneForTask } = await import('../tmux/session.js');
  respawnTmuxPaneForTask(worker.paneId, teamName, task.id, task.lease?.token);
}

async function scheduleReadyTasks(cwd: string, teamName: string): Promise<void> {
  const config = await readTeamConfig(cwd, teamName);
  if (!config) return;

  await recoverLeases(cwd, teamName);
  const [tasks, workers] = await Promise.all([
    loadReadyPendingTasks(cwd, teamName),
    listWorkers(cwd, teamName),
  ]);
  const availableWorkers = workers.filter(isWorkerRunnable);
  const assignments = Math.min(tasks.length, availableWorkers.length);

  for (let index = 0; index < assignments; index += 1) {
    const task = tasks[index];
    const worker = availableWorkers[index];
    if (!task || !worker) continue;
    const lease = createLease(worker.name);
    const assignedTask: TeamTaskRecord = {
      ...task,
      workerName: worker.name,
      lease,
    };
    await writeTask(cwd, teamName, assignedTask);
    await writeWorker(cwd, teamName, {
      ...worker,
      taskId: assignedTask.id,
      status: 'idle',
      waitReason: undefined,
      pid: undefined,
    });
    await appendEvent(cwd, teamName, {
      at: nowIso(),
      type: 'task_assigned',
      message: `${assignedTask.id} assigned to ${worker.name}`,
      taskId: assignedTask.id,
      workerName: worker.name,
    });
    if (config.launchMode === 'tmux') {
      await respawnTmuxWorker(cwd, teamName, assignedTask, worker);
    } else {
      await spawnProcessWorker(cwd, teamName, assignedTask);
    }
  }
}

export async function runWorker(cwd: string, teamName: string, taskId: string, leaseToken?: string): Promise<void> {
  const config = await readTeamConfig(cwd, teamName);
  const task = await readTask(cwd, teamName, taskId);
  if (!config || !task) {
    throw new Error(`Worker bootstrap failed for ${teamName}/${taskId}`);
  }
  if (leaseToken && task.lease?.token !== leaseToken) {
    throw new Error(`lease_mismatch:${taskId}`);
  }
  const workerName = requireTaskWorkerName(task);

  const worker = (await readWorker(cwd, teamName, workerName)) ?? {
    name: workerName,
    status: 'idle' as const,
    taskId,
  };
  const activeLeaseToken = task.lease?.token ?? leaseToken ?? '';
  if (!activeLeaseToken) {
    throw new Error(`missing_lease:${taskId}`);
  }
  const pulse = startWorkerRuntimePulse({
    cwd,
    teamName,
    workerName,
    taskId,
    leaseToken: activeLeaseToken,
  });

  const startedAt = nowIso();
  await writeWorker(cwd, teamName, {
    ...worker,
    status: 'waiting',
    pid: process.pid,
    startedAt,
    exitCode: null,
    waitReason: undefined,
  });
  await pulse.tick({ status: 'waiting', pid: process.pid, startedAt, exitCode: null, waitReason: undefined });
  await appendEvent(cwd, teamName, {
    at: startedAt,
    type: 'worker_started',
    message: `${workerName} started ${taskId}`,
    taskId,
    workerName,
  });

  while (true) {
    const readiness = await waitForTaskDependencies(cwd, teamName, taskId, activeLeaseToken);
    if (readiness.ready) break;
    if (readiness.reason.startsWith('failed_dependency:') || readiness.reason === 'task_missing' || readiness.reason === 'lease_replaced' || readiness.reason === 'lease_expired' || readiness.reason.startsWith('missing_dependency:')) {
      const completedAt = nowIso();
      pulse.stop();
      await writeTask(cwd, teamName, {
        ...task,
        status: readiness.reason.startsWith('failed_dependency:') || readiness.reason.startsWith('missing_dependency:') ? 'failed' : 'pending',
        completedAt: readiness.reason.startsWith('failed_dependency:') || readiness.reason.startsWith('missing_dependency:') ? completedAt : undefined,
        error: readiness.reason.startsWith('failed_dependency:') || readiness.reason.startsWith('missing_dependency:') ? readiness.reason : undefined,
        lease: undefined,
      });
      await writeWorker(cwd, teamName, {
        ...worker,
        status: readiness.reason.startsWith('failed_dependency:') || readiness.reason.startsWith('missing_dependency:') ? 'failed' : 'idle',
        completedAt: readiness.reason.startsWith('failed_dependency:') || readiness.reason.startsWith('missing_dependency:') ? completedAt : undefined,
        exitCode: readiness.reason.startsWith('failed_dependency:') || readiness.reason.startsWith('missing_dependency:') ? 1 : null,
        pid: undefined,
        waitReason: readiness.reason,
      });
      await appendEvent(cwd, teamName, {
        at: nowIso(),
        type: readiness.reason.startsWith('failed_dependency:') || readiness.reason.startsWith('missing_dependency:') ? 'task_failed' : 'task_wait_cancelled',
        message: `${taskId} ${readiness.reason}`,
        taskId,
        workerName,
      });
      return;
    }
    await pulse.tick({
      status: 'waiting',
      pid: process.pid,
      startedAt,
      waitReason: readiness.reason,
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }

  await writeWorker(cwd, teamName, {
    ...worker,
    status: 'running',
    pid: process.pid,
    startedAt,
    exitCode: null,
    waitReason: undefined,
  });
  await writeTask(cwd, teamName, {
    ...task,
    status: 'running',
    startedAt,
  });
  await pulse.tick({
    status: 'running',
    pid: process.pid,
    startedAt,
    exitCode: null,
    waitReason: undefined,
  });
  await appendEvent(cwd, teamName, {
    at: nowIso(),
    type: 'task_ready',
    message: `${taskId} dependencies satisfied`,
    taskId,
    workerName,
  });

  try {
    const result = await runHarness({
      cwd: config.cwd,
      prompt: buildWorkerPrompt({
        teamName,
        workerName,
        rootTask: config.rootTask,
        subject: task.subject,
        description: task.description,
      }),
      model: config.model,
      approvalMode: config.approvalMode,
      includeDirectories: config.includeDirectories,
      timeoutMs: 180_000,
    });

    const parsed = parseWorkerOutcome(result.responseText);
    const completedAt = nowIso();
    const outputPath = artifactFilePath(cwd, teamName, taskId);
    await ensureDir(dirname(outputPath));
    await writeJsonFile(outputPath, {
      sessionId: result.sessionId,
      responseText: result.responseText,
      stderr: result.stderr,
      stats: result.stats,
      parsed,
    });

    await writeTask(cwd, teamName, {
      ...task,
      status: parsed.status === 'completed' ? 'completed' : 'failed',
      completedAt,
      artifactPath: outputPath,
      lease: undefined,
      result: {
        summary: parsed.summary,
        changedFiles: parsed.changed_files,
        verification: parsed.verification,
        ...(parsed.notes ? { notes: parsed.notes } : {}),
      },
      ...(parsed.status === 'failed' ? { error: parsed.summary } : {}),
    });
    await writeWorker(cwd, teamName, {
      ...worker,
      status: parsed.status === 'completed' ? 'completed' : 'failed',
      pid: undefined,
      startedAt,
      completedAt,
      exitCode: 0,
      taskId,
      waitReason: undefined,
    });
    pulse.stop();
    await appendEvent(cwd, teamName, {
      at: completedAt,
      type: parsed.status === 'completed' ? 'task_completed' : 'task_failed',
      message: `${workerName} ${parsed.status} ${taskId}`,
      taskId,
      workerName,
    });
    await scheduleReadyTasks(cwd, teamName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completedAt = nowIso();
    await writeTask(cwd, teamName, {
      ...task,
      status: 'failed',
      completedAt,
      error: message,
      lease: undefined,
    });
    await writeWorker(cwd, teamName, {
      ...worker,
      status: 'failed',
      pid: undefined,
      startedAt,
      completedAt,
      exitCode: 1,
      taskId,
      waitReason: undefined,
    });
    pulse.stop();
    await appendEvent(cwd, teamName, {
      at: completedAt,
      type: 'worker_error',
      message,
      taskId,
      workerName,
    });
    await scheduleReadyTasks(cwd, teamName);
  }
}

async function reconcileTeamHealth(cwd: string, teamName: string): Promise<TeamSummary | null> {
  const summary = await getTeamSummary(cwd, teamName);
  if (!summary) return null;

  if (summary.config.launchMode === 'tmux') {
    const sessionName = summary.config.tmuxSession;
    if (sessionName && !tmuxSessionExists(sessionName)) {
      for (const worker of summary.workers) {
        if (worker.status !== 'running') continue;
        const completedAt = nowIso();
        const task = worker.taskId ? await readTask(cwd, teamName, worker.taskId) : null;
        if (task && task.status === 'running') {
          await writeTask(cwd, teamName, {
            ...task,
            status: 'failed',
            completedAt,
            error: 'tmux session disappeared while task was running',
          });
        }
        await writeWorker(cwd, teamName, {
          ...worker,
          status: 'failed',
          completedAt,
          exitCode: 1,
        });
      }
      await appendEvent(cwd, teamName, {
        at: nowIso(),
        type: 'tmux_session_lost',
        message: `tmux session ${sessionName} is no longer available`,
      });
      return getTeamSummary(cwd, teamName);
    }

    if (sessionName) {
      const panes = listTmuxPanes(`${sessionName}:workers`);
      const paneById = new Map(panes.map((pane) => [pane.paneId, pane]));
      for (const worker of summary.workers) {
        if (worker.status !== 'running' || !worker.paneId) continue;
        const pane = paneById.get(worker.paneId);
        if (pane && !pane.dead) continue;

        const completedAt = nowIso();
        const task = worker.taskId ? await readTask(cwd, teamName, worker.taskId) : null;
        if (task && task.status === 'running') {
          await writeTask(cwd, teamName, {
            ...task,
            status: 'failed',
            completedAt,
            error: 'tmux worker pane terminated before task recorded completion',
          });
        }
        await writeWorker(cwd, teamName, {
          ...worker,
          status: 'failed',
          completedAt,
          exitCode: worker.exitCode ?? 1,
        });
        await appendEvent(cwd, teamName, {
          at: completedAt,
          type: 'tmux_worker_pane_dead',
          message: `${worker.name} pane ended unexpectedly`,
          ...(worker.taskId ? { taskId: worker.taskId } : {}),
          workerName: worker.name,
        });
      }

      const windows = listTmuxWindows(sessionName);
      const missing = ['leader', 'workers', 'hud'].filter((name) => !windows.some((window) => window.name === name));
      if (missing.length > 0) {
        await appendEvent(cwd, teamName, {
          at: nowIso(),
          type: 'tmux_window_missing',
          message: `Missing tmux window(s): ${missing.join(', ')}`,
        });
      }
    }
  }

  for (const worker of summary.workers) {
    if (worker.status !== 'running' || !worker.pid || isPidAlive(worker.pid)) continue;

    const completedAt = nowIso();
    const task = worker.taskId ? await readTask(cwd, teamName, worker.taskId) : null;
    if (task && task.status === 'running') {
      await writeTask(cwd, teamName, {
        ...task,
        status: 'failed',
        completedAt,
        error: 'worker process exited unexpectedly',
      });
    }
    await writeWorker(cwd, teamName, {
      ...worker,
      status: 'failed',
      completedAt,
      exitCode: worker.exitCode ?? 1,
    });
    await appendEvent(cwd, teamName, {
      at: completedAt,
      type: 'worker_lost',
      message: `${worker.name} exited unexpectedly`,
      ...(worker.taskId ? { taskId: worker.taskId } : {}),
      workerName: worker.name,
    });
  }

  return getTeamSummary(cwd, teamName);
}

async function terminateWorkerProcesses(summary: TeamSummary): Promise<void> {
  for (const worker of summary.workers) {
    if (!worker.pid || !isPidAlive(worker.pid)) continue;
    try {
      process.kill(worker.pid, 'SIGTERM');
    } catch {}
  }

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));

  for (const worker of summary.workers) {
    if (!worker.pid || !isPidAlive(worker.pid)) continue;
    try {
      process.kill(worker.pid, 'SIGKILL');
    } catch {}
  }
}

async function terminateWorkerByName(summary: TeamSummary, workerName: string): Promise<void> {
  const worker = summary.workers.find((entry) => entry.name === workerName);
  if (!worker?.pid || !isPidAlive(worker.pid)) return;

  try {
    process.kill(worker.pid, 'SIGTERM');
  } catch {}
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
  if (isPidAlive(worker.pid)) {
    try {
      process.kill(worker.pid, 'SIGKILL');
    } catch {}
  }
}

export async function inspectTeam(cwd: string, teamName: string): Promise<TeamSummary | null> {
  return reconcileTeamHealth(cwd, teamName);
}

export async function waitForTeam(cwd: string, teamName: string, timeoutMs = 300_000): Promise<TeamSummary | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const summary = await reconcileTeamHealth(cwd, teamName);
    if (!summary) return null;
    if (summary.allTerminal) return summary;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  return reconcileTeamHealth(cwd, teamName);
}

export async function cleanupTeam(cwd: string, teamName: string, force = false): Promise<void> {
  const summary = await reconcileTeamHealth(cwd, teamName);
  if (!summary) return;
  if (!force && !summary.allTerminal) {
    throw new Error(`Team ${teamName} still has active work; rerun with --force to remove state`);
  }
  if (summary.config.launchMode === 'tmux' && summary.config.tmuxSession) {
    killTmuxSession(summary.config.tmuxSession);
  } else if (force) {
    await terminateWorkerProcesses(summary);
  }
  await cleanupTeamState(cwd, teamName);
}

async function launchTaskWorker(cwd: string, teamName: string, task: TeamTaskRecord, config: TeamConfig): Promise<void> {
  if (config.launchMode === 'tmux') {
    throw new Error('Task relaunch inside existing tmux session is not supported; use restart for tmux teams');
  }

  const child = spawn(process.execPath, [cliEntryPath(), 'team', 'run-worker', '--team', teamName, '--task-id', task.id, '--lease-token', task.lease?.token ?? ''], {
    cwd,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
}

export async function requeueTask(cwd: string, teamName: string, taskId: string): Promise<void> {
  const config = await readTeamConfig(cwd, teamName);
  const task = await readTask(cwd, teamName, taskId);
  if (!config || !task) {
    throw new Error(`Team/task not found: ${teamName}/${taskId}`);
  }

  const summary = await inspectTeam(cwd, teamName);
  if (summary && config.launchMode === 'process' && task.workerName) {
    await terminateWorkerByName(summary, task.workerName);
  }

  const worker = task.workerName ? await readWorker(cwd, teamName, task.workerName) : null;
  const queuedAt = nowIso();
  await writeTask(cwd, teamName, {
    ...task,
    workerName: undefined,
    status: 'pending',
    startedAt: undefined,
    completedAt: undefined,
    artifactPath: undefined,
    result: undefined,
    error: undefined,
    lease: undefined,
  });
  if (worker) {
    await writeWorker(cwd, teamName, {
      ...worker,
      status: 'idle',
      startedAt: undefined,
      completedAt: undefined,
      exitCode: null,
      pid: config.launchMode === 'process' ? undefined : worker.pid,
    });
  }
  await appendEvent(cwd, teamName, {
    at: queuedAt,
    type: 'task_requeued',
    message: `Requeued ${taskId}`,
    taskId,
    ...(task.workerName ? { workerName: task.workerName } : {}),
  });
}

export async function retryFailedTasks(cwd: string, teamName: string): Promise<{ retried: string[] }> {
  const config = await readTeamConfig(cwd, teamName);
  if (!config) throw new Error(`Team not found: ${teamName}`);

  const tasks = await listTasks(cwd, teamName);
  const failed = tasks.filter((task) => task.status === 'failed');
  for (const task of failed) {
    await requeueTask(cwd, teamName, task.id);
  }
  await scheduleReadyTasks(cwd, teamName);

  await appendEvent(cwd, teamName, {
    at: nowIso(),
    type: 'failed_tasks_retried',
    message: `Retried ${failed.length} failed task(s)`,
  });

  return {
    retried: failed.map((task) => task.id),
  };
}

export async function restartTeam(
  cwd: string,
  teamName: string,
  options: { deep?: boolean } = {},
): Promise<{ restarted: boolean; teamName: string; deep: boolean }> {
  const summary = await inspectTeam(cwd, teamName);
  if (!summary) {
    throw new Error(`Team not found: ${teamName}`);
  }

  if (options.deep === true) {
    if (summary.config.launchMode === 'tmux' && summary.config.tmuxSession) {
      killTmuxSession(summary.config.tmuxSession);
    } else {
      await terminateWorkerProcesses(summary);
    }
    await cleanupTeamState(cwd, teamName);
    const prepared = await prepareTeamPlan({
      cwd,
      teamName,
      rootTask: summary.config.rootTask,
      workers: summary.config.workerCount,
      model: summary.config.model,
      approvalMode: summary.config.approvalMode,
      includeDirectories: summary.config.includeDirectories,
      launchMode: summary.config.launchMode,
    });
    await launchPreparedTeam(cwd, prepared);
    await appendEvent(cwd, teamName, {
      at: nowIso(),
      type: 'team_deep_restarted',
      message: `Deep restarted team ${teamName} with replanning`,
    });
    return {
      restarted: true,
      teamName,
      deep: true,
    };
  }

  const tasks = await listTasks(cwd, teamName);
  const workers = await listWorkers(cwd, teamName);
  const normalizedTasks = tasks.map((task) => (
    task.status === 'completed'
      ? task
      : {
        ...task,
        status: 'pending' as const,
        startedAt: undefined,
        completedAt: undefined,
        artifactPath: undefined,
        result: undefined,
        error: undefined,
      }
  ));

  if (summary.config.launchMode === 'tmux' && summary.config.tmuxSession) {
    killTmuxSession(summary.config.tmuxSession);
    const tmux = createTmuxTeamSession({
      sessionName: summary.config.tmuxSession,
      cwd,
      teamName,
      workers: workers.map((worker) => ({
        workerName: worker.name,
        taskId: '',
      })),
    });
    await writeTeamConfig(cwd, teamName, {
      ...summary.config,
      leaderWindow: tmux.leaderWindowName,
      tmuxWindow: 'workers',
      hudWindow: tmux.hudWindowName,
    });
    const nextWorkers = workers.map((worker, index) => ({
      ...worker,
      status: (worker.status === 'completed' ? 'completed' : 'idle') as WorkerStatus,
      paneId: tmux.workerPaneIds[index] ?? worker.paneId,
      pid: undefined,
      startedAt: worker.status === 'completed' ? worker.startedAt : undefined,
      completedAt: worker.status === 'completed' ? worker.completedAt : undefined,
      exitCode: worker.status === 'completed' ? worker.exitCode : null,
    }));
    await writeTasks(cwd, teamName, normalizedTasks);
    await writeWorkers(cwd, teamName, nextWorkers);
  } else {
    const nextWorkers = workers.map((worker) => ({
      ...worker,
      status: (worker.status === 'completed' ? 'completed' : 'idle') as WorkerStatus,
      pid: undefined,
      startedAt: worker.status === 'completed' ? worker.startedAt : undefined,
      completedAt: worker.status === 'completed' ? worker.completedAt : undefined,
      exitCode: worker.status === 'completed' ? worker.exitCode : null,
    }));
    await writeTasks(cwd, teamName, normalizedTasks);
    await writeWorkers(cwd, teamName, nextWorkers);
  }
  await scheduleReadyTasks(cwd, teamName);

  await appendEvent(cwd, teamName, {
    at: nowIso(),
    type: 'team_restarted',
    message: `Restarted team ${teamName}`,
  });

  return {
    restarted: true,
    teamName,
    deep: false,
  };
}
