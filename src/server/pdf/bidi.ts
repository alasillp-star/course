/**
 * Minimal bidirectional ordering for one line of text drawn in a PDF.
 *
 * pdf-lib shapes Arabic through fontkit (letters join correctly) and fontkit
 * reverses a right-to-left run into visual order — but it treats a whole
 * string as one run, so "محمد 2026 Ali" comes out as "ilA 6202 محمد". This
 * splits a line into directional runs and orders them visually; each run is
 * then drawn on its own. Enough for names, titles and short labels (no
 * explicit embedding controls, no mirroring).
 *
 * Pure module: no server-only imports (unit tested).
 */

export type Direction = "rtl" | "ltr";
export type TextRun = { text: string; direction: Direction };

const RTL_STRONG = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_STRONG = /[A-Za-zÀ-ɏḀ-ỿ0-9٠-٩۰-۹]/;

function classify(char: string): Direction | "neutral" {
  // Digits (Western and Arabic-Indic) read left to right inside Arabic text.
  if (/[0-9٠-٩۰-۹]/.test(char)) return "ltr";
  if (RTL_STRONG.test(char)) return "rtl";
  if (LTR_STRONG.test(char)) return "ltr";
  return "neutral";
}

/** Paragraph direction: that of the first strong character (LTR when none). */
export function baseDirection(text: string): Direction {
  for (const char of text) {
    const kind = classify(char);
    if (kind !== "neutral") return kind;
  }
  return "ltr";
}

/**
 * Runs in logical order. Neutral characters (spaces, punctuation) between two
 * runs of the same direction join them; otherwise they take the paragraph
 * direction.
 */
export function logicalRuns(text: string, base = baseDirection(text)): TextRun[] {
  const chars = [...text];
  const kinds = chars.map(classify);
  const resolved: Direction[] = kinds.map((kind, index) => {
    if (kind !== "neutral") return kind;
    let before: Direction | null = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const k = kinds[i]!;
      if (k !== "neutral") {
        before = k;
        break;
      }
    }
    let after: Direction | null = null;
    for (let i = index + 1; i < kinds.length; i += 1) {
      const k = kinds[i]!;
      if (k !== "neutral") {
        after = k;
        break;
      }
    }
    return before && before === after ? before : base;
  });
  const runs: TextRun[] = [];
  chars.forEach((char, index) => {
    const direction = resolved[index]!;
    const last = runs.at(-1);
    if (last && last.direction === direction) last.text += char;
    else runs.push({ text: char, direction });
  });
  return runs;
}

/** Runs in the order they are drawn from left to right. */
export function visualRuns(text: string): TextRun[] {
  const base = baseDirection(text);
  const runs = logicalRuns(text, base);
  return base === "rtl" ? runs.reverse() : runs;
}
