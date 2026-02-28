import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOgxPathsFromRoot,
  detectDefaultScope,
  ensureOgxBaseDirs,
} from "../src/utils/paths.js";

const tempDirs: string[] = [];

async function mkTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ogx-test-"));
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

describe("paths", () => {
  it("builds project root paths", async () => {
    const temp = await mkTempDir();
    const root = path.join(temp, ".ogx");
    const paths = buildOgxPathsFromRoot("project", root);

    await ensureOgxBaseDirs(paths);

    expect(paths.rootDir).toBe(root);
    expect(paths.stateDir).toBe(path.join(root, "state"));
    expect(paths.homeDir).toBe(path.join(root, "home"));

    await expect(fs.stat(paths.logsDir)).resolves.toBeTruthy();
  });

  it("detects project scope when .ogx exists", async () => {
    const temp = await mkTempDir();
    await fs.mkdir(path.join(temp, ".ogx"), { recursive: true });

    await expect(detectDefaultScope(temp)).resolves.toBe("project");
  });

  it("defaults to user scope without .ogx", async () => {
    const temp = await mkTempDir();
    await expect(detectDefaultScope(temp)).resolves.toBe("user");
  });
});
