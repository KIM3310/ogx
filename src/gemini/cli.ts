import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { type ApprovalMode } from '../config/project.js';

const execFileAsync = promisify(execFile);

export interface GeminiRunOptions {
  cwd: string;
  prompt: string;
  model?: string;
  approvalMode?: ApprovalMode;
  includeDirectories?: string[];
  geminiBinary?: string;
  outputFormat?: 'json' | 'text' | 'stream-json';
  timeoutMs?: number;
}

export interface GeminiStructuredEnvelope {
  session_id?: string;
  response?: string;
  stats?: unknown;
}

export interface GeminiRunResult {
  sessionId?: string;
  responseText: string;
  stats?: unknown;
  stdout: string;
  stderr: string;
}

export class GeminiCliError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;

  constructor(message: string, stdout: string, stderr: string, exitCode: number | null) {
    super(message);
    this.stdout = stdout;
    this.stderr = stderr;
    this.exitCode = exitCode;
  }
}

export function resolveGeminiBinary(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const candidate = override ?? env.OMG_GEMINI_BIN ?? 'gemini';
  return candidate.includes('/') ? resolve(candidate) : candidate;
}

export async function detectGeminiVersion(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  try {
    const binary = resolveGeminiBinary(override, env);
    const { stdout } = await execFileAsync(binary, ['--version'], {
      encoding: 'utf8',
      env,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function geminiSettingsPath(home = homedir()): string {
  return join(home, '.gemini', 'settings.json');
}

export function geminiOauthPath(home = homedir()): string {
  return join(home, '.gemini', 'oauth_creds.json');
}

export function hasGeminiAuth(home = homedir()): boolean {
  return existsSync(geminiOauthPath(home));
}

export async function runGeminiPrompt(options: GeminiRunOptions): Promise<GeminiRunResult> {
  const binary = resolveGeminiBinary(options.geminiBinary);
  const args = [
    '-p',
    options.prompt,
    '--output-format',
    options.outputFormat ?? 'json',
  ];

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.approvalMode) {
    if (options.approvalMode === 'yolo') {
      args.push('--yolo');
    } else {
      args.push('--approval-mode', options.approvalMode);
    }
  }

  for (const includeDirectory of options.includeDirectories ?? []) {
    args.push('--include-directories', includeDirectory);
  }

  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
      timeout: options.timeoutMs ?? 180_000,
    });

    const parsed = JSON.parse(stdout) as GeminiStructuredEnvelope;
    return {
      sessionId: parsed.session_id,
      responseText: parsed.response ?? '',
      stats: parsed.stats,
      stdout,
      stderr,
    };
  } catch (error) {
    const failed = error as {
      stdout?: string;
      stderr?: string;
      code?: number | null;
      message?: string;
    };
    throw new GeminiCliError(
      failed.message ?? 'Gemini CLI execution failed',
      failed.stdout ?? '',
      failed.stderr ?? '',
      failed.code ?? null,
    );
  }
}
