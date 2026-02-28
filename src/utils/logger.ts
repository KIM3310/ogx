export type LogLevel = "info" | "warn" | "error" | "debug";

function format(level: LogLevel, message: string): string {
  return `[ogx:${level}] ${message}`;
}

export function log(level: LogLevel, message: string): void {
  if (level === "error") {
    console.error(format(level, message));
    return;
  }
  if (level === "warn") {
    console.warn(format(level, message));
    return;
  }
  console.log(format(level, message));
}

export function info(message: string): void {
  log("info", message);
}

export function warn(message: string): void {
  log("warn", message);
}

export function error(message: string): void {
  log("error", message);
}
