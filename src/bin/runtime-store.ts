import fs from "node:fs";
import path from "node:path";

export interface OgxRuntimeEvent {
  at: string;
  event_type: "route_hit" | "doctor_run";
  method?: string;
  route?: string;
  scope?: "project" | "user";
  ok?: boolean;
  duration_ms?: number;
}

export interface OgxRuntimeStoreSummary {
  enabled: boolean;
  path: string;
  event_count: number;
  route_hits: number;
  doctor_runs: number;
  failed_doctor_runs: number;
  last_event_at: string | null;
}

export function readRuntimeStorePath(): string {
  return process.env.OGX_RUNTIME_STORE_PATH || path.resolve(process.cwd(), ".runtime/ogx-runtime-events.jsonl");
}

function ensureRuntimeStoreFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", "utf8");
  }
}

export function createRuntimeStore() {
  const filePath = readRuntimeStorePath();
  ensureRuntimeStoreFile(filePath);

  return {
    path: filePath,
    append(event: OgxRuntimeEvent): void {
      ensureRuntimeStoreFile(filePath);
      fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
    },
  };
}

export function summarizeRuntimeStore(limit = 4000): OgxRuntimeStoreSummary {
  const filePath = readRuntimeStorePath();
  const summary: OgxRuntimeStoreSummary = {
    enabled: true,
    path: filePath,
    event_count: 0,
    route_hits: 0,
    doctor_runs: 0,
    failed_doctor_runs: 0,
    last_event_at: null,
  };

  if (!fs.existsSync(filePath)) {
    return summary;
  }

  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(-Math.max(1, limit));

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as OgxRuntimeEvent;
      summary.event_count += 1;
      if (summary.last_event_at === null || (event.at ?? "") > summary.last_event_at) {
        summary.last_event_at = event.at ?? null;
      }
      if (event.event_type === "route_hit") {
        summary.route_hits += 1;
      }
      if (event.event_type === "doctor_run") {
        summary.doctor_runs += 1;
        if (event.ok === false) {
          summary.failed_doctor_runs += 1;
        }
      }
    } catch {
      continue;
    }
  }

  return summary;
}
