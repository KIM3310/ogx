import type { Command } from "commander";
import { ensureInstalledAssets } from "../../state/store.js";
import { ensureDir } from "../../utils/fs.js";
import { info } from "../../utils/logger.js";
import { resolvePackageRoot } from "../../utils/paths.js";
import { resolvePathsWithBaseDirs } from "../context.js";

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Install prompts/skills/templates and initialize state directories")
    .requiredOption("--scope <scope>", "user | project")
    .option("--force", "overwrite installed assets", false)
    .action(async (options: { force?: boolean; scope: string }) => {
      const { paths, scope } = await resolvePathsWithBaseDirs(options.scope);
      const packageRoot = resolvePackageRoot(import.meta.url);

      await ensureInstalledAssets(packageRoot, paths, {
        force: options.force ?? false,
      });

      if (scope === "project") {
        await ensureDir(paths.homeDir);
      }

      info(`setup complete (scope=${scope})`);
      info(`root=${paths.rootDir}`);
      info(`state=${paths.stateDir}`);
      info(`logs=${paths.logsDir}`);
      info(`plans=${paths.plansDir}`);
    });
}
