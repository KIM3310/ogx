export async function sendDiscordNotification(
  webhookUrl: string,
  message: string
): Promise<void> {
  if (!webhookUrl) {
    return;
  }
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(webhookUrl)) {
    throw new Error("Invalid Discord webhook URL format");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: message }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord webhook failed: ${response.status} ${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
