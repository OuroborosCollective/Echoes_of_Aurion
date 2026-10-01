-- NPC decision log from the native Aurion resolveNpcLife system.
-- Collects all NPC decisions for impact analysis of their actions.

CREATE TABLE IF NOT EXISTS `aurionNpcDecisionLog` (
  `id` varchar(96) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `regionId` varchar(96) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `goal` varchar(64) NOT NULL,
  `longTermGoal` varchar(64) NOT NULL,
  `planStatus` varchar(32) NOT NULL,
  `planHash` varchar(64) NOT NULL,
  `decisionHash` varchar(64) NOT NULL,
  `utilityBpsJson` text NOT NULL,
  `needsJson` text NOT NULL,
  `observationIdsJson` text NOT NULL,
  `sourceReceiptId` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionNpcDecisionLog_npc_index_uq` (`npcId`, `resolutionIndex`),
  KEY `aurionNpcDecisionLog_region_created_idx` (`regionId`, `createdAt`),
  KEY `aurionNpcDecisionLog_goal_idx` (`goal`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
