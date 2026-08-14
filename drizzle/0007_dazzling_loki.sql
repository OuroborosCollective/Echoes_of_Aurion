CREATE TABLE `expeditionChatMessages` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`body` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expeditionChatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expeditionTeamMembers` (
	`id` varchar(64) NOT NULL,
	`teamId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('leader','partner') NOT NULL,
	`status` enum('active','left') NOT NULL DEFAULT 'active',
	`activeUserKey` varchar(64),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	CONSTRAINT `expeditionTeamMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `expeditionTeamMembers_team_user_uq` UNIQUE(`teamId`,`userId`),
	CONSTRAINT `expeditionTeamMembers_active_user_uq` UNIQUE(`activeUserKey`)
);
--> statement-breakpoint
CREATE TABLE `expeditionTeams` (
	`id` varchar(64) NOT NULL,
	`createdByUserId` int NOT NULL,
	`status` enum('active','disbanded') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`disbandedAt` timestamp,
	CONSTRAINT `expeditionTeams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forumReplies` (
	`id` varchar(64) NOT NULL,
	`threadId` varchar(64) NOT NULL,
	`authorUserId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forumReplies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forumThreads` (
	`id` varchar(64) NOT NULL,
	`category` enum('announcements','patch_notes','events','general') NOT NULL,
	`authorUserId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`pinned` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forumThreads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partnerRequests` (
	`id` varchar(64) NOT NULL,
	`requesterUserId` int NOT NULL,
	`note` varchar(280) NOT NULL,
	`status` enum('open','accepted','cancelled') NOT NULL DEFAULT 'open',
	`responderUserId` int,
	`teamId` varchar(64),
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partnerRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `expeditionChatMessages_created_idx` ON `expeditionChatMessages` (`createdAt`);--> statement-breakpoint
CREATE INDEX `expeditionTeamMembers_team_status_idx` ON `expeditionTeamMembers` (`teamId`,`status`);--> statement-breakpoint
CREATE INDEX `forumReplies_thread_created_idx` ON `forumReplies` (`threadId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `forumThreads_category_created_idx` ON `forumThreads` (`category`,`createdAt`);--> statement-breakpoint
CREATE INDEX `partnerRequests_open_created_idx` ON `partnerRequests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `partnerRequests_requester_status_idx` ON `partnerRequests` (`requesterUserId`,`status`);