/**
 * <input type="datetime-local"> values interpreted in a fixed IANA time zone
 * (the academy's), so the server render and the browser agree and staff in
 * other zones schedule in academy time. Pure; uses Intl only.
 */

function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** ISO instant → "YYYY-MM-DDTHH:mm" wall time in `timeZone` ("" for null). */
export function toZonedInputValue(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  if (!value) return "";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  const shifted = new Date(instant.getTime() + zoneOffsetMinutes(instant, timeZone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" wall time in `timeZone` → ISO instant (null for empty/invalid). */
export function fromZonedInputValue(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes handle offsets that differ either side of a DST change.
  let instant = wallAsUtc - zoneOffsetMinutes(new Date(wallAsUtc), timeZone) * 60_000;
  instant = wallAsUtc - zoneOffsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant).toISOString();
}
