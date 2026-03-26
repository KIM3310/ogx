import type { ApprovalMode } from '../config/project.js';
import type { TeamLaunchMode } from '../config/project.js';

export type TeamTaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type WorkerStatus = 'idle' | 'waiting' | 'running' | 'completed' | 'failed';

export interface TeamTaskLease {
  owner: string;
  token: string;
  leasedUntil: string;
}

export interface TeamTaskResult {
  summary: string;
  changedFiles: string[];
  verification: string[];
  notes?: string[];
}

export interface TeamTaskRecord {
  id: string;
  subject: string;
  description: string;
  workerName?: string;
  priority?: number;
  dependsOn?: string[];
  lease?: TeamTaskLease;
  status: TeamTaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  artifactPath?: string;
  result?: TeamTaskResult;
  error?: string;
}

export interface TeamWorkerRecord {
  name: string;
  status: WorkerStatus;
  taskId?: string;
  pid?: number;
  paneId?: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number | null;
  lastHeartbeatAt?: string;
  heartbeatCount?: number;
  waitReason?: string;
}

export interface TeamDependencyBlock {
  taskId: string;
  waitingOn: string[];
}

export interface TeamConfig {
  schemaVersion: 1;
  name: string;
  rootTask: string;
  createdAt: string;
  cwd: string;
  workerCount: number;
  taskCount: number;
  model?: string;
  approvalMode: ApprovalMode;
  includeDirectories: string[];
  launchMode: TeamLaunchMode;
  tmuxSession?: string;
  leaderWindow?: string;
  tmuxWindow?: string;
  hudWindow?: string;
}

export interface TeamEvent {
  at: string;
  type: string;
  message: string;
  taskId?: string;
  workerName?: string;
}

export interface TeamSummary {
  config: TeamConfig;
  tasks: TeamTaskRecord[];
  workers: TeamWorkerRecord[];
  counts: Record<TeamTaskStatus, number> & { total: number };
  activeWorkers: number;
  waitingWorkers: number;
  readyTaskCount: number;
  readyTaskIds: string[];
  dependencyBlockedTasks: number;
  dependencyBlocks: TeamDependencyBlock[];
  allTerminal: boolean;
}
