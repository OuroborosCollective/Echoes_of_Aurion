import React from "react";
import { UserCheck, Shield } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export const PublicCharacterPicker: React.FC = () => {
  const { user } = useAuth();

  return (
    <section className="rounded-3xl border border-cyan-300/20 bg-[#0b2024]/80 p-6 text-slate-100 shadow-lg">
      <div className="flex items-center justify-between gap-4 border-b border-cyan-900/40 pb-4">
        <div>
          <h3 className="text-lg font-serif font-bold text-amber-100 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-cyan-400" />
            Öffentliches Charakter-Profil
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Öffentliche Modell- und Avatar-Zuordnung im Aurion-Netzwerk.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/30 px-3 py-1 text-xs font-mono text-emerald-300">
          <Shield className="h-3.5 w-3.5" />
          Serverbestätigt
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-300">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-700/60 bg-black/40 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 font-serif text-lg text-amber-300">
            ✦
          </div>
          <div>
            <div className="font-semibold text-white">{user?.name ?? "Explorer"}</div>
            <div className="text-xs font-mono text-cyan-300">ID: #{user?.id ?? "0"}</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PublicCharacterPicker;
