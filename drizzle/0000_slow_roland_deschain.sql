CREATE TABLE `desk_workspaces` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL
);
