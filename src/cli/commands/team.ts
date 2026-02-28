import { Command } from "commander";
import { readConfig } from "../../state/store.js";
import { info } from "../../utils/logger.js";
import { assertPositiveInt } from "../../utils/validate.js";
import {
  teamResume,
  teamShutdown,
  teamStart,
  teamStatus,
} from "../../team/orchestrator.js";
import { resolvePathsWithBaseDirs } from "../context.js";

const DEFAULT_TEAM = "default";

function resolveTeamName(name?: string): string {
  return name?.trim() || DEFAULT_TEAM;
}

export function registerTeamCommand(program: Command): void {
  const team = program.command("team").description("Manage tmux-based multi-agent workers");

  team
    .command("start")
    .description("Start a worker team")
    .option("--scope <scope>", "user | project")
    .option("--name <team>", "team name", DEFAULT_TEAM)
    .option("--workers <n>", "worker count")
    .action(async (options: { name?: string; scope?: string; workers?: string }) => {
      const { paths, scope } = await resolvePathsWithBaseDirs(options.scope);
      const teamName = resolveTeamName(options.name);
      const config = await readConfig(paths);
      const configuredWorkers = config?.team.defaultWorkers ?? 3;
      const workers = options.workers
        ? assertPositiveInt(Number(options.workers), "workers")
        : configuredWorkers;

      await teamStart({
        paths,
        scope,
        teamName,
        workers,
      });
    });

  team
    .command("status")
    .description("Show team status")
    .option("--scope <scope>", "user | project")
    .option("--name <team>", "team name", DEFAULT_TEAM)
    .action(async (options: { name?: string; scope?: string }) => {
      const { paths } = await resolvePathsWithBaseDirs(options.scope);
      const teamName = resolveTeamName(options.name);
      const result = await teamStatus(paths, teamName);

      if (!result.state) {
        info(`team=${teamName} not found`);
        return;
      }

      info(
        `team=${teamName} session=${result.state.sessionName} status=${result.state.status} alive=${result.sessionAlive}`
      );
      for (const worker of result.workers) {
        info(
          `worker=${worker.workerId} status=${worker.status} processed=${worker.processedTasks}`
        );
      }
    });

  team
    .command("resume")
    .description("Resume a previously configured team")
    .option("--scope <scope>", "user | project")
    .option("--name <team>", "team name", DEFAULT_TEAM)
    .action(async (options: { name?: string; scope?: string }) => {
      const { paths } = await resolvePathsWithBaseDirs(options.scope);
      const teamName = resolveTeamName(options.name);
      await teamResume(paths, teamName);
    });

  team
    .command("shutdown")
    .description("Shutdown a running team")
    .option("--scope <scope>", "user | project")
    .option("--name <team>", "team name", DEFAULT_TEAM)
    .action(async (options: { name?: string; scope?: string }) => {
      const { paths } = await resolvePathsWithBaseDirs(options.scope);
      const teamName = resolveTeamName(options.name);
      await teamShutdown(paths, teamName);
    });
}
