import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { getDb } from "../../_db/client";
import { PROTOKOLL_TAGE } from "../../_lib/abgleich";
import { anzahlHelfer } from "../../_lib/daten";
import { leseEinstellungen } from "../../_lib/einstellungen";
import { STATUS_TEXT } from "../../_lib/filter";
import { hiorgKonfiguration } from "../../_lib/hiorg/konfiguration";
import { verbindungsstand } from "../../_lib/hiorg/verbindung";
import { requireHelferHost } from "../../_lib/host";
import { darfHelferVerwalten, requireHelferZugang } from "../../_lib/zugang";
import { DemoHinweis } from "../../_ui/DemoHinweis";
import { Einstellungen, type EinstellungenProps } from "../../_ui/Einstellungen";

export const dynamic = "force-dynamic";

const ZEIT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Die Texte zur Rückkehr von HiOrg (`hiorg/callback`); ein unbekannter Wert zeigt nichts. */
const RUECKMELDUNG: Record<string, EinstellungenProps["rueckmeldung"]> = {
  verbunden: { art: "erfolg", text: "Mit HiOrg-Server verbunden." },
  abgelehnt: { art: "warnung", text: "Die Anmeldung bei HiOrg-Server wurde abgebrochen oder abgelehnt." },
  abgelaufen: { art: "warnung", text: "Der Vorgang ist abgelaufen oder gehört zu einem anderen Browser. Bitte noch einmal verbinden." },
  "ohne-refresh": { art: "warnung", text: "HiOrg-Server hat kein Erneuerungs-Token geliefert; ohne das ist kein späterer Abgleich möglich. Bitte beim HiOrg-Support den Grant-Type refresh_token für den Client freischalten lassen." },
  "nicht-eingerichtet": { art: "warnung", text: "Die Anbindung an HiOrg-Server ist in der Umgebung der Suite nicht eingerichtet." },
  fehler: { art: "warnung", text: "HiOrg-Server hat die Anmeldung nicht bestätigt. Bitte später noch einmal versuchen." },
};

export default async function EinstellungenSeite({ searchParams }: { searchParams: Promise<{ hiorg?: string }> }) {
  requireHelferHost(await headers());
  const viewer = await requireHelferZugang();
  const db = getDb();
  const e = leseEinstellungen(db);
  const v = verbindungsstand(db);
  const k = hiorgKonfiguration();
  const darfVerwalten = darfHelferVerwalten(viewer.groups);
  const { hiorg } = await searchParams;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.xl }}>
      <Seitenkopf titel="Einstellungen" beschreibung="Quelle, Verbindung zu HiOrg-Server und Datenschutz." zurueck={{ titel: "Helfer", href: "/" }} />
      {e.quelle === "demo" ? <DemoHinweis darfVerwalten={false} /> : null}
      {darfVerwalten ? (
        <Einstellungen
          quelle={e.quelle}
          neueFreigeben={e.neueFreigeben}
          anzahl={anzahlHelfer(db)}
          hiorgFehlt={k.ok ? [] : k.fehlt}
          verbindung={v ? { kontoName: v.kontoName, verbundenVon: v.verbundenVon, verbundenAm: ZEIT.format(v.verbundenAm), erneuertAm: ZEIT.format(v.erneuertAm) } : null}
          rueckmeldung={(hiorg && RUECKMELDUNG[hiorg]) || null}
        />
      ) : (
        <p style={{ margin: 0 }}>
          Quelle: {e.quelle === "demo" ? "Demo" : "HiOrg-Server"}{v ? `, verbunden als ${v.kontoName}` : ""}. Ändern dürfen nur die Verwaltenden des Moduls.
        </p>
      )}
      <section aria-labelledby="datenschutz" style={{ display: "grid", gap: SPACE.sm, maxWidth: 720 }}>
        <h2 id="datenschutz" style={{ ...SCHRIFT.unterTitel, margin: 0 }}>Datenschutz</h2>
        <ul style={{ margin: 0, paddingInlineStart: SPACE.xl, display: "grid", gap: SPACE.xs }}>
          <li>
            <b>Gespeichert</b> werden je Person nur Vor- und Nachname, Kontostatus in HiOrg, Gruppen und Qualifikationen. Alles
            andere, was HiOrg-Server mitliefert (Kontaktdaten, Anschrift, Geburtsdatum, Bankverbindung, Führerschein, Allergien,
            Angehörige, Bemerkungen), wird beim Lesen verworfen und nie gespeichert oder protokolliert.
          </li>
          <li>
            <b>Übernommen</b> wird nur, wer durch den Importfilter kommt (heute: Kontostatus {e.filter.status.map((s) => STATUS_TEXT[s]).join(", ")}),
            nie gesperrte Konten und nie Ausgetretene. Wer nicht mehr durchkommt, wird beim nächsten Abgleich gelöscht.
          </li>
          <li>
            <b>Ans Einsatzbuch</b> gehen nur freigegebene Personen, und nur mit Name und Qualifikationen — keine HiOrg-Kennung,
            keine Gruppen.
          </li>
          <li>
            <b>Sehen</b> darf die Liste nur, wer in der Zugangsgruppe des Moduls ist; die Suite-Administration allein reicht
            nicht. Jede Änderung steht im Audit-Log der Suite, das Abgleichprotokoll (ohne Helfernamen) {PROTOKOLL_TAGE} Tage lang.
          </li>
          <li>
            <b>Die Verbindung</b> zu HiOrg speichert nur ein verschlüsseltes Erneuerungs-Token. „Verbindung trennen“ löscht es.
          </li>
        </ul>
      </section>
    </div>
  );
}
