ALTER TABLE `glbAssets` ADD `normalizationRevision` varchar(96);
--> statement-breakpoint
ALTER TABLE `glbAssets` ADD `normalizationSha256` varchar(64);
--> statement-breakpoint
ALTER TABLE `glbAssets` ADD `normalizationManifest` mediumtext;
