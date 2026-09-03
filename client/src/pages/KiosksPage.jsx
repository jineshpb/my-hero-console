import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useConsole } from "@/context/ConsoleContext";
import { formatTime, kioskHref, kioskName, kioskStatus, portSelectOptions, shortSha } from "@/lib/kiosk";

export const KiosksPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const {
    boards,
    ports,
    portsLoading,
    port,
    setPort,
    identity,
    busy,
    handleIdentify,
    refresh,
    setError,
  } = useConsole();

  const kiosks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return boards.filter((board) => {
      if (!needle) {
        return true;
      }
      const haystack = [kioskName(board), board.mac, board.slot, board.last_sku, board.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [boards, query]);

  const handleIdentifyAndOpen = async () => {
    const result = await handleIdentify();
    if (result?.mac) {
      navigate(kioskHref({ mac: result.mac }));
    }
  };

  return (
    <div>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-white">Kiosks</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {boards.length} SOS kiosk{boards.length === 1 ? "" : "s"} · identity is the ESP32 factory MAC
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <Label htmlFor="usb-port" className="text-xs text-muted-foreground">
              USB port
            </Label>
            <Select
              id="usb-port"
              className="mt-1"
              value={port}
              onChange={setPort}
              aria-label="USB serial port"
              options={portSelectOptions(ports, portsLoading)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleIdentifyAndOpen}
            disabled={!port || Boolean(busy)}
            aria-label="Read ESP32 MAC and open that kiosk"
          >
            Identify USB
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => refresh().catch((err) => setError(err.message))}
            aria-label="Refresh kiosks and ports"
          >
            Refresh
          </Button>
        </div>
      </header>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search kiosks"
          aria-label="Search kiosks"
        />
      </div>

      {kiosks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {boards.length === 0
              ? "Plug a board in and identify USB. Each kiosk is named my-hro-kiosk-nn after you assign a slot."
              : "No kiosks match that search."}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {kiosks.map((board) => {
            const status = kioskStatus(board, ports, identity);
            const name = kioskName(board);
            return (
              <li key={board.mac}>
                <Link
                  to={kioskHref(board)}
                  aria-label={`Open ${name}`}
                  className="block rounded-xl no-underline text-inherit"
                >
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`size-2 shrink-0 rounded-full ${status.className}`} aria-hidden="true" />
                        <p className="truncate font-medium">{name}</p>
                        {name === "Unassigned" ? (
                          <Badge variant="outline">Needs slot</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{board.mac}</p>
                    </div>
                    <div className="hidden text-right text-sm sm:block">
                      <p className="text-muted-foreground">{board.last_sku || "No SKU"}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {shortSha(board.last_sha)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {board.last_write_at
                          ? `Last write ${formatTime(board.last_write_at)}`
                          : "Never written"}
                      </p>
                    </div>
                    <Badge variant="secondary">{status.label}</Badge>
                  </CardContent>
                </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
