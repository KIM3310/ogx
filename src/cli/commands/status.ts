import type { Command } from "commander";
import { printRunStatus } from "../../state/runtime.js";
import { resolvePathsWithBaseDirs } from "../context.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show launch mode runtime status")
    .option("--scope <scope>", "user | project")
    .action(async (options: { scope?: string }) => {
      const { paths } = await resolvePathsWithBaseDirs(options.scope);
      await printRunStatus(paths);
    });
}
