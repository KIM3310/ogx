import nodemailer from "nodemailer";

export interface GmailNotificationInput {
  appPassword: string;
  from: string;
  subject: string;
  text: string;
  to: string;
  user: string;
}

export async function sendGmailNotification(input: GmailNotificationInput): Promise<void> {
  if (!input.user || !input.appPassword) {
    throw new Error("Missing Gmail credentials");
  }
  if (!input.from || !input.to) {
    throw new Error("Missing Gmail sender or recipient");
  }

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: input.user,
      pass: input.appPassword,
    },
  });

  await transport.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
