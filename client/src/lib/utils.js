import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs) => twMerge(clsx(inputs));

export const nativeControlClass =
  "flex h-auto min-h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-background text-foreground scheme-dark px-2.5 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
