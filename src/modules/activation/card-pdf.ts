import "server-only";
import {
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  PDFDocument,
  type PDFFont,
  type PDFImage,
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
import { formatCardPin } from "./codes";

/**
 * Print-ready activation cards in the Abdou Academy identity: A4 sheets with
 * 10 credit-card-size cards (85.6 x 54 mm, ISO/IEC 7810 ID-1) and crop marks.
 *
 * The card carries the QR code and the serial only — no printed code and no
 * scratch-off PIN: activation is unlocked when the delivery company confirms
 * the parcel was delivered (the delivery gate replaces the hidden PIN). The
 * official inverse logo (PNG, purple background) is embedded as artwork;
 * texts use the built-in Helvetica (Latin only). For legacy batches created
 * with a PIN, the PIN is still printed in a scratch panel.
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
  hostLabel: string;
  eyebrow: string;
  tagline: string;
  scanLabel: string;
  purple: RGB;
  lime: RGB;
  ink: RGB;
  /** Official inverse logo (purple background), drawn top-left. */
  logo?: { bytes: Uint8Array; type: "png" | "jpg" };
  /** Optional full-card artwork from the brand team (replaces the purple field). */
  background?: { bytes: Uint8Array; type: "png" | "jpg" };
};

export type CardData = {
  serial: string;
  code: string;
  pin: string | null;
  url: string;
};

const hex = (value: string) =>
  rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );

export function defaultCardDesign(params: {
  appUrl: string;
  logo?: CardDesign["logo"];
}): CardDesign {
  return {
    hostLabel: new URL(params.appUrl).host,
    eyebrow: "A C T I V A T I O N   C A R D",
    tagline: "Activate once. Learn for life.",
    scanLabel: "S C A N   T O   A C T I V A T E",
    purple: hex("#4B2AF0"),
    lime: hex("#D6FF46"),
    ink: hex("#1C1734"),
    logo: params.logo,
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

type Images = { logo: PDFImage | null; background: PDFImage | null };

function drawCard(
  page: PDFPage,
  fonts: Fonts,
  design: CardDesign,
  images: Images,
  card: CardData,
  x: number,
  y: number,
) {
  const white = rgb(1, 1, 1);
  const pad = 4 * MM;

  // Field: brand artwork, or purple with the concentric "loop" rings (clipped to the card).
  if (images.background) {
    page.drawImage(images.background, { x, y, width: CARD_W, height: CARD_H });
  } else {
    page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, color: design.purple });
    page.pushOperators(pushGraphicsState(), rectangle(x, y, CARD_W, CARD_H), clip(), endPath());
    for (const radius of [16, 23, 30]) {
      page.drawCircle({
        x: x + CARD_W - 9 * MM,
        y: y + CARD_H + 3 * MM,
        size: radius * MM,
        borderColor: white,
        borderOpacity: 0.16,
        borderWidth: 0.45,
      });
    }
    page.pushOperators(popGraphicsState());
  }

  // QR tile (ink on white, generous quiet zone) on the right.
  const tile = 31 * MM;
  const tileX = x + CARD_W - pad - tile;
  const tileY = y + (CARD_H - tile) / 2 + 2.2 * MM;
  roundedRect(page, tileX, tileY, tile, tile, 3 * MM, white);
  drawQr(page, card.url, tileX + 1.2 * MM, tileY + 1.2 * MM, tile - 2.4 * MM, design.ink);
  const scanSize = fitText(fonts.bold, design.scanLabel, 4.6, tile);
  page.drawText(design.scanLabel, {
    x: tileX + (tile - fonts.bold.widthOfTextAtSize(design.scanLabel, scanSize)) / 2,
    y: tileY - 3.2 * MM,
    size: scanSize,
    font: fonts.bold,
    color: design.lime,
  });

  // Left column: official logo, eyebrow, tagline, serial and host.
  const textX = x + pad;
  const textW = tileX - 3 * MM - textX;
  let cursor = y + CARD_H - pad;
  if (images.logo) {
    const logoW = Math.min(textW + 3 * MM, 42 * MM);
    const logoH = (logoW * images.logo.height) / images.logo.width;
    // The artwork has its own margins; offset so the symbol aligns with the text column.
    page.drawImage(images.logo, {
      x: textX - 0.06 * logoW,
      y: cursor - logoH + 0.14 * logoH,
      width: logoW,
      height: logoH,
    });
    cursor -= logoH * 0.86;
  } else {
    page.drawText("abdou", {
      x: textX,
      y: cursor - 6 * MM,
      size: 17,
      font: fonts.bold,
      color: white,
    });
    cursor -= 9 * MM;
  }
  cursor -= 2.6 * MM;
  page.drawText(design.eyebrow, {
    x: textX,
    y: cursor,
    size: fitText(fonts.bold, design.eyebrow, 4.8, textW),
    font: fonts.bold,
    color: design.lime,
  });
  cursor -= 3.6 * MM;
  page.drawText(design.tagline, {
    x: textX,
    y: cursor,
    size: fitText(fonts.regular, design.tagline, 6.4, textW),
    font: fonts.regular,
    color: white,
    opacity: 0.85,
  });

  // Legacy batches only: PIN under a scratch-off panel.
  if (card.pin) {
    const panelH = 7.5 * MM;
    const panelY = y + pad + 7 * MM;
    roundedRect(page, textX, panelY, textW, panelH, 1.5 * MM, design.lime);
    const pinText = `PIN ${formatCardPin(card.pin)}`;
    page.drawText(pinText, {
      x: textX + 2 * MM,
      y: panelY + 2.4 * MM,
      size: fitText(fonts.mono, pinText, 9, textW - 4 * MM),
      font: fonts.mono,
      color: design.ink,
    });
  }

  page.drawText("N°", {
    x: textX,
    y: y + pad + 3.2 * MM,
    size: 5.5,
    font: fonts.regular,
    color: white,
    opacity: 0.7,
  });
  page.drawText(card.serial, {
    x: textX + 3.6 * MM,
    y: y + pad + 3.2 * MM,
    size: fitText(fonts.bold, card.serial, 8, textW - 3.6 * MM),
    font: fonts.bold,
    color: white,
  });
  page.drawText(design.hostLabel, {
    x: textX,
    y: y + pad,
    size: fitText(fonts.regular, design.hostLabel, 5.5, textW),
    font: fonts.regular,
    color: white,
    opacity: 0.6,
  });
}

export async function renderCardsPdf(params: {
  cards: CardData[];
  design: CardDesign;
  documentTitle: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(params.documentTitle);
  pdf.setCreator("Abdou Academy");
  pdf.setProducer("Abdou Academy");
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.CourierBold),
  };
  const embed = (image?: { bytes: Uint8Array; type: "png" | "jpg" }) =>
    image
      ? image.type === "png"
        ? pdf.embedPng(image.bytes)
        : pdf.embedJpg(image.bytes)
      : Promise.resolve(null);
  const images: Images = {
    logo: await embed(params.design.logo),
    background: await embed(params.design.background),
  };

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
      drawCard(page, fonts, params.design, images, card, x, y);
    });
  }
  return pdf.save({ useObjectStreams: true });
}
