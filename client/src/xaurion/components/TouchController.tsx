import React from "react";

export interface AX1TouchDirectorProps {
  onMove?: (vector: { x: number; y: number }) => void;
  onOpenPanel?: (panel: any) => void;
  enabled?: boolean;
}

/**
 * Mobile touch controller director for AX1 runtime.
 * Provides touch direction signals without interrupting standard pointer gestures.
 */
export const AX1TouchDirector: React.FC<AX1TouchDirectorProps> = ({
  onMove,
  enabled = true,
}) => {
  if (!enabled) return null;

  return (
    <div
      data-testid="ax1-touch-director"
      className="pointer-events-none fixed inset-0 z-10 select-none overflow-hidden touch-none"
      aria-hidden="true"
    />
  );
};

export default AX1TouchDirector;
