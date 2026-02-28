export const TEAM_NAME_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
export const WORKER_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export type Scope = "user" | "project";

export function parseScope(scope: string | undefined): Scope {
  if (!scope) {
    throw new Error("Scope is required: user | project");
  }
  if (scope !== "user" && scope !== "project") {
    throw new Error(`Invalid scope: ${scope}. Use user | project`);
  }
  return scope;
}

export function assertSafeTeamName(value: string): string {
  if (!TEAM_NAME_PATTERN.test(value)) {
    throw new Error(
      "Invalid team name. Allowed: letters, numbers, underscore, dash (1-40 chars)."
    );
  }
  return value;
}

export function assertSafeWorkerId(value: string): string {
  if (!WORKER_ID_PATTERN.test(value)) {
    throw new Error(
      "Invalid worker id. Allowed: letters, numbers, underscore, dash (1-40 chars)."
    );
  }
  return value;
}

export function assertPositiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}
