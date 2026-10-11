import "server-only";
import {
  appendBezierCurve,
  closePath,
  fill,
  lineTo,
  moveTo,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setFillingRgbColor,
  StandardFonts,
  type RGB,
} from "pdf-lib";
import QRCode from "qrcode";
import { formatCardCode, formatCardPin } from "./codes";

/**
 * Print-ready activation cards: A4 sheets with 10 credit-card-size cards
 * (85.6 x 54 mm, ISO/IEC 7810 ID-1) and crop marks. Text on the card is
 * Latin-only (built-in PDF fonts); Arabic artwork belongs in the optional
 * background image designed by the brand team (see CardDesign.background).
 *
 * The PIN is printed inside the marked "scratch" panel: the print shop
 * applies scratch-off foil over that rectangle.
 */

const MM = 72 / 25.4;
const CARD_W = 85.6 * MM;
const CARD_H = 53.98 * MM;
const GUTTER = 4 * MM;
const COLS = 2;
const ROWS = 5;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

export type CardDesign = {
  title: string;
  subtitle: string;
  hostLabel: string;
  primary: RGB;
  accent: RGB;
  /** Optional PNG/JPEG artwork drawn full-card behind the variable data. */
  background?: { bytes: Uint8Array; type: "png" | "jpg" };
};

export type CardData = {
  serial: string;
  code: string;
  pin: string | null;
  url: string;
};

export function defaultCardDesign(params: { academyName: string; appUrl: string }): CardDesign {
  return {
    title: params.academyName.toUpperCase(),
    subtitle: "Carte d'activation  ·  Activation card",
    hostLabel: new URL(params.appUrl).host,
    primary: rgb(11 / 255, 19 / 255, 43 / 255),
    accent: rgb(201 / 255, 162 / 255, 77 / 255),
  };
}

/** Draws QR modules as merged horizontal runs: compact and crisp at any print size. */
function drawQr(page: PDFPage, text: string, x: number, y: number, size: number, color: RGB) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const quiet = 2;
  const unit = size / (count + quiet * 2);
  const ops = [pushGraphicsState(), setFillingRgbColor(color.red, color.green, color.blue)];
  for (let row = 0; row < count; row += 1) {
    let col = 0;
    while (col < count) {
      if (qr.modules.get(row, col)) {
        const start = col;
        while (col < count && qr.modules.get(row, col)) col += 1;
        ops.push(
          rectangle(
            x + (quiet + start) * unit,
            y + size - (quiet + row + 1) * unit,
            (col - start) * unit + 0.05,
            unit + 0.05,
          ),
        );
      } else {
        col += 1;
      }
    }
  }
  ops.push(fill(), popGraphicsState());
  page.pushOperators(...ops);
}

function roundedRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: RGB,
) {
  const k = 0.5523 * r;
  page.pushOperators(
    pushGraphicsState(),
    setFillingRgbColor(color.red, color.green, color.blue),
    moveTo(x + r, y),
    lineTo(x + w - r, y),
    ...curve(x + w - r + k, y, x + w, y + r - k, x + w, y + r),
    lineTo(x + w, y + h - r),
    ...curve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h),
    ...curve(x + r - k, y + h, x, y + h - r + k, x, y + h - r),
    lineTo(x, y + r),
    ...curve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(),
    fill(),
    popGraphicsState(),
  );
}

function curve(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
  return [appendBezierCurve(x1, y1, x2, y2, x3, y3)];
}

function cropMarks(page: PDFPage, x: number, y: number) {
  const len = 3 * MM;
  const off = 1 * MM;
  const color = rgb(0.6, 0.6, 0.6);
  const lines: Array<[number, number, number, number]> = [
    [x - off - len, y, x - off, y],
    [x, y - off - len, x, y - off],
    [x + CARD_W + off, y, x + CARD_W + off + len, y],
    [x + CARD_W, y - off - len, x + CARD_W, y - off],
    [x - off - len, y + CARD_H, x - off, y + CARD_H],
    [x, y + CARD_H + off, x, y + CARD_H + off + len],
    [x + CARD_W + off, y + CARD_H, x + CARD_W + off + len, y + CARD_H],
    [x + CARD_W, y + CARD_H + off, x + CARD_W, y + CARD_H + off + len],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.3, color });
  }
}

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };

function fitText(font: PDFFont, text: string, size: number, maxWidth: number): number {
  let current = size;
  while (current > 5 && font.widthOfTextAtSize(text, current) > maxWidth) current -= 0.25;
  return current;
}

