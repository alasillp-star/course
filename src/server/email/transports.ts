import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "../env";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Template id, used for delivery logs and the dev outbox (never the body). */
  template: string;
};

export interface EmailTransport {
  readonly name: string;
  send(message: OutgoingEmail): Promise<{ messageId?: string }>;
}

/** Any SMTP provider (Postmark, SES, Brevo, Mailgun, Resend SMTP, Mailpit in dev). */
export class SmtpTransport implements EmailTransport {
  readonly name = "smtp";
  private readonly transporter: Transporter;

  constructor(
    url: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {
    this.transporter = nodemailer.createTransport(url);
  }

  async send(message: OutgoingEmail) {
    const info = await this.transporter.sendMail({
      from: this.from,
      replyTo: this.replyTo,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { messageId: info.messageId };
  }
}

/** Resend HTTP API (no SDK dependency). */
export class ResendTransport implements EmailTransport {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  async send(message: OutgoingEmail) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        reply_to: this.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: "template", value: message.template.replace(/[^a-zA-Z0-9_-]/g, "_") }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Resend API responded ${response.status}`);
    }
    const body = (await response.json()) as { id?: string };
    return { messageId: body.id };
  }
}

/**
 * Development/test only: writes each e-mail as JSON into DEV_MAIL_OUTBOX_DIR
 * so developers and the E2E suite can read OTPs without a mail server.
 * Rejected by env validation in staging/production.
 */
export class DevOutboxTransport implements EmailTransport {
  readonly name = "dev-outbox";

  constructor(private readonly directory: string) {}

  async send(message: OutgoingEmail) {
    await mkdir(this.directory, { recursive: true });
    const safeRecipient = message.to.replace(/[^a-zA-Z0-9@._-]/g, "_");
    const file = path.join(
      this.directory,
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeRecipient}.json`,
    );
    await writeFile(
      file,
      JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
    return { messageId: path.basename(file) };
  }
}

let transport: EmailTransport | undefined;

export function getEmailTransport(): EmailTransport {
  if (transport) return transport;
  const env = getEnv();
  switch (env.EMAIL_TRANSPORT) {
    case "smtp":
      transport = new SmtpTransport(env.SMTP_URL!, env.EMAIL_FROM, env.EMAIL_REPLY_TO);
      break;
    case "resend":
      transport = new ResendTransport(env.RESEND_API_KEY!, env.EMAIL_FROM, env.EMAIL_REPLY_TO);
      break;
    case "dev-outbox":
      transport = new DevOutboxTransport(path.resolve(env.DEV_MAIL_OUTBOX_DIR));
      break;
  }
  return transport;
}

/** Tests can inject a transport (e.g. an in-memory recorder). */
export function setEmailTransport(next: EmailTransport | undefined): void {
  transport = next;
}
