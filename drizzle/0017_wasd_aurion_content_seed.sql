INSERT INTO `treasureClasses` (`id`, `classKey`, `minLevel`, `maxLevel`, `entriesJson`, `active`)
VALUES
  ('tc_asterion_t2', 'asterion_t2_weapons', 1, 20, '["aurion_spear","asterion_blade","archive_staff","warden_focus"]', 1),
  ('tc_archive_t3', 'archive_t3_weapons', 21, 36, '["archive_staff","warden_focus","asterion_blade"]', 1),
  ('tc_solarium_t4', 'solarium_t4_weapons', 37, 50, '["solarium_blade","sunspike_spear","ember_focus"]', 1)
ON DUPLICATE KEY UPDATE `minLevel` = VALUES(`minLevel`), `maxLevel` = VALUES(`maxLevel`), `entriesJson` = VALUES(`entriesJson`), `active` = VALUES(`active`);
--> statement-breakpoint
INSERT INTO `lootAffixes` (`id`, `affixKey`, `slot`, `minItemLevel`, `maxItemLevel`, `modifiersJson`, `active`)
VALUES
  ('aff_resonant', 'resonant', 'prefix', 1, 50, '{"resonance":4}', 1),
  ('aff_warded', 'warded', 'prefix', 1, 50, '{"guard":3}', 1),
  ('aff_starforged', 'starforged', 'prefix', 1, 50, '{"power":5}', 1),
  ('aff_echo', 'of_the_echo', 'suffix', 1, 50, '{"echoPower":3}', 1),
  ('aff_asterion', 'of_asterion', 'suffix', 1, 50, '{"expeditionGain":2}', 1),
  ('aff_sentinel', 'of_the_sentinel', 'suffix', 1, 50, '{"sentinelDamage":3}', 1)
ON DUPLICATE KEY UPDATE `slot` = VALUES(`slot`), `minItemLevel` = VALUES(`minItemLevel`), `maxItemLevel` = VALUES(`maxItemLevel`), `modifiersJson` = VALUES(`modifiersJson`), `active` = VALUES(`active`);
--> statement-breakpoint
INSERT INTO `lootSetDefinitions` (`id`, `setKey`, `displayName`, `piecesJson`, `bonusesJson`, `active`)
VALUES
  ('set_asterion_regalia', 'asterion_regalia', 'Asterions Regalia', '["aurion_spear","asterion_blade","warden_focus"]', '[{"pieces":2,"modifiers":{"resonance":6,"guard":4}},{"pieces":3,"modifiers":{"resonance":12,"guard":8,"echoPower":6}}]', 1),
  ('set_archive_vigil', 'archive_vigil', 'Wacht des Archivs', '["archive_staff","warden_focus","ember_focus"]', '[{"pieces":2,"modifiers":{"guard":5,"echoPower":3}},{"pieces":3,"modifiers":{"guard":10,"echoPower":7,"power":3}}]', 1)
ON DUPLICATE KEY UPDATE `displayName` = VALUES(`displayName`), `piecesJson` = VALUES(`piecesJson`), `bonusesJson` = VALUES(`bonusesJson`), `active` = VALUES(`active`);
