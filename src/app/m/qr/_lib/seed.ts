import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { presets } from "@/app/m/qr/_db/schema";
import * as schema from "@/app/m/qr/_db/schema";

export async function seedQr(db: BetterSQLite3Database<typeof schema>): Promise<void> {
  const now = new Date();
  db.insert(presets)
    .values({
      id: "demo-url",
      label: "Beispiel-Link",
      icon: "🔗",
      kind: "url",
      // JSON-kodiert wie jeder value, auch bei kind='url'.
      value: JSON.stringify("https://www.drk.de"),
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      // 'system' hat bewusst keine User-Zeile, siehe Audit-Felder im Schema.
      createdBy: "system",
      updatedBy: "system",
    })
    .onConflictDoNothing()
    .run();
}
