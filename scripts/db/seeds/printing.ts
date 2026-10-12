import type { DemoSeedContext } from "./types";

/** Demo data for this feature (development only, idempotent). Returns a line for the summary, or null. */
export async function seedPrintingDemo(context: DemoSeedContext): Promise<string | null> {
  void context; // not implemented yet
  return null;
}
