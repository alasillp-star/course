import "../_env";
import { bootstrapPlatform } from "@/modules/platform/bootstrap.service";
import { closeDb, getDb } from "@/server/db/client";

/** Production-safe bootstrap. Idempotent: run after every migration. */
async function main() {
  const db = getDb();
  const result = await db.transaction((tx) =>
    bootstrapPlatform(tx, { superAdminEmail: process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL }),
  );
  console.log("✓ access catalogue synchronised");
  console.log(`✓ main course ready (${result.courseId})`);
  if (result.superAdminCreated) {
    console.log(
      `✓ super admin created for ${result.superAdminCreated} — sign in with an e-mailed code, then enrol MFA`,
    );
  } else if (result.superAdmins === 0) {
    console.warn("! no Super Admin exists: set BOOTSTRAP_SUPER_ADMIN_EMAIL and run again");
  }
}

main()
  .catch((error: unknown) => {
    console.error("✗ seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
