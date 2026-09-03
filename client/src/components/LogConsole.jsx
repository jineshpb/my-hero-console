import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export const LogConsole = ({ text, label, follow, className, placeholder }) => {
  const ref = useRef(null);
  const body = text || placeholder || "";

  useEffect(() => {
    if (!follow || !ref.current || !text) {
      return;
    }
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, follow]);

  if (!body) {
    return null;
  }

  return (
    <pre
      ref={ref}
      tabIndex={0}
      aria-label={label}
      className={cn(
        "mt-3 max-h-64 min-w-0 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-background p-3 font-mono text-[11px] leading-relaxed text-muted-foreground",
        !text && placeholder ? "text-muted-foreground/70" : "",
        className
      )}
    >
      {body}
    </pre>
  );
};
