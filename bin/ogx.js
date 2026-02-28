#!/usr/bin/env node
import("../dist/bin/ogx.js").catch((error) => {
  console.error("[ogx] failed to start:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
