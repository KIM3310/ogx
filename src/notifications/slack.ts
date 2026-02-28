export async function sendSlackNotification(
  webhookUrl: string,
  message: string
): Promise<void> {
  if (!webhookUrl) {
    return;
  }

  if (!/^https:\/\/hooks\.slack\.com\/services\//.test(webhookUrl)) {
    throw new Error("Invalid Slack webhook URL format");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Slack webhook failed: ${response.status} ${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