function drawCard(
  page: PDFPage,
  fonts: Fonts,
  design: CardDesign,
  background: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
  card: CardData,
  x: number,
  y: number,
) {
  const white = rgb(1, 1, 1);
  const pad = 4 * MM;

  if (background) {
    page.drawImage(background, { x, y, width: CARD_W, height: CARD_H });
  } else {
    page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, color: design.primary });
    page.drawRectangle({
      x,
      y: y + CARD_H - 1.2 * MM,
      width: CARD_W,
      height: 1.2 * MM,
      color: design.accent,
    });
  }

  // QR panel (always dark-on-white for reliable scanning).
  const qrSize = 30 * MM;
  const qrX = x + pad;
  const qrY = y + (CARD_H - qrSize) / 2 - 2 * MM;
  roundedRect(
    page,
    qrX - 1.2 * MM,
    qrY - 1.2 * MM,
    qrSize + 2.4 * MM,
    qrSize + 2.4 * MM,
    2 * MM,
    white,
  );
  drawQr(page, card.url, qrX, qrY, qrSize, rgb(0, 0, 0));

  const textX = qrX + qrSize + 4 * MM;
  const textW = x + CARD_W - pad - textX;
  const light = background ? design.primary : white;
  const muted = background ? design.primary : rgb(0.8, 0.83, 0.9);

  let cursor = y + CARD_H - pad - 3.2 * MM;
  const titleSize = fitText(fonts.bold, design.title, 8.5, textW);
  page.drawText(design.title, {
    x: textX,
    y: cursor,
    size: titleSize,
    font: fonts.bold,
    color: design.accent,
  });
  cursor -= 3.6 * MM;
  const subtitleSize = fitText(fonts.regular, design.subtitle, 6, textW);
  page.drawText(design.subtitle, {
    x: textX,
    y: cursor,
    size: subtitleSize,
    font: fonts.regular,
    color: muted,
  });

  cursor -= 5.2 * MM;
  page.drawText("N°", { x: textX, y: cursor, size: 5.5, font: fonts.regular, color: muted });
  page.drawText(card.serial, {
    x: textX + 3.4 * MM,
    y: cursor,
    size: 7.5,
    font: fonts.bold,
    color: light,
  });

  cursor -= 4.2 * MM;
  const codeText = formatCardCode(card.code);
  page.drawText(codeText, {
    x: textX,
    y: cursor,
    size: fitText(fonts.mono, codeText, 8, textW),
    font: fonts.mono,
    color: light,
  });

  // Scratch-off panel with the PIN.
  if (card.pin) {
    const panelH = 8.5 * MM;
    const panelY = y + pad;
    roundedRect(page, textX, panelY, textW, panelH, 1.5 * MM, design.accent);
    page.drawText("PIN", {
      x: textX + 2 * MM,
      y: panelY + panelH - 3 * MM,
      size: 5,
      font: fonts.bold,
      color: design.primary,
    });
    const pinText = formatCardPin(card.pin);
    page.drawText(pinText, {
      x: textX + 2 * MM,
      y: panelY + 1.8 * MM,
      size: fitText(fonts.mono, pinText, 11, textW - 4 * MM),
      font: fonts.mono,
      color: design.primary,
    });
  }

  const host = design.hostLabel;
  page.drawText(host, {
    x: textX,
    y: y + pad + (card.pin ? 9.6 * MM : 0),
    size: fitText(fonts.regular, host, 6, textW),
    font: fonts.regular,
    color: muted,
  });
}

export async function renderCardsPdf(params: {
  cards: CardData[];
  design: CardDesign;
  documentTitle: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(params.documentTitle);
  pdf.setCreator("Academy platform");
  pdf.setProducer("Academy platform");
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.CourierBold),
  };
  const background = params.design.background
    ? params.design.background.type === "png"
      ? await pdf.embedPng(params.design.background.bytes)
      : await pdf.embedJpg(params.design.background.bytes)
    : null;

  const gridW = COLS * CARD_W + (COLS - 1) * GUTTER;
  const gridH = ROWS * CARD_H + (ROWS - 1) * GUTTER;
  const marginX = (PAGE_W - gridW) / 2;
  const marginY = (PAGE_H - gridH) / 2;
  const perPage = COLS * ROWS;

  for (let index = 0; index < params.cards.length; index += perPage) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    params.cards.slice(index, index + perPage).forEach((card, slot) => {
      const col = slot % COLS;
      const row = Math.floor(slot / COLS);
      const x = marginX + col * (CARD_W + GUTTER);
      const y = PAGE_H - marginY - (row + 1) * CARD_H - row * GUTTER;
      cropMarks(page, x, y);
      drawCard(page, fonts, params.design, background, card, x, y);
    });
  }
  return pdf.save({ useObjectStreams: true });
}
