import { importDeliveryCsv } from "@/modules/commerce/orders.service";
import { requireApiActor } from "@/modules/identity/current";
import { AppError } from "@/server/http/errors";
import { ok, withApi } from "@/server/http/api";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

/**
 * Imports a status export (CSV) downloaded from the carrier's dashboard. The
 * body is the file itself (text/csv). Can unlock cards: override permission.
 */
export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "orders.delivery.override" });
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^(text\/(csv|plain)|application\/(vnd\.ms-excel|csv))/i.test(contentType)) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  }
  if (Number(request.headers.get("content-length") ?? "0") > MAX_CSV_BYTES) {
    throw new AppError("UPLOAD_TOO_LARGE");
  }
  const csv = await request.text();
  if (csv.length > MAX_CSV_BYTES) throw new AppError("UPLOAD_TOO_LARGE");
  return ok(await importDeliveryCsv(actor, csv, meta));
});
