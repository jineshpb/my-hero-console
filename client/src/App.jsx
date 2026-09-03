import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { ConsoleProvider } from "@/context/ConsoleContext";
import { FirmwarePage } from "@/pages/FirmwarePage";
import { KioskActivityTab } from "@/pages/kiosk/KioskActivityTab";
import { KioskDetailsTab } from "@/pages/kiosk/KioskDetailsTab";
import { KioskLogsTab } from "@/pages/kiosk/KioskLogsTab";
import { KioskRfidTab } from "@/pages/kiosk/KioskRfidTab";
import { KioskSerialTab } from "@/pages/kiosk/KioskSerialTab";
import { KioskSettingsTab } from "@/pages/kiosk/KioskSettingsTab";
import { KioskDetailPage } from "@/pages/KioskDetailPage";
import { KiosksPage } from "@/pages/KiosksPage";

const App = () => (
  <BrowserRouter>
    <ConsoleProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/kiosks" replace />} />
          <Route path="/kiosks" element={<KiosksPage />} />
          <Route path="/kiosks/:kioskId" element={<KioskDetailPage />}>
            <Route index element={<KioskDetailsTab />} />
            <Route path="activity" element={<KioskActivityTab />} />
            <Route path="logs" element={<KioskLogsTab />} />
            <Route path="serial" element={<KioskSerialTab />} />
            <Route path="rfid" element={<KioskRfidTab />} />
            <Route path="settings" element={<KioskSettingsTab />} />
          </Route>
          <Route path="/firmware" element={<FirmwarePage />} />
        </Route>
      </Routes>
    </ConsoleProvider>
  </BrowserRouter>
);

export default App;
