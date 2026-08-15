import { Button } from "antd";
import { allePersonen, aufgabenVonErsteller, freigabeDaten } from "../_db/queries";
import type { DB } from "../_db/client";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import { namenMap } from "../_lib/anzeige";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AufgabenListe, type AufgabenListeZeile } from "./AufgabenListe";
import { FreigabeZone } from "./FreigabeZone";
import { SeitenKopf } from "./SeitenKopf";

/*
 * „MEINE AUFTRAEGE" — DER AUFTRAGGEBER-EINSTIEG (Spec §8.3, Aufgabe 15). Server Component (kein
 * "use client") — sie liest `db` direkt, wie `EinstiegBufdi.tsx`/`EinstiegKoordination.tsx`;
 * `page.tsx` bleibt duenn.
 *
 * OBEN DER KNOPF, DER DER GRUND FUER DAS GANZE MODUL IST (Brief, woertlich): „Aufgabe einstellen"
 * steht in `SeitenKopf`s `aktionen`-Slot, rechts neben der Ueberschrift — dieselbe Position, an der
 * `routinen/page.tsx`/`personen/page.tsx` ihr Formular UNTER dem Kopf zeigen, aber hier ist der
 * Knopf selbst die Handlung: er fuehrt zu `/neu`, nicht zu einem eingebetteten Formular auf dieser
 * Seite (Spec §8.3 beschreibt „Aufgabe einstellen" als Knopf, nicht als Inline-Formular — anders
 * als `RoutineFormular`/`PersonenFormular`, die IMMER sichtbar auf ihrer eigenen Seite stehen).
 *
 * DIESE ANSICHT ENTHAELT KEINE VERTEIL-AKTION (Brief, Spec §8.3, woertlich): „der Weg zum Verteilen
 * existiert in ihrer Oberflaeche nicht, und /verteilen antwortet ihnen mit 404. Beides prueft
 * dasselbe Praedikat aus derselben Quelle." Aufgabe 14 hat den Riegel gebaut (`verteilen/page.tsx`
 * ruft `darfVerteilen`) — DIESE Datei baut die andere Haelfte, indem sie schlicht KEINEN Verweis auf
 * `/verteilen` und KEINE `VerteilenTabelle`/`VerteilenDialog`-Komponente einbindet. Kein Praedikat
 * noetig, wo kein Pfad existiert — `EinstiegAuftrag.test.tsx` haelt das als Gegenprobe fest (sucht
 * aktiv nach einem Verweis, statt die Abwesenheit nur zu behaupten).
 *
 * `aufgabenVonErsteller(db, person.id)` (Aufgabe 4) ZEIGT NUR DIE EIGENEN AUFTRAEGE — fremde
 * erscheinen strukturell nicht, weil die Abfrage selbst auf `erstellerId` filtert (keine
 * Server-seitige UND client-seitige Kopie derselben Filterung, die auseinanderlaufen koennte).
 *
 * DIE FREIGABE-WARTESCHLANGE IST DIESELBE `FreigabeZone`-KOMPONENTE WIE `/freigaben` (Aufgabe 15,
 * Vorbild `VerteilenTabelle`s geteilte Verwendung durch `EinstiegKoordination.tsx` UND
 * `verteilen/page.tsx`) — `_db/queries.ts`s `freigabeDaten(db, person, heute)` ist die EINE
 * Ladefunktion fuer beide Aufrufer, s. deren Kopfkommentar. `EinstiegKoordination.tsx` bleibt
 * bewusst UNVERAENDERT (nicht Teil dieser Aufgabe): ihre eigene Freigabe-Sektion zeigt weiterhin nur
 * eine schreibgeschuetzte `AufgabenListe` ohne Aktionsknoepfe — ein bekannter, kleiner Nachzug, im
 * Bericht als Beobachtung festgehalten, keine stillschweigende Aenderung an einer Datei ausserhalb
 * des Auftrags dieser Aufgabe.
 */
export function EinstiegAuftrag({ db, person, heute }: { db: DB; person: PersonRow; heute: string }) {
  const meineAuftraege = aufgabenVonErsteller(db, person.id);
  const namen = namenMap(allePersonen(db));
  const { meine: meineFreigabe, vertretung: vertretungFreigabe } = freigabeDaten(db, person, heute);

  const offenAnzahl = meineAuftraege.filter((a) => a.status !== "abgeschlossen").length;
  const freigabeAnzahl = meineFreigabe.length + vertretungFreigabe.length;
  const kontext =
    `${meineAuftraege.length} Auftr${meineAuftraege.length === 1 ? "ag" : "äge"} insgesamt, ` +
    `${offenAnzahl} offen, ${freigabeAnzahl} wartet${freigabeAnzahl === 1 ? "" : "en"} auf Freigabe.`;

  const zeilen: AufgabenListeZeile[] = meineAuftraege.map((a) => ({
    aufgabe: a,
    aktionen: <span style={{ fontSize: 12 }}>{empfaengerText(a, namen)}</span>,
  }));

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben" }]}
        titel="Meine Aufträge"
        kontext={kontext}
        aktionen={
          <Button type="primary" href="/neu">
            Aufgabe einstellen
          </Button>
        }
      />

      <section id="auftraege" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Eigene Aufträge</h2>
        <AufgabenListe zeilen={zeilen} heute={heute} leerText="Noch keine eigenen Aufträge." />
      </section>

      <section id="freigabe" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>
          Freigabe-Warteschlange
        </h2>
        <FreigabeZone meine={meineFreigabe} vertretung={vertretungFreigabe} heute={heute} />
      </section>
    </>
  );
}

/**
 * DER EMPFAENGER EINER EIGENEN AUFGABE (Spec §8.3: „die eigenen Auftraege mit Zustand und
 * Empfaenger"). `zugewiesenAn === null` heisst „noch nicht verteilt" (Status `eingegangen`, im
 * Posteingang der Koordination) — das ist kein Fehlerfall, sondern der Normalzustand einer frisch
 * fremd eingestellten Aufgabe, deshalb ein eigener Satz statt eines Gedankenstrichs.
 */
function empfaengerText(a: AufgabeRow, namen: Record<string, string>): string {
  if (a.zugewiesenAn === null) return "Noch nicht verteilt";
  return `Empfänger: ${namen[a.zugewiesenAn] ?? "—"}`;
}
