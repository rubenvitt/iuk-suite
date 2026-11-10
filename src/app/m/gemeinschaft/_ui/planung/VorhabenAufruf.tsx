import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Result } from "antd";
import { getDb } from "../../_db/client";
import { requireGemeinschaftHost } from "../../_lib/host";
import { formularDaten, vorhabenDetail } from "../../_lib/vorhaben";
import { idSchema } from "../../_lib/vorhabenEingabe";
import { vorhabenPfad, type VorhabenArt } from "../../_lib/vorhabenTypen";
import { tagInZone } from "../../_lib/zeit";
import { requireLeitung } from "../../_lib/zugang";
import { VorhabenSeite } from "./VorhabenSeite";

/**
 * Die Seite eines Events oder Projekts, aufgerufen unter seiner Liste (`/events/<id>`, `/projekte/<id>`) oder
 * unter der alten Adresse `/v/<id>` (`art` fehlt). Das Objekt kommt aus der Datenbank, die Kennung aus der Adresse
 * ist nur der Schlüssel; die Leitung sieht alle Vorhaben (kein Objektrecht darunter). Passt die Adresse nicht zur
 * Art, geht es auf die richtige (IDA-398: die Seitenleiste markiert nach Pfadanfang). Ein gelöschtes Vorhaben
 * zeigt — wie im POC — einen Leerzustand mit Rückweg statt einer 404: es ist kein Zugriffsentscheid, und nach dem
 * Löschen landet man sonst auf der Fehlerseite der Suite ohne Navigation.
 */
export async function VorhabenAufruf({ art, id }: { art: VorhabenArt | null; id: string }) {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  const db = getDb();
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const jetzt = new Date().getTime();
  const v = idSchema.safeParse(id).success ? vorhabenDetail(db, id, jetzt) : null;
  if (!v) {
    return (
      <Result status="info" title="Dieses Event oder Projekt gibt es nicht mehr."
        extra={<span style={{ display: "inline-flex", gap: 16 }}><Link href="/events">Zu den Events</Link><Link href="/projekte">Zu den Projekten</Link></span>} />
    );
  }
  if (v.art !== art) redirect(vorhabenPfad(v.art, v.id));
  return <VorhabenSeite v={v} heute={tagInZone(jetzt)} daten={formularDaten(db, jetzt)} />;
}
