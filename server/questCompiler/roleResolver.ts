import { BoundRole, QuestRole, QuestTemplateVersion, WorldFact } from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';

export interface WorldEntity {
  id: string;
  name: string;
  type: 'npc' | 'location' | 'item' | 'player' | 'faction';
}

export const DEFAULT_AURION_ENTITIES: WorldEntity[] = [
  { id: 'npc_merchant_kaelen', name: 'Merchant Kaelen', type: 'npc' },
  { id: 'npc_scout_elena', name: 'Scout Elena', type: 'npc' },
  { id: 'npc_bandit_leader_vark', name: 'Bandit Leader Vark', type: 'npc' },
  { id: 'loc_caravan_road', name: 'Caravan Road Crossroads', type: 'location' },
  { id: 'loc_bandit_hideout', name: 'Bandit Hideout', type: 'location' },
  { id: 'item_damaged_manifest', name: 'Damaged Cargo Manifest', type: 'item' },
];

/**
 * AIM-298: Aurion Role Resolver.
 * Binds semantic template roles against available world entities deterministically.
 */
export class RoleResolver {
  public static resolveRoles(
    roles: QuestRole[],
    entities: WorldEntity[] = DEFAULT_AURION_ENTITIES,
    giverNpcId?: string
  ): { boundRoles: BoundRole[]; roleBindingHash: string } {
    const boundRoles: BoundRole[] = [];

    const sortedRoles = [...roles].sort((a, b) => a.roleName.localeCompare(b.roleName));

    for (const role of sortedRoles) {
      if (role.roleName === 'giver' && giverNpcId) {
        const found = entities.find(e => e.id === giverNpcId);
        if (found) {
          boundRoles.push({
            roleName: 'giver',
            entityId: found.id,
            entityName: found.name,
            entityType: found.type,
          });
          continue;
        }
      }

      // Filter matching entity types
      const candidates = entities
        .filter(e => e.type === role.entityType)
        .sort((a, b) => a.id.localeCompare(b.id));

      if (candidates.length > 0) {
        const selected = candidates[0]!;
        boundRoles.push({
          roleName: role.roleName,
          entityId: selected.id,
          entityName: selected.name,
          entityType: selected.type,
        });
      } else if (!role.optional) {
        throw new Error(`UNSATISFIED_ROLE_BINDING:${role.roleName}:${role.entityType}`);
      }
    }

    const sortedBindings = [...boundRoles].sort((a, b) => a.roleName.localeCompare(b.roleName));
    const roleBindingHash = computeCanonicalHash('aurion.quest.template.v1', sortedBindings);

    return { boundRoles: sortedBindings, roleBindingHash };
  }
}
