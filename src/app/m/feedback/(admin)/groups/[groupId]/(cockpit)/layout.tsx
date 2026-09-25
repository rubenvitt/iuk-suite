import { notFound } from "next/navigation";
import { getGroup } from "../../../../_db/queries";
import { guardPage } from "../../../../_lib/guardPage";

/**
 * DER ZUGRIFFSSCHUTZ DES COCKPITS, VOR SEINER LADEGRENZE (DRK-424).
 *
 * ⛔ UNTER EINER `loading.tsx` KOMMT DER 404 ZU SPAET. Die Grenze ist eine
 * Suspense-Grenze; der Server schickt den Ladezustand zuerst — und mit ihm
 * den Status 200. Ein `notFound()` in der Seite darunter zeigt dann zwar die
 * 404-Oberflaeche, aber der Status bleibt 200. Belegt in CI (e2e
 * files-feedback: „IDOR-Guard …" und „Gruppenleiter …", je 200 statt 404) und
 * gegen `build`/`start` nachgemessen: fremde und unbekannte Gruppe → 200.
 *
 * Ein Layout rendert OBERHALB der Grenze seines Segments, also bevor
 * gestreamt wird: hier wirft `notFound()` noch einen echten 404. Die Seite
 * prueft trotzdem weiter selbst — sie laedt mit derselben `id`, und ein
 * Layout, das spaeter jemand anders verdrahtet, soll den Schutz nicht als
 * Einziger tragen.
 *
 * ⚠️ DAS LAYOUT LAEUFT AUCH BEIM VORABLADEN: Next laedt eine dynamische Route
 * bis zur ersten Ladegrenze vor, und dieses Layout liegt davor. Das ist ein
 * Lesezugriff (Sitzung, Zuordnung, Gruppe) und bleibt es — hier gehoert
 * nichts hin, das schreibt.
 */
export default async function CockpitSchutz({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const id = Number((await params).groupId);
  const { db } = await guardPage(id);
  if (!getGroup(db, id)) notFound();
  return children;
}
