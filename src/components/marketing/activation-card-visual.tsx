import { LogoMark } from "@/components/brand/logo";
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
      <rect x={x} y={y} width="7" height="7" fill="#1c1734" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#1c1734" />
    </g>
  );
  return (
    <svg
      viewBox={`-1 -1 ${size + 2} ${size + 2}`}
      className="size-full"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="-1" y="-1" width={size + 2} height={size + 2} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" fill="#1c1734" />
      ))}
      {finder(0, 0)}
      {finder(size - 7, 0)}
      {finder(0, size - 7)}
    </svg>
  );
}

/**
 * The printed card (QR only — no scratch-off code): purple field with the
 * brand rings, inverse logo, the QR and the serial. Activation also waits for
 * the delivery company to confirm the parcel was delivered.
 */
export function ActivationCardVisual({
  label,
  scan,
  serialLabel,
  className,
}: {
  label: string;
  scan: string;
  serialLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative aspect-[1.586] w-full max-w-[420px] select-none", className)}
      aria-hidden="true"
    >
      <div className="bg-lime/30 absolute -inset-6 rounded-[2rem] blur-3xl" />
      <div
        dir="ltr"
        className="surface-hero relative flex h-full overflow-hidden rounded-[1.4rem] p-5 shadow-[0_30px_80px_-30px_rgba(28,23,52,0.85)] ring-1 ring-white/15 sm:p-6"
      >
        <div className="relative flex flex-1 flex-col">
          <span className="inline-flex items-center gap-2">
            <LogoMark inverse className="size-7" />
            <span className="grid leading-none text-white">
              <span className="text-[19px] font-black tracking-[-0.05em]">abdou</span>
              <span className="text-lime mt-0.5 text-[6.5px] font-extrabold tracking-[0.42em] uppercase">
                Academy
              </span>
            </span>
          </span>
          <p className="mt-3 text-xs font-medium text-white/75">{label}</p>
          <p className="mt-auto text-[10px] text-white/55">{serialLabel}</p>
          <p className="font-mono text-sm font-semibold text-white">B0007-00042</p>
        </div>
        <div className="relative flex w-[40%] flex-col items-center justify-center">
          <div className="rounded-2xl bg-white p-2.5 shadow-lg">
            <QrPattern />
          </div>
          <p className="eyebrow text-lime mt-2.5 text-center !text-[8.5px]">{scan}</p>
        </div>
      </div>
    </div>
  );
}
