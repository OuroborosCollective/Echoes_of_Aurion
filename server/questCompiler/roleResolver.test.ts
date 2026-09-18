import { describe, expect, it } from 'vitest';
import { DEFAULT_AURION_ENTITIES, RoleResolver } from './roleResolver';
import { QuestRole } from '../../shared/aurionQuestContract';

describe('RoleResolver (AIM-298)', () => {
  it('binds semantic roles to Aurion world entities deterministically', () => {
    const roles: QuestRole[] = [
      { roleName: 'giver', entityType: 'npc', optional: false, predicates: [] },
      { roleName: 'location', entityType: 'location', optional: false, predicates: [] },
    ];

    const { boundRoles, roleBindingHash } = RoleResolver.resolveRoles(roles, DEFAULT_AURION_ENTITIES, 'npc_merchant_kaelen');

    expect(boundRoles).toHaveLength(2);
    expect(boundRoles.find(r => r.roleName === 'giver')?.entityId).toBe('npc_merchant_kaelen');
    expect(roleBindingHash).toBeTruthy();
    it('uses authored role predicates instead of silently binding the first entity', () => {
    const roles: QuestRole[] = [
      { roleName: 'giver', entityType: 'npc', optional: false, predicates: [{ subjectField: 'id', operator: 'eq', expectedValue: 'npc_scout_elena' }] },
    ];
    const first = RoleResolver.resolveRoles(roles, DEFAULT_AURION_ENTITIES);
    const second = RoleResolver.resolveRoles(roles, [...DEFAULT_AURION_ENTITIES].reverse());
    expect(first.boundRoles[0]?.entityId).toBe('npc_scout_elena');
    expect(second).toEqual(first);
  });
});

  it('fails closed when required role entity is missing', () => {
    const roles: QuestRole[] = [
      { roleName: 'unsupported_role', entityType: 'faction', optional: false, predicates: [] },
    ];

    expect(() => RoleResolver.resolveRoles(roles, DEFAULT_AURION_ENTITIES)).toThrow('UNSATISFIED_ROLE_BINDING');
  });
});
