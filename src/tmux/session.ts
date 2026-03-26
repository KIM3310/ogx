import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getBinScriptPath } from '../utils/package.js';

export interface TmuxWorkerSpec {
  workerName: string;
  taskId: string;
  leaseToken?: string;
}

export interface TmuxLaunchResult {
  sessionName: string;
  leaderWindowName: string;
  workerPaneIds: string[];
  hudWindowName: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runTmux(args: string[]): string {
  const result = spawnSync('tmux', args, {
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `tmux exited ${result.status}`).trim());
  }
  return (result.stdout || '').trim();
}

export function isTmuxInstalled(): boolean {
  const result = spawnSync('tmux', ['-V'], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

export function tmuxSessionExists(sessionName: string): boolean {
  const result = spawnSync('tmux', ['has-session', '-t', sessionName], { encoding: 'utf8' });
  return result.status === 0;
}

function buildIdleWorkerCommand(workerName: string): string {
  const shell = shellQuote(resolveInteractiveShell());
  const banner = [
    `printf "\\n[oh-my-gemini worker idle]\\nworker: ${workerName}\\n\\n"`,
    `exec ${shell} -l`,
  ].join('; ');
  return `/bin/sh -lc ${shellQuote(banner)}`;
}

function buildWorkerCommand(teamName: string, taskId: string, leaseToken?: string): string {
  const binPath = getBinScriptPath(import.meta.url);
  const inner = [
    shellQuote(process.execPath),
    shellQuote(binPath),
    'team',
    'run-worker',
    '--team',
    shellQuote(teamName),
    '--task-id',
    shellQuote(taskId),
  ];
  if (leaseToken) {
    inner.push('--lease-token', shellQuote(leaseToken));
  }
  return `/bin/sh -lc ${shellQuote(inner.join(' '))}`;
}

function buildHudCommand(teamName: string): string {
  const binPath = getBinScriptPath(import.meta.url);
  return [
    shellQuote(process.execPath),
    shellQuote(binPath),
    'hud',
    '--watch',
    '--team',
    shellQuote(teamName),
  ].join(' ');
}

function resolveInteractiveShell(): string {
  return process.env.SHELL?.trim() || '/bin/zsh';
}

function buildLeaderCommand(teamName: string): string {
  const shell = shellQuote(resolveInteractiveShell());
  const banner = [
    'printf "\\n[oh-my-gemini leader]\\n"',
    `printf "team: ${teamName}\\n"`,
    'printf "Useful commands:\\n"',
    `printf "  ogx team status ${teamName}\\n"`,
    `printf "  ogx team windows ${teamName}\\n"`,
    `printf "  ogx team panes ${teamName}\\n"`,
    `printf "  ogx team graph ${teamName}\\n"`,
    `printf "  ogx team capture ${teamName} --worker worker-1\\n\\n"`,
    `exec ${shell} -l`,
  ].join('; ');
  return `/bin/sh -lc ${shellQuote(banner)}`;
}

export function createTmuxTeamSession(input: {
  sessionName: string;
  cwd: string;
  teamName: string;
  workers: TmuxWorkerSpec[];
}): TmuxLaunchResult {
  const resolvedCwd = resolve(input.cwd);
  const leaderWindowName = 'leader';
  const workersWindow = `${input.sessionName}:workers`;
  const hudWindowName = 'hud';
  const workerPaneIds: string[] = [];

  const firstWorker = input.workers[0];
  if (!firstWorker) {
    throw new Error('createTmuxTeamSession requires at least one worker');
  }

  runTmux([
    'new-session',
    '-d',
    '-s',
    input.sessionName,
    '-n',
    leaderWindowName,
    '-c',
    resolvedCwd,
    buildLeaderCommand(input.teamName),
  ]);
  runTmux(['set-option', '-t', input.sessionName, 'remain-on-exit', 'on']);
  const inheritedGeminiBin = process.env.OMG_GEMINI_BIN?.trim();
  if (inheritedGeminiBin) {
    runTmux(['set-environment', '-t', input.sessionName, 'OMG_GEMINI_BIN', inheritedGeminiBin]);
  }

  runTmux([
    'new-window',
    '-d',
    '-t',
    input.sessionName,
    '-n',
    'workers',
    '-c',
    resolvedCwd,
    buildIdleWorkerCommand(firstWorker.workerName),
  ]);

  const firstPaneId = runTmux(['list-panes', '-t', workersWindow, '-F', '#{pane_id}'])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  if (!firstPaneId) {
    throw new Error(`Failed to detect first worker pane for ${workersWindow}`);
  }
  workerPaneIds.push(firstPaneId);

  for (const worker of input.workers.slice(1)) {
    const paneId = runTmux([
      'split-window',
      '-d',
      '-P',
      '-F',
      '#{pane_id}',
      '-t',
      workersWindow,
      '-c',
      resolvedCwd,
      buildIdleWorkerCommand(worker.workerName),
    ]).trim();
    if (paneId) workerPaneIds.push(paneId);
  }

  runTmux(['select-layout', '-t', workersWindow, 'tiled']);
  runTmux([
    'new-window',
    '-d',
    '-t',
    input.sessionName,
    '-n',
    hudWindowName,
    '-c',
    resolvedCwd,
    buildHudCommand(input.teamName),
  ]);
  runTmux(['select-window', '-t', `${input.sessionName}:${leaderWindowName}`]);

  return {
    sessionName: input.sessionName,
    leaderWindowName,
    workerPaneIds,
    hudWindowName,
  };
}

export function killTmuxSession(sessionName: string): void {
  if (!tmuxSessionExists(sessionName)) return;
  runTmux(['kill-session', '-t', sessionName]);
}

export interface TmuxPaneRuntime {
  paneId: string;
  dead: boolean;
  pid: number | null;
}

export interface TmuxWindowRuntime {
  index: number;
  name: string;
  active: boolean;
  paneCount: number;
}

export function listTmuxPanes(sessionTarget: string): TmuxPaneRuntime[] {
  let output = '';
  try {
    output = runTmux(['list-panes', '-t', sessionTarget, '-F', '#{pane_id}\t#{pane_dead}\t#{pane_pid}']);
  } catch {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [paneId = '', dead = '0', pid = ''] = line.split('\t');
      return {
        paneId,
        dead: dead === '1',
        pid: Number.isFinite(Number.parseInt(pid, 10)) ? Number.parseInt(pid, 10) : null,
      };
    });
}

export function listTmuxWindows(sessionName: string): TmuxWindowRuntime[] {
  let output = '';
  try {
    output = runTmux(['list-windows', '-t', sessionName, '-F', '#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}']);
  } catch {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [index = '0', name = '', active = '0', paneCount = '0'] = line.split('\t');
      return {
        index: Number.parseInt(index, 10),
        name,
        active: active === '1',
        paneCount: Number.parseInt(paneCount, 10),
      };
    });
}

