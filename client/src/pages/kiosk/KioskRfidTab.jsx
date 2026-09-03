import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const KioskRfidTab = () => (
  <Card>
    <CardContent className="flex flex-wrap items-start justify-between gap-4 py-6">
      <div>
        <h2 className="text-lg font-medium">Onboarded RFID cards</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Cards enrolled on this kiosk will list here. Enrollment still happens on-device after USB identity is written.
        </p>
      </div>
      <Badge variant="outline">Coming later</Badge>
    </CardContent>
  </Card>
);
