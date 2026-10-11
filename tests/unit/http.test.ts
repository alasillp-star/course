import { describe, expect, it } from "vitest";
import { maskEmail, normalizeEmail, emailSchema } from "@/modules/identity/email";
import { describeUserAgent } from "@/modules/identity/device";
import { assertSameOrigin } from "@/server/http/api";
import { resetEnvCache } from "@/server/env";
import { safeRedirectPath } from "@/server/http/schemas";

describe("redirect safety", () => {
  it("only allows locale-prefixed relative paths", () => {
    expect(safeRedirectPath("/ar/app/settings", "/ar/app")).toBe("/ar/app/settings");
    expect(safeRedirectPath("//evil.example/ar", "/ar/app")).toBe("/ar/app");
    expect(safeRedirectPath("https://evil.example", "/ar/app")).toBe("/ar/app");
    expect(safeRedirectPath("/\\evil.example", "/ar/app")).toBe("/ar/app");
    expect(safeRedirectPath("/de/app", "/ar/app")).toBe("/ar/app");
    expect(safeRedirectPath(undefined, "/fr/app")).toBe("/fr/app");
  });
});

describe("CSRF origin check", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/v1/x", {
      method: "POST",
      headers: { host: "localhost:3000", ...headers },
    });

  it("accepts same-origin requests", () => {
    expect(() => assertSameOrigin(request({ origin: "http://localhost:3000" }))).not.toThrow();
    expect(() => assertSameOrigin(request({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });

  it("accepts this codespace's forwarded address in development only", () => {
    const previous = { ...process.env };
    process.env.CODESPACE_NAME = "didactic-carnival-6976";
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";
    process.env.APP_ENV = "development";
    resetEnvCache();
    try {
      expect(() =>
        assertSameOrigin(request({ origin: "https://didactic-carnival-6976-3000.app.github.dev" })),
      ).not.toThrow();
      expect(() =>
        assertSameOrigin(request({ origin: "https://other-codespace-3000.app.github.dev" })),
      ).toThrow("CSRF_REJECTED");
      expect(() =>
        assertSameOrigin(
          request({ origin: "https://didactic-carnival-6976-3000.app.github.dev.evil.example" }),
        ),
      ).toThrow("CSRF_REJECTED");
      process.env.APP_ENV = "production";
      process.env.APP_URL = "https://academy.example";
      process.env.EMAIL_TRANSPORT = "resend";
      process.env.RESEND_API_KEY = "re_test";
      process.env.VIDEO_PROVIDER = "none";
      process.env.STORAGE_PROVIDER = "none";
      resetEnvCache();
      expect(() =>
        assertSameOrigin(request({ origin: "https://didactic-carnival-6976-3000.app.github.dev" })),
      ).toThrow("CSRF_REJECTED");
    } finally {
      process.env = previous;
      resetEnvCache();
    }
  });

  it("rejects cross-site and signal-less requests", () => {
    expect(() => assertSameOrigin(request({ origin: "https://evil.example" }))).toThrow(
      "CSRF_REJECTED",
    );
    expect(() => assertSameOrigin(request({ origin: "null" }))).toThrow("CSRF_REJECTED");
    expect(() => assertSameOrigin(request({}))).toThrow("CSRF_REJECTED");
  });
});

describe("e-mail handling", () => {
  it("normalises case and whitespace but keeps dots and tags", () => {
    expect(normalizeEmail("  John.Doe+course@Example.COM ")).toBe("john.doe+course@example.com");
    expect(emailSchema.parse(" A@B.co ")).toBe("a@b.co");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("masks addresses for display", () => {
    expect(maskEmail("john@example.com")).toBe("jo***@example.com");
    expect(maskEmail("a@x.dz")).toBe("a***@x.dz");
  });
});

describe("device labels", () => {
  it("recognises common browsers and platforms", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome · Android");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari · iPhone");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0",
      ),
    ).toBe("Edge · Windows");
    expect(describeUserAgent(null)).toBe("Unknown device");
  });
});
