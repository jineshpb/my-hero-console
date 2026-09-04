import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FirmwareSourceForm } from "@/components/FirmwareSourceForm";

export const FirmwarePage = () => (
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
        <FirmwareSourceForm />
      </CardContent>
    </Card>
  </div>
);
