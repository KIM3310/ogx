function assertTelegramToken(token: string): void {
  if (!/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Invalid Telegram bot token format");
  }
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  message: string
): Promise<void> {
  if (!botToken || !chatId) {
    return;
  }

  assertTelegramToken(botToken);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram send failed: ${response.status} ${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
