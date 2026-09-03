import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export const KioskTabs = ({ kioskId }) => {
  const base = `/kiosks/${kioskId}`;
  const tabs = [
    { to: base, label: "Details", end: true },
    { to: `${base}/activity`, label: "Activity" },
    { to: `${base}/logs`, label: "Logs" },
    { to: `${base}/serial`, label: "Serial" },
    { to: `${base}/rfid`, label: "RFID" },
    { to: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav
      className="inline-flex h-9 items-center rounded-lg bg-muted p-[3px]"
      aria-label="Kiosk sections"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={Boolean(tab.end)}
          className={({ isActive }) =>
            cn(
              "inline-flex h-full items-center rounded-md px-2.5 text-sm font-medium no-underline transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
};
