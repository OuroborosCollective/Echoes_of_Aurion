import { describe, expect, it, vi, beforeEach } from 'vitest';
import { calculatePercentiles, getMemoryHeapUsage, PerformanceLoggerService } from '../services/PerformanceLoggerService';

describe('PerformanceLoggerService (AIM-273)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates p50 and p95 frame times correctly from sample arrays', () => {
    // 100 frame deltas from 10ms to 109ms
    const samples = Array.from({ length: 100 }, (_, i) => 10 + i);
    const result = calculatePercentiles(samples);

    expect(result.count).toBe(100);
    expect(result.min).toBe(10);
    expect(result.max).toBe(109);
    expect(result.p50).toBe(60);  // 50th index is 10 + 50 = 60
    expect(result.p95).toBe(105); // 95th index is 10 + 95 = 105
  });

  it('handles empty or single sample arrays gracefully', () => {
    const empty = calculatePercentiles([]);
    expect(empty.p50).toBe(0);
    expect(empty.p95).toBe(0);
    expect(empty.count).toBe(0);

    const single = calculatePercentiles([16.6]);
    expect(single.p50).toBe(16.6);
    expect(single.p95).toBe(16.6);
    expect(single.count).toBe(1);
  });

  it('reads memory heap usage when available or returns nulls cleanly', () => {
    const mem = getMemoryHeapUsage();
    expect(typeof mem).toBe('object');
    // In node/vitest, performance.memory may be undefined or mocked
    if (mem.usedMb !== null) {
      expect(mem.usedMb).toBeGreaterThan(0);
    } else {
      expect(mem.usedMb).toBeNull();
      expect(mem.totalMb).toBeNull();
    }
  });

  it('posts performance log payloads to .manus-logs via endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const success = await PerformanceLoggerService.logMetrics({
      timestamp: new Date().toISOString(),
      type: 'performance_metrics',
      deviceTier: 'Tablet',
      frameTimeP50: 16.6,
      frameTimeP95: 22.1,
      avgFps: 60.0,
      memoryHeapUsedMb: 45.2,
      memoryHeapTotalMb: 128.0,
      samplesCount: 120,
    });

    expect(success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const args = fetchSpy.mock.calls[0];
    expect(args[0]).toBe('/__manus__/logs');
    const body = JSON.parse(args[1]?.body as string);
    expect(body.performanceLogs).toHaveLength(1);
    expect(body.performanceLogs[0].deviceTier).toBe('Tablet');
  });
});
