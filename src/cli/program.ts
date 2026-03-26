import { Command } from "commander";
import { OGX_COMMAND_NAME, OGX_PROGRAM_DESCRIPTION, OGX_VERSION } from "../meta.js";
import { registerCancelCommand } from "./commands/cancel.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerHarnessCommand } from "./commands/harness.js";
import { registerHudCommand } from "./commands/hud.js";
import { registerLaunchCommand } from "./commands/launch.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerSetupCommand } from "./commands/setup.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerTeamCommand } from "./commands/team.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name(OGX_COMMAND_NAME)
    .description(OGX_PROGRAM_DESCRIPTION)
    .version(OGX_VERSION)
    .enablePositionalOptions()
    .showHelpAfterError();

  registerSetupCommand(program);
  registerDoctorCommand(program);
  registerLaunchCommand(program);
  registerTeamCommand(program);
  registerStatusCommand(program);
  registerCancelCommand(program);
  registerHudCommand(program);
  registerMcpCommand(program);
  registerHarnessCommand(program);

  return program;
}
