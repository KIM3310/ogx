import { sendDiscordNotification } from "../notifications/discord.js";
import { resolveNotificationTargets } from "../notifications/config.js";
import { sendGmailNotification } from "../notifications/gmail.js";
import { sendSlackNotification } from "../notifications/slack.js";
import { sendTelegramNotification } from "../notifications/telegram.js";
import { readConfig } from "../state/store.js";
import { info, warn } from "../utils/logger.js";
import type { OgxPaths } from "../utils/paths.js";

export interface TurnCompletePayload {
  actor: string;
  eventId: string;
  summary: string;
}

function buildMessage(payload: TurnCompletePayload): string {
  return [
    "ogx turn-complete",
    `actor: ${payload.actor}`,
    `eventId: ${payload.eventId}`,
    `summary: ${payload.summary}`,
  ].join("\n");
}

export async function dispatchTurnComplete(
  paths: OgxPaths,
  payload: TurnCompletePayload
): Promise<void> {
  const config = await readConfig(paths);
  if (!config) {
    return;
  }

  const message = buildMessage(payload);
  const targets = resolveNotificationTargets(config);
  const sentChannels: string[] = [];

  if (targets.discordWebhookUrl) {
    try {
      await sendDiscordNotification(targets.discordWebhookUrl, message);
      sentChannels.push("discord");
    } catch (error) {
      warn(
        `Discord notification failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (targets.slackWebhookUrl) {
    try {
      await sendSlackNotification(targets.slackWebhookUrl, message);
      sentChannels.push("slack");
    } catch (error) {
      warn(
        `Slack notification failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (targets.telegramBotToken || targets.telegramChatId) {
    if (!targets.telegramBotToken || !targets.telegramChatId) {
      warn("Telegram notification skipped: token/chatId is incomplete");
    } else {
      try {
        await sendTelegramNotification(
          targets.telegramBotToken,
          targets.telegramChatId,
          message
        );
        sentChannels.push("telegram");
      } catch (error) {
        warn(
          `Telegram notification failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  if (targets.gmail.enabled) {
    const gmailReady =
      targets.gmail.from &&
      targets.gmail.to &&
      targets.gmail.user &&
      targets.gmail.appPassword;

    if (!gmailReady) {
      warn("Gmail notification skipped: from/to/credentials incomplete");
    } else {
      try {
        await sendGmailNotification({
          from: targets.gmail.from,
          to: targets.gmail.to,
          user: targets.gmail.user,
          appPassword: targets.gmail.appPassword,
          subject: `${targets.gmail.subjectPrefix} turn-complete ${payload.eventId}`,
          text: message,
        });
        sentChannels.push("gmail");
      } catch (error) {
        warn(
          `Gmail notification failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  if (sentChannels.length > 0) {
    info(`turn-complete notifications sent via: ${sentChannels.join(", ")}`);
  }
}
