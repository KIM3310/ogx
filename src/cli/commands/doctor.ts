import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import {
  hasAtLeastOneNotificationChannel,
  resolveNotificationTargets,
} from "../../notifications/config.js";
import { readConfig } from "../../state/store.js";
import { info, warn } from "../../utils/logger.js";
import { pathExists } from "../../utils/fs.js";
import { runCommand } from "../../utils/process.js";
import { isTmuxAvailable } from "../../team/tmux.js";
import { resolvePathsWithBaseDirs } from "../context.js";

interface Check {
  detail: string;
  name: string;
  pass: boolean;
  required: boolean;
}

async function checkDirectoryHasFiles(dirPath: string): Promise<boolean> {
  if (!(await pathExists(dirPath))) {
    return false;
  }
  const entries = await fs.readdir(dirPath);
  return entries.length > 0;
}

async function checkGeminiCli(command: string): Promise<{ pass: boolean; detail: string }> {
  try {
    const result = await runCommand(command, ["--version"], { timeoutMs: 4000 });
    if (result.code !== 0) {
      return { pass: false, detail: result.stderr || result.stdout || "non-zero exit" };
    }
    return { pass: true, detail: result.stdout || "available" };
  } catch (error) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveVertexAuthState(env: NodeJS.ProcessEnv): {
  detail: string;
  pass: boolean;
} {
  const explicitCreds = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicitCreds) {
    return {
      pass: true,
      detail: `GOOGLE_APPLICATION_CREDENTIALS=${explicitCreds}`,
    };
  }

  const adcPath = path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");
  if (existsSync(adcPath)) {
    return {
      pass: true,
      detail: `ADC file found at ${adcPath}`,
    };
  }

  return {
    pass: false,
    detail: "No ADC found. Use gcloud auth application-default login or set GOOGLE_APPLICATION_CREDENTIALS",
  };
}

function nodeVersionPass(version = process.versions.node): boolean {
  const major = Number(version.split(".")[0]);
  return Number.isFinite(major) && major >= 20;
}

function printChecks(checks: Check[]): void {
  for (const check of checks) {
    const state = check.pass ? "PASS" : check.required ? "FAIL" : "WARN";
    info(`${state} ${check.name}: ${check.detail}`);
  }
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Diagnose local runtime requirements")
    .option("--scope <scope>", "user | project")
    .action(async (options: { scope?: string }) => {
      const { paths, scope } = await resolvePathsWithBaseDirs(options.scope);
      const config = await readConfig(paths);
      const geminiCommand =
        process.env.OGX_GEMINI_CMD ?? config?.runtime.geminiCommand ?? "gemini";
      const gemini = await checkGeminiCli(geminiCommand);
      const targets = config ? resolveNotificationTargets(config) : null;

      const checks: Check[] = [
        {
          name: "node",
          pass: nodeVersionPass(),
          detail: process.versions.node,
          required: true,
        },
        {
          name: "gemini-cli",
          pass: gemini.pass,
          detail: `cmd=${geminiCommand} ${gemini.detail}`,
          required: true,
        },
        {
          name: "config",
          pass: config !== null,
          detail: config ? paths.configPath : `${paths.configPath} missing or invalid`,
          required: true,
        },
        {
          name: "prompts",
          pass: await checkDirectoryHasFiles(paths.promptsDir),
          detail: paths.promptsDir,
          required: true,
        },
        {
          name: "skills",
          pass: await checkDirectoryHasFiles(paths.skillsDir),
          detail: paths.skillsDir,
          required: true,
        },
        {
          name: "tmux",
          pass: await isTmuxAvailable(),
          detail: "required for `ogx team`",
          required: false,
        },
      ];

      const isWindows = process.platform === "win32";
      if (isWindows && !process.env.WSL_DISTRO_NAME) {
        checks.push({
          name: "platform",
          pass: false,
          detail: "Windows native shell detected. Use WSL for full support.",
          required: false,
        });
      } else {
        checks.push({
          name: "platform",
          pass: true,
          detail: `${os.platform()} ${os.release()}`,
          required: false,
        });
      }

      if (targets) {
        checks.push({
          name: "notifications-any",
          pass: hasAtLeastOneNotificationChannel(targets),
          detail: "discord/slack/telegram/gmail",
          required: false,
        });

        checks.push({
          name: "slack",
          pass: targets.slackWebhookUrl.length > 0,
          detail: targets.slackWebhookUrl.length > 0 ? "configured" : "not configured",
          required: false,
        });

        const telegramReady =
          targets.telegramBotToken.length > 0 && targets.telegramChatId.length > 0;
        checks.push({
          name: "telegram",
          pass: telegramReady,
          detail: telegramReady ? "configured" : "token/chatId incomplete",
          required: false,
        });

        const gmailReady =
          targets.gmail.enabled &&
          targets.gmail.from.length > 0 &&
          targets.gmail.to.length > 0 &&
          targets.gmail.user.length > 0 &&
          targets.gmail.appPassword.length > 0;
        checks.push({
          name: "gmail",
          pass: gmailReady,
          detail: targets.gmail.enabled ? (gmailReady ? "configured" : "enabled but incomplete") : "disabled",
          required: false,
        });
      }

      const vertexProject = (process.env.GOOGLE_CLOUD_PROJECT ?? "").trim();
      const vertexAuth = resolveVertexAuthState(process.env);
      const vertexEnabled =
        (process.env.GOOGLE_GENAI_USE_VERTEXAI ?? "").toLowerCase() === "true";

      checks.push({
        name: "vertex-enabled",
        pass: vertexEnabled,
        detail: vertexEnabled
          ? "GOOGLE_GENAI_USE_VERTEXAI=true"
          : "set GOOGLE_GENAI_USE_VERTEXAI=true for Vertex routing",
        required: false,
      });
      checks.push({
        name: "vertex-project",
        pass: vertexProject.length > 0,
        detail:
          vertexProject.length > 0
            ? vertexProject
            : "set GOOGLE_CLOUD_PROJECT=<your-project-id>",
        required: false,
      });
      checks.push({
        name: "vertex-auth",
        pass: vertexAuth.pass,
        detail: vertexAuth.detail,
        required: false,
      });

      info(`doctor scope=${scope} root=${path.resolve(paths.rootDir)}`);
      printChecks(checks);

      const requiredFailed = checks.some((check) => check.required && !check.pass);
      if (requiredFailed) {
        process.exitCode = 1;
        warn("doctor found required failures");
      }
    });
}
