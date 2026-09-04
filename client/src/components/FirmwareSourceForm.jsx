import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConsole } from "@/context/ConsoleContext";

export const FirmwareSourceForm = ({ onSaved }) => {
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

  const handleSubmit = async (event) => {
    const ok = await handleSaveFirmwareSource(event);
    if (ok) {
      onSaved?.();
    }
  };

  return (
    <div className="grid gap-4">
      <form className="grid gap-4" onSubmit={handleSubmit}>
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
        <div className="flex flex-wrap items-center gap-2">
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
      <p className="font-mono text-xs text-muted-foreground">
        {git?.branch || "no git"} · {git?.shortSha || "—"}
        {git?.dirty ? " dirty" : ""}
        {git?.subject ? ` · ${git.subject}` : ""}
      </p>
      {git?.remote ? (
        <p className="max-w-xl truncate font-mono text-xs text-muted-foreground">{git.remote}</p>
      ) : null}
    </div>
  );
};
