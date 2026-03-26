import { describe, expect, it } from "vitest";
import { configSchema } from "../src/state/schemas.js";
import {
  hasAtLeastOneNotificationChannel,
  resolveNotificationTargets,
} from "../src/notifications/config.js";

describe("notifications config", () => {
  it("resolves webhook/token values from env fallback", () => {
    const config = configSchema.parse({
      version: 1,
      notifications: {
        slackWebhookEnv: "TEST_SLACK_WEBHOOK",
        telegramBotTokenEnv: "TEST_TELEGRAM_BOT",
        telegramChatIdEnv: "TEST_TELEGRAM_CHAT",
        gmail: {
          enabled: true,
          from: "from@example.com",
          to: "to@example.com",
          userEnv: "TEST_GMAIL_USER",
          appPasswordEnv: "TEST_GMAIL_PASS",
        },
      },
    });

    const targets = resolveNotificationTargets(config, {
      TEST_SLACK_WEBHOOK: "https://hooks.slack.com/services/T000/B000/XXX",
      TEST_TELEGRAM_BOT: "123456:ABC_token",
      TEST_TELEGRAM_CHAT: "-100123",
      TEST_GMAIL_USER: "user@gmail.com",
      TEST_GMAIL_PASS: "app-password",
    });

    expect(targets.slackWebhookUrl).toContain("hooks.slack.com");
    expect(targets.telegramBotToken).toContain(":");
    expect(targets.telegramChatId).toBe("-100123");
    expect(targets.gmail.user).toBe("user@gmail.com");
    expect(targets.gmail.appPassword).toBe("app-password");
    expect(hasAtLeastOneNotificationChannel(targets)).toBe(true);
  });

  it("prefers direct config over env values", () => {
    const config = configSchema.parse({
      version: 1,
      notifications: {
        slackWebhookUrl: "https://hooks.slack.com/services/T000/B000/CONFIG",
        slackWebhookEnv: "TEST_SLACK_WEBHOOK",
      },
    });

    const targets = resolveNotificationTargets(config, {
      TEST_SLACK_WEBHOOK: "https://hooks.slack.com/services/T000/B000/ENV",
    });

    expect(targets.slackWebhookUrl).toContain("CONFIG");
  });
});
