import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  Bell,
  Box,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Cpu,
  GalleryVerticalEnd,
  LifeBuoy,
  PanelLeft,
  Send,
  User,
} from "lucide-react";
import { ConsoleAlert } from "@/components/ConsoleAlert";
import { FlashPanel } from "@/components/FlashPanel";
import { Separator } from "@/components/ui/separator";
import { useConsole } from "@/context/ConsoleContext";
import { cn } from "@/lib/utils";

const platformItems = [
  { to: "/kiosks", label: "Kiosks", icon: Box, match: (path) => path.startsWith("/kiosks") },
  { to: "/firmware", label: "Firmware", icon: Cpu, match: (path) => path.startsWith("/firmware") },
  { label: "Alerts", icon: Bell, disabled: true, title: "Cloud alerts come later" },
  { label: "Activity", icon: Activity, disabled: true, title: "Fleet activity log comes later" },
];

const footerItems = [
  { label: "Support", icon: LifeBuoy, title: "Support comes later" },
  { label: "Feedback", icon: Send, title: "Feedback comes later" },
];

export const AppShell = () => {
  const { error, notice, git, flashPanelOpen, setFlashPanelOpen, dismissAlerts, progress } = useConsole();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isKioskDetail = /^\/kiosks\/[^/]+/.test(location.pathname);

  const handleAlertAction = () => {
    if (error || progress?.mode === "flash") {
      setFlashPanelOpen(true);
      return;
    }
    dismissAlerts();
  };

  return (
    <div className="flex h-full min-h-0 bg-black">
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          sidebarOpen ? "w-[255px]" : "w-[68px]"
        )}
      >
        <div className="flex h-[68px] shrink-0 flex-col p-2">
          <Link
            to="/kiosks"
            className="flex items-center gap-2 rounded-md p-2 text-inherit no-underline"
            aria-label="My Hero home"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground">
              <GalleryVerticalEnd className="size-4" aria-hidden="true" />
            </span>
            {sidebarOpen ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">My Hero</span>
                <span className="block truncate text-xs text-sidebar-foreground/80">Enterprise</span>
              </span>
            ) : null}
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="p-2">
            {sidebarOpen ? (
              <p className="flex h-8 items-center px-2 text-xs font-medium text-sidebar-foreground/70">Platform</p>
            ) : null}
            <nav className="flex flex-col gap-1" aria-label="Primary">
              {platformItems.map((item) => {
                const Icon = item.icon;
                if (item.disabled) {
                  return (
                    <span
                      key={item.label}
                      className="flex h-8 cursor-not-allowed items-center gap-2 rounded-md p-2 text-sm text-sidebar-foreground/40"
                      aria-disabled="true"
                      title={item.title}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {sidebarOpen ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                      {sidebarOpen ? <ChevronRight className="size-4 shrink-0 opacity-50" aria-hidden="true" /> : null}
                    </span>
                  );
                }
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.label}
                    aria-label={item.label}
                    className={() =>
                      cn(
                        "flex h-8 items-center gap-2 rounded-md p-2 text-sm text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent",
                        item.match(location.pathname) ? "bg-sidebar-accent" : ""
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {sidebarOpen ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                    {sidebarOpen ? (
                      item.match(location.pathname) ? (
                        <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                      )
                    ) : null}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto p-2">
            <nav className="flex flex-col gap-1" aria-label="Help">
              {footerItems.map((item) => {
                const Icon = item.icon;
                return (
                  <span
                    key={item.label}
                    className="flex h-8 cursor-not-allowed items-center gap-2 rounded-md p-2 text-sm text-sidebar-foreground/70"
                    aria-disabled="true"
                    title={item.title}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {sidebarOpen ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                  </span>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="flex h-[68px] shrink-0 flex-col p-2">
          <div className="flex items-center gap-2 rounded-md p-2">
            <span
              className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent"
              aria-hidden="true"
            >
              <User className="size-3.5" />
            </span>
            {sidebarOpen ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">USB bench</span>
                  <span className="block truncate text-xs text-sidebar-foreground/80">
                    {git?.branch || "no git"} · {git?.shortSha || "—"}
                    {git?.dirty ? " dirty" : ""}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
              </>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-accent"
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-pressed={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <PanelLeft className="size-4" aria-hidden="true" />
            </button>
            <Separator orientation="vertical" className="h-[17px]" />
            <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
              <Link to="/kiosks" className="text-muted-foreground no-underline hover:text-foreground">
                Home
              </Link>
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-foreground">SOS Fleet console</span>
            </nav>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="w-full px-8 py-10 xl:px-32">
            {!isKioskDetail && (error || notice) ? (
              <div className="mb-6">
                <ConsoleAlert
                  tone={error ? "danger" : "success"}
                  title={error || notice}
                  description={error && notice ? notice : undefined}
                  actionLabel={error && flashPanelOpen === false && progress?.mode === "flash" ? "View" : "Dismiss"}
                  onAction={handleAlertAction}
                />
              </div>
            ) : null}
            <Outlet />
          </div>
        </main>
      </div>
      <FlashPanel />
    </div>
  );
};
