import { runCommand } from "../utils/process.js";
import { assertSafeTeamName } from "../utils/validate.js";

export async function isTmuxAvailable(): Promise<boolean> {
  try {
    const result = await runCommand("tmux", ["-V"], { timeoutMs: 2000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  assertSafeTeamName(sessionName.replace(/^ogx-/, ""));
  const result = await runCommand("tmux", ["has-session", "-t", sessionName], {
    timeoutMs: 2000,
  });
  return result.code === 0;
}

export async function tmuxCreateSession(
  sessionName: string,
  windowName: string,
  command: string
): Promise<void> {
  const result = await runCommand("tmux", [
    "new-session",
    "-d",
    "-s",
    sessionName,
    "-n",
    windowName,
    command,
  ]);
  if (result.code !== 0) {
    throw new Error(`Failed to create tmux session: ${result.stderr || result.stdout}`);
  }
}

export async function tmuxCreateWindow(
  sessionName: string,
  windowName: string,
  command: string
): Promise<void> {
  const result = await runCommand("tmux", [
    "new-window",
    "-d",
    "-t",
    sessionName,
    "-n",
    windowName,
    command,
  ]);
  if (result.code !== 0) {
    throw new Error(`Failed to create tmux window: ${result.stderr || result.stdout}`);
  }
}

export async function tmuxKillSession(sessionName: string): Promise<void> {
  const result = await runCommand("tmux", ["kill-session", "-t", sessionName]);
  if (result.code !== 0) {
    throw new Error(`Failed to kill tmux session: ${result.stderr || result.stdout}`);
  }
}
