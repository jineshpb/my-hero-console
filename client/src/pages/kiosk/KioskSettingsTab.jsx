import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useKiosk } from "@/hooks/useKiosk";
import { portSelectOptions } from "@/lib/kiosk";

export const KioskSettingsTab = () => {
  const {
    board,
    ports,
    portsLoading,
    port,
    setPort,
    handleSaveKiosk,
    setError,
  } = useKiosk();
  const [slotDraft, setSlotDraft] = useState(board.slot || "");
  const [notesDraft, setNotesDraft] = useState(board.notes || "");

  useEffect(() => {
    setSlotDraft(board.slot || "");
    setNotesDraft(board.notes || "");
  }, [board.slot, board.notes]);

  const handleSaveMeta = async (event) => {
    event.preventDefault();
    try {
      await handleSaveKiosk(board.mac, { slot: slotDraft, notes: notesDraft });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kiosk settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-xl gap-4" onSubmit={handleSaveMeta}>
          <div className="space-y-2">
            <Label htmlFor="kiosk-slot">Slot</Label>
            <Input
              id="kiosk-slot"
              className="w-24 font-mono"
              value={slotDraft}
              onChange={(event) => setSlotDraft(event.target.value)}
              placeholder="01"
              aria-label="Kit slot"
            />
            <p className="text-xs text-muted-foreground">Becomes the display name my-hro-kiosk-nn.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kiosk-notes">Notes</Label>
            <Input
              id="kiosk-notes"
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              aria-label="Kiosk notes"
            />
          </div>
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
          </div>
        </form>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          Controller MAC {board.mac}
          {board.chip_model ? ` · ${board.chip_model}` : ""}
        </p>
      </CardContent>
    </Card>
  );
};
