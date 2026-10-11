import { loadBatchRegistry } from "@/modules/activation/batches.service";
import { requireApiActor } from "@/modules/identity/current";
import { csvResponse, toCsv } from "@/server/csv";
import { withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

/** Card registry CSV (statuses and dates; contains no card secrets). */
export const GET = withApi<{ batchId: string }>(
  async (_request, { params }) => {
    const actor = await requireApiActor({ adminArea: true, permission: "activation.codes.read" });
    const { batch, rows } = await loadBatchRegistry(actor, parseIdParam((await params).batchId));
    const csv = toCsv(
      ["serial", "status", "locked", "created_at", "sold_at", "activated_at", "activated_by", "revoked_at", "revoke_reason"],
      rows.map((row) => [
        row.serial,
        row.status,
        row.lockedAt ? "yes" : "no",
        row.createdAt,
        row.soldAt,
        row.activatedAt,
        row.activatedByEmail,
        row.revokedAt,
        row.revokeReason,
      ]),
    );
    return csvResponse(`registry-${batch.serialPrefix}.csv`, csv);
  },
  { sameSiteOnly: true },
);
