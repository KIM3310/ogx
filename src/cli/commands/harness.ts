import { resolve } from 'node:path';
import type { Command } from "commander";
import { loadProjectConfig } from '../../config/project.js';
import { runHarness } from '../../harness/runner.js';

export function registerHarnessCommand(program: Command): void {
  program
    .command("harness")
    .description("Run a single Gemini prompt through the harness")
    .argument("[subcommand]", "run")
    .requiredOption("--prompt <text>", "prompt text")
    .option("--cwd <path>", "working directory")
    .option("--model <model>", "Gemini model")
    .option("--json-response", "parse JSON from response", false)
    .action(async (subcommand: string | undefined, options: { prompt: string; cwd?: string; model?: string; jsonResponse?: boolean }) => {
      if (subcommand !== 'run') {
        console.log('Usage: ogx harness run --prompt "<text>" [--cwd <path>] [--model <model>] [--json-response]');
        return;
      }

      const cwd = resolve(options.cwd ?? process.cwd());
      const config = await loadProjectConfig(cwd);
      const result = await runHarness({
        cwd,
        prompt: options.prompt,
        model: options.model ?? config.defaultModel,
        approvalMode: config.approvalMode,
        includeDirectories: [cwd, ...config.includeDirectories],
        parseJsonResponse: options.jsonResponse ?? false,
      });

      if (options.jsonResponse) {
        console.log(JSON.stringify({
          sessionId: result.sessionId,
          responseText: result.responseText,
          parsedResponse: result.parsedResponse,
          stats: result.stats,
          stderr: result.stderr,
        }, null, 2));
        return;
      }

      console.log(result.responseText);
    });
}
