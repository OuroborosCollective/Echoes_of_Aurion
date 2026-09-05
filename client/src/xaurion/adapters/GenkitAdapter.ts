import { DeterministicSimulation } from "@shared/deterministicSimulation";
// Vendored from owner-provided xaurion ZIP (SHA-256 739650d16dee85bb073e2c5af3c737f32573f328673c56edfe91d250719a030f).
import { GameAdapter } from './GameAdapter';
import { PlayerStats, Quest, RPGItem, WorldMobEntity } from '../types';
import { RPG_ITEMS_DATABASE } from '../data/mmorpgData';

export interface GenkitBountyConfig {
  difficulty?: 'Standard' | 'Heroic' | 'Mythic';
  category?: 'Extermination' | 'Assassination' | 'Recon' | 'Salvage';
}

export class GenkitAdapter extends GameAdapter {
  public availableBounties: Quest[] = [];
  public activeTrackedQuests: Quest[] = [];
  public onQuestPoolUpdated?: (bounties: Quest[]) => void;
  public onLoreGenerated?: (lore: string) => void;

  constructor(private readonly simulation: DeterministicSimulation) {
    super('GenkitAIAdapter');
    this.generateTaskPool('Aethelgard Sanctum', 1, 4);
  }

  public setCallbacks(onQuestPool: (bounties: Quest[]) => void, onLore: (lore: string) => void) {
    this.onQuestPoolUpdated = onQuestPool;
    this.onLoreGenerated = onLore;
  }

  public generateTaskPool(zone: string = 'Aethelgard Sanctum', level: number = 1, count: number = 4): Quest[] {
    const templates = [
      { title:'Bounty: Clockwork Stalker Eradication', objective:'Slay 4 Clockwork Stalkers roaming in the Whispering Woods', lore:'Autonomous scouts from the dormant war factories have rebooted with hostile targeting routines. Cleanse the perimeter before merchant caravans are dismantled.', type:'kill_mobs', targetMobType:'clockwork_stalker', targetCount:4, baseGold:140, baseXp:220, rewardItemId:'item_boots_rare' },
      { title:'Aetherial Resonance Suppression', objective:'Dispel 5 Corrupted Aether Wisps around the Ley Flower Wells', lore:'Fluctuations in the celestial aetherial grid are generating aggressive plasma wisps. Siphon their energy cores to stabilize the regional atmospheric pressure.', type:'kill_mobs', targetMobType:'aether_wisp', targetCount:5, baseGold:180, baseXp:280, rewardItemId:'item_ring_epic' },
      { title:'Iron Quarry Salvage Directive', objective:'Neutralize 4 Corrupted Iron Golems in the Western Quarry', lore:'Rogue mining constructs have formed a perimeter around the raw iron veins. Terminate their clockwork engines and reclaim the quarry resources.', type:'kill_mobs', targetMobType:'corrupted_golem', targetCount:4, baseGold:220, baseXp:340, rewardItemId:'item_sword_rare' },
      { title:'Elite Threat: Centurion Overlord Hunt', objective:'Defeat 1 Centurion Overlord Elite in the Scorched Quarry', lore:'A heavily armored command automaton is marshaling the rogue golem horde. Eliminate this elite threat before it coordinates a full assault on the Sanctum gates.', type:'kill_mobs', targetMobType:'centurion_elite', targetCount:1, baseGold:380, baseXp:550, rewardItemId:'item_chest_epic' },
      { title:'Apex Directive: Slay Titan Ignis', objective:'Vanquish World Boss Titan Ignis the Overclocked in the South Arena', lore:'The ultimate super-heavy steam war machine has awakened in the southern crater. Assemble your weapons and strike down the Colossus of Aethelgard!', type:'kill_boss', targetMobType:'titan_boss', targetCount:1, baseGold:1200, baseXp:2000, rewardItemId:'item_legendary_blade' },
      { title:'Skies of Aethelgard: Drake Cull', objective:'Bring down 3 Aether Steam Drakes near the Void Spire', lore:'Bio-mechanical steam drakes have nested atop the southern spires, diving upon ground patrols. Secure the airspace with precision ranged fire.', type:'kill_mobs', targetMobType:'steam_drake', targetCount:3, baseGold:260, baseXp:400, rewardItemId:'item_bow_epic' },
    ] as const;
    const selected=this.simulation.shuffled("bounty:templates", templates).slice(0,Math.min(count,templates.length));
    const newBounties: Quest[]=selected.map(tpl=>({ id:this.simulation.nextId("genkit_bounty"), title:tpl.title, lore:tpl.lore, description:tpl.lore, objective:tpl.objective, type:tpl.type, targetMobType:tpl.targetMobType, targetCount:tpl.targetCount, currentCount:0, rewardGold:tpl.baseGold+level*35, rewardXp:tpl.baseXp+level*50, rewardItem:tpl.rewardItemId?RPG_ITEMS_DATABASE.find(i=>i.id===tpl.rewardItemId):undefined, completed:false, giverName:'Genkit AI Bounty Matrix', giverZone:zone }));
    this.availableBounties=newBounties;
    this.onQuestPoolUpdated?.(newBounties);
    return newBounties;
  }

  public acceptBounty(bountyId:string):Quest|null {
    const bounty=this.availableBounties.find(b=>b.id===bountyId);
    if(!bounty)return null;
    if(!this.activeTrackedQuests.some(q=>q.id===bountyId))this.activeTrackedQuests.push(bounty);
    return bounty;
  }

  public override onMobKilled(mob:WorldMobEntity,_loot?:RPGItem):void {
    this.activeTrackedQuests.forEach(quest=>{
      if(quest.completed)return;
      if((quest.type==='kill_boss'&&mob.isBoss) || (quest.type==='kill_mobs'&&(!quest.targetMobType||quest.targetMobType===mob.type))){
        quest.currentCount=Math.min(quest.targetCount,quest.currentCount+1);
        if(quest.currentCount>=quest.targetCount)quest.completed=true;
      }
    });
  }

  public generateEmergentLore(npcName:string,zone:string):string {
    const lines=[`"The clockwork resonance in ${zone} is pulsating with unprecedented energy today," murmurs ${npcName}. "Take caution as you venture beyond the perimeter."`,`"Our artificers detected harmonic anomalies across ${zone}. Whatever power sleeps in the ancient core, it is stirring," whispers ${npcName}.`,`"Every defeated construct yields precious aetherium crystal conduits. The realm salutes your steadfast courage," remarks ${npcName}.`];
    const lore=lines[Math.floor(this.simulation.random("lore")*lines.length)];
    this.onLoreGenerated?.(lore);
    return lore;
  }
}
