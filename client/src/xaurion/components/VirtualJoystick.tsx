import { useCallback, useEffect, useRef } from "react";
import { VirtualJoystick as DesktopJoystick } from "./LegacyVirtualJoystick";
import { VirtualJoystick as MobileJoystick } from "./MobileVirtualJoystick";
import { usePcHud } from "./hud/usePcHud";

export const VirtualJoystick = ({ onMove }: { onMove: (forward: number, right: number) => void }) => {
  const pc = usePcHud();
  const lastCallback = useRef(onMove);
  const moving = useRef(false);
  lastCallback.current = onMove;
  const relay = useCallback((forward: number, right: number) => {
    moving.current = forward !== 0 || right !== 0;
    lastCallback.current(forward, right);
  }, []);
  // Switching presentation or removing the stick must release a held move.
  useEffect(() => () => {
    if (moving.current) {
      moving.current = false;
      lastCallback.current(0, 0);
    }
  }, [pc]);
  return pc ? <DesktopJoystick onMove={relay} /> : <MobileJoystick onMove={relay} />;
};
