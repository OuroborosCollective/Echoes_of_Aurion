import { describe, expect, it } from 'vitest';
import { DeviceConfigService, DEVICE_BUDGET_MAP } from './DeviceConfigService';

describe('DeviceConfigService (AIM-273)', () => {
  it('detects Phone profile correctly for mobile width or mobile userAgent', () => {
    const phoneByWidth = DeviceConfigService.detectDeviceCategory(375, 667);
    expect(phoneByWidth).toBe('Phone');

    const phoneByUa = DeviceConfigService.detectDeviceCategory(1024, 768, 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
    expect(phoneByUa).toBe('Phone');
  });

  it('detects Tablet profile correctly for tablet width or touch userAgent', () => {
    const tabletByWidth = DeviceConfigService.detectDeviceCategory(800, 1024, '', 2);
    expect(tabletByWidth).toBe('Tablet');

    const tabletByUa = DeviceConfigService.detectDeviceCategory(1400, 900, 'Mozilla/5.0 (iPad; CPU OS 13_2 like Mac OS X)');
    expect(tabletByUa).toBe('Tablet');
  });

  it('detects Desktop profile by default for high resolution non-touch screens', () => {
    const desktop = DeviceConfigService.detectDeviceCategory(1920, 1080, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0);
    expect(desktop).toBe('Desktop');
  });

  it('returns appropriate initial budget constants for each device category', () => {
    const phoneBudget = DeviceConfigService.getBudgetConstants('Phone');
    expect(phoneBudget.tier).toBe('Phone');
    expect(phoneBudget.maxParticlePoolSize).toBe(600);
    expect(phoneBudget.targetFps).toBe(30);

    const tabletBudget = DeviceConfigService.getBudgetConstants('Tablet');
    expect(tabletBudget.tier).toBe('Tablet');
    expect(tabletBudget.maxParticlePoolSize).toBe(1200);

    const desktopBudget = DeviceConfigService.getBudgetConstants('Desktop');
    expect(desktopBudget.tier).toBe('Desktop');
    expect(desktopBudget.maxParticlePoolSize).toBe(2400);
    expect(desktopBudget.targetFps).toBe(60);
  });
});
