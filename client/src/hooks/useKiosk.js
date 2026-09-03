import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useConsole } from "@/context/ConsoleContext";
import { kioskIdToMac } from "@/lib/kiosk";

export const useKiosk = () => {
  const { kioskId } = useParams();
  const consoleState = useConsole();
  const mac = kioskIdToMac(kioskId);
  const board = consoleState.kiosks.find((item) => item.mac === mac);
  const kioskFlashes = useMemo(
    () => consoleState.flashes.filter((row) => row.mac === mac),
    [consoleState.flashes, mac]
  );

  return {
    ...consoleState,
    kioskId,
    mac,
    board,
    kioskFlashes,
  };
};
