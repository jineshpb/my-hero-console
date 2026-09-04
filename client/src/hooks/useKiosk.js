import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useConsole } from "@/context/ConsoleContext";
import { kioskIdToMac, findKiosk } from "@/lib/kiosk";

export const useKiosk = () => {
  const { kioskId } = useParams();
  const consoleState = useConsole();
  const board = findKiosk(consoleState.kiosks, kioskId);
  const mac = board?.mac || kioskIdToMac(kioskId);
  const kioskFlashes = useMemo(
    () =>
      consoleState.flashes.filter(
        (row) => (board?.id && row.kiosk_id === board.id) || (mac && row.mac === mac)
      ),
    [consoleState.flashes, board?.id, mac]
  );

  return {
    ...consoleState,
    kioskId,
    mac,
    board,
    kioskFlashes,
  };
};
