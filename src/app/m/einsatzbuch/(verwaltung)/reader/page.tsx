import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { requireEinsatzbuchHost } from "../../_lib/host";
import { requireEinsatzbuchZugang } from "../../_lib/zugang";
import { leseEinstellungen } from "../../_lib/einstellungen";
import { Reader } from "../../_ui/reader/Reader";

export const dynamic = "force-dynamic";

/**
 * Der Reader: öffnet eine Exportdatei der Verwaltung ganz im Browser (Entscheidung 6 aus dem
 * Plan der Stufe 3 — in der Suite-Hülle statt mit eigener Kopfleiste). Der Server liefert nur
 * die Hülle und die Bereitschaft für das Berichtsblatt; die Datei und das Kennwort verlassen
 * den Tab nie.
 */
export default async function ReaderSeite() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  return (
    <>
      <Seitenkopf titel="Einsatzbuch-Datei öffnen" beschreibung="Öffne eine Datei, die du in der Verwaltung heruntergeladen hast. Du brauchst das Kennwort, mit dem sie gespeichert wurde. Läuft nur in deinem Browser · kein Server." />
      <Reader bereitschaft={leseEinstellungen(getDb()).bereitschaft} />
    </>
  );
}
