import { VirtualJoystick as DesktopJoystick } from "./LegacyVirtualJoystick";
import { VirtualJoystick as MobileJoystick } from "./MobileVirtualJoystick";
import { usePcHud } from "./hud/usePcHud";
export const VirtualJoystick = ({ onMove }: { onMove: (forward: number, right: number) => void }) => {
  const pc = usePcHud();
  return pc ? <DesktopJoystick onMove={onMove} /> : <MobileJoystick onMove={onMove} />;
};
