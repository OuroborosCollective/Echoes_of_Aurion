import { PlayerStats, Quest, RPGItem, WorldMobEntity } from '../types';

export interface MMOGameAdapterHooks {
  onInit?(): void;
  onPlayerUpdate?(stats: PlayerStats): void;
  onMobKilled?(mob: WorldMobEntity, loot?: RPGItem): void;
  onLootAcquired?(item: RPGItem, gold: number): void;
  onQuestProgressed?(quest: Quest): void;
  onLevelUp?(newLevel: number): void;
}

export class GameAdapter implements MMOGameAdapterHooks {
  public name: string;
  public enabled: boolean = true;
  constructor(name: string = 'BaseMMOAdapter') { this.name = name; }
  public onInit(): void {}
  public onPlayerUpdate(_stats: PlayerStats): void {}
  public onMobKilled(_mob: WorldMobEntity, _loot?: RPGItem): void {}
  public onLootAcquired(_item: RPGItem, _gold: number): void {}
  public onQuestProgressed(_quest: Quest): void {}
  public onLevelUp(_newLevel: number): void {}
}
