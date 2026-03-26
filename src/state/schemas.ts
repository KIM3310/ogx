import { z } from "zod";

export const scopeSchema = z.union([z.literal("user"), z.literal("project")]);

export const configSchema = z.object({
  notifications: z
    .object({
      discordWebhookUrl: z.string().url().or(z.literal("")).default(""),
      discordWebhookEnv: z.string().default("OGX_DISCORD_WEBHOOK_URL"),
      slackWebhookUrl: z.string().url().or(z.literal("")).default(""),
      slackWebhookEnv: z.string().default("OGX_SLACK_WEBHOOK_URL"),
      telegramBotToken: z.string().default(""),
      telegramBotTokenEnv: z.string().default("OGX_TELEGRAM_BOT_TOKEN"),
      telegramChatId: z.string().default(""),
      telegramChatIdEnv: z.string().default("OGX_TELEGRAM_CHAT_ID"),
      gmail: z
        .object({
          enabled: z.boolean().default(false),
          from: z.string().email().or(z.literal("")).default(""),
          to: z.string().email().or(z.literal("")).default(""),
          user: z.string().email().or(z.literal("")).default(""),
          appPassword: z.string().default(""),
          userEnv: z.string().default("OGX_GMAIL_USER"),
          appPasswordEnv: z.string().default("OGX_GMAIL_APP_PASSWORD"),
          subjectPrefix: z.string().default("[ogx]"),
        })
        .default({}),
    })
    .default({}),
  runtime: z
    .object({
      geminiCommand: z.string().default("gemini"),
    })
    .default({ geminiCommand: "gemini" }),
  safety: z
    .object({
      allowDangerousFlags: z.boolean().default(false),
    })
    .default({ allowDangerousFlags: false }),
  team: z
    .object({
      defaultWorkers: z.number().int().positive().default(3),
    })
    .default({ defaultWorkers: 3 }),
  version: z.number().int().positive(),
});

export const runStateSchema = z.object({
  args: z.array(z.string()),
  command: z.string(),
  mode: z.union([z.literal("launch"), z.literal("team")]),
  pid: z.number().int().positive(),
  scope: scopeSchema,
  startedAt: z.string(),
  status: z.union([z.literal("running"), z.literal("stopped")]),
  stoppedAt: z.string().optional(),
});

export const workerRefSchema = z.object({
  inboxPath: z.string(),
  statePath: z.string(),
  windowName: z.string(),
  workerId: z.string(),
});

export const teamStateSchema = z.object({
  createdAt: z.string(),
  scope: scopeSchema,
  sessionName: z.string(),
  status: z.union([z.literal("running"), z.literal("stopped")]),
  teamName: z.string(),
  updatedAt: z.string(),
  workers: z.array(workerRefSchema),
});

export const taskSchema = z.object({
  createdAt: z.string(),
  error: z.string().optional(),
  id: z.string(),
  payload: z.string(),
  status: z.union([
    z.literal("pending"),
    z.literal("running"),
    z.literal("done"),
    z.literal("failed"),
  ]),
  updatedAt: z.string(),
});

export const workerInboxSchema = z.object({
  tasks: z.array(taskSchema),
});

export const workerStateSchema = z.object({
  currentTaskId: z.string().optional(),
  lastHeartbeatAt: z.string(),
  processedTasks: z.number().int().nonnegative(),
  status: z.union([z.literal("idle"), z.literal("busy"), z.literal("stopped")]),
  teamName: z.string(),
  workerId: z.string(),
});

export type OgxConfig = z.output<typeof configSchema>;
export type RunState = z.output<typeof runStateSchema>;
export type TeamState = z.output<typeof teamStateSchema>;
export type Task = z.output<typeof taskSchema>;
export type WorkerInbox = z.output<typeof workerInboxSchema>;
export type WorkerState = z.output<typeof workerStateSchema>;
