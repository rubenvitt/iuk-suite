export { auditOutbox } from "@/core/audit/_db/schema";
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

/**
 * Schlüssel/Wert für Portal-Einstellungen. Heute genau ein Schlüssel:
 * `ansprechpartner` — der Kontakt, den der Leerzustand nennt, wenn jemand für
 * nichts freigeschaltet ist. Eine Tabelle statt einer env-Variable, weil sonst
 * jede Änderung einen Deploy kostet und die Person, die den Kontakt kennt, die
 * Portal-Verwaltung ist.
 */
export const einstellungen = sqliteTable("portal_einstellungen", {
  schluessel: text("schluessel").primaryKey(),
  wert: text("wert").notNull(),
});

export type Einstellung = typeof einstellungen.$inferSelect;

/**
 * „WAS STEHT AN" AUFS TELEFON, JE PERSON (IDA-297). Jede Person, die es einrichtet, bekommt ein
 * EIGENES ntfy-Thema (`thema`, Zufallsname hinter dem Präfix aus `SUITE_FAELLIG_NTFY_PRAEFIX`) und
 * wählt, welche Arten darin stehen.
 *
 * `abgewaehlt` statt „angewählt": eine Art, die später dazukommt (etwa eine neue Quelle), ist für alle
 * Bestehenden sofort an. Schlüssel `<modul>:<art>`, siehe `portal/_lib/faelligkeiten/auswahl.ts`.
 *
 * `gruppen` ist nur der Stand beim letzten Besuch der Seite — der wöchentliche Versand fragt Pocket ID
 * (`personenGruppen.ts`) und nimmt diesen Stand nur, wo kein Verzeichnis eingerichtet ist (lokal).
 *
 * `gesendeteWoche` je Person statt einmal fürs Portal: scheitert der Versand an eine Person, bekommen
 * die anderen ihre Nachricht beim nächsten Schritt nicht ein zweites Mal.
 */
export const faelligkeitenAbos = sqliteTable("faelligkeiten_abos", {
  personId: text("person_id").primaryKey(),
  thema: text("thema").notNull().unique(),
  push: integer("push", { mode: "boolean" }).notNull().default(true),
  abgewaehlt: text("abgewaehlt", { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []),
  gruppen: text("gruppen", { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []),
  gesendeteWoche: text("gesendete_woche"),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type FaelligkeitenAbo = typeof faelligkeitenAbos.$inferSelect;
