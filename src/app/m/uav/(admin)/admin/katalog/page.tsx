import { getDb } from "../../../_db/client";
import { alleTasks } from "../../../_lib/queries";
import type { TaskDTO } from "../../../_lib/typen";
import { requireUavAdminPage } from "../../../_lib/requireUavAdmin";
import { KatalogTabelle } from "../../../_ui/admin/KatalogTabelle";

export const dynamic = "force-dynamic";

/**
 * `/admin/katalog` — die Katalog-Verwaltung (Aufgabe 17). `katalogInhalt` ist
 * die reine, exportierte Inhaltsfunktion (Vorbild `personenInhalt`,
 * `teilnehmerInhalt`) — `alleTasks(db, true)` liest INKLUSIVE inaktiver
 * Aufgaben, damit die Verwaltung auch deaktivierte Einträge sieht und wieder
 * aktivieren kann.
 *
 * DER `Seitenkopf` DIESER SEITE STEHT AUSNAHMSWEISE IN DER CLIENT-INSEL
 * (`_ui/admin/KatalogTabelle.tsx`), NICHT HIER. Der Grund steht dort
 * ausgeschrieben: seine einzige Aktion ist „Aufgabe anlegen", und dieser Knopf
 * öffnet den `Drawer` der Tabelle — er teilt sich deren Zustand. Ein
 * `Seitenkopf` hier und der Knopf dort wären zwei Kopfzeilen; ein Context nur
 * für ein Boolean wäre Aufwand ohne Ertrag. Auf `/admin` und
 * `/admin/teilnehmer/<id>` liegt der Kopf dagegen in der Seite selbst, weil
 * seine Aktionen dort schlichte Links sind.
 */
export function katalogInhalt(aufgaben: TaskDTO[]) {
  return <KatalogTabelle aufgaben={aufgaben} />;
}

export default async function AdminKatalogPage() {
  await requireUavAdminPage();
  const aufgaben = alleTasks(getDb(), true);
  return katalogInhalt(aufgaben);
}
