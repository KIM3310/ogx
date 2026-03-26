import { readdir } from "node:fs/promises";
import path from "node:path";
import { resolveNotificationTargets } from "../notifications/config.js";
import {
  readConfig,
  readTeamState,
  readWorkerInbox,
  readWorkerState,
} from "../state/store.js";
import { detectDefaultScope, buildOgxPaths } from "../utils/paths.js";

export interface TeamSessionReplaySnapshot {
  configuredChannels: string[];
  latestHeartbeatAt: string | null;
  teams: Array<{
    sessionName: string;
    status: string;
    teamName: string;
    workers: Array<{
      failedTasks: number;
      lastHeartbeatAt: string | null;
      pendingTasks: number;
      processedTasks: number;
      status: string;
      workerId: string;
    }>;
  }>;
}

function emptySnapshot(): TeamSessionReplaySnapshot {
  return {
    configuredChannels: [],
    latestHeartbeatAt: null,
    teams: [],
  };
}

export async function summarizeTeamSessions(cwd = process.cwd()): Promise<TeamSessionReplaySnapshot> {
  const scope = await detectDefaultScope(cwd);
  const paths = buildOgxPaths(scope, cwd);
  const config = await readConfig(paths);
  const configuredChannels = config
    ? detectConfiguredChannels(resolveNotificationTargets(config))
    : [];

  let teamFiles: string[] = [];
  try {
    teamFiles = (await readdir(paths.stateDir)).filter(
      (file) => file.startsWith("team.") && file.endsWith(".json")
    );
  } catch {
    return {
      configuredChannels,
      latestHeartbeatAt: null,
      teams: [],
    };
  }

  const teams: TeamSessionReplaySnapshot["teams"] = [];
  let latestHeartbeatAt: string | null = null;

  for (const file of teamFiles) {
    const rawName = file.slice("team.".length, -".json".length);
    if (!rawName) continue;
    const state = await readTeamState(paths, rawName);
    if (!state) continue;

    const workers: TeamSessionReplaySnapshot["teams"][number]["workers"] = [];
    for (const worker of state.workers) {
      const workerState = await readWorkerState(paths, rawName, worker.workerId);
      const workerInbox = await readWorkerInbox(paths, rawName, worker.workerId);
      const tasks = workerInbox?.tasks ?? [];
      const lastHeartbeat = workerState?.lastHeartbeatAt ?? null;
      if (lastHeartbeat && (!latestHeartbeatAt || lastHeartbeat > latestHeartbeatAt)) {
        latestHeartbeatAt = lastHeartbeat;
      }
      workers.push({
        workerId: worker.workerId,
        status: workerState?.status ?? "unknown",
        processedTasks: workerState?.processedTasks ?? 0,
        pendingTasks: tasks.filter((task) => task.status === "pending").length,
        failedTasks: tasks.filter((task) => task.status === "failed").length,
        lastHeartbeatAt: lastHeartbeat,
      });
    }

    teams.push({
      teamName: state.teamName,
      sessionName: state.sessionName,
      status: state.status,
      workers,
    });
  }

  return {
    configuredChannels,
    latestHeartbeatAt,
    teams: teams.sort((left, right) => left.teamName.localeCompare(right.teamName)),
  };
}

function detectConfiguredChannels(targets: ReturnType<typeof resolveNotificationTargets>): string[] {
  const channels: string[] = [];
  if (targets.discordWebhookUrl) channels.push("discord");
  if (targets.slackWebhookUrl) channels.push("slack");
  if (targets.telegramBotToken && targets.telegramChatId) channels.push("telegram");
  if (
    targets.gmail.enabled &&
    targets.gmail.from &&
    targets.gmail.to &&
    targets.gmail.user &&
    targets.gmail.appPassword
  ) {
    channels.push("gmail");
  }
  return channels;
}

export function buildTeamSessionReplayPayload(
  snapshot: TeamSessionReplaySnapshot = emptySnapshot()
) {
  const allWorkers = snapshot.teams.flatMap((team) => team.workers);
  return {
    service: "oh-my-gemini-api",
    status: "ok",
    generated_at: new Date().toISOString(),
    schema: "ogx-team-session-replay-v1",
    summary: {
      visible_teams: snapshot.teams.length,
      active_workers: allWorkers.filter((worker) => worker.status !== "stopped").length,
      pending_tasks: allWorkers.reduce((sum, worker) => sum + worker.pendingTasks, 0),
      failed_tasks: allWorkers.reduce((sum, worker) => sum + worker.failedTasks, 0),
      configured_notification_channels: snapshot.configuredChannels.length,
      latest_heartbeat_at: snapshot.latestHeartbeatAt,
    },
    items: snapshot.teams.map((team) => ({
      team_name: team.teamName,
      session_name: team.sessionName,
      status: team.status,
      workers: team.workers,
    })),
    review_actions: [
      "Inspect worker heartbeat and inbox backlog before trusting a resumed team session.",
      "Keep notification delivery proof visible when team handoff depends on alerts reaching operators.",
      "Use runtime brief and status pack alongside this replay surface before external automation handoff.",
    ],
    links: {
      team_session_replay: "/v1/team-session-replay",
      runtime_brief: "/v1/runtime-brief",
      runtime_scorecard: "/v1/runtime-scorecard",
      review_pack: "/v1/review-pack",
    },
  };
}
