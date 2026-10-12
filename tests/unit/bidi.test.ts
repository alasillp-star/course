import { describe, expect, it } from "vitest";
import { baseDirection, logicalRuns, visualRuns } from "@/server/pdf/bidi";

const texts = (runs: Array<{ text: string }>) => runs.map((run) => run.text);

describe("PDF line ordering (bidi)", () => {
  it("detects the paragraph direction from the first strong character", () => {
    expect(baseDirection("عبد الرحمن")).toBe("rtl");
    expect(baseDirection("Amine بن علي")).toBe("ltr");
    expect(baseDirection("  2026 محمد")).toBe("ltr");
    expect(baseDirection("—")).toBe("ltr");
  });

  it("keeps a single-script line as one run", () => {
    expect(visualRuns("عبد الرحمن بن علي")).toEqual([
      { text: "عبد الرحمن بن علي", direction: "rtl" },
    ]);
    expect(visualRuns("Amine Benali")).toEqual([{ text: "Amine Benali", direction: "ltr" }]);
  });

  it("orders mixed runs right to left in an Arabic line", () => {
    expect(texts(logicalRuns("محمد 2026 Ali"))).toEqual(["محمد ", "2026 Ali"]);
    expect(texts(visualRuns("محمد 2026 Ali"))).toEqual(["2026 Ali", "محمد "]);
    expect(texts(visualRuns("شهادة رقم AC-7K2M-9QX4"))).toEqual(["AC-7K2M-9QX4", "شهادة رقم "]);
  });

  it("keeps the logical order in a Latin line with Arabic inside", () => {
    expect(texts(visualRuns("Amine Benali (بن علي)"))).toEqual(["Amine Benali (", "بن علي", ")"]);
  });

  it("reads Arabic-Indic digits left to right", () => {
    expect(visualRuns("٢٠٢٦")).toEqual([{ text: "٢٠٢٦", direction: "ltr" }]);
  });
});
