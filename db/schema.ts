import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const deskWorkspaces = sqliteTable("desk_workspaces", {
  ownerId: text("owner_id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
