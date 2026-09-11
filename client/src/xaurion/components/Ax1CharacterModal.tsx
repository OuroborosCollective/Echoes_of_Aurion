import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { CharacterAttributes, CharacterClassId, ClassSkill, MilestoneWeaponSkill, PlayerStats, WeaponMastery, WeaponType } from '../types';

export type Ax1VisiblePlayerStats = PlayerStats & { prestigeTitle?: string };

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: Ax1VisiblePlayerStats;
  currentClassId: CharacterClassId;
  onAllocateStatPoint?: (attribute: keyof CharacterAttributes) => { success: boolean; message: string };
  onUnlockMilestoneSkill?: (skillId: string) => { success: boolean; message: string; skill?: MilestoneWeaponSkill };
  onEquipSkill?: (slotIndex: number, skill: ClassSkill) => void;
}

const shown = (value: number) => Number.isFinite(value) ? value : '—';

/**
 * Visible AX1 character/mastery surface sourced from AX1 cf9cd7a.
 * Aurion may project confirmed readbacks into the props, but this component never
 * invents progression or mutates server truth on its own.
 */
export const Ax1CharacterModal: React.FC<CharacterModalProps> = ({
  isOpen,
  onClose,
  stats,
  currentClassId: _currentClassId,
  onAllocateStatPoint,
  onUnlockMilestoneSkill,
  onEquipSkill,
}) => {
  const [selectedWeaponTab, setSelectedWeaponTab] = useState<WeaponType>(stats.activeWeaponType);
  const [activeTab, setActiveTab] = useState<'stats' | 'mastery'>('stats');
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  const handleAllocate = (attr: keyof CharacterAttributes) => {
    if (!onAllocateStatPoint) return;
    const res = onAllocateStatPoint(attr);
    setFeedbackMessage({ text: res.message, isError: !res.success });
  };

  const handleUnlockSkill = (skillId: string) => {
    if (!onUnlockMilestoneSkill) return;
    const res = onUnlockMilestoneSkill(skillId);
    setFeedbackMessage({ text: res.message, isError: !res.success });
  };

  const handleEquipToHotbar = (skill: ClassSkill) => {
    if (!onEquipSkill) return;
    onEquipSkill(0, skill);
    setFeedbackMessage({ text: `Equipped "${skill.name}" to Hotbar Slot 1`, isError: false });
  };

  const unlockedSkills = stats.unlockedMilestoneSkills || [];
  const selectedMastery: WeaponMastery | undefined = stats.weaponMasteries?.[selectedWeaponTab] || stats.weaponMasteries?.blade;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div role="dialog" aria-modal="true" aria-label="Charakter & Skills" className="w-full max-w-3xl bg-[#11141a] border border-[#b8860b]/40 rounded-2xl p-5 sm:p-6 text-gray-200 shadow-[0_0_40px_rgba(184,134,11,0.2)] flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-[#fbbf24] uppercase tracking-wider">{stats.prestigeTitle || 'Aspirant'}</h2>
            <div className="text-sm text-gray-400 font-mono">Level {stats.level > 0 ? stats.level : '—'}</div>
          </div>
          <button type="button" aria-label="Charakter schließen" onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg"><X aria-hidden="true" /></button>
        </div>

        {feedbackMessage && <div className={`mt-4 p-3 rounded-lg text-sm font-semibold ${feedbackMessage.isError ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{feedbackMessage.text}</div>}

        <div className="flex gap-2 mt-4 border-b border-gray-800 pb-2">
          <button onClick={() => setActiveTab('stats')} className={`px-4 py-2 ${activeTab === 'stats' ? 'text-[#fbbf24] bg-gray-800' : 'text-gray-400'}`}>Stats</button>
          <button onClick={() => setActiveTab('mastery')} className={`px-4 py-2 ${activeTab === 'mastery' ? 'text-[#00f0ff] bg-gray-800' : 'text-gray-400'}`}>Mastery</button>
        </div>

        <div className="flex-1 overflow-y-auto mt-4">
          {activeTab === 'stats' && <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/50 p-4 rounded-xl border border-gray-800">
              <h3 className="text-[#fbbf24] mb-2 font-bold">Base Attributes</h3>
              <div className="space-y-2">
                <div className="flex justify-between"><span>Strength:</span><span>{shown(stats.attributes?.strength)}</span></div>
                <div className="flex justify-between"><span>Agility:</span><span>{shown(stats.attributes?.agility)}</span></div>
                <div className="flex justify-between"><span>Intelligence:</span><span>{shown(stats.attributes?.intelligence)}</span></div>
                <div className="flex justify-between"><span>Defense:</span><span>{shown(stats.attributes?.defense)}</span></div>
              </div>
              {!onAllocateStatPoint && <p className="mt-3 text-[11px] text-gray-500">Attribute warten auf einen bestätigten Aurion-Readback.</p>}
            </div>
          </div>}

          {activeTab === 'mastery' && <div className="space-y-6">
            <div className="grid grid-cols-4 gap-3">
              {Object.values(stats.weaponMasteries || {}).map((wep) => <button key={wep.type} onClick={() => setSelectedWeaponTab(wep.type)} className={`p-3 rounded-xl border flex flex-col items-center ${selectedWeaponTab === wep.type ? 'bg-black/90 border-[#fbbf24]' : 'bg-black/50 border-gray-800'}`}>
                <span className="text-2xl">{wep.icon}</span><span className="text-xs">{wep.name}</span>
              </button>)}
            </div>

            {selectedMastery && <div className="bg-black/70 rounded-xl p-4">
              <div className="flex justify-between mb-2"><span className="font-bold">{selectedMastery.name} (Rank {selectedMastery.level})</span><span>{selectedMastery.maxXp > 0 ? `${selectedMastery.xp} / ${selectedMastery.maxXp} XP` : 'Receipt verified'}</span></div>
              <div className="text-xs text-gray-400">{selectedMastery.description}</div>
              <div className="mt-4 space-y-2">{selectedMastery.milestoneSkills?.map(skill => <div key={skill.id} className="p-3 border border-gray-800 rounded flex justify-between items-center">
                <div><div className="font-bold">{skill.name}</div><div className="text-xs text-gray-500">Req Rank {skill.requiredMasteryLevel}</div></div>
                {unlockedSkills.includes(skill.id) && onEquipSkill ? <button onClick={() => handleEquipToHotbar(skill)} className="px-3 py-1 bg-green-700 rounded text-xs">Equip</button> : !unlockedSkills.includes(skill.id) && onUnlockMilestoneSkill && selectedMastery.level >= skill.requiredMasteryLevel ? <button onClick={() => handleUnlockSkill(skill.id)} className="px-3 py-1 bg-yellow-700 rounded text-xs">Unlock ({skill.unlockCostGold}g)</button> : <div className="text-xs text-gray-500">{unlockedSkills.includes(skill.id) ? 'Confirmed' : 'Locked'}</div>}
              </div>)}</div>
            </div>}
          </div>}
        </div>
      </div>
    </div>
  );
};