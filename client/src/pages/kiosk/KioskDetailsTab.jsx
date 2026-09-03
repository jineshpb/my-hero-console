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
