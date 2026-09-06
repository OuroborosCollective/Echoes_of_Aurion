import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { persistConfirmedPlayLaunch } from "./AurionPlayRoute";

export const AX1_PLAY_REQUEST_EVENT = "ax1:request-play" as const;
export const AX1_PLAY_STATUS_EVENT = "ax1:play-status" as const;

type PlayStatus = Readonly<{ state: "launching" | "failed"; message: string }>;

function publish(status: PlayStatus): void {
  window.dispatchEvent(new CustomEvent(AX1_PLAY_STATUS_EVENT, { detail: status }));
}

/**
 * AX1 owns the transition from the Aurion portal into the game route.
 * Aurion may present the website and authenticated account, but it never
 * constructs a gameplay snapshot or invents a fallback arena.
 */
export default function Ax1PlayNavigationBridge() {
  const [location, navigate] = useLocation();
  const enterOpenWorld = trpc.gameplay.enterOpenWorld.useMutation();
  const inFlight = useRef(false);

  useEffect(() => {
    const launch = () => {
      if (location === "/play" || inFlight.current) return;
      inFlight.current = true;
      publish({ state: "launching", message: "AX1 lädt den WASD-bestätigten Weltvertrag." });
      enterOpenWorld.mutate(undefined, {
        onSuccess: snapshot => {
          inFlight.current = false;
          if (!persistConfirmedPlayLaunch(snapshot)) {
            publish({ state: "failed", message: "Der WASD-Weltvertrag konnte nicht revisionssicher gebunden werden." });
            return;
          }
          navigate("/play");
        },
        onError: () => {
          inFlight.current = false;
          publish({ state: "failed", message: "Der WASD-Weltvertrag ist derzeit nicht verfügbar." });
        },
      });
    };
    window.addEventListener(AX1_PLAY_REQUEST_EVENT, launch);
    return () => window.removeEventListener(AX1_PLAY_REQUEST_EVENT, launch);
  }, [enterOpenWorld, location, navigate]);

  return null;
}
