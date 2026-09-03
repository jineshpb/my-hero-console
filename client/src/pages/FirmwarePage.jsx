import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConsole } from "@/context/ConsoleContext";

export const FirmwarePage = () => {
  const {
    git,
    firmwareGit,
    setFirmwareGit,
    firmwareBranch,
    setFirmwareBranch,
    pulling,
    busy,
    handleSaveFirmwareSource,
    handlePull,
  } = useConsole();

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-2xl font-medium text-white">Firmware</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Source of sketches flashed onto SOS kiosks. Flash itself is a kiosk action.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Firmware source</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_8rem_auto]" onSubmit={handleSaveFirmwareSource}>
            <div className="space-y-2">
              <Label htmlFor="firmware-git">Git URL or path</Label>
              <Input
                id="firmware-git"
                className="font-mono text-xs"
                value={firmwareGit}
                onChange={(event) => setFirmwareGit(event.target.value)}
                placeholder="https://github.com/you/sos-button-firmware.git"
                aria-label="Firmware git URL or local path"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firmware-branch">Branch</Label>
              <Input
                id="firmware-branch"
                value={firmwareBranch}
                onChange={(event) => setFirmwareBranch(event.target.value)}
                aria-label="Firmware git branch"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={Boolean(busy) || pulling || !firmwareGit}>
                {pulling ? "Pulling…" : "Save & pull"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePull}
                disabled={Boolean(busy) || pulling}
                aria-label="Fetch latest commits from GitHub"
              >
                Pull
              </Button>
            </div>
          </form>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            {git?.branch || "no git"} · {git?.shortSha || "—"}
            {git?.dirty ? " dirty" : ""}
            {git?.subject ? ` · ${git.subject}` : ""}
          </p>
          {git?.remote ? <p className="mt-1 max-w-xl truncate font-mono text-xs text-muted-foreground">{git.remote}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
};
