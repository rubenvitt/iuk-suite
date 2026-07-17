import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const services = sqliteTable("services", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  url: text("url").notNull(),
  iconUrl: text("icon_url"),
  category: text("category"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []),
  requiredGroups: text("required_groups", { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  openInNewTab: integer("open_in_new_tab", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
