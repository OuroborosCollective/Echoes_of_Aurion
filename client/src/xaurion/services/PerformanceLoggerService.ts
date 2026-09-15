export interface PerformanceMetricsPayload {
  timestamp: string;
  type: 'performance_metrics';
  deviceTier: 'Phone' | 'Tablet' | 'Desktop';
  frameTimeP50: number;
  frameTimeP95: number;
  avgFps: number;
  memoryHeapUsedMb: number | null;
  memoryHeapTotalMb: number | null;
  samplesCount: number;
}

export interface PercentileResult {
  p50: number;
  p95: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

/**
 * Calculates p50, p95, min, max, and avg from frame time samples array.
 */
export function calculatePercentiles(samples: number[]): PercentileResult {
  if (!samples || samples.length === 0) {
    return { p50: 0, p95: 0, min: 0, max: 0, avg: 0, count: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = sum / count;

  const p50Index = Math.min(count - 1, Math.floor(count * 0.5));
  const p95Index = Math.min(count - 1, Math.floor(count * 0.95));

  return {
    p50: Number(sorted[p50Index]!.toFixed(2)),
    p95: Number(sorted[p95Index]!.toFixed(2)),
    min: Number(sorted[0]!.toFixed(2)),
    max: Number(sorted[count - 1]!.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    count,
  };
}

/**
 * Returns current JS heap usage in MB if available, or null.
 */
export function getMemoryHeapUsage(): { usedMb: number | null; totalMb: number | null } {
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    const mem = (performance as any).memory;
    const usedMb = Number((mem.usedJSHeapSize / (1024 * 1024)).toFixed(2));
    const totalMb = Number((mem.totalJSHeapSize / (1024 * 1024)).toFixed(2));
    return { usedMb, totalMb };
  }
  return { usedMb: null, totalMb: null };
}

/**
 * Service to dispatch performance metrics directly to .manus-logs via the debug collector.
 */
export class PerformanceLoggerService {
  private static endpoint = '/__manus__/logs';

  public static async logMetrics(payload: PerformanceMetricsPayload): Promise<boolean> {
    try {
      if (typeof fetch === 'undefined') return false;

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performanceLogs: [payload],
        }),
      });

      return response.ok;
    } catch {
      // Ignore network errors in offline test environments
      return false;
    }
  }
}
