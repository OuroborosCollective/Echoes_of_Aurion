import { useEffect, useRef, useState, useCallback } from 'react';
import {
  calculatePercentiles,
  getMemoryHeapUsage,
  PerformanceLoggerService,
  PerformanceMetricsPayload,
  PercentileResult,
} from '../services/PerformanceLoggerService';
import { DeviceConfigService, DeviceCategory } from '../services/DeviceConfigService';

export interface UsePerformanceObserverOptions {
  sampleIntervalMs?: number;
  autoLogToManusLogs?: boolean;
  deviceTier?: DeviceCategory;
  enabled?: boolean;
  /** Operational time must be supplied by the caller; xaurion presentation never owns host wall-clock access. */
  timestampProvider?: () => string;
}

export interface PerformanceState {
  p50: number;
  p95: number;
  avgFps: number;
  memoryHeapUsedMb: number | null;
  memoryHeapTotalMb: number | null;
  samplesCount: number;
  lastLoggedAt: string | null;
}

/**
 * PerformanceObserver hook to capture p50/p95 frame times and memory heap usage.
 * Frame timing uses requestAnimationFrame's monotonic timestamp. Operational timestamps are injected.
 */
export function usePerformanceObserver(options: UsePerformanceObserverOptions = {}) {
  const {
    sampleIntervalMs = 3000,
    autoLogToManusLogs = true,
    deviceTier = DeviceConfigService.detectDeviceCategory(),
    enabled = true,
    timestampProvider,
  } = options;

  const [metrics, setMetrics] = useState<PerformanceState>({
    p50: 0,
    p95: 0,
    avgFps: 0,
    memoryHeapUsedMb: null,
    memoryHeapTotalMb: null,
    samplesCount: 0,
    lastLoggedAt: null,
  });

  const frameSamplesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const processAndFlush = useCallback(() => {
    const samples = frameSamplesRef.current;
    if (samples.length === 0) return metrics;

    const stats: PercentileResult = calculatePercentiles(samples);
    const memory = getMemoryHeapUsage();
    const avgFps = stats.avg > 0 ? Number((1000 / stats.avg).toFixed(1)) : 0;
    const sampleTimestamp = typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)
      ? performance.timeOrigin + performance.now()
      : 0;
    const nowIso = new Date(sampleTimestamp).toISOString();

    const payload: PerformanceMetricsPayload = {
      timestamp: nowIso,
      type: 'performance_metrics',
      deviceTier,
      frameTimeP50: stats.p50,
      frameTimeP95: stats.p95,
      avgFps,
      memoryHeapUsedMb: memory.usedMb,
      memoryHeapTotalMb: memory.totalMb,
      samplesCount: stats.count,
    };

    const nextState: PerformanceState = {
      p50: stats.p50,
      p95: stats.p95,
      avgFps,
      memoryHeapUsedMb: memory.usedMb,
      memoryHeapTotalMb: memory.totalMb,
      samplesCount: stats.count,
      lastLoggedAt: timestamp,
    };

    setMetrics(nextState);

    if (autoLogToManusLogs && timestamp) {
      const payload: PerformanceMetricsPayload = {
        timestamp,
        type: 'performance_metrics',
        deviceTier,
        frameTimeP50: stats.p50,
        frameTimeP95: stats.p95,
        avgFps,
        memoryHeapUsedMb: memory.usedMb,
        memoryHeapTotalMb: memory.totalMb,
        samplesCount: stats.count,
      };
      PerformanceLoggerService.logMetrics(payload);
    }

    frameSamplesRef.current = [];
    return nextState;
  }, [autoLogToManusLogs, deviceTier, metrics, timestampProvider]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onFrame = (timestamp: number) => {
      if (lastFrameTimeRef.current !== null) {
        const delta = timestamp - lastFrameTimeRef.current;
        if (delta > 0 && delta < 500) {
          frameSamplesRef.current.push(delta);
        }
      }
      lastFrameTimeRef.current = timestamp;
      rafIdRef.current = requestAnimationFrame(onFrame);
    };

    rafIdRef.current = requestAnimationFrame(onFrame);
    const intervalId = setInterval(processAndFlush, sampleIntervalMs);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      clearInterval(intervalId);
    };
  }, [enabled, sampleIntervalMs, processAndFlush]);

  return {
    metrics,
    recordFrameDelta: (deltaMs: number) => {
      if (deltaMs > 0 && deltaMs < 500) {
        frameSamplesRef.current.push(deltaMs);
      }
    },
    processAndFlush,
  };
}
