import { headers } from "next/headers";
import Link from "next/link";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../_db/client";
import { listeLaeufe } from "../../_lib/daten";
import { leseEinstellungen } from "../../_lib/einstellungen";
import { GRUND_TEXT, STATUS_TEXT } from "../../_lib/filter";
import { verbindungsstand } from "../../_lib/hiorg/verbindung";
import { requireHelferHost } from "../../_lib/host";
import { darfHelferVerwalten, requireHelferZugang } from "../../_lib/zugang";
import { Abgleich } from "../../_ui/Abgleich";
import { DemoHinweis } from "../../_ui/DemoHinweis";
import { LaufListe } from "../../_ui/LaufListe";

export const dynamic = "force-dynamic";

/**
 * Abgleich mit der Quelle. Wer nur Zugang hat, sieht Quelle, Filter und Protokoll; Vorschau und
 * Übernehmen bekommt nur, wer verwalten darf — dasselbe Prädikat wie in den Actions.
 */
export default async function AbgleichSeite() {
  requireHelferHost(await headers());
  const viewer = await requireHelferZugang();
  const db = getDb();
  const e = leseEinstellungen(db);
  const verbindung = verbindungsstand(db);
  const darfVerwalten = darfHelferVerwalten(viewer.groups);
  const hiorgOhneVerbindung = e.quelle === "hiorg" && !verbindung;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.xl }}>
      <Seitenkopf
        titel="Abgleich"
        beschreibung={
          e.quelle === "demo"
            ? "Quelle ist die eingebaute Demo-Antwort. Der Abgleich läuft genau wie mit HiOrg-Server: lesen, filtern, Vorschau, übernehmen."
            : e.quelle === "datei"
              ? "Quelle ist eine Excel-Datei: hochladen, filtern, Vorschau, übernehmen."
              : verbindung
              ? `Quelle ist HiOrg-Server, verbunden als ${verbindung.kontoName}. Gelesen wird nur, was das Konto in HiOrg sehen darf.`
              : "Quelle ist HiOrg-Server, aber es besteht keine Verbindung."
        }
        zurueck={{ titel: "Helfer", href: "/" }}
      />
      {e.quelle === "demo" ? <DemoHinweis darfVerwalten={darfVerwalten} /> : null}
      {hiorgOhneVerbindung ? (
        <p style={{ margin: 0 }}>
          {darfVerwalten ? <>Verbinde zuerst unter <Link href="/einstellungen">Einstellungen</Link> ein HiOrg-Konto.</> : "Eine Person mit Verwaltungsrecht muss zuerst ein HiOrg-Konto verbinden."}
        </p>
      ) : darfVerwalten ? (
        <Abgleich start={e.filter} quelle={e.quelle} />
      ) : (
        <section aria-labelledby="filter-lesend" style={{ display: "grid", gap: SPACE.sm }}>
          <h2 id="filter-lesend" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Importfilter</h2>
          <p style={{ margin: 0 }}>
            Kontostatus: {e.filter.status.map((s) => STATUS_TEXT[s]).join(", ")}
            {e.filter.gruppenEin.length > 0 ? ` · nur Gruppen: ${e.filter.gruppenEin.join(", ")}` : ""}
            {e.filter.gruppenAus.length > 0 ? ` · ohne Gruppen: ${e.filter.gruppenAus.join(", ")}` : ""}
            {` · nie: ${GRUND_TEXT.gesperrt}, ${GRUND_TEXT.ausgetreten}`}
          </p>
        </section>
      )}
      <section aria-labelledby="protokoll" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}>
        <h2 id="protokoll" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Letzte Abgleiche</h2>
        <LaufListe laeufe={listeLaeufe(db, 10)} />
      </section>
    </div>
  );
}
