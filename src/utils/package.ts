import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function getPackageRoot(importMetaUrl: string): string {
  let current = dirname(fileURLToPath(importMetaUrl));

  while (true) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Unable to find package.json above ${current}`);
    }
    current = parent;
  }
}

export function readPackageVersion(importMetaUrl: string): string {
  const packageRoot = getPackageRoot(importMetaUrl);
  const raw = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version?: string };
  return raw.version ?? '0.0.0';
}

export function getBinScriptPath(importMetaUrl: string): string {
  return join(getPackageRoot(importMetaUrl), 'bin', 'ogx.js');
}
