import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";

export const MAILBOX = path.resolve(".data/e2e-mailbox");
export const STATE_DIR = path.resolve("tests/e2e/.state");
export const ADMIN_STATE = path.join(STATE_DIR, "admin.json");
export const DATA_FILE = path.join(STATE_DIR, "data.json");

export type Card = { serial: string; code: string; pin: string; url: string; sold: boolean };
export type E2EData = {
  adminEmail: string;
  adminSecret: string;
  batchId: string;
  courseId: string;
  cards: Card[];
  /** QR-only cards (no PIN), never sold at the counter: for the delivery flow. */
  qrCards: Array<{ serial: string; code: string; url: string }>;
};

/** Shared secrets of the test server's integrations (see playwright.config.ts). */
export const ORDERS_TOKEN = "e2e-orders-token-0123456789abcdefghijklmnop";
export const DELIVERY_TOKEN = "e2e-delivery-token-0123456789abcdefghijklmn";

export function saveData(data: E2EData) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function loadData(): E2EData {
  return JSON.parse(readFileSync(DATA_FILE, "utf8")) as E2EData;
}

type OtpTemplate = "otp.login" | "otp.activation" | "otp.email_change";

/** Waits for the newest OTP e-mail (of `template`) sent to `to` after `sinceMs`. */
export async function readOtp(
  to: string,
  sinceMs: number,
  template?: OtpTemplate,
): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(MAILBOX)) {
      const files = readdirSync(MAILBOX)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .reverse();
      for (const file of files) {
        const message = JSON.parse(readFileSync(path.join(MAILBOX, file), "utf8")) as {
          to: string;
          text: string;
          sentAt: string;
          template: string;
        };
        if (
          message.to === to &&
          Date.parse(message.sentAt) >= sinceMs &&
          (!template || message.template === template)
        ) {
          const code = message.text.match(/\b(\d{6})\b/)?.[1];
          if (code) return code;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No OTP e-mail for ${to}`);
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "")) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 code, independent from the application implementation. */
export function totp(secret: string, offsetSteps = 0): string {
  const counter = Math.floor(Date.now() / 30_000) + offsetSteps;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  const binary =
    ((hmac[offset]! & 127) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

/** Signs `email` in through the public OTP API (the context keeps the cookie). */
export async function apiLogin(
  api: APIRequestContext,
  email: string,
): Promise<{ redirectTo: string; isStaff: boolean }> {
  const since = Date.now();
  const request = await api.post("/api/v1/auth/otp/request", { data: { email, locale: "ar" } });
  expect(request.status(), await request.text()).toBe(200);
  const { challengeId } = (await request.json()).data as { challengeId: string };
  const verify = await api.post("/api/v1/auth/otp/verify", {
    data: { challengeId, code: await readOtp(email, since, "otp.login"), locale: "ar" },
  });
  expect(verify.status(), await verify.text()).toBe(200);
  return (await verify.json()).data;
}

/** Redeems a card through the public activation API, returning the student's context. */
export async function apiActivate(api: APIRequestContext, card: Card, email: string) {
  const since = Date.now();
  const start = await api.post("/api/v1/activation/start", {
    data: { code: card.code, pin: card.pin, email, locale: "ar" },
  });
  expect(start.status(), await start.text()).toBe(200);
  const { challengeId } = (await start.json()).data as { challengeId: string };
  const complete = await api.post("/api/v1/activation/complete", {
    data: { challengeId, otp: await readOtp(email, since, "otp.activation"), locale: "ar" },
  });
  expect(complete.status(), await complete.text()).toBe(200);
}

export function parseCsv(text: string): string[][] {
  return text
    .replace(/^﻿/, "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
}
