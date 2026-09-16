CREATE TABLE `documentChunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`workspaceId` int NOT NULL,
	`chunkIndex` int NOT NULL,
	`content` text NOT NULL,
	`embeddingJson` text NOT NULL,
	`tokenCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documentChunks_id` PRIMARY KEY(`id`)
);
