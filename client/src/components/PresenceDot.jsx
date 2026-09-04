import { cn } from "@/lib/utils";
import { PRESENCE } from "@/lib/kiosk";

export const PresenceDot = ({ presence, size = "row" }) => {
  const tone = PRESENCE[presence] || PRESENCE.offline;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        size === "badge" ? "size-3" : "size-5"
      )}
      aria-hidden="true"
    >
      <span className={cn("rounded-full", tone.className, size === "badge" ? "size-3" : "size-4")} />
    </span>
  );
};
