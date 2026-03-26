import { buildOgxPaths, detectDefaultScope, ensureOgxBaseDirs, type OgxPaths } from "../utils/paths.js";
import { parseScope, type Scope } from "../utils/validate.js";

export async function resolveScope(scopeArg?: string, cwd = process.cwd()): Promise<Scope> {
  if (scopeArg) {
    return parseScope(scopeArg);
  }
  return detectDefaultScope(cwd);
}

export async function resolvePaths(scopeArg?: string, cwd = process.cwd()): Promise<{
  paths: OgxPaths;
  scope: Scope;
}> {
  const scope = await resolveScope(scopeArg, cwd);
  const paths = buildOgxPaths(scope, cwd);
  return { scope, paths };
}

export async function resolvePathsWithBaseDirs(
  scopeArg?: string,
  cwd = process.cwd()
): Promise<{
  paths: OgxPaths;
  scope: Scope;
}> {
  const resolved = await resolvePaths(scopeArg, cwd);
  await ensureOgxBaseDirs(resolved.paths);
  return resolved;
}
