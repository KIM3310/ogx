import { spawn } from "node:child_process";
import path from "node:path";
import type { Command } from "commander";
import { markRunStarted, markRunStopped } from "../../state/runtime.js";
import { readConfig } from "../../state/store.js";
import { ensureDir } from "../../utils/fs.js";
import { info } from "../../utils/logger.js";
import type { OgxPaths } from "../../utils/paths.js";
import { resolvePathsWithBaseDirs } from "../context.js";

const DANGEROUS_PATTERNS = [
  /^--danger/i,
  /^--yolo$/i,
  /^--skip[-_]safety$/i,
  /^--sandbox=danger-full-access$/i,
  /^danger-full-access$/i,
];

function hasDangerousFlag(args: string[]): string | null {
  for (const arg of args) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(arg)) {
        return arg;
      }
    }
  }
  return null;
}

function buildLaunchEnv(paths: OgxPaths, scope: "user" | "project"): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (scope === "project") {
    env.HOME = paths.homeDir;
    env.XDG_CONFIG_HOME = path.join(paths.rootDir, "xdg-config");
    env.OGX_SCOPE = "project";
    env.OGX_HOME = paths.rootDir;
  } else {
    env.OGX_SCOPE = "user";
    env.OGX_HOME = paths.rootDir;
  }
  return env;
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

export function registerLaunchCommand(program: Command): void {
  program
    .command("launch [geminiArgs...]")
    .description("Launch Gemini CLI with ogx runtime wrapping")
    .option("--scope <scope>", "user | project")
    .option("--detach", "run in background", false)
    .option("--dry-run", "print resolved command only", false)
    .option("--allow-dangerous", "opt-in to dangerous flags for this launch", false)
    .allowUnknownOption(true)
    .passThroughOptions()
    .action(
      async (
        geminiArgs: string[],
        options: {
          allowDangerous?: boolean;
          detach?: boolean;
          dryRun?: boolean;
          scope?: string;
        }
      ) => {
        const args = Array.isArray(geminiArgs) ? geminiArgs : [];
        const { paths, scope } = await resolvePathsWithBaseDirs(options.scope);
        const config = await readConfig(paths);
        if (!config) {
          throw new Error(`Config missing at ${paths.configPath}. Run \`ogx setup --scope ${scope}\`.`);
        }

        const dangerous = hasDangerousFlag(args);
        const allowDangerous = Boolean(options.allowDangerous) || config.safety.allowDangerousFlags;
        if (dangerous && !allowDangerous) {
          throw new Error(
            `Blocked dangerous flag: ${dangerous}. Use --allow-dangerous for explicit opt-in.`
          );
        }

        const geminiCommand =
          process.env.OGX_GEMINI_CMD ?? config.runtime.geminiCommand ?? "gemini";
        const env = buildLaunchEnv(paths, scope);
        if (scope === "project") {
          await ensureDir(paths.homeDir);
          await ensureDir(path.join(paths.rootDir, "xdg-config"));
        }

        info(`launch scope=${scope} cmd=${geminiCommand}`);
        if (options.dryRun) {
          info(`args=${args.join(" ")}`);
          info(`home=${env.HOME ?? ""}`);
          return;
        }

        if (options.detach) {
          const child = spawn(geminiCommand, args, {
            stdio: "ignore",
            detached: true,
            shell: false,
            env,
          });

          if (!child.pid) {
            throw new Error("Failed to start detached process");
          }

          child.unref();
          await markRunStarted(paths, {
            args,
            command: geminiCommand,
            mode: "launch",
            pid: child.pid,
            scope,
          });
          info(`detached pid=${child.pid}`);
          return;
        }

        const child = spawn(geminiCommand, args, {
          stdio: "inherit",
          shell: false,
          env,
        });

        if (!child.pid) {
          throw new Error("Failed to start Gemini process");
        }

        await markRunStarted(paths, {
          args,
          command: geminiCommand,
          mode: "launch",
          pid: child.pid,
          scope,
        });

        try {
          const exitCode = await waitForExit(child);
          if (exitCode !== 0) {
            throw new Error(`Gemini exited with code ${exitCode}`);
          }
        } finally {
          await markRunStopped(paths);
        }
      }
    );
}
