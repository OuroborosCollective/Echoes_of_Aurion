export type DeviceCategory = 'Phone' | 'Tablet' | 'Desktop';

export interface DeviceBudgetConstants {
  tier: DeviceCategory;
  maxDrawCalls: number;
  maxTriangles: number;
  maxSkinnedMeshMixers: number;
  maxParticlePoolSize: number;
  farClipMeters: number;
  targetFps: number;
  enableBloom: boolean;
  enableShadows: boolean;
  textureQualityScale: number;
}

export const DEVICE_BUDGET_MAP: Record<DeviceCategory, DeviceBudgetConstants> = {
  Phone: {
    tier: 'Phone',
    maxDrawCalls: 60,
    maxTriangles: 100_000,
    maxSkinnedMeshMixers: 12,
    maxParticlePoolSize: 600,
    farClipMeters: 220,
    targetFps: 30,
    enableBloom: false,
    enableShadows: false,
    textureQualityScale: 0.5,
  },
  Tablet: {
    tier: 'Tablet',
    maxDrawCalls: 120,
    maxTriangles: 350_000,
    maxSkinnedMeshMixers: 30,
    maxParticlePoolSize: 1200,
    farClipMeters: 320,
    targetFps: 45,
    enableBloom: true,
    enableShadows: true,
    textureQualityScale: 0.75,
  },
  Desktop: {
    tier: 'Desktop',
    maxDrawCalls: 300,
    maxTriangles: 1_000_000,
    maxSkinnedMeshMixers: 100,
    maxParticlePoolSize: 2400,
    farClipMeters: 500,
    targetFps: 60,
    enableBloom: true,
    enableShadows: true,
    textureQualityScale: 1.0,
  },
};

/**
 * Device-aware configuration service for Quality Governor (AIM-273).
 * Detects client category ('Phone', 'Tablet', 'Desktop') and sets initial budget constants.
 */
export class DeviceConfigService {
  public static detectDeviceCategory(
    screenWidth?: number,
    screenHeight?: number,
    userAgent?: string,
    maxTouchPoints?: number
  ): DeviceCategory {
    const width = screenWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    const touch = maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);

    const isMobileUa = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry/i.test(ua);
    const isTabletUa = /iPad|Android(?!.*Mobile)|Tablet/i.test(ua);

    if (isMobileUa || width < 768) {
      return 'Phone';
    }

    if (isTabletUa || (width < 1200 && touch > 0)) {
      return 'Tablet';
    }

    return 'Desktop';
  }

  public static getBudgetConstants(
    category?: DeviceCategory,
    screenWidth?: number,
    screenHeight?: number,
    userAgent?: string
  ): DeviceBudgetConstants {
    const detectedCategory = category ?? this.detectDeviceCategory(screenWidth, screenHeight, userAgent);
    return { ...DEVICE_BUDGET_MAP[detectedCategory] };
  }
}
