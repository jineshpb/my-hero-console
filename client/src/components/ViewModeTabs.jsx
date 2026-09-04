import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "details", label: "Details", live: false },
  { id: "live", label: "Live", live: true },
];

export const isLiveView = (searchParams) => searchParams.get("view") === "live";

export const ViewModeTabs = ({ className }) => {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const live = isLiveView(params);

  const handleSelect = (nextLive) => {
    const next = new URLSearchParams(params);
    if (nextLive) {
      next.set("view", "live");
    } else {
      next.delete("view");
    }
    const qs = next.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" });
  };

  return (
    <div
      className={cn(
        "inline-flex h-9 w-fit items-center self-start rounded-lg bg-muted p-[3px]",
        className
      )}
      role="tablist"
      aria-label="Console view"
    >
      {TABS.map((tab) => {
        const selected = live === tab.live;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "inline-flex h-full items-center rounded-md px-2.5 text-sm font-medium",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => handleSelect(tab.live)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
