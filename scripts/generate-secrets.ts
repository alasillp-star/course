import { randomBytes } from "node:crypto";

/** Prints fresh, independent secrets for a new environment's configuration. */
for (const name of ["AUTH_SECRET", "ACTIVATION_CODE_PEPPER", "DATA_ENCRYPTION_KEY"]) {
  console.log(`${name}=${randomBytes(32).toString("base64")}`);
}
