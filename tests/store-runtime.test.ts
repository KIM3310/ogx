import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { markRunStarted, markRunStopped } from "../src/state/runtime.js";
import { readConfig, readRunState, writeConfig } from "../src/state/store.js";
import { configSchema, type OgxConfig } from "../src/state/schemas.js";
import {
  buildOgxPathsFromRoot,
  ensureOgxBaseDirs,
} from "../src/utils/paths.js";

const tempDirs: string[] = [];

async function mkTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ogx-store-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

describe("store/runtime", () => {
  it("writes and reads config", async () => {
    const temp = await mkTempDir();
    const paths = buildOgxPathsFromRoot("project", path.join(temp, ".ogx"));
    await ensureOgxBaseDirs(paths);

    const config: OgxConfig = configSchema.parse({
      version: 1,
      runtime: {
        geminiCommand: "gemini",
      },
      notifications: { discordWebhookUrl: "" },
      team: { defaultWorkers: 2 },
      safety: { allowDangerousFlags: false },
    });

    await writeConfig(paths, config);
    const readBack = await readConfig(paths);

    expect(readBack).not.toBeNull();
    expect(readBack?.team.defaultWorkers).toBe(2);
  });

  it("tracks run start and stop", async () => {
    const temp = await mkTempDir();
    const paths = buildOgxPathsFromRoot("project", path.join(temp, ".ogx"));
    await ensureOgxBaseDirs(paths);

    await markRunStarted(paths, {
      mode: "launch",
      command: "gemini",
      args: ["-p", "hello"],
      pid: 12345,
      scope: "project",
    });

    const started = await readRunState(paths);
    expect(started?.status).toBe("running");
    expect(started?.pid).toBe(12345);

    await markRunStopped(paths);
    const stopped = await readRunState(paths);
    expect(stopped?.status).toBe("stopped");
    expect(stopped?.stoppedAt).toBeTypeOf("string");
  });
});
