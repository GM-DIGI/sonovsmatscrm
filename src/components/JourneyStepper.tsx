import { STATUSES, statusIndex } from "@/lib/format";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function JourneyStepper({ status }: { status: string }) {
  const current = statusIndex(status);
  return (
    <ol className="flex w-full flex-col gap-4 md:flex-row md:items-center md:gap-0">
      {STATUSES.map((s, i) => {
        const done = i < current;
        const isCurrent = i === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-3 md:flex-col md:gap-2">
            <div className="flex items-center md:w-full">
              {i > 0 && (
                <div
                  className={cn(
                    "hidden h-0.5 flex-1 md:block",
                    done || isCurrent ? "bg-[color:var(--success)]" : "bg-border",
                  )}
                />
              )}
              <div
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold",
                  done
                    ? "border-[color:var(--success)] bg-[color:var(--success)] text-[color:var(--success-foreground)]"
                    : isCurrent
                    ? "border-[color:var(--accent)] bg-card text-[color:var(--accent)]"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STATUSES.length - 1 && (
                <div
                  className={cn(
                    "hidden h-0.5 flex-1 md:block",
                    done ? "bg-[color:var(--success)]" : "bg-border",
                  )}
                />
              )}
            </div>
            <div className="md:text-center">
              <div
                className={cn(
                  "text-sm font-medium",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
