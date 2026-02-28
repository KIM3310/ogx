import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

export function runCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    const timer =
      options?.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGTERM");
          }, options.timeoutMs)
        : undefined;

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const result = await runCommand(command, ["--version"], {
      timeoutMs: 3000,
    });
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function terminateProcess(pid: number): Promise<void> {
  process.kill(pid, "SIGTERM");
}
