import { getModule } from "@/core/registry";
import { openModuleDatabase, moduleDbPath } from "@/core/db";

export function checkModuleHealth(key: string): { status: "ok" | "error"; module: string; error?: string } {
  try {
    getModule(key); // throws on unknown
    const db = openModuleDatabase(moduleDbPath(key));
    db.prepare("SELECT 1").get();
    db.close();
    return { status: "ok", module: key };
  } catch (e) {
    return { status: "error", module: key, error: e instanceof Error ? e.message : String(e) };
  }
}
