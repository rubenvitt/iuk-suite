import { getModule } from "@/core/registry";
import { openModuleDatabase, moduleDbPath } from "@/core/db";

export function checkModuleHealth(key: string): { status: "ok" | "error"; module: string; error?: string } {
  let db: ReturnType<typeof openModuleDatabase> | undefined;
  try {
    getModule(key); // throws on unknown; not yet opened, so nothing to close
    db = openModuleDatabase(moduleDbPath(key));
    db.prepare("SELECT 1").get();
    return { status: "ok", module: key };
  } catch (e) {
    return { status: "error", module: key, error: e instanceof Error ? e.message : String(e) };
  } finally {
    db?.close();
  }
}
