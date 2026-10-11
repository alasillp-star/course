/**
 * RFC 4180 CSV writer with spreadsheet formula-injection protection: cells
 * starting with = + - @ (or tab/CR) are prefixed with a quote so Excel /
 * Sheets never evaluate attacker-controlled content as formulas.
 */
export type CsvValue = string | number | boolean | Date | null | undefined;

function neutralise(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? neutralise(value)
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))];
  // UTF-8 BOM so Excel opens Arabic text correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
