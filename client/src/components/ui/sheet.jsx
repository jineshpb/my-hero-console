import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = ({ open, onOpenChange, children }) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close overlay"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  );
};

export const SheetContent = ({ className, children, ...props }) => (
  <aside
    role="dialog"
    aria-modal="true"
    className={cn(
      "absolute inset-y-0 right-0 flex w-full max-w-lg min-w-0 flex-col overflow-hidden border-l bg-background shadow-xl",
      className
    )}
    {...props}
  >
    {children}
  </aside>
);

export const SheetHeader = ({ className, children }) => (
  <div className={cn("flex min-w-0 shrink-0 items-start justify-between gap-3 border-b px-5 py-4", className)}>
    {children}
  </div>
);

export const SheetTitle = ({ className, children }) => (
  <h2 className={cn("text-lg font-semibold tracking-tight", className)}>{children}</h2>
);

export const SheetClose = ({ onClick, disabled }) => (
  <button
    type="button"
    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
    onClick={onClick}
    disabled={disabled}
    aria-label="Close flash panel"
  >
    <X className="size-4" />
  </button>
);
