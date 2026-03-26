import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  writeFileAtomic,
  removeFileIfExists,
  listFiles,
  readTextIfExists,
  writeTextFile,
  fileExists,
} from "../src/utils/fs.js";

const tempDirs: string[] = [];

async function mkTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ogx-fs-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

describe("fs utilities", () => {
  it("ensureDir creates nested directories", async () => {
    const dir = await mkTempDir();
    const nested = path.join(dir, "a", "b", "c");
    await ensureDir(nested);
    expect(await pathExists(nested)).toBe(true);
  });

  it("ensureDir is idempotent", async () => {
    const dir = await mkTempDir();
    const nested = path.join(dir, "x");
    await ensureDir(nested);
    await ensureDir(nested);
    expect(await pathExists(nested)).toBe(true);
  });

  it("pathExists returns false for nonexistent path", async () => {
    expect(await pathExists("/tmp/nonexistent-ogx-path-12345")).toBe(false);
  });

  it("readJsonFile returns null for missing file", async () => {
    expect(await readJsonFile("/tmp/nonexistent-ogx-path-12345.json")).toBeNull();
  });

  it("readJsonFile returns null for invalid JSON", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "bad.json");
    await fs.writeFile(filePath, "not json", "utf8");
    expect(await readJsonFile(filePath)).toBeNull();
  });

  it("writeJsonFile and readJsonFile round-trip", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "data.json");
    const data = { key: "value", num: 42, nested: { arr: [1, 2] } };
    await writeJsonFile(filePath, data);
    const readBack = await readJsonFile(filePath);
    expect(readBack).toEqual(data);
  });

  it("writeJsonFile creates parent directories", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "sub", "dir", "data.json");
    await writeJsonFile(filePath, { ok: true });
    expect(await readJsonFile(filePath)).toEqual({ ok: true });
  });

  it("writeFileAtomic writes content atomically", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "atomic.txt");
    await writeFileAtomic(filePath, "hello atomic");
    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("hello atomic");
  });

  it("writeFileAtomic does not leave temp files on success", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "atomic2.txt");
    await writeFileAtomic(filePath, "content");
    const files = await fs.readdir(dir);
    expect(files).toEqual(["atomic2.txt"]);
  });

  it("removeFileIfExists removes existing file", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "remove-me.txt");
    await fs.writeFile(filePath, "x", "utf8");
    await removeFileIfExists(filePath);
    expect(await pathExists(filePath)).toBe(false);
  });

  it("removeFileIfExists is silent for missing file", async () => {
    await expect(
      removeFileIfExists("/tmp/nonexistent-ogx-file-99999")
    ).resolves.toBeUndefined();
  });

  it("listFiles returns empty for missing directory", async () => {
    const files = await listFiles("/tmp/nonexistent-ogx-dir-99999");
    expect(files).toEqual([]);
  });

  it("listFiles returns file names", async () => {
    const dir = await mkTempDir();
    await fs.writeFile(path.join(dir, "a.txt"), "a", "utf8");
    await fs.writeFile(path.join(dir, "b.txt"), "b", "utf8");
    const files = await listFiles(dir);
    expect(files.sort()).toEqual(["a.txt", "b.txt"]);
  });

  it("readTextIfExists returns null for missing file", async () => {
    expect(await readTextIfExists("/tmp/nonexistent-ogx-text-99999")).toBeNull();
  });

  it("readTextIfExists returns content for existing file", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "text.txt");
    await writeTextFile(filePath, "hello");
    expect(await readTextIfExists(filePath)).toBe("hello");
  });

  it("fileExists returns boolean synchronously", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "sync-check.txt");
    expect(fileExists(filePath)).toBe(false);
    await fs.writeFile(filePath, "x", "utf8");
    expect(fileExists(filePath)).toBe(true);
  });
});

describe("concurrent write safety", () => {
  it("multiple writeFileAtomic calls do not corrupt each other", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "concurrent.txt");

    const writes = Array.from({ length: 10 }, (_, i) =>
      writeFileAtomic(filePath, `content-${i}`)
    );
    await Promise.all(writes);

    const content = await fs.readFile(filePath, "utf8");
    expect(content).toMatch(/^content-\d$/);
  });

  it("multiple writeJsonFile calls produce valid JSON", async () => {
    const dir = await mkTempDir();
    const filePath = path.join(dir, "concurrent.json");

    const writes = Array.from({ length: 10 }, (_, i) =>
      writeJsonFile(filePath, { index: i })
    );
    await Promise.all(writes);

    const result = await readJsonFile<{ index: number }>(filePath);
    expect(result).not.toBeNull();
    expect(typeof result!.index).toBe("number");
  });
});
