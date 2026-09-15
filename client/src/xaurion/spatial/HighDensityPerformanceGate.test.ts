import { describe, expect, it } from 'vitest';
import { HighDensityPerformanceGate } from './HighDensityPerformanceGate';

describe('HighDensityPerformanceGate (AIM-279 End-to-End Performance Gate)', () => {
  it('runs high-density evaluation for phone profile and passes without actor elimination', () => {
    const report = HighDensityPerformanceGate.runGateEvaluation('phone', 120, 9);

    expect(report.profile).toBe('phone');
    expect(report.confirmedActorsCount).toBe(120);
    expect(report.visibleActorsCount).toBe(120);
    expect(report.actorEliminationDetected).toBe(false);
    expect(report.overallGatePassed).toBe(true);
    expect(report.maxParticlePool).toBe(600);
  });

  it('runs high-density evaluation for tablet profile', () => {
    const report = HighDensityPerformanceGate.runGateEvaluation('tablet', 250, 16);

    expect(report.profile).toBe('tablet');
    expect(report.confirmedActorsCount).toBe(250);
    expect(report.visibleActorsCount).toBe(250);
    expect(report.actorEliminationDetected).toBe(false);
    expect(report.overallGatePassed).toBe(true);
    expect(report.maxParticlePool).toBe(1200);
  });

  it('runs high-density evaluation for desktop profile', () => {
    const report = HighDensityPerformanceGate.runGateEvaluation('desktop', 500, 25);

    expect(report.profile).toBe('desktop');
    expect(report.confirmedActorsCount).toBe(500);
    expect(report.visibleActorsCount).toBe(500);
    expect(report.actorEliminationDetected).toBe(false);
    expect(report.overallGatePassed).toBe(true);
    expect(report.maxParticlePool).toBe(2400);
    expect(report.bvhMeshAccelerated).toBe(true);
  });
});
