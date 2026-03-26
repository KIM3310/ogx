import { resolve } from 'node:path';
import { Command } from "commander";
import {
  cleanupTeam,
  inspectTeam,
  readTeamGraph,
  requeueTask,
  restartTeam,
  retryFailedTasks,
  runWorker,
  startTeam,
  waitForTeam,
} from "../../orchestration/runtime.js";
import type { ApprovalMode, TeamLaunchMode } from "../../config/project.js";
import {
  attachTmuxSession,
  captureTmuxPane,
  listTmuxPanes,
  listTmuxWindows,
} from "../../tmux/session.js";
import type { TeamSummary } from "../../state/types.js";

function printSummary(summary: TeamSummary | null): void {
  if (!summary) {
    console.log('Team not found');
    return;
  }

  console.log(`team: ${summary.config.name}`);
  console.log(`root task: ${summary.config.rootTask}`);
  if (summary.config.launchMode === 'tmux' && summary.config.tmuxSession) {
    console.log(`tmux session: ${summary.config.tmuxSession}`);
    console.log(`tmux windows: leader=${summary.config.leaderWindow ?? 'leader'} workers=${summary.config.tmuxWindow ?? 'workers'} hud=${summary.config.hudWindow ?? 'hud'}`);
  }
  console.log(`counts: pending=${summary.counts.pending} running=${summary.counts.running} completed=${summary.counts.completed} failed=${summary.counts.failed}`);
  for (const task of summary.tasks) {
    console.log(`- ${task.id} ${task.status} ${task.workerName ?? ''} :: ${task.subject}`);
  }
}

