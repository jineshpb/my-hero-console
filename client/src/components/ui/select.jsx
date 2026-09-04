import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn, nativeControlClass } from "@/lib/utils";

export const Select = ({
  id,
  value,
  onChange,
  options,
  disabled,
  className,
  "aria-label": ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) || options[0];

  const updateMenuStyle = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 260 && rect.top > spaceBelow;
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 80,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  };

  const handleOpen = () => {
    if (disabled) {
      return;
    }
    setOpen((current) => {
      const next = !current;
      if (next) {
        requestAnimationFrame(updateMenuStyle);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    updateMenuStyle();
    const handlePointer = (event) => {
      if (!rootRef.current?.contains(event.target) && !event.target.closest("[data-select-menu]")) {
        setOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", updateMenuStyle);
    window.addEventListener("scroll", updateMenuStyle, true);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", updateMenuStyle);
      window.removeEventListener("scroll", updateMenuStyle, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative w-full min-w-0", className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          nativeControlClass,
          "h-9 items-center py-0 w-full max-w-full min-w-0 justify-between gap-2 overflow-hidden bg-background text-left text-foreground hover:bg-accent"
        )}
        onClick={handleOpen}
        title={selected?.label || undefined}
      >
        <span className="min-w-0 flex-1 truncate text-left leading-none">
          {selected?.label || "Select"}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
      </button>
      {open && menuStyle
        ? createPortal(
            <ul
              id={listId}
              data-select-menu="true"
              role="listbox"
              aria-label={ariaLabel}
              className="max-h-64 w-full overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
              style={menuStyle}
            >
              {options.map((option) => (
                <li key={option.value === "" ? "empty" : option.value} className="min-w-0">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={cn(
                      "flex w-full min-w-0 whitespace-normal break-words rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent",
                      option.value === value ? "bg-accent" : ""
                    )}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
};
