import { resolve } from 'node:path';
import type { Command } from "commander";
import { loadProjectConfig } from '../../config/project.js';
import { renderHud } from '../../hud/render.js';
import { readHudSnapshot } from '../../hud/state.js';
import { createDetachedHudSession, isTmuxInstalled, openHudInTmux, tmuxSessionExists } from '../../tmux/session.js';

async function renderOnce(cwd: string, flags: { team?: string; json: boolean }): Promise<void> {
  const snapshot = await readHudSnapshot(cwd, flags.team);
  if (flags.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  process.stdout.write(renderHud(snapshot));
}

export function registerHudCommand(program: Command): void {
  program
    .command("hud")
    .description("Display HUD for team task/worker state")
    .option("--watch", "continuously refresh HUD", false)
    .option("--json", "output JSON instead of text", false)
    .option("--team <team>", "filter to a specific team")
    .option("--tmux", "open HUD in tmux pane/session", false)
    .option("--interval-ms <ms>", "refresh interval in watch mode")
    .action(async (options: { watch?: boolean; json?: boolean; team?: string; tmux?: boolean; intervalMs?: string }) => {
      const cwd = resolve(process.cwd());

      if (options.tmux) {
        if (!isTmuxInstalled()) {
          throw new Error('tmux is not installed');
        }
        if (process.env.TMUX) {
          const paneId = openHudInTmux(cwd, options.team);
          console.log(`Opened HUD in tmux pane ${paneId}`);
          return;
        }
        const sessionName = `ogx-hud-${(await loadProjectConfig(cwd)).projectName}`;
        if (!tmuxSessionExists(sessionName)) {
          createDetachedHudSession(cwd, sessionName, options.team);
        }
        console.log(`Started detached HUD session ${sessionName}`);
        return;
      }

      if (!options.watch) {
        await renderOnce(cwd, { team: options.team, json: options.json ?? false });
        return;
      }

      const parsedInterval = options.intervalMs ? Number.parseInt(options.intervalMs, 10) : undefined;
      const intervalMs = (parsedInterval && Number.isFinite(parsedInterval) && parsedInterval > 0)
        ? parsedInterval
        : (await loadProjectConfig(cwd)).hudRefreshMs;

      while (true) {
        process.stdout.write('\x1b[2J\x1b[H');
        await renderOnce(cwd, { team: options.team, json: options.json ?? false });
        await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
      }
    });
}
