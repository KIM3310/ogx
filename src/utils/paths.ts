import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, pathExists } from "./fs.js";
import type { Scope } from "./validate.js";

export interface OgxPaths {
  configPath: string;
  homeDir: string;
  logsDir: string;
  plansDir: string;
  promptsDir: string;
  rootDir: string;
  scope: Scope;
  skillsDir: string;
  stateDir: string;
  templatesDir: string;
}

export function resolvePackageRoot(fromImportMetaUrl: string): string {
  const filePath = fileURLToPath(fromImportMetaUrl);
  let current = path.dirname(filePath);
  const root = path.parse(current).root;

  while (current !== root) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }

  throw new Error("Cannot locate package.json from current module path");
}

export async function detectDefaultScope(cwd = process.cwd()): Promise<Scope> {
  const projectOgx = path.join(cwd, ".ogx");
  if (await pathExists(projectOgx)) {
    return "project";
  }
  return "user";
}

export function buildOgxPaths(scope: Scope, cwd = process.cwd()): OgxPaths {
  const rootDir =
    scope === "user" ? path.join(os.homedir(), ".ogx") : path.join(cwd, ".ogx");
  return buildOgxPathsFromRoot(scope, rootDir);
}

export function buildOgxPathsFromRoot(scope: Scope, rootDir: string): OgxPaths {
  const normalizedRoot = path.resolve(rootDir);
  return {
    scope,
    rootDir: normalizedRoot,
    stateDir: path.join(normalizedRoot, "state"),
    logsDir: path.join(normalizedRoot, "logs"),
    plansDir: path.join(normalizedRoot, "plans"),
    promptsDir: path.join(normalizedRoot, "prompts"),
    skillsDir: path.join(normalizedRoot, "skills"),
    templatesDir: path.join(normalizedRoot, "templates"),
    configPath: path.join(normalizedRoot, "config.json"),
    homeDir: scope === "project" ? path.join(normalizedRoot, "home") : os.homedir(),
  };
}

export async function ensureOgxBaseDirs(paths: OgxPaths): Promise<void> {
  await ensureDir(paths.rootDir);
  await ensureDir(paths.stateDir);
  await ensureDir(paths.logsDir);
  await ensureDir(paths.plansDir);
  await ensureDir(paths.promptsDir);
  await ensureDir(paths.skillsDir);
  await ensureDir(paths.templatesDir);
}
