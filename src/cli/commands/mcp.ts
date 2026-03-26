import { resolve } from 'node:path';
import type { Command } from "commander";
import { serveMcp } from '../../mcp/server.js';

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("MCP server for Gemini CLI integration")
    .argument("[subcommand]", "serve")
    .option("--cwd <path>", "working directory")
    .action(async (subcommand: string | undefined, options: { cwd?: string }) => {
      if (subcommand !== 'serve') {
        console.log('Usage: ogx mcp serve [--cwd <path>]');
        return;
      }
      await serveMcp(resolve(options.cwd ?? process.cwd()));
    });
}
