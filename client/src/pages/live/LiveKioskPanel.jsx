import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatRelative, formatTime, formatUptime } from "@/lib/kiosk";

const StatTile = ({ label, value, hint }) => (
  <div className="rounded-lg border border-border px-3 py-2.5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 truncate text-sm font-medium text-card-foreground">{value}</p>
    {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

const EventRow = ({ title, meta, time }) => (
  <li className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-card-foreground">{title}</p>
      {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
    </div>
    <p className="shrink-0 text-xs text-muted-foreground">{time}</p>
  </li>
);

const EmptyList = ({ children }) => (
  <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
);

const formatBattery = (percent, voltage) => {
  if (percent == null && voltage == null) {
    return { value: "—", hint: "Extended ping off or never seen" };
  }
  const value = percent == null ? "—" : `${Number(percent).toFixed(Number(percent) % 1 === 0 ? 0 : 1)}%`;
  const hint = voltage == null ? null : `${Number(voltage).toFixed(3)} V`;
  return { value, hint };
};

const formatRssi = (rssi) => {
  if (rssi == null) {
    return "—";
  }
  return `${rssi} dBm`;
};

const formatRfid = (rfidOk) => {
  if (rfidOk === true) {
    return "OK";
  }
  if (rfidOk === false) {
    return "Fault";
  }
  return "—";
};

export const LiveKioskPanel = ({ kioskId }) => {
  const [heartbeats, setHeartbeats] = useState([]);
  const [sosPresses, setSosPresses] = useState([]);
  const [doorOpenings, setDoorOpenings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [nextHeartbeats, nextSos, nextDoors] = await Promise.all([
          api(`/api/kiosks/${kioskId}/heartbeats?limit=8`),
          api(`/api/kiosks/${kioskId}/sos-presses?limit=8`),
          api(`/api/kiosks/${kioskId}/door-openings?limit=8`),
        ]);
        if (cancelled) {
          return;
        }
        setHeartbeats(Array.isArray(nextHeartbeats) ? nextHeartbeats : []);
        setSosPresses(Array.isArray(nextSos) ? nextSos : []);
        setDoorOpenings(Array.isArray(nextDoors) ? nextDoors : []);
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [kioskId]);

  const latest = heartbeats[0] || null;
  const battery = formatBattery(latest?.batteryPercent, latest?.batteryVoltage);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-medium text-white">Field status</h2>
          <p className="text-xs text-muted-foreground">
            Last-seen from kit POSTs. Pings are about every 10 minutes, not a live stream.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Last ping"
            value={latest ? formatRelative(latest.receivedAt) : "Never"}
            hint={latest ? formatTime(latest.receivedAt) : "Waiting for first status POST"}
          />
          <StatTile label="Battery" value={battery.value} hint={battery.hint} />
          <StatTile
            label="Wi-Fi"
            value={formatRssi(latest?.wifiRssi)}
            hint={latest?.deviceId || "RSSI when statusext=1"}
          />
          <StatTile
            label="RFID"
            value={formatRfid(latest?.rfidOk)}
            hint={latest?.rfidOk == null ? "Not in last ping" : "RC522 last report"}
          />
          <StatTile
            label="Uptime"
            value={latest?.uptimeSec == null ? "—" : formatUptime(latest.uptimeSec)}
            hint={latest?.uptimeSec == null ? null : `${latest.uptimeSec}s`}
          />
          <StatTile
            label="Boot"
            value={latest?.bootCount == null ? "—" : String(latest.bootCount)}
            hint={latest?.resetReason || "Reset reason when reported"}
          />
          <StatTile
            label="Last SOS"
            value={sosPresses[0] ? formatRelative(sosPresses[0].receivedAt) : "Never"}
            hint={sosPresses[0]?.triggeredBy || "Button POST from the sketch"}
          />
          <StatTile
            label="Last door"
            value={doorOpenings[0] ? formatRelative(doorOpenings[0].receivedAt) : "Never"}
            hint={
              doorOpenings[0]
                ? [doorOpenings[0].triggeredBy, doorOpenings[0].gpio != null ? `GPIO ${doorOpenings[0].gpio}` : null]
                    .filter(Boolean)
                    .join(" · ")
                : "Firmware does not POST door events yet"
            }
          />
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading field events…</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Heartbeats</CardTitle>
          </CardHeader>
          <CardContent>
            {heartbeats.length === 0 ? (
              <EmptyList>No pings yet. Kits POST kitId, localTimeStamp, and hash to the status URL.</EmptyList>
            ) : (
              <ul>
                {heartbeats.map((row) => (
                  <EventRow
                    key={row.id}
                    title={row.localTimeStamp || formatTime(row.receivedAt)}
                    meta={[
                      row.batteryPercent != null ? `${row.batteryPercent}%` : null,
                      row.wifiRssi != null ? `${row.wifiRssi} dBm` : null,
                      row.rfidOk === true ? "RFID ok" : row.rfidOk === false ? "RFID fault" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Original three-field ping"}
                    time={formatRelative(row.receivedAt)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">SOS presses</CardTitle>
          </CardHeader>
          <CardContent>
            {sosPresses.length === 0 ? (
              <EmptyList>No SOS POSTs yet.</EmptyList>
            ) : (
              <ul>
                {sosPresses.map((row) => (
                  <EventRow
                    key={row.id}
                    title={row.triggeredBy || "SOS"}
                    meta={`Attempt ${row.attemptNo ?? "—"} · ${row.localTimeStamp || formatTime(row.receivedAt)}`}
                    time={formatRelative(row.receivedAt)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Door openings</CardTitle>
          </CardHeader>
          <CardContent>
            {doorOpenings.length === 0 ? (
              <EmptyList>No door events yet. Table is ready when the sketch starts POSTing.</EmptyList>
            ) : (
              <ul>
                {doorOpenings.map((row) => (
                  <EventRow
                    key={row.id}
                    title={row.triggeredBy || "Door"}
                    meta={[
                      row.gpio != null ? `GPIO ${row.gpio}` : null,
                      `Attempt ${row.attemptNo ?? "—"}`,
                      row.localTimeStamp || formatTime(row.receivedAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    time={formatRelative(row.receivedAt)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
