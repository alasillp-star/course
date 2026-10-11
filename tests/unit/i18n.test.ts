import { describe, expect, it } from "vitest";
import { localeDirection, matchLocale } from "@/i18n/config";
import { ar } from "@/i18n/dictionaries/ar";
import { en } from "@/i18n/dictionaries/en";
import { fr } from "@/i18n/dictionaries/fr";
import { format, pickLocalized } from "@/i18n/format";

function shape(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [`${prefix}[${value.length}]`, ...value.flatMap((item, i) => shape(item, `${prefix}[${i}]`))];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => shape(inner, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

describe("i18n", () => {
  it("every dictionary has exactly the same keys as Arabic", () => {
    expect(shape(fr)).toEqual(shape(ar));
    expect(shape(en)).toEqual(shape(ar));
  });

  it("uses the same placeholders in every translation", () => {
    const placeholders = (dict: unknown) =>
      shape(dict).map((path) => {
        const value = path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dict);
        return typeof value === "string" ? `${path}:${[...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",")}` : path;
      });
    expect(placeholders(fr)).toEqual(placeholders(ar));
    expect(placeholders(en)).toEqual(placeholders(ar));
  });

  it("negotiates the locale from Accept-Language", () => {
    expect(matchLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(matchLocale("en-US,ar;q=0.5")).toBe("ar");
    expect(matchLocale(null)).toBe("ar");
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("fr")).toBe("ltr");
  });

  it("formats placeholders and localised content with fallbacks", () => {
    expect(format("{done} / {total}", { done: 3, total: 9 })).toBe("3 / 9");
    expect(format("{missing}")).toBe("{missing}");
    expect(pickLocalized({ ar: "مرحبا" }, "fr")).toBe("مرحبا");
    expect(pickLocalized(null, "ar")).toBe("");
  });
});
