import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";

/**
 * Wiederverwendbare Auth-Guards für Module. Ein Modul soll weder die
 * Gruppenprüfung noch die Frage „welcher Statuscode?" selbst beantworten
 * müssen — beides gehörte bisher pro Modul neu geschrieben.
 *
 * Zwei Varianten, weil der richtige Ausgang vom Kontext abhängt:
 * - `requireModuleAdmin` in **Server Actions** → wirft. Eine Action, die
 *   unerlaubt aufgerufen wird, darf nicht „nichts tun und so aussehen wie
 *   Erfolg"; sie muss abbrechen, bevor irgendetwas geschrieben wird.
 * - `moduleAdminPageOrNotFound` in **Seiten** → `notFound()`. Bewusst 404 statt
 *   403: ein 403 verriete, dass es die Admin-Route gibt.
 */

/** Für Server Actions: bricht ab, wenn der Aufrufer das Modul nicht administrieren darf. */
export async function requireModuleAdmin(moduleKey: string): Promise<void> {
  const session = await auth();
  if (!isModuleAdmin(getModule(moduleKey), session?.user?.groups)) {
    throw new Error("Forbidden");
  }
}

/** Für Seiten: rendert 404 statt der Seite, wenn der Nutzer nicht Admin ist. */
export async function moduleAdminPageOrNotFound(moduleKey: string): Promise<void> {
  const session = await auth();
  if (!isModuleAdmin(getModule(moduleKey), session?.user?.groups)) {
    notFound();
  }
}

/** Reine Sichtbarkeitsfrage — z. B. „Admin-Link im Menü zeigen?". Wirft nicht. */
export async function canAdminModule(moduleKey: string): Promise<boolean> {
  const session = await auth();
  return isModuleAdmin(getModule(moduleKey), session?.user?.groups);
}
