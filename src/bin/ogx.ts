import { createProgram } from "../cli/program.js";

async function main(): Promise<void> {
  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ogx] ${message}`);
  process.exitCode = 1;
});
