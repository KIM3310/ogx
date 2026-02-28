import type { OgxConfig } from "../state/schemas.js";

export interface ResolvedNotificationTargets {
  discordWebhookUrl: string;
  gmail: {
    appPassword: string;
    enabled: boolean;
    from: string;
    subjectPrefix: string;
    to: string;
    user: string;
  };
  slackWebhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
}

function pickSecret(direct: string, envKey: string, env: NodeJS.ProcessEnv): string {
  if (direct.trim().length > 0) {
    return direct.trim();
  }
  return (env[envKey] ?? "").trim();
}

export function resolveNotificationTargets(
  config: OgxConfig,
  env: NodeJS.ProcessEnv = process.env
): ResolvedNotificationTargets {
  const notifications = config.notifications;

  const discordWebhookUrl = pickSecret(
    notifications.discordWebhookUrl,
    notifications.discordWebhookEnv,
    env
  );

  const slackWebhookUrl = pickSecret(
    notifications.slackWebhookUrl,
    notifications.slackWebhookEnv,
    env
  );

  const telegramBotToken = pickSecret(
    notifications.telegramBotToken,
    notifications.telegramBotTokenEnv,
    env
  );

  const telegramChatId = pickSecret(
    notifications.telegramChatId,
    notifications.telegramChatIdEnv,
    env
  );

  const gmail = {
    enabled: notifications.gmail.enabled,
    from: notifications.gmail.from.trim(),
    to: notifications.gmail.to.trim(),
    user: pickSecret(notifications.gmail.user, notifications.gmail.userEnv, env),
    appPassword: pickSecret(
      notifications.gmail.appPassword,
      notifications.gmail.appPasswordEnv,
      env
    ),
    subjectPrefix: notifications.gmail.subjectPrefix.trim() || "[ogx]",
  };

  return {
    discordWebhookUrl,
    slackWebhookUrl,
    telegramBotToken,
    telegramChatId,
    gmail,
  };
}

export function hasAtLeastOneNotificationChannel(
  targets: ResolvedNotificationTargets
): boolean {
  const hasTelegram =
    targets.telegramBotToken.length > 0 && targets.telegramChatId.length > 0;

  const hasGmail =
    targets.gmail.enabled &&
    targets.gmail.from.length > 0 &&
    targets.gmail.to.length > 0 &&
    targets.gmail.user.length > 0 &&
    targets.gmail.appPassword.length > 0;

  return (
    targets.discordWebhookUrl.length > 0 ||
    targets.slackWebhookUrl.length > 0 ||
    hasTelegram ||
    hasGmail
  );
}
