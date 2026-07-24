import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";

// Stub: echter Seed folgt in Task 14. Bewusst leer, damit das Bootstrap-Wiring
// schon in Task 1 vollständig ist (sonst scheitert der Boot still).
export async function seedFeedback(
  _db: BetterSQLite3Database<typeof schema>,
): Promise<void> {
  // absichtlich leer bis Task 14
}
