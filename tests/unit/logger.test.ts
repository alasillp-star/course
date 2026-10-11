import { describe, expect, it } from "vitest";
import { maskEmails, redact } from "@/server/logger";

describe("log redaction", () => {
  it("redacts secret-looking keys at any depth", () => {
    const output = redact({
      code: "ABCD",
      pin: "12345678",
      otp: "123456",
      nested: {
        session_token: "x",
        authorization: "Bearer y",
        apiKey: "z",
        cardSerial: "B0001-00001",
      },
      list: [{ password: "p" }],
    }) as Record<string, unknown>;
    expect(output).toEqual({
      code: "[redacted]",
      pin: "[redacted]",
      otp: "[redacted]",
      nested: {
        session_token: "[redacted]",
        authorization: "[redacted]",
        apiKey: "[redacted]",
        cardSerial: "B0001-00001",
      },
      list: [{ password: "[redacted]" }],
    });
  });

  it("masks e-mail addresses in free text and errors", () => {
    expect(maskEmails("contact john.doe@example.com now")).toBe("contact j***@example.com now");
    const error = redact(new Error("user a.b@example.org failed")) as { message: string };
    expect(error.message).toBe("user a***@example.org failed");
  });
});
