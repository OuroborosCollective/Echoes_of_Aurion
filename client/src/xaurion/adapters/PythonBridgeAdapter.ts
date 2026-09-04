import { GameAdapter } from './GameAdapter';
import { PlayerStats, Quest, RPGItem, WorldMobEntity } from '../types';

export class PythonBridgeAdapter extends GameAdapter {
  private eventLog: Array<{ type: string; timestamp: number; payload: any }> = [];
  private maxLogs: number = 200;
  constructor() { super('PythonEngineBridgeAdapter'); }
  public logEvent(type: string, payload: any) {
    this.eventLog.push({ type, timestamp: Date.now(), payload });
    if (this.eventLog.length > this.maxLogs) this.eventLog.shift();
  }
  public override onPlayerUpdate(stats: PlayerStats): void { this.logEvent('PLAYER_STATE_SYNC', { hp: stats.hp, level: stats.level, xp: stats.xp, gold: stats.gold, x: stats.x, z: stats.z, zone: stats.currentZone }); }
  public override onMobKilled(mob: WorldMobEntity, loot?: RPGItem): void { this.logEvent('MOB_SLAIN', { mobId: mob.id, mobType: mob.type, mobLevel: mob.level, isBoss: mob.isBoss, lootDropped: loot ? loot.name : null }); }
  public override onLootAcquired(item: RPGItem, gold: number): void { this.logEvent('LOOT_ACQUIRED', { itemId: item.id, itemName: item.name, rarity: item.rarity, gold }); }
  public override onQuestProgressed(quest: Quest): void { this.logEvent('QUEST_PROGRESS', { questId: quest.id, title: quest.title, progress: `${quest.currentCount}/${quest.targetCount}`, completed: quest.completed }); }
  public exportTelemetryJson(): string { return JSON.stringify({ engine: 'Aurion-MMORPG-Core', version: '2.0.0', timestamp: Date.now(), eventsCount: this.eventLog.length, events: this.eventLog }, null, 2); }
}
