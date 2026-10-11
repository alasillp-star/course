/**
 * RFC 6266 / RFC 8187 Content-Disposition with a safe ASCII fallback and the
 * UTF-8 filename (Arabic names survive in modern browsers).
 */
export function contentDisposition(filename: string, type: "attachment" | "inline" = "attachment") {
  const cleaned = filename.replace(/[\r\n"\\/]/g, "_").trim() || "download";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
