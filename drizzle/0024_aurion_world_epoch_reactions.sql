CREATE TABLE `aurionWorldEpochReactions` (
  `receiptId` varchar(96) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `epoch` int NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `snapshotHash` varchar(64) NOT NULL,
  `reactionHash` varchar(64) NOT NULL,
  `reactionJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`receiptId`),
  CONSTRAINT `aurionWorldEpochReactions_world_epoch_uq` UNIQUE (`worldId`, `epoch`),
  CONSTRAINT `aurionWorldEpochReactions_hash_uq` UNIQUE (`reactionHash`),
  KEY `aurionWorldEpochReactions_world_created_idx` (`worldId`, `createdAt`)
);
