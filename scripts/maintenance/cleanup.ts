import "../_env";
import { runMaintenance } from "@/modules/platform/maintenance.service";
import { closeDb, getDb } from "@/server/db/client";

/** Data-retention housekeeping (schedule daily); see maintenance.service.ts for the rules. */
async function main() {
  const removed = await runMaintenance(getDb());
  for (const [name, count] of Object.entries(removed)) {
    console.log(`✓ ${name}: ${count} rows removed`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("✗ cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
