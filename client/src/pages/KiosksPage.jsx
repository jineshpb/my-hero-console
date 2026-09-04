import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GitBranch, Plus } from "lucide-react";
import { FirmwareSourceForm } from "@/components/FirmwareSourceForm";
import { KitIdentityFields } from "@/components/KitIdentityFields";
import { PresenceDot } from "@/components/PresenceDot";
import { ViewModeTabs, isLiveView } from "@/components/ViewModeTabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConsole } from "@/context/ConsoleContext";
import { cn } from "@/lib/utils";
import {
  emptyKitIdentity,
  fieldPresence,
  formatRelative,
  formatTime,
  kioskHref,
  kioskName,
  kitIdentityPayload,
  kioskPresence,
  nextOpenSlot,
  PRESENCE,
  shortSha,
} from "@/lib/kiosk";

const FILTERS = [
  { id: "all", label: "All available" },
  { id: "online", label: "Online" },
  { id: "stale", label: "Stale" },
  { id: "offline", label: "Offline" },
];

const skuLine = (sku) => {
  if (!sku) {
    return "—";
  }
  return sku.charAt(0).toUpperCase() + sku.slice(1);
};

export const KiosksPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const live = isLiveView(params);
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(() => emptyKitIdentity(""));
  const [creating, setCreating] = useState(false);
  const {
    kiosks: allKiosks,
    ports,
    identity,
    git,
    handleCreateKiosk,
    setError,
  } = useConsole();

  const withPresence = useMemo(
    () =>
      allKiosks.map((board) => ({
        board,
        presence: live ? fieldPresence(board) : kioskPresence(board, ports, identity),
      })),
    [allKiosks, ports, identity, live]
  );

  const counts = useMemo(
    () => ({
      online: withPresence.filter((item) => item.presence === "online").length,
      stale: withPresence.filter((item) => item.presence === "stale").length,
      offline: withPresence.filter((item) => item.presence === "offline").length,
    }),
    [withPresence]
  );

  const kiosks = useMemo(() => {
    if (filter === "all") {
      return withPresence;
    }
    return withPresence.filter((item) => item.presence === filter);
  }, [withPresence, filter]);

  const firmwareUrl = git?.remote || "";
  const firmwareHref = /^https?:\/\//i.test(firmwareUrl) ? firmwareUrl : "";

  const handleOpenCreate = () => {
    setCreateDraft(emptyKitIdentity(nextOpenSlot(allKiosks)));
    setCreateOpen(true);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await handleCreateKiosk(kitIdentityPayload(createDraft));
      setCreateOpen(false);
      navigate(kioskHref(created));
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <ViewModeTabs />

      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="text-2xl font-medium text-white">Kiosks</h1>
            <div className="flex items-start gap-2" aria-label="Kiosk status counts">
              {["online", "stale", "offline"].map((id) => (
                <span
                  key={id}
                  className="inline-flex h-[22px] items-center gap-1 rounded-[26px] bg-secondary px-2 py-0.5"
                  aria-label={`${counts[id]} ${PRESENCE[id].label.toLowerCase()}`}
                >
                  <PresenceDot presence={id} size="badge" />
                  <span className="text-xs font-medium text-secondary-foreground">{counts[id]}</span>
                </span>
              ))}
            </div>
            {!live && firmwareUrl ? (
              <div className="flex items-center gap-1">
                <GitBranch className="size-6 shrink-0" aria-hidden="true" />
                {firmwareHref ? (
                  <a
                    href={firmwareHref}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs font-medium text-white no-underline hover:underline"
                  >
                    {firmwareUrl}
                  </a>
                ) : (
                  <p className="truncate text-xs font-medium text-white">{firmwareUrl}</p>
                )}
              </div>
            ) : null}
            {live ? (
              <p className="text-xs text-muted-foreground">
                Field presence from last heartbeat. Online is a ping in the last 15 minutes.
              </p>
            ) : null}
          </div>
          {!live ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() => setSourceOpen(true)}
                aria-label="Change firmware source"
              >
                <GitBranch className="size-4" aria-hidden="true" />
                Change source
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={handleOpenCreate}
                aria-label="Create a new kiosk"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add Kiosk
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <div
            className="inline-flex h-9 items-start rounded-lg bg-muted p-[3px]"
            role="tablist"
            aria-label="Filter kiosks"
          >
            {FILTERS.map((item) => {
              const selected = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    "inline-flex h-full items-center rounded-md px-2.5 text-sm font-medium",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {kiosks.length === 0 ? (
          <div className="rounded-lg border border-border px-3 py-10 text-center text-sm text-muted-foreground">
            {allKiosks.length === 0
              ? live
                ? "No kiosks yet. Switch to Details to add one, then wait for the first status POST."
                : "Add a kiosk and assign a slot. Plug the ESP32 in afterwards to bind the controller."
              : "No kiosks match that filter."}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {kiosks.map(({ board, presence }) => {
              const name = kioskName(board);
              const tone = PRESENCE[presence];
              return (
                <li key={board.id}>
                  <Link
                    to={kioskHref(board, { live })}
                    aria-label={`Open ${name}, ${tone.label}`}
                    className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-inherit no-underline hover:bg-accent/40"
                  >
                    <PresenceDot presence={presence} />
                    <div className="flex min-h-[46px] min-w-0 flex-1 flex-col justify-center gap-1">
                      <p className="truncate text-sm font-medium text-card-foreground">{name}</p>
                      <p className="truncate font-mono text-sm text-muted-foreground">
                        {live
                          ? board.kit_id || "No kit ID"
                          : board.mac || "Awaiting USB bind"}
                      </p>
                    </div>
                    <div className="hidden min-h-[46px] min-w-0 flex-1 flex-col justify-center gap-1 text-xs text-muted-foreground sm:flex">
                      {live ? (
                        <>
                          <p>Ping {formatRelative(board.last_heartbeat_at)}</p>
                          <p>SOS {board.last_sos_at ? formatRelative(board.last_sos_at) : "never"}</p>
                          <p>Door {board.last_door_at ? formatRelative(board.last_door_at) : "never"}</p>
                        </>
                      ) : (
                        <>
                          <p>{skuLine(board.last_sku)}</p>
                          <p className="font-mono">{shortSha(board.last_sha)}</p>
                          <p>{board.last_write_at ? formatTime(board.last_write_at) : "Never written"}</p>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="max-w-xl" aria-labelledby="new-kiosk-title">
          <SheetHeader>
            <div className="min-w-0 flex-1">
              <SheetTitle id="new-kiosk-title">New kiosk</SheetTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Same identity fields as the kit setup portal. Bind the ESP32 over USB when it is on the bench.
              </p>
            </div>
            <SheetClose onClick={() => setCreateOpen(false)} />
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleCreate}>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <KitIdentityFields
                idPrefix="new"
                mode="create"
                values={createDraft}
                onChange={setCreateDraft}
              />
            </div>
            <div className="shrink-0 border-t px-5 py-4">
              <Button type="submit" disabled={creating || !createDraft.slot.trim()}>
                {creating ? "Creating…" : "Create kiosk"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={sourceOpen} onOpenChange={setSourceOpen}>
        <SheetContent aria-labelledby="change-source-title">
          <SheetHeader>
            <div className="min-w-0 flex-1">
              <SheetTitle id="change-source-title">Change source</SheetTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Firmware git used when compiling flashes on this bench.
              </p>
            </div>
            <SheetClose onClick={() => setSourceOpen(false)} />
          </SheetHeader>
          <div className="px-5 py-4">
            <FirmwareSourceForm onSaved={() => setSourceOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
