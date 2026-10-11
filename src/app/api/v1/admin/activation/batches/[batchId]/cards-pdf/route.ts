import { z } from "zod";
import { ACADEMY } from "@/config/academy";
import { loadPrintableCards } from "@/modules/activation/batches.service";
import { defaultCardDesign, renderCardsPdf } from "@/modules/activation/card-pdf";
import { requireApiActor } from "@/modules/identity/current";
import { getEnv } from "@/server/env";
import { parseSearchParams, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

const Range = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

export const maxDuration = 120;

/** Print-ready PDF of a card range. Contains secrets: export permission, audited. */
export const GET = withApi<{ batchId: string }>(
  async (request, { params, meta }) => {
    const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.export" });
    const { from, to } = parseSearchParams(request, Range);
    const { batch, cards } = await loadPrintableCards(
      actor,
      { batchId: parseIdParam((await params).batchId), from, to, format: "pdf" },
      meta,
    );
    const pdf = await renderCardsPdf({
      cards,
      design: defaultCardDesign({ academyName: ACADEMY.name.en, appUrl: getEnv().APP_URL }),
      documentTitle: `Activation cards ${batch.serialPrefix} ${from}-${to}`,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cards-${batch.serialPrefix}-${from}-${to}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { sameSiteOnly: true },
);
