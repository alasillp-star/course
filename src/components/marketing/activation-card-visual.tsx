import { cn } from "@/lib/utils";

/**
 * Decorative rendering of the printed activation card (not a scannable code:
 * the pattern has no valid QR format information).
 */
function pseudoRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

function QrPattern() {
  const size = 21;
  const next = pseudoRandom(7);
  const cells: Array<[number, number]> = [];
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!inFinder(x, y) && next() > 0.52) cells.push([x, y]);
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#0b132b" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#0b132b" />
    </g>
  );
  return (
    <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} className="size-full" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="-1" y="-1" width={size + 2} height={size + 2} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" fill="#0b132b" />
      ))}
      {finder(0, 0)}
      {finder(size - 7, 0)}
      {finder(0, size - 7)}
    </svg>
  );
}

export function ActivationCardVisual({
  label,
  scan,
  serialLabel,
  academy,
  className,
}: {
  label: string;
  scan: string;
  serialLabel: string;
  academy: string;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-[1.586] w-full max-w-[420px] select-none", className)} aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2rem] bg-gold/20 blur-3xl" />
      <div
        dir="ltr"
        className="relative flex h-full overflow-hidden rounded-[1.4rem] border border-white/15 bg-[linear-gradient(135deg,#101a3a,#0b132b_55%,#141f45)] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] ring-1 ring-black/20 sm:p-6"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_220px_at_100%_0%,rgba(227,194,107,0.22),transparent_60%)]" />
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#b8893c] via-[#f0d58c] to-[#b8893c]" />
        <div className="relative flex w-[38%] flex-col justify-center">
          <div className="rounded-xl bg-white p-2 shadow-lg">
            <QrPattern />
          </div>
          <p className="mt-2 text-center text-[10px] font-medium tracking-wide text-white/60">{scan}</p>
        </div>
        <div className="relative ms-5 flex flex-1 flex-col">
          <p className="text-[11px] font-bold tracking-[0.18em] text-[#e3c26b] uppercase">{academy}</p>
          <p className="mt-1 text-xs text-white/60">{label}</p>
          <p className="mt-auto text-[10px] text-white/45">{serialLabel}</p>
          <p className="font-mono text-sm font-semibold text-white/90">B0007-00042</p>
          <div className="mt-3 rounded-lg bg-[linear-gradient(110deg,#a8a9ad,#e4e4e7_40%,#9ca3af_60%,#d4d4d8)] px-3 py-2 shadow-inner">
            <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-zinc-600">PIN ••••••••</p>
          </div>
        </div>
      </div>
    </div>
  );
}
