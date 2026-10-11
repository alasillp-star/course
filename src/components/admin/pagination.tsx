import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Server-rendered pagination that preserves the current query string. */
export function Pagination({
  basePath,
  query,
  offset,
  limit,
  total,
  labels,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  offset: number;
  limit: number;
  total: number;
  labels: { previous: string; next: string; of: string };
}) {
  if (total <= limit) return null;
  const href = (nextOffset: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const hasPrevious = offset > 0;
  const hasNext = offset + limit < total;
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-3 px-1 py-3 text-sm">
      <span className="tabular">
        {offset + 1}–{Math.min(offset + limit, total)} {labels.of} {total}
      </span>
      <div className="flex gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={!hasPrevious}
          className={!hasPrevious ? "pointer-events-none opacity-50" : undefined}
        >
          <Link href={href(Math.max(0, offset - limit))}>
            <ChevronRightIcon className="ltr:rotate-180" />
            {labels.previous}
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={!hasNext}
          className={!hasNext ? "pointer-events-none opacity-50" : undefined}
        >
          <Link href={href(offset + limit)}>
            {labels.next}
            <ChevronLeftIcon className="ltr:rotate-180" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
