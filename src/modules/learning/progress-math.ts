/**
 * Watch-progress arithmetic (pure). Ranges are half-open [start, end) in whole
 * seconds. The server never trusts a client's "I watched it all": new coverage
 * per heartbeat is capped by the real time elapsed since the previous one, so
 * a lesson cannot be completed faster than watching it at the maximum speed.
 */

export type Range = [number, number];

/** Fastest playback speed offered by the player. */
export const MAX_PLAYBACK_RATE = 2;
/** Network jitter / clock tolerance added to every budget. */
export const BUDGET_SLACK_SECONDS = 10;
/** Gaps longer than this mean the player was paused or closed. */
export const MAX_COUNTED_GAP_SECONDS = 300;
/** Budget for the first heartbeat ever recorded for a lesson. */
export const FIRST_HEARTBEAT_BUDGET_SECONDS = 60;

/** Clamps to [0, duration], rounds to whole seconds, sorts and merges. */
export function normalizeRanges(
  input: ReadonlyArray<readonly number[]>,
  duration: number,
): Range[] {
  const cleaned: Range[] = [];
  for (const pair of input) {
    const [rawStart, rawEnd] = pair;
    if (typeof rawStart !== "number" || typeof rawEnd !== "number") continue;
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
    const start = Math.max(0, Math.round(rawStart));
    const end = Math.min(duration, Math.round(rawEnd));
    if (end > start) cleaned.push([start, end]);
  }
  return merge(cleaned);
}

function merge(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

export function mergeRanges(a: Range[], b: Range[]): Range[] {
  return merge([...a, ...b].map(([start, end]) => [start, end] as Range));
}

export function coverage(ranges: Range[]): number {
  return ranges.reduce((sum, [start, end]) => sum + (end - start), 0);
}

/** Parts of `incoming` not already covered by `stored` (both merged). */
export function subtractRanges(incoming: Range[], stored: Range[]): Range[] {
  const out: Range[] = [];
  for (const [start, end] of incoming) {
    let cursor = start;
    for (const [s, e] of stored) {
      if (e <= cursor || s >= end) continue;
      if (s > cursor) out.push([cursor, s]);
      cursor = Math.max(cursor, e);
      if (cursor >= end) break;
    }
    if (cursor < end) out.push([cursor, end]);
  }
  return out;
}

/** Adds new coverage, earliest first, but never more than `budget` seconds. */
export function addCoverageWithBudget(
  stored: Range[],
  incoming: Range[],
  budget: number,
): { ranges: Range[]; added: number } {
  let remaining = Math.max(0, Math.floor(budget));
  const accepted: Range[] = [];
  for (const [start, end] of subtractRanges(incoming, stored)) {
    if (remaining <= 0) break;
    const take = Math.min(end - start, remaining);
    accepted.push([start, start + take]);
    remaining -= take;
  }
  return { ranges: mergeRanges(stored, accepted), added: coverage(accepted) };
}

/** Seconds of new coverage a heartbeat may add, from the time since the last one. */
export function heartbeatBudget(lastHeartbeatAt: Date | null, now: Date): number {
  if (!lastHeartbeatAt) return FIRST_HEARTBEAT_BUDGET_SECONDS;
  const elapsed = Math.max(0, (now.getTime() - lastHeartbeatAt.getTime()) / 1000);
  return Math.min(elapsed, MAX_COUNTED_GAP_SECONDS) * MAX_PLAYBACK_RATE + BUDGET_SLACK_SECONDS;
}

export function percentWatched(watchedSeconds: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.min(100, Math.floor((watchedSeconds * 100) / duration));
}

/** Where to resume: the saved position, unless the video was (nearly) finished. */
export function resumePosition(positionSeconds: number, duration: number | null): number {
  if (!duration || positionSeconds <= 0) return 0;
  if (positionSeconds >= duration - 5 || positionSeconds / duration >= 0.97) return 0;
  return Math.floor(positionSeconds);
}