export function registerTeamCommand(program: Command): void {
  const team = program.command("team").description("Manage tmux-based multi-agent worker teams");

  team
    .command("start")
    .description("Start a worker team with automatic task planning")
    .requiredOption("--task <text>", "root task description")
    .option("--name <team>", "team name")
    .option("--workers <n>", "worker count")
    .option("--model <model>", "Gemini model")
    .option("--approval-mode <mode>", "default | auto_edit | yolo | plan")
    .option("--launch-mode <mode>", "process | tmux")
    .option("--tmux", "shorthand for --launch-mode tmux")
    .option("--json", "output JSON", false)
    .action(async (options: {
      task: string;
      name?: string;
      workers?: string;
      model?: string;
      approvalMode?: string;
      launchMode?: string;
      tmux?: boolean;
      json?: boolean;
    }) => {
      const cwd = resolve(process.cwd());
      const workers = options.workers ? Number.parseInt(options.workers, 10) : undefined;
      const launchMode: TeamLaunchMode | undefined = options.tmux
        ? 'tmux'
        : (options.launchMode as TeamLaunchMode | undefined);

      const result = await startTeam({
        cwd,
        task: options.task,
        name: options.name,
        workers: (workers && Number.isInteger(workers) && workers > 0) ? workers : undefined,
        model: options.model,
        approvalMode: options.approvalMode as ApprovalMode | undefined,
        launchMode,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`Started team ${result.teamName} with ${result.taskCount} task(s)`);
    });

  team
    .command("status")
    .description("Show team status")
    .argument("<team-name>", "team name")
    .option("--json", "output JSON", false)
    .option("--tail-lines <n>", "capture pane tail")
    .action(async (teamName: string, options: { json?: boolean; tailLines?: string }) => {
      const cwd = resolve(process.cwd());
      const summary = await inspectTeam(cwd, teamName);

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }
      printSummary(summary);

      const tailLines = options.tailLines ? Number.parseInt(options.tailLines, 10) : undefined;
      if (
        summary
        && tailLines
        && Number.isFinite(tailLines)
        && summary.config.launchMode === 'tmux'
      ) {
        const paneId = summary.workers[0]?.paneId;
        if (paneId) {
          console.log('\n--- pane tail ---');
          console.log(captureTmuxPane(paneId, tailLines));
        }
      }
    });

  team
    .command("wait")
    .description("Wait for all team tasks to complete")
    .argument("<team-name>", "team name")
    .option("--timeout-ms <ms>", "timeout in ms")
    .option("--json", "output JSON", false)
    .action(async (teamName: string, options: { timeoutMs?: string; json?: boolean }) => {
      const cwd = resolve(process.cwd());
      const timeoutMs = options.timeoutMs ? Number.parseInt(options.timeoutMs, 10) : undefined;
      const summary = await waitForTeam(cwd, teamName, Number.isFinite(timeoutMs) ? timeoutMs : undefined);

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }
      printSummary(summary);
    });

  team
    .command("cleanup")
    .description("Remove team state")
    .argument("<team-name>", "team name")
    .option("--force", "force cleanup of active teams", false)
    .action(async (teamName: string, options: { force?: boolean }) => {
      const cwd = resolve(process.cwd());
      await cleanupTeam(cwd, teamName, options.force ?? false);
      console.log(`Removed team state for ${teamName}`);
    });

  team
    .command("requeue")
    .description("Requeue a specific task")
    .argument("<team-name>", "team name")
    .argument("<task-id>", "task id")
    .action(async (teamName: string, taskId: string) => {
      const cwd = resolve(process.cwd());
      await requeueTask(cwd, teamName, taskId);
      console.log(`Requeued ${taskId} in ${teamName}`);
    });

  team
    .command("retry")
    .description("Retry all failed tasks")
    .argument("<team-name>", "team name")
    .action(async (teamName: string) => {
      const cwd = resolve(process.cwd());
      const result = await retryFailedTasks(cwd, teamName);
      console.log(`Retried ${result.retried.length} failed task(s) in ${teamName}`);
    });

  team
    .command("restart")
    .description("Restart a team (--deep for full replan)")
    .argument("<team-name>", "team name")
    .option("--deep", "deep restart with replanning", false)
    .action(async (teamName: string, options: { deep?: boolean }) => {
      const cwd = resolve(process.cwd());
      const result = await restartTeam(cwd, teamName, { deep: options.deep ?? false });
      console.log(`${result.deep ? 'Deep restarted' : 'Restarted'} team ${result.teamName}`);
    });

  team
    .command("resume")
    .description("Resume / attach to a team")
    .argument("<team-name>", "team name")
    .action(async (teamName: string) => {
      const cwd = resolve(process.cwd());
      const summary = await inspectTeam(cwd, teamName);
      if (!summary) throw new Error(`Team not found: ${teamName}`);
      if (summary.config.launchMode === 'tmux' && summary.config.tmuxSession) {
        attachTmuxSession(summary.config.tmuxSession);
        return;
      }
      printSummary(summary);
    });

  team
    .command("attach")
    .description("Attach to a tmux team session")
    .argument("<team-name>", "team name")
    .action(async (teamName: string) => {
      const cwd = resolve(process.cwd());
      const summary = await inspectTeam(cwd, teamName);
      if (!summary) throw new Error(`Team not found: ${teamName}`);
      if (summary.config.launchMode !== 'tmux' || !summary.config.tmuxSession) {
        throw new Error(`Team ${teamName} is not tmux-backed`);
      }
      attachTmuxSession(summary.config.tmuxSession);
    });

  team
    .command("shutdown")
    .description("Shutdown a running team (cleanup + force)")
    .argument("<team-name>", "team name")
    .action(async (teamName: string) => {
      const cwd = resolve(process.cwd());
      await cleanupTeam(cwd, teamName, true);
      console.log(`Shutdown team ${teamName}`);
    });

  team
    .command("graph")
    .description("Show task dependency graph")
    .argument("<team-name>", "team name")
    .option("--json", "output JSON", false)
    .action(async (teamName: string, options: { json?: boolean }) => {
      const cwd = resolve(process.cwd());
      const graph = await readTeamGraph(cwd, teamName);
      if (!graph) throw new Error(`Team not found: ${teamName}`);

      if (options.json) {
        console.log(JSON.stringify(graph, null, 2));
        return;
      }
      console.log(`ready: ${graph.ready.join(',') || 'none'}`);
      for (const edge of graph.edges) {
        console.log(`${edge.from} -> ${edge.to}`);
      }
      if (graph.blocked.length > 0) {
        console.log(`blocked: ${graph.blocked.map((block) => `${block.taskId}<-${block.waitingOn.join(',')}`).join(' | ')}`);
      }
    });

  team
    .command("windows")
    .description("List tmux windows for a team")
    .argument("<team-name>", "team name")
    .option("--json", "output JSON", false)
    .action(async (teamName: string, options: { json?: boolean }) => {
      const cwd = resolve(process.cwd());
      const summary = await inspectTeam(cwd, teamName);
      if (!summary) throw new Error(`Team not found: ${teamName}`);
      if (summary.config.launchMode !== 'tmux' || !summary.config.tmuxSession) {
        throw new Error(`Team ${teamName} is not tmux-backed`);
      }
      const windows = listTmuxWindows(summary.config.tmuxSession);
      if (options.json) {
        console.log(JSON.stringify({ session: summary.config.tmuxSession, windows }, null, 2));
        return;
      }
      for (const window of windows) {
        console.log(`${window.index}:${window.name} active=${window.active} panes=${window.paneCount}`);
      }
    });

  team
    .command("panes")
    .description("List tmux panes for a team")
    .argument("<team-name>", "team name")
    .option("--json", "output JSON", false)
    .action(async (teamName: string, options: { json?: boolean }) => {
      const cwd = resolve(process.cwd());
      const summary = await inspectTeam(cwd, teamName);
      if (!summary) throw new Error(`Team not found: ${teamName}`);
      if (summary.config.launchMode !== 'tmux' || !summary.config.tmuxSession) {
        throw new Error(`Team ${teamName} is not tmux-backed`);
      }
      const panes = listTmuxPanes(`${summary.config.tmuxSession}:workers`);
      if (options.json) {
        console.log(JSON.stringify({ session: summary.config.tmuxSession, panes }, null, 2));
        return;
      }
      for (const pane of panes) {
        console.log(`${pane.paneId} dead=${pane.dead} pid=${pane.pid ?? 'n/a'}`);
      }
    });

  team
    .command("capture")
    .description("Capture tmux pane output")
    .argument("<team-name>", "team name")
    .option("--worker <name>", "worker name")
    .option("--pane <id>", "pane id")
    .option("--leader", "capture leader pane", false)
    .option("--hud", "capture HUD pane", false)
    .option("--lines <n>", "number of lines", "200")
    .action(async (teamName: string, options: { worker?: string; pane?: string; leader?: boolean; hud?: boolean; lines?: string }) => {
      const cwd = resolve(process.cwd());
      const summary = await inspectTeam(cwd, teamName);
      if (!summary) throw new Error(`Team not found: ${teamName}`);
      if (summary.config.launchMode !== 'tmux' || !summary.config.tmuxSession) {
        throw new Error(`Team ${teamName} is not tmux-backed`);
      }

      const lines = Number.parseInt(options.lines ?? '200', 10);
      const resolvedTarget = options.leader
        ? `${summary.config.tmuxSession}:${summary.config.leaderWindow ?? 'leader'}`
        : options.hud
          ? `${summary.config.tmuxSession}:${summary.config.hudWindow ?? 'hud'}`
          : options.pane || summary.workers.find((w) => w.name === options.worker)?.paneId || summary.workers[0]?.paneId || '';
      if (!resolvedTarget) throw new Error(`Unable to resolve pane for team ${teamName}`);
      console.log(captureTmuxPane(resolvedTarget, lines));
    });

  team
    .command("run-worker")
    .description("Internal: run a worker for a specific task (used by tmux spawner)")
    .requiredOption("--team <name>", "team name")
    .requiredOption("--task-id <id>", "task id")
    .option("--lease-token <token>", "lease token")
    .action(async (options: { team: string; taskId: string; leaseToken?: string }) => {
      const cwd = resolve(process.cwd());
      await runWorker(cwd, options.team, options.taskId, options.leaseToken);
    });
}
