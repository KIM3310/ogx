import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function writeTextFile(filePath: string, text: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, text, "utf8");
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readTextFile(filePath);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeTextFile(filePath, text);
}

export async function copyDirectoryRecursive(
  srcDir: string,
  dstDir: string,
  options?: { force?: boolean }
): Promise<void> {
  const force = options?.force ?? false;
  await ensureDir(dstDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, dstPath, { force });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!force && (await pathExists(dstPath))) {
      continue;
    }

    await ensureDir(path.dirname(dstPath));
    await fs.copyFile(srcPath, dstPath);
  }
}

export async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = path.join(
    path.dirname(filePath),
    `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

export async function removeDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
