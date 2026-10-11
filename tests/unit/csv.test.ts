import { describe, expect, it } from "vitest";
import { toCsv } from "@/server/csv";

describe("CSV export", () => {
  it("quotes special characters and neutralises spreadsheet formulas", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", "x,y"], ["+1", "-2"], ["@SUM", 'say "hi"']]);
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe(`"'=HYPERLINK(""x"")","x,y"`);
    expect(lines[2]).toBe("'+1,'-2");
    expect(lines[3]).toBe(`'@SUM,"say ""hi"""`);
  });

  it("starts with a UTF-8 BOM so Excel reads Arabic correctly", () => {
    expect(toCsv(["الاسم"], [["قيمة"]]).startsWith("﻿")).toBe(true);
  });
});
