import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/app/m/portal/_db/client";
import { seedPortal } from "@/app/m/portal/_lib/seed";

// Lazy bootstrap for local/dev runs: migrate the module's SQLite db and seed
// it once per process. Spec 2 replaces this with a real migration/import step
// run at deploy time — this exists only so the skeleton is runnable without a
// separate provisioning step.
let done = false;

export async function ensurePortalReady() {
  if (done) return;
  const db = getDb();
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  await seedPortal(db);
  done = true;
}
