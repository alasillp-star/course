/**
 * Loads .env files the same way Next.js does (.env, .env.local, .env.<mode>...)
 * so CLI scripts see the same configuration as the app. Import this first.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
