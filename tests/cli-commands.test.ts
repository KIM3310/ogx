import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/program.js";

describe("CLI command parsing", () => {
  it("registers all expected subcommands", () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("setup");
    expect(names).toContain("doctor");
    expect(names).toContain("launch");
    expect(names).toContain("team");
    expect(names).toContain("status");
    expect(names).toContain("cancel");
    expect(names).toContain("hud");
    expect(names).toContain("mcp");
    expect(names).toContain("harness");
  });

  it("has correct program name and version", () => {
    const program = createProgram();
    expect(program.name()).toBe("ogx");
    expect(program.version()).toBe("1.0.0");
  });

  it("launch command accepts --scope option", () => {
    const program = createProgram();
    const launch = program.commands.find((c) => c.name() === "launch");
    expect(launch).toBeDefined();
    const optionNames = launch!.options.map((o) => o.long);
    expect(optionNames).toContain("--scope");
  });

  it("team command exists as a parent with subcommands or options", () => {
    const program = createProgram();
    const team = program.commands.find((c) => c.name() === "team");
    expect(team).toBeDefined();
  });

  it("status command accepts --scope option", () => {
    const program = createProgram();
    const status = program.commands.find((c) => c.name() === "status");
    expect(status).toBeDefined();
    const optionNames = status!.options.map((o) => o.long);
    expect(optionNames).toContain("--scope");
  });

  it("program shows help after error", () => {
    const program = createProgram();
    // Commander stores this internally; we verify it was set
    expect((program as any)._showHelpAfterError).toBeTruthy();
  });
});
