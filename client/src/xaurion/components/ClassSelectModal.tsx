import React, { useState } from 'react';
import { X, Shield, Sparkles, Check } from 'lucide-react';
import { CharacterClassId } from '../types';
import { MMORPG_CLASSES } from '../data/mmorpgData';

interface ClassSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClassId: CharacterClassId;
  onSelectClass: (classId: CharacterClassId) => void;
}

export const ClassSelectModal: React.FC<ClassSelectModalProps> = ({
  isOpen,
  onClose,
  currentClassId,
  onSelectClass,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<CharacterClassId>(currentClassId);

  if (!isOpen) return null;

  const currentDef = MMORPG_CLASSES[selectedClassId];
  const classesList = Object.values(MMORPG_CLASSES);

  return (
    <div id="class-modal-overlay" className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div
        id="class-dialog"
        className="w-full max-w-4xl bg-[#11141a] border border-[#b8860b]/40 rounded-2xl p-5 sm:p-6 text-gray-200 shadow-[0_0_40px_rgba(184,134,11,0.15)] flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black/80 border-2 border-[#b8860b] flex items-center justify-center text-[#b8860b] shadow-[0_0_12px_rgba(184,134,11,0.25)]"><Shield className="w-5 h-5" /></div>
            <div><h3 className="text-lg sm:text-xl font-serif font-bold text-white flex items-center gap-2">AETHELGARD CLASS SANCTUM</h3><p className="text-xs text-gray-400 font-sans">Choose your combat archetype, passive masteries, and hotbar skill loadouts</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-black/50 border border-gray-800 hover:border-[#b8860b] text-gray-400 hover:text-white transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 py-4 min-h-0 overflow-y-auto">
          <div className="md:col-span-5 space-y-2.5">
            {classesList.map((cls) => { const isSelected = cls.id === selectedClassId; const isCurrentActive = cls.id === currentClassId; return (
              <button key={cls.id} onClick={() => setSelectedClassId(cls.id)} className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center gap-3.5 cursor-pointer ${isSelected ? 'bg-black/90 border-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.2)]' : 'bg-black/40 border-gray-800/80 hover:border-gray-700'}`}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl border flex-shrink-0" style={{ borderColor: `${cls.color}60`, backgroundColor: `${cls.color}15`, color: cls.color }}>{cls.icon}</div>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-serif font-bold text-sm text-white">{cls.name}</span>{isCurrentActive && <span className="px-1.5 py-0.5 rounded bg-[#b8860b]/20 border border-[#b8860b]/40 text-[#fbbf24] text-[9px] font-mono uppercase font-bold">Active</span>}</div><div className="text-[11px] font-sans text-gray-400 truncate">{cls.primaryRole}</div></div>
              </button>); })}
          </div>
          <div className="md:col-span-7 bg-black/60 rounded-xl border border-gray-800/90 p-4.5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-start justify-between"><div><h4 className="text-lg font-serif font-bold text-white flex items-center gap-2"><span style={{ color: currentDef.color }}>{currentDef.icon}</span><span>{currentDef.name}</span></h4><span className="text-xs text-[#b8860b] font-mono italic">{currentDef.title}</span></div><div className="text-right"><span className="text-[10px] font-mono uppercase text-gray-400 block">Primary Resource</span><span className="text-xs font-mono font-bold" style={{ color: currentDef.resourceColor }}>{currentDef.resourceName}</span></div></div>
              <p className="text-xs text-gray-300 font-sans leading-relaxed">{currentDef.description}</p>
              <div className="space-y-2 pt-2 border-t border-gray-800"><span className="text-[11px] font-serif font-bold text-[#b8860b] uppercase tracking-widest block">Active Class Abilities (Keys [1] - [5])</span><div className="space-y-2">{currentDef.skills.map((skill, index) => <div key={skill.id} className="p-2.5 rounded-lg bg-black/70 border border-gray-800 flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-black/80 border border-gray-700 flex items-center justify-center text-lg flex-shrink-0 relative">{skill.icon}<span className="absolute -bottom-1 -right-1 px-1 bg-black text-[#fbbf24] border border-gray-700 text-[9px] font-mono font-bold rounded">{index + 1}</span></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><span className="font-serif font-bold text-xs text-white">{skill.name}</span><span className="text-[10px] font-mono text-gray-400">CD: {skill.cooldown}s · {skill.resourceCost} {currentDef.resourceName.split(' ')[0]}</span></div><p className="text-[10px] text-gray-400 font-sans line-clamp-1">{skill.description}</p></div></div>)}</div></div>
            </div>
            <div className="pt-4 mt-3 border-t border-gray-800 flex justify-end">{currentClassId === selectedClassId ? <div className="px-5 py-2 rounded-lg bg-black/80 border border-gray-700 text-gray-400 font-serif font-bold text-xs flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /><span>Currently Active Class</span></div> : <button onClick={() => { onSelectClass(selectedClassId); onClose(); }} className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#b8860b] to-[#8a6508] hover:from-[#d4af37] hover:to-[#b8860b] text-black font-serif font-bold text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(184,134,11,0.25)] transition-all cursor-pointer">Switch to {currentDef.name}</button>}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
