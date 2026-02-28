import { Command } from "commander";
import { registerCancelCommand } from "./commands/cancel.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerLaunchCommand } from "./commands/launch.js";
import { registerSetupCommand } from "./commands/setup.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerTeamCommand } from "./commands/team.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("ogx")
    .description("oh-my-gemini: Gemini multi-agent orchestration CLI")
    .version("0.1.0")
    .enablePositionalOptions()
    .showHelpAfterError();

  registerSetupCommand(program);
  registerDoctorCommand(program);
  registerLaunchCommand(program);
  registerTeamCommand(program);
  registerStatusCommand(program);
  registerCancelCommand(program);

  return program;
}
