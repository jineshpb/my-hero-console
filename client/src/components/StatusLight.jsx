import { cn } from "@/lib/utils";

export const StatusLight = ({ on, pulse, label, className }) => (
  <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-foreground", className)}>
    <span
      className={cn(
        "size-3 shrink-0 rounded-full",
        pulse ? "animate-pulse bg-amber-400" : on ? "bg-emerald-400" : "bg-zinc-500"
      )}
      aria-hidden="true"
    />
    {label}
  </span>
);
