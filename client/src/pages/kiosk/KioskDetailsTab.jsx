import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KitIdentityFields } from "@/components/KitIdentityFields";
import { useKiosk } from "@/hooks/useKiosk";
import {
  formatRelative,
  formatTime,
  isUsbConnected,
  kitIdentityFromKiosk,
  kitIdentityPayload,
  kioskName,
  lastWrite,
  shortSha,
} from "@/lib/kiosk";

const DetailRow = ({ label, children }) => (
  <div className="grid grid-cols-[8rem_1fr] items-baseline gap-4 border-b py-3 last:border-b-0">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-sm">{children}</dd>
  </div>
);

export const KioskDetailsTab = () => {
  const { board, kioskFlashes, ports, identity, handleSaveKiosk, setError } = useKiosk();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => kitIdentityFromKiosk(board));
  const write = lastWrite(kioskFlashes);
  const usbHere = isUsbConnected(board, ports, identity);
  const name = kioskName(board);
  const lastGrade = write?.serial_grade || (write?.success ? "ok" : write ? "fail" : "");
  const writeAt = write?.finished_at || board.last_write_at;

  useEffect(() => {
    if (editing) {
      return;
    }
    setDraft(kitIdentityFromKiosk(board));
  }, [
    editing,
    board.id,
    board.mac,
    board.slot,
    board.notes,
    board.kit_id,
    board.status_extended,
    board.device_id,
    board.device_name,
    board.location_label,
    board.webhook_url,
    board.heartbeat_url,
    board.kit_secret,
    board.status_hash,
    board.access_pin,
  ]);

  const handleEdit = () => {
    setDraft(kitIdentityFromKiosk(board));
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft(kitIdentityFromKiosk(board));
    setEditing(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await handleSaveKiosk(board.id, kitIdentityPayload(draft));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <CardTitle className="text-base">{editing ? "Edit kiosk" : "Kiosk details"}</CardTitle>
          {editing ? null : (
            <Button type="button" variant="outline" size="sm" onClick={handleEdit} aria-label="Edit kiosk details">
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <form className="grid max-w-xl gap-6" onSubmit={handleSave}>
              <KitIdentityFields
                idPrefix="details"
                mode="edit"
                values={draft}
                onChange={setDraft}
                savedSecrets={{
                  kit_secret: Boolean(board.kit_secret),
                  status_hash: Boolean(board.status_hash),
                  access_pin: Boolean(board.access_pin),
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving} aria-label="Save kiosk details">
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
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
              <DetailRow label="Notes">{board.notes || "—"}</DetailRow>
              <DetailRow label="SKU">{board.last_sku || "—"}</DetailRow>
              <DetailRow label="Firmware">
                <span className="font-mono text-xs">{shortSha(board.last_sha)}</span>
              </DetailRow>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};
