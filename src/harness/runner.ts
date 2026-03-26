import { parseLooseJson } from '../utils/json.js';
import { runGeminiPrompt, type GeminiRunOptions } from '../gemini/cli.js';

export interface HarnessRunOptions extends GeminiRunOptions {
  parseJsonResponse?: boolean;
}

export interface HarnessRunResult<T = unknown> {
  sessionId?: string;
  responseText: string;
  parsedResponse: T | null;
  stats?: unknown;
  stderr: string;
}

export async function runHarness<T = unknown>(options: HarnessRunOptions): Promise<HarnessRunResult<T>> {
  const result = await runGeminiPrompt(options);
  return {
    sessionId: result.sessionId,
    responseText: result.responseText,
    parsedResponse: options.parseJsonResponse ? parseLooseJson<T>(result.responseText) : null,
    stats: result.stats,
    stderr: result.stderr,
  };
}
