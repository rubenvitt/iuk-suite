import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/app/m/portal/_db/schema";

export async function seedPortal(db: BetterSQLite3Database<typeof schema>) {
  const rows: schema.NewService[] = [
    { slug: "bookstack", name: "BookStack", url: "https://wiki.iuk-ue.de", category: "Doku", isPublic: true, sortOrder: 1 },
    { slug: "vaultwarden", name: "Vaultwarden", url: "https://vault.iuk-ue.de", category: "Tools", requiredGroups: ["dashboard-admins"], isPublic: false, sortOrder: 2 },
  ];
  for (const r of rows) await db.insert(schema.services).values(r).onConflictDoNothing();
}
