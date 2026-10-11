import "server-only";
import { getDb } from "../db/client";
import { emailDeliveries } from "../db/schema";
import { AppError } from "../http/errors";
import { logger } from "../logger";
import type { RenderedEmail } from "./templates";
import { getEmailTransport } from "./transports";

/**
 * Sends a transactional e-mail synchronously and records the delivery outcome
 * (recipient, template, status — never the body, which may contain a code).
 * Throws SERVICE_UNAVAILABLE so callers can tell the user to retry.
 */
export async function sendEmail(params: {
  to: string;
  template: string;
  locale: string;
  rendered: RenderedEmail;
  userId?: string | null;
}): Promise<void> {
  const transport = getEmailTransport();
  try {
    const { messageId } = await transport.send({
      to: params.to,
      subject: params.rendered.subject,
      html: params.rendered.html,
      text: params.rendered.text,
      template: params.template,
    });
    await getDb()
      .insert(emailDeliveries)
      .values({
        userId: params.userId ?? null,
        toEmail: params.to,
        template: params.template,
        locale: params.locale,
        transport: transport.name,
        status: "sent",
        providerMessageId: messageId ?? null,
      });
  } catch (error) {
    logger.error("email delivery failed", { template: params.template, transport: transport.name, error });
    await getDb()
      .insert(emailDeliveries)
      .values({
        userId: params.userId ?? null,
        toEmail: params.to,
        template: params.template,
        locale: params.locale,
        transport: transport.name,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
      })
      .catch(() => undefined);
    throw new AppError("SERVICE_UNAVAILABLE", "E-mail delivery failed");
  }
}
