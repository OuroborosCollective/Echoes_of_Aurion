CREATE TABLE `aurionWorldVisualOverrides` (
  `id` varchar(64) NOT NULL PRIMARY KEY,
  `worldId` varchar(128) NOT NULL,
  `targetKind` enum('uploaded_anchor','authored_placement','shipped_placement','surface_texture') NOT NULL,
  `placementRef` varchar(160) NOT NULL,
  `revision` int NOT NULL,
  `assetId` varchar(96),
  `previousAssetId` varchar(96),
  `actorUserId` int NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  UNIQUE KEY `aurionWorldVisualOverrides_ref_revision_uq` (`worldId`, `placementRef`, `revision`),
  UNIQUE KEY `aurionWorldVisualOverrides_hash_uq` (`receiptHash`),
  INDEX `aurionWorldVisualOverrides_world_created_idx` (`worldId`, `createdAt`)
);
