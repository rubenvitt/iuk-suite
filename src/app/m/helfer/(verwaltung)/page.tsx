import { headers } from "next/headers";
import Link from "next/link";
import { Card, Statistic } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { getDb } from "../_db/client";
import { listeHelfer, listeLaeufe } from "../_lib/daten";
import { leseEinstellungen } from "../_lib/einstellungen";
import { requireHelferHost } from "../_lib/host";
import { darfHelferVerwalten, requireHelferZugang } from "../_lib/zugang";
import { DemoHinweis } from "../_ui/DemoHinweis";
import { HelferListe } from "../_ui/HelferListe";

export const dynamic = "force-dynamic";

const ZEIT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Die Helferliste mit Kennzahlen. Die Riegel stehen hier noch einmal: eine Route Group ist keine Sicherheitsgrenze. */
export default async function HelferSeite() {
  requireHelferHost(await headers());
  const viewer = await requireHelferZugang();
  const db = getDb();
  const liste = listeHelfer(db);
  const { quelle } = leseEinstellungen(db);
  const letzter = listeLaeufe(db, 1)[0];
  const darfVerwalten = darfHelferVerwalten(viewer.groups);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Helfer"
        beschreibung="Die aktiven Helferinnen und Helfer aus HiOrg-Server. Wer hier fürs Einsatzbuch freigegeben ist, steht dort zur Auswahl. Gespeichert sind nur Name, Kontostatus, Gruppen und Qualifikationen."
        aktionen={darfVerwalten ? <Link href="/abgleich">Mit der Quelle abgleichen</Link> : undefined}
      />
      {quelle === "demo" ? <DemoHinweis darfVerwalten={darfVerwalten} /> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: SPACE.lg }}>
        <Card><Statistic title="Helfer" value={liste.length} /></Card>
        <Card><Statistic title="Fürs Einsatzbuch freigegeben" value={liste.filter((h) => h.fuerEinsatzbuch).length} /></Card>
        <Card>
          <Statistic title="Letzter Abgleich" value={letzter ? ZEIT.format(new Date(letzter.zeitpunkt)) : "noch keiner"} />
        </Card>
      </div>
      <HelferListe liste={liste} darfVerwalten={darfVerwalten} />
    </div>
  );
}
