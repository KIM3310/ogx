import { join, resolve } from 'node:path';
import { readJsonFile, writeJsonFile } from '../utils/fs.js';
import { type OmgProjectConfig } from './project.js';

export interface GeminiProjectSettings {
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
  }>;
  [key: string]: unknown;
}

export function geminiProjectSettingsPath(cwd: string): string {
  return join(resolve(cwd), '.gemini', 'settings.json');
}

export async function loadGeminiProjectSettings(cwd: string): Promise<GeminiProjectSettings> {
  return (await readJsonFile<GeminiProjectSettings>(geminiProjectSettingsPath(cwd))) ?? {};
}

export async function syncGeminiProjectSettings(
  cwd: string,
  config: OmgProjectConfig,
  omgBinPath: string,
): Promise<GeminiProjectSettings> {
  const current = await loadGeminiProjectSettings(cwd);
  const next: GeminiProjectSettings = {
    ...current,
    mcpServers: {
      ...(current.mcpServers ?? {}),
      [config.mcpServerName]: {
        command: 'node',
        args: [omgBinPath, 'mcp', 'serve', '--cwd', resolve(cwd)],
      },
    },
  };
  await writeJsonFile(geminiProjectSettingsPath(cwd), next);
  return next;
}
