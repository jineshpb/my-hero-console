import { cn } from "@/lib/utils";

const Separator = ({ className, orientation = "horizontal", ...props }) => (
  <div
    role="separator"
    aria-orientation={orientation}
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className
    )}
    {...props}
  />
);

export { Separator };
