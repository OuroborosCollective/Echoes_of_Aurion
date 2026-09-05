import { useEffect, useRef, type MutableRefObject } from "react";
import { COMPANION_FRAME_MAX_AGE_MS } from "@shared/companionLearningProtocol";
import { isFreshCompanionFrame, type CompanionFrameSample } from "@/lib/companionFrameCapture";

type Pending = { id: number; issuedAt: number };
type Inputs<T extends Pending> = {
  enabled: boolean;
  scope: string;
  pending: MutableRefObject<T | undefined>;
  now: () => number;
  capture: (startedAt: number) => Promise<CompanionFrameSample | null>;
  accept: (sample: CompanionFrameSample, action: T) => boolean;
  onError: () => void;
};

/** Query/mutation observer renders update callbacks, never retire the active capture. */
export function useCompanionCaptureLoop<T extends Pending>(input: Inputs<T>) {
  const latest = useRef(input);
  latest.current = input;
  const inFlight = useRef(false);
  useEffect(() => {
    const pendingRef = latest.current.pending;
    if (!input.enabled) { pendingRef.current = undefined; return; }
    let active = true;
    const timer = window.setInterval(() => {
      const request = latest.current;
      const pending = pendingRef.current;
      if (!pending || inFlight.current) return;
      const now = request.now();
      if (now < pending.issuedAt || now - pending.issuedAt > COMPANION_FRAME_MAX_AGE_MS) {
        pendingRef.current = undefined;
        return;
      }
      inFlight.current = true;
      void Promise.resolve().then(() => active ? request.capture(now) : null).then(sample => {
        if (!active || !isFreshCompanionFrame(sample, latest.current.now()) || pendingRef.current?.id !== pending.id) return;
        if (latest.current.accept(sample, pending) && pendingRef.current?.id === pending.id) pendingRef.current = undefined;
      }).catch(() => { if (active) latest.current.onError(); })
        .finally(() => { inFlight.current = false; });
    }, 100);
    return () => { active = false; window.clearInterval(timer); pendingRef.current = undefined; };
  }, [input.enabled, input.scope]);
}
