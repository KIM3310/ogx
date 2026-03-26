import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/program.js";

describe("program", () => {
  it("registers top-level commands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain("setup");
    expect(commandNames).toContain("doctor");
    expect(commandNames).toContain("launch");
    expect(commandNames).toContain("team");
    expect(commandNames).toContain("status");
    expect(commandNames).toContain("cancel");
  });
});
