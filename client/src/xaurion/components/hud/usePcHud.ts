import { useEffect, useState } from "react";

// Keep desktop's existing HUD for a primary mouse/keyboard on a wide screen.
// Touch-primary devices and small screens receive the mobile presentation.
export const PC_HUD_QUERY = "(pointer: fine) and (hover: hover) and (min-width: 721px)";
export function usePcHud(): boolean {
  const [pc, setPc] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PC_HUD_QUERY).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(PC_HUD_QUERY);
    const update = () => setPc(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return pc;
}
