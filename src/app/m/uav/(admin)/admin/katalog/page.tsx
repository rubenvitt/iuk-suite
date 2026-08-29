import { getDb } from "../../../_db/client";
import { alleTasks } from "../../../_lib/queries";
import type { TaskDTO } from "../../../_lib/typen";
import { requireUavAdminPage } from "../../../_lib/requireUavAdmin";
import { KatalogTabelle } from "../../../_ui/admin/KatalogTabelle";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

export const dynamic = "force-dynamic";

/**
 * `/admin/katalog` — die Katalog-Verwaltung (Aufgabe 17). `katalogInhalt` ist
 * die reine, exportierte Inhaltsfunktion (Vorbild `personenInhalt`,
 * `teilnehmerInhalt`) — `alleTasks(db, true)` liest INKLUSIVE inaktiver
 * Aufgaben, damit die Verwaltung auch deaktivierte Einträge sieht und wieder
 * aktivieren kann.
 */
export function katalogInhalt(aufgaben: TaskDTO[]) {
  return (
    <>
      <h1 style={{ ...SCHRIFT.titel, margin: `0 0 ${SPACE.lg}px` }}>Aufgabenkatalog</h1>
      <KatalogTabelle aufgaben={aufgaben} />
    </>
  );
}

export default async function AdminKatalogPage() {
  await requireUavAdminPage();
  const aufgaben = alleTasks(getDb(), true);
  return katalogInhalt(aufgaben);
}
