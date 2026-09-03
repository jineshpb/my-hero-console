import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ConsoleAlert = ({
  tone = "info",
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  if (!title && !description) {
    return null;
  }

  const Icon = tone === "success" ? CircleCheck : CircleAlert;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-2",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              "size-4 shrink-0",
              tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-red-400" : "text-foreground"
            )}
            aria-hidden="true"
          />
          {title ? <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</p> : null}
        </div>
        {description ? (
          <div className="mt-0.5 flex items-center gap-2">
            <span className="size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm font-light text-foreground">{description}</p>
          </div>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <Button type="button" size="sm" className="h-6 shrink-0 rounded-lg px-2 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
};
