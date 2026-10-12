import type { Actor } from "@/modules/access/actor";

/**
 * What every feature's demo seed receives (development data only). Each seed
 * must be idempotent: `npm run setup` runs them again on existing demo data
 * (npm run db:seed:dev -- --extras).
 */
export type DemoSeedContext = {
  /** The demo Super Admin (owner@academy.test), with every permission. */
  actor: Actor;
  courseId: string;
};
