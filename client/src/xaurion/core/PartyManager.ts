// @ts-nocheck
// Vendored from owner-provided xaurion ZIP (SHA-256 739650d16dee85bb073e2c5af3c737f32573f328673c56edfe91d250719a030f).
import { CharacterClassId, PartyMember, Quest, SimulatedPlayer, WorldMobEntity } from '../types';
import { MMORPG_CLASSES } from '../data/mmorpgData';
import { soundSynth } from '../audio/SoundSynthesizer';

export class PartyManager {
  public members: PartyMember[] = [];
  public maxPartySize: number = 5;
  private simulationTimer: number = 0;
  public onPartyMessage?: (sender: string, text: string) => void;
  public onPartyQuestProgress?: (questId: string, objective: string, memberName: string) => void;

  constructor(playerName: string = 'Hero', playerClass: CharacterClassId = 'knight', playerLevel: number = 1) { this.createSoloParty(playerName, playerClass, playerLevel); }

  public createSoloParty(playerName: string, playerClass: CharacterClassId, playerLevel: number) {
    const classDef = MMORPG_CLASSES[playerClass];
    const leaderMember: PartyMember = { id: 'player_self', name: playerName, classId: playerClass, className: classDef.name, level: playerLevel, hp: classDef.baseHp, maxHp: classDef.baseHp, resource: classDef.baseResource, maxResource: classDef.baseResource, resourceName: classDef.resourceName, resourceColor: classDef.resourceColor, isLeader: true, avatarIcon: classDef.icon, zone: 'Grand Sanctum', isOnline: true, dps: 180 };
    this.members = [leaderMember];
  }

  public updatePlayerStats(hp: number, maxHp: number, resource: number, maxResource: number, level: number, zone: string) { const self = this.members.find((m) => m.id === 'player_self'); if (self) { self.hp = hp; self.maxHp = maxHp; self.resource = resource; self.maxResource = maxResource; self.level = level; self.zone = zone; } }
  public getMembers(): PartyMember[] { return this.members; }
  public getOtherMembers(): PartyMember[] { return this.members.filter((m) => m.id !== 'player_self'); }
  public isInParty(): boolean { return this.members.length > 1; }

  public inviteMember(simPlayer: SimulatedPlayer): boolean {
    if (this.members.length >= this.maxPartySize) { this.onPartyMessage?.('Party Leader', 'Party is already full (Maximum 5 members)!'); return false; }
    if (this.members.some((m) => m.id === simPlayer.id || m.name === simPlayer.name)) { this.onPartyMessage?.('Party Leader', `${simPlayer.name} is already in your party!`); return false; }
    const classDef = MMORPG_CLASSES[simPlayer.classId];
    const newMember: PartyMember = { id: simPlayer.id, name: simPlayer.name, classId: simPlayer.classId, className: simPlayer.className || classDef.name, level: simPlayer.level, hp: Math.round(classDef.baseHp * (1 + (simPlayer.level - 1) * 0.15)), maxHp: Math.round(classDef.baseHp * (1 + (simPlayer.level - 1) * 0.15)), resource: classDef.baseResource, maxResource: classDef.baseResource, resourceName: classDef.resourceName, resourceColor: classDef.resourceColor, isLeader: false, avatarIcon: classDef.icon, zone: 'Grand Sanctum', isOnline: true, dps: 120 + simPlayer.level * 25 };
    this.members.push(newMember); soundSynth.playQuestComplete();
    this.onPartyMessage?.('System', `🤝 [${newMember.name}] (${newMember.className} Lv.${newMember.level}) joined your party!`);
    const greetings = [`Greetings! Ready to explore and hunt together!`, `Glad to group up. Let's conquer some dungeons and world bosses!`, `Covering your flank with my ${classDef.name} armaments!`, `Let's share quest objectives and clear the realm!`];
    const randomGreet = greetings[Math.floor(Math.random() * greetings.length)]; setTimeout(() => { this.onPartyMessage?.(newMember.name, randomGreet); }, 400); return true;
  }

  public removeMember(memberId: string): boolean { const idx = this.members.findIndex((m) => m.id === memberId); if (idx !== -1 && memberId !== 'player_self') { const removed = this.members[idx]; this.members.splice(idx, 1); this.onPartyMessage?.('System', `❌ [${removed.name}] has left the party.`); return true; } return false; }
  public leaveParty() { if (this.members.length > 1) { this.members = this.members.filter((m) => m.id === 'player_self'); const self = this.members[0]; if (self) self.isLeader = true; this.onPartyMessage?.('System', '🚪 You have disbanded/left the party and returned to solo status.'); } }
  public promoteToLeader(memberId: string) { this.members.forEach((m) => { m.isLeader = m.id === memberId; }); const newLeader = this.members.find((m) => m.id === memberId); if (newLeader) this.onPartyMessage?.('System', `👑 [${newLeader.name}] is now the Party Leader.`); }

  public update(delta: number, playerInCombat: boolean, activeMob: WorldMobEntity | null) {
    this.simulationTimer += delta;
    this.members.forEach((member) => {
      if (member.id === 'player_self') return;
      if (playerInCombat && activeMob) {
        const jitter = (Math.random() - 0.45) * 15 * delta;
        member.hp = Math.max(Math.round(member.maxHp * 0.35), Math.min(member.maxHp, Math.round(member.hp - jitter)));
        member.resource = Math.max(10, Math.min(member.maxResource, member.resource - Math.round(15 * delta)));
        if (Math.random() < 0.008 && activeMob.name) { const spellQuotes = [`Striking ${activeMob.name} with full force!`, `Focusing DPS on the target!`, `Shield holding steady!`, `Channelling support magic for the group!`]; this.onPartyMessage?.(member.name, spellQuotes[Math.floor(Math.random() * spellQuotes.length)]); }
      } else {
        member.hp = Math.min(member.maxHp, Math.round(member.hp + member.maxHp * 0.15 * delta));
        member.resource = Math.min(member.maxResource, Math.round(member.resource + member.maxResource * 0.2 * delta));
      }
    });
  }

  public handleSharedKill(mobName: string, quests: Quest[]): { sharedCount: number; questTitle?: string } {
    if (this.members.length <= 1) return { sharedCount: 0 };
    let shared = 0; let progressedTitle = ''; const otherMembers = this.getOtherMembers(); const helper = otherMembers[Math.floor(Math.random() * otherMembers.length)];
    if (helper) { quests.forEach((q) => { if (!q.completed && (q.type === 'kill_mobs' || q.type === 'kill_boss')) { shared++; progressedTitle = q.title; } }); if (shared > 0) this.onPartyMessage?.(helper.name, `🎯 Assisted in slaying [${mobName}]! Shared party quest credit applied.`); }
    return { sharedCount: shared, questTitle: progressedTitle };
  }
}
