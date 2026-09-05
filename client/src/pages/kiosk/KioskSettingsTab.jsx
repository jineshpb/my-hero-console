import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { KitIdentityFields } from "@/components/KitIdentityFields";
import { useKiosk } from "@/hooks/useKiosk";
import { kitIdentityFromKiosk, kitIdentityPayload, kioskName, portSelectOptions } from "@/lib/kiosk";

export const KioskSettingsTab = () => {
  const navigate = useNavigate();
  const {
    board,
    ports,
    portsLoading,
    port,
    setPort,
    busy,
    handleSaveKiosk,
    handleIdentify,
    handleProvisionKiosk,
    handleDeleteKiosk,
    setError,
  } = useKiosk();
  const [draft, setDraft] = useState(() => kitIdentityFromKiosk(board));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDraft(kitIdentityFromKiosk(board));
    setConfirmDelete(false);
  }, [
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

  const handleSaveMeta = async (event) => {
    event.preventDefault();
    try {
      await handleSaveKiosk(board.id, kitIdentityPayload(draft));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await handleDeleteKiosk(board.id);
      navigate("/kiosks");
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kiosk settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid max-w-xl gap-6" onSubmit={handleSaveMeta}>
            <KitIdentityFields
              idPrefix="kiosk"
              mode="edit"
              values={draft}
              onChange={setDraft}
              savedSecrets={{
                kit_secret: Boolean(board.kit_secret),
                status_hash: Boolean(board.status_hash),
                access_pin: Boolean(board.access_pin),
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="settings-usb">USB port</Label>
              <Select
                id="settings-usb"
                value={port}
                onChange={setPort}
                aria-label="USB serial port"
                options={portSelectOptions(ports, portsLoading)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Save</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleIdentify(board.id)}
                disabled={!port || Boolean(busy)}
              >
                {board.mac ? "Rebind USB" : "Bind USB"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleProvisionKiosk(board.id).catch((err) => setError(err.message))}
                disabled={!port || !board.slot || Boolean(busy)}
              >
                Write identity to chip
              </Button>
            </div>
          </form>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            {board.mac ? `Controller MAC ${board.mac}` : "No controller bound yet"}
            {board.chip_model ? ` · ${board.chip_model}` : ""}
            {board.provisioned_hostname ? ` · NVS ${board.provisioned_hostname}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Delete kiosk</CardTitle>
        </CardHeader>
        <CardContent className="max-w-xl space-y-3">
          <p className="text-sm text-muted-foreground">
            Remove {kioskName(board)} from this bench ledger. Flash history for this kit is deleted too. The
            chip itself is not erased.
          </p>
          {confirmDelete ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                aria-label={`Confirm delete ${kioskName(board)}`}
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${kioskName(board)}`}
            >
              Delete kiosk
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
