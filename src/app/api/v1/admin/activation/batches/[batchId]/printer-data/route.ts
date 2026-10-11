import { z } from "zod";
import { loadPrintableCards } from "@/modules/activation/batches.service";
import { formatCardCode, formatCardPin } from "@/modules/activation/codes";
import { requireApiActor } from "@/modules/identity/current";
import { csvResponse, toCsv } from "@/server/csv";
import { parseSearchParams, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

const Range = z.object({ from: z.coerce.number().int().min(1), to: z.coerce.number().int().min(1) });

/** Variable-data file for professional printers (serial, code, PIN, QR URL). Audited. */
export const GET = withApi<{ batchId: string }>(
  async (request, { params, meta }) => {
    const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.export" });
    const { from, to } = parseSearchParams(request, Range);
    const { batch, cards } = await loadPrintableCards(
      actor,
      { batchId: parseIdParam((await params).batchId), from, to, format: "csv" },
      meta,
    );
    const csv = toCsv(
      ["serial", "code", "pin", "qr_url"],
      cards.map((card) => [card.serial, formatCardCode(card.code), card.pin ? formatCardPin(card.pin) : "", card.url]),
    );
    return csvResponse(`printer-data-${batch.serialPrefix}-${from}-${to}.csv`, csv);
  },
  { sameSiteOnly: true },
);
