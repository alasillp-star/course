import QRCode from "qrcode";
import { requireApiActor } from "@/modules/identity/current";
import { beginTotpEnrollment } from "@/modules/identity/mfa.service";
import { AppError } from "@/server/http/errors";
import { ok, withApi } from "@/server/http/api";

/** Starts authenticator-app enrolment for staff accounts. */
export const POST = withApi(async () => {
  const actor = await requireApiActor();
  if (!actor.isStaff) throw new AppError("FORBIDDEN");
  const { secret, otpauthUri } = await beginTotpEnrollment(actor);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: "M", margin: 1, width: 240 });
  return ok({ secret, otpauthUri, qrDataUrl });
});