export function captureTmuxPane(target: string, lines = 200): string {
  return runTmux(['capture-pane', '-p', '-S', `-${Math.max(1, lines)}`, '-t', target]);
}

export function attachTmuxSession(sessionName: string): void {
  const result = spawnSync('tmux', ['attach-session', '-t', sessionName], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr?.toString?.() || `tmux attach exited ${result.status}`).trim());
  }
}

export function openHudInTmux(cwd: string, teamName?: string): string {
  const binPath = getBinScriptPath(import.meta.url);
  const command = [
    shellQuote(process.execPath),
    shellQuote(binPath),
    'hud',
    '--watch',
    ...(teamName ? ['--team', shellQuote(teamName)] : []),
  ].join(' ');

  return runTmux([
    'split-window',
    '-d',
    '-P',
    '-F',
    '#{pane_id}',
    '-c',
    resolve(cwd),
    command,
  ]).trim();
}

export function createDetachedHudSession(cwd: string, sessionName: string, teamName?: string): string {
  const binPath = getBinScriptPath(import.meta.url);
  const command = [
    shellQuote(process.execPath),
    shellQuote(binPath),
    'hud',
    '--watch',
    ...(teamName ? ['--team', shellQuote(teamName)] : []),
  ].join(' ');

  runTmux([
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-n',
    'hud',
    '-c',
    resolve(cwd),
    command,
  ]);
  return sessionName;
}

export function respawnTmuxPaneForTask(paneId: string, teamName: string, taskId: string, leaseToken?: string): void {
  runTmux([
    'respawn-pane',
    '-k',
    '-t',
    paneId,
    buildWorkerCommand(teamName, taskId, leaseToken),
  ]);
}
