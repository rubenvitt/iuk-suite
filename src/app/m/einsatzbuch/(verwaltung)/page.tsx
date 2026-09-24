import { headers } from "next/headers";
import { Card, Statistic } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { requireEinsatzbuchHost } from "../_lib/host";
import { requireEinsatzbuchZugang } from "../_lib/zugang";
import { listeFahrzeuge, listePersonal, listeStichworte, stammdatenVersion } from "../_lib/stammdaten/daten";
import { schluesselStatus } from "../_lib/schluessel/status";
import { KekHinweis } from "../_ui/KekHinweis";

export const dynamic = "force-dynamic";

export default async function EinsatzbuchUebersicht() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  const db = getDb();
  const status = await schluesselStatus(db);
  const aktiv = <T extends { aktiv: boolean }>(l: T[]) => l.filter((x) => x.aktiv).length;
  return (
    <>
      <Seitenkopf titel="Einsatzbuch" beschreibung="Hier pflegst du Fahrzeuge, Personal, Alarmstichworte und die Einstellungen für den Einsatzbuch-Rechner." />
      <KekHinweis status={status} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 16 }}>
        <Card><Statistic title="Fahrzeuge aktiv" value={aktiv(listeFahrzeuge(db))} /></Card>
        <Card><Statistic title="Personal aktiv" value={aktiv(listePersonal(db))} /></Card>
        <Card><Statistic title="Stichworte aktiv" value={aktiv(listeStichworte(db))} /></Card>
        <Card><Statistic title="Stammdatenstand" value={stammdatenVersion(db)} prefix="Version" /></Card>
      </div>
      {status.schluesselId && <p>Schlüssel-Kennung: <code>{status.schluesselId}</code></p>}
    </>
  );
}
