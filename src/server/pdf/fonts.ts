import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { Color, PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { visualRuns } from "./bidi";

/**
 * Unicode fonts for generated PDFs (activation cards, certificates). The
 * built-in PDF fonts (Helvetica…) cover Latin only; IBM Plex Sans Arabic — the
 * platform's own typeface, SIL Open Font License (assets/fonts) — covers
 * Arabic and Latin. pdf-lib + fontkit shape Arabic (joined letters) and
 * `drawLine` orders mixed Arabic/Latin text (see bidi.ts).
 *
 * Files are read from assets/fonts at runtime (included in the server bundle
 * by outputFileTracingIncludes in next.config.ts).
 */

export type BrandFonts = { regular: PDFFont; bold: PDFFont };

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const cache = new Map<string, Promise<Buffer>>();

function fontBytes(file: string): Promise<Buffer> {
  let bytes = cache.get(file);
  if (!bytes) {
    bytes = readFile(path.join(FONT_DIR, file));
    bytes.catch(() => cache.delete(file));
    cache.set(file, bytes);
  }
  return bytes;
}

/** Embeds the brand fonts (subset: only the glyphs used end up in the file). */
export async function embedBrandFonts(pdf: PDFDocument): Promise<BrandFonts> {
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    fontBytes("IBMPlexSansArabic-Regular.ttf"),
    fontBytes("IBMPlexSansArabic-Bold.ttf"),
  ]);
  return {
    regular: await pdf.embedFont(regular, { subset: true }),
    bold: await pdf.embedFont(bold, { subset: true }),
  };
}

/** Width of a line as drawn by drawLine. */
export function lineWidth(font: PDFFont, text: string, size: number): number {
  return visualRuns(text).reduce((sum, run) => sum + font.widthOfTextAtSize(run.text, size), 0);
}

/** Largest size (down to `min`) at which the line fits in `maxWidth`. */
export function fitLineSize(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
  min = 5,
): number {
  let current = size;
  while (current > min && lineWidth(font, text, current) > maxWidth) current -= 0.25;
  return current;
}

/**
 * Draws one line of Arabic, Latin or mixed text. `x` is the left edge, the
 * centre or the right edge depending on `align`.
 */
export function drawLine(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    size: number;
    font: PDFFont;
    color?: Color;
    opacity?: number;
    align?: "left" | "center" | "right";
  },
): void {
  const { size, font } = options;
  const width = lineWidth(font, text, size);
  let cursor =
    options.align === "center"
      ? options.x - width / 2
      : options.align === "right"
        ? options.x - width
        : options.x;
  for (const run of visualRuns(text)) {
    page.drawText(run.text, {
      x: cursor,
      y: options.y,
      size,
      font,
      color: options.color,
      opacity: options.opacity,
    });
    cursor += font.widthOfTextAtSize(run.text, size);
  }
}
