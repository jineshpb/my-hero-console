import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useKiosk } from "@/hooks/useKiosk";
import { formatRelative, formatTime, isUsbConnected, kioskName, lastWrite, shortSha } from "@/lib/kiosk";

const DetailRow = ({ label, children }) => (
  <div className="grid grid-cols-[8rem_1fr] items-baseline gap-4 border-b py-3 last:border-b-0">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-sm">{children}</dd>
  </div>
);

export const KioskDetailsTab = () => {
  const { board, kioskFlashes, ports, identity } = useKiosk();
  const write = lastWrite(kioskFlashes);
  const usbHere = isUsbConnected(board, ports, identity);
  const name = kioskName(board);
  const lastGrade = write?.serial_grade || (write?.success ? "ok" : write ? "fail" : "");
  const writeAt = write?.finished_at || board.last_write_at;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Kiosk details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <DetailRow label="Name">{name}</DetailRow>
            <DetailRow label="Slot">{board.slot || "—"}</DetailRow>
            <DetailRow label="Controller">{board.mac || "Awaiting USB bind"}</DetailRow>
            <DetailRow label="Identity">
              {board.provisioned_at
                ? `${board.provisioned_hostname || name} · written ${formatTime(board.provisioned_at)}`
                : board.mac
                  ? "Not written to chip yet"
                  : "Bind USB, then flash"}
            </DetailRow>
            <DetailRow label="Device ID">
              <span className="font-mono text-xs">{board.device_id || "—"}</span>
            </DetailRow>
            <DetailRow label="Device name">{board.device_name || "—"}</DetailRow>
            <DetailRow label="Location">{board.location_label || "—"}</DetailRow>
            <DetailRow label="Kit ID">
              <span className="font-mono text-xs">{board.kit_id || "—"}</span>
            </DetailRow>
            <DetailRow label="Status fields">
              {board.status_extended === "1" ? "Extended telemetry on" : "Original three-field ping"}
            </DetailRow>
            <DetailRow label="SOS API">
              <span className="break-all font-mono text-xs">{board.webhook_url || "—"}</span>
            </DetailRow>
            <DetailRow label="Status API">
              <span className="break-all font-mono text-xs">{board.heartbeat_url || "—"}</span>
            </DetailRow>
            <DetailRow label="Credentials">
              {[
                board.kit_secret ? "kit secret" : null,
                board.status_hash ? "status hash" : null,
                board.access_pin ? "service PIN" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Not set"}
            </DetailRow>
            <DetailRow label="SKU">{board.last_sku || "—"}</DetailRow>
            <DetailRow label="Firmware">
              <span className="font-mono text-xs">{shortSha(board.last_sha)}</span>
            </DetailRow>
            <DetailRow label="Sketch">{board.last_sku || "—"}</DetailRow>
            <DetailRow label="Board">
              <span className="font-mono text-xs">
                {board.chip_model || "ESP32"} · {board.last_port || "no port"}
                {usbHere ? " · USB now" : ""}
              </span>
            </DetailRow>
            <DetailRow label="Last write">
              {writeAt ? (
                <div className="space-y-1">
                  <p>{formatTime(writeAt)}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(writeAt)}</p>
                  {write ? (
                    <span className="inline-flex items-center gap-2">
                      <Badge variant="outline">{lastGrade}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {write.sku} · {shortSha(write.git_sha)}
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : (
                "No writes yet"
              )}
            </DetailRow>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
};
