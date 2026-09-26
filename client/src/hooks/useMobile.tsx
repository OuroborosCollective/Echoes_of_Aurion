import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;
const SMALL_PHONE_BREAKPOINT = 380;

export type DeviceType = "mobile" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";

export interface DeviceProfile {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isSmallPhone: boolean;
  deviceType: DeviceType;
  orientation: Orientation;
  hasTouch: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

function readProfile(): DeviceProfile {
  const width = typeof window !== "undefined" ? window.innerWidth : 1280;
  const height = typeof window !== "undefined" ? window.innerHeight : 800;
  const hasTouch =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const isMobile = width < MOBILE_BREAKPOINT;
  const isTablet = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT;
  const isDesktop = width >= TABLET_BREAKPOINT;
  return {
    isMobile,
    isTablet,
    isDesktop,
    isSmallPhone: width < SMALL_PHONE_BREAKPOINT,
    deviceType: isMobile ? "mobile" : isTablet ? "tablet" : "desktop",
    orientation: width >= height ? "landscape" : "portrait",
    hasTouch,
    viewportWidth: width,
    viewportHeight: height,
  };
}

const EMPTY_PROFILE: DeviceProfile = {
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isSmallPhone: false,
  deviceType: "desktop",
  orientation: "landscape",
  hasTouch: false,
  viewportWidth: 1280,
  viewportHeight: 800,
};

/**
 * Comprehensive device + viewport detection hook.
 * Returns a stable profile that updates on resize and orientation change.
 */
export function useDeviceDetect(): DeviceProfile {
  const [profile, setProfile] = React.useState<DeviceProfile>(EMPTY_PROFILE);

  React.useEffect(() => {
    setProfile(readProfile());
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setProfile(readProfile()));
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return profile;
}

/** Backward-compatible boolean mobile check (width < 768px). */
export function useIsMobile() {
  const { isMobile } = useDeviceDetect();
  return isMobile;
}
