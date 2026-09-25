import { headers } from "next/headers";
import Link from "next/link";
import { Card, Statistic } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../_db/client";
import { requireEinsatzbuchHost } from "../_lib/host";
import { requireEinsatzbuchZugang } from "../_lib/zugang";
import { listeFahrzeuge, listePersonal, listeStichworte, stammdatenVersion } from "../_lib/stammdaten/daten";
import { schluesselStatus } from "../_lib/schluessel/status";
import { rechnerStatus } from "../_lib/anbindung/status";
import { KekHinweis } from "../_ui/KekHinweis";
import styles from "../_ui/rechner/rechner.module.css";

export const dynamic = "force-dynamic";

export default async function EinsatzbuchUebersicht() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  const db = getDb();
  const status = await schluesselStatus(db);
  const { echt, test } = rechnerStatus(db);
  const abweichungen = (echt?.abweichungen.length ?? 0) + test.reduce((summe, r) => summe + r.abweichungen, 0);
  const aktiv = <T extends { aktiv: boolean }>(l: T[]) => l.filter((x) => x.aktiv).length;
  return (
    <>
      <Seitenkopf
        titel="Einsatzbuch"
        beschreibung="Hier pflegst du Fahrzeuge, Personal, Alarmstichworte und die Einstellungen für den Einsatzbuch-Rechner."
        aktionen={
          <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
            <Link href="/rechner">Rechner verwalten</Link>
            <Link href="/reader">Einsatzdatei im Reader öffnen</Link>
          </div>
        }
      />
      <KekHinweis status={status} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 16 }}>
        <Card><Statistic title="Fahrzeuge aktiv" value={aktiv(listeFahrzeuge(db))} /></Card>
        <Card><Statistic title="Personal aktiv" value={aktiv(listePersonal(db))} /></Card>
        <Card><Statistic title="Stichworte aktiv" value={aktiv(listeStichworte(db))} /></Card>
        <Card><Statistic title="Stammdatenstand" value={stammdatenVersion(db)} prefix="Version" /></Card>
        <Card>
          <Statistic title="Echter Rechner" value={echt ? "eingerichtet" : "nicht eingerichtet"} />
          <p style={{ margin: `${SPACE.xs}px 0 0` }}>
            {echt ? `Letzter Kontakt: ${echt.letzterKontakt ?? "noch keiner"}` : "Die Einrichtung startet am Rechner selbst."}
            {echt && <><br />{echt.ankerBis !== null ? `Anker bis Block ${echt.ankerBis}` : "Noch kein Anker"}</>}
          </p>
        </Card>
        <Card className={styles.modul}>
          <Statistic
            title="Anker-Abweichungen"
            value={abweichungen}
            valueStyle={abweichungen > 0 ? { color: "var(--eb-verw-rot-text)" } : undefined}
          />
        </Card>
      </div>
      {status.schluesselId && <p>Schlüssel-Kennung: <code>{status.schluesselId}</code></p>}
    </>
  );
}
