import type { Command } from "commander";
import { assertCancellable, markRunStopped, reportCancelled } from "../../state/runtime.js";
import { terminateProcess } from "../../utils/process.js";
import { resolvePathsWithBaseDirs } from "../context.js";

export function registerCancelCommand(program: Command): void {
  program
    .command("cancel")
    .description("Cancel currently running launch process")
    .option("--scope <scope>", "user | project")
    .action(async (options: { scope?: string }) => {
      const { paths } = await resolvePathsWithBaseDirs(options.scope);
      const state = await assertCancellable(paths);

      try {
        await terminateProcess(state.pid);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ESRCH") {
          throw error;
        }
      }

      await markRunStopped(paths);
      reportCancelled(state.pid);
    });
}
