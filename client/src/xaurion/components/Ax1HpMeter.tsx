import React from "react";

interface Ax1HpMeterProps {
  hp: number;
  maxHp: number;
  className?: string;
  showText?: boolean;
}

export const Ax1HpMeter: React.FC<Ax1HpMeterProps> = ({ hp, maxHp, className = "", showText = true }) => {
  const percentage = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  
  // Dynamic color based on health percentage
  let barColor = "bg-emerald-500";
  if (percentage < 25) {
    barColor = "bg-red-500";
  } else if (percentage < 50) {
    barColor = "bg-amber-500";
  }

  return (
    <div className={`relative h-2 overflow-hidden rounded border border-emerald-950 bg-black/90 ${className}`}>
      <div 
        className={`h-full transition-all duration-300 ease-out ${barColor} shadow-[0_0_8px_rgba(16,185,129,0.3)]`} 
        style={{ width: `${percentage}%` }} 
      />
      {showText && (
        <span className="absolute inset-0 flex items-center justify-center text-[6px] font-mono font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {hp}/{maxHp}
        </span>
      )}
    </div>
  );
};
