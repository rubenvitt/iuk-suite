import Link from "next/link";
import { aufgabenVonErsteller } from "../_db/queries";
import type { DB } from "../_db/client";
import type { AufgabeRow } from "../_db/schema";
import { kartenGrunddaten } from "../_lib/kartendaten";
import type { Lage } from "../_lib/lage";
import type { Akteur } from "../_lib/zugang";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AufgabenListe, type AufgabenListeZeile } from "./AufgabenListe";
import { Fuehrungskarte } from "./Fuehrungskarte";
import { SeitenKopf } from "./SeitenKopf";
import s from "./aufgaben.module.css";

/*
 * „MEINE AUFTRAEGE" — DER AUFTRAGGEBER-EINSTIEG, NEU GEBAUT NACH DER OBERFLAECHEN-SPEC (2026-08-16
 * §3.4, §5.3). Server Component (kein "use client").
 *
 * FUER DIESE ROLLE EXISTIERT EBENE 4 DES AUFBAUS NICHT (§3.4, R3-Ausnahmetabelle) — und das ist
 * kein toter Zweig, sondern die richtige Antwort auf eine Flaeche, die ihren Bestand ohnehin ganz
 * zeigt: „Eigene Auftraege" listet JEDE eigene Zeile, UNGEDECKELT (Regel D nimmt die Flaeche der
 * Rolle aus). Jede Zone waere eine wortwoertliche Wiederholung zwei Bildschirmzentimeter tiefer.
 * `lage()` liefert fuer diese Ansicht deshalb auch keine Zonen — `R3_AUSNAHMEN.auftrag` enthaelt
 * alle drei Sprossen.
 *
 * DIESE ANSICHT ENTHAELT KEINE VERTEIL-AKTION (Modulspec §8.3, woertlich): „der Weg zum Verteilen
 * existiert in ihrer Oberflaeche nicht, und /verteilen antwortet ihnen mit 404. Beides prueft
 * dasselbe Praedikat aus derselben Quelle." KEIN WORT UND KEIN `href` MIT DEM TEILSTRING
 * `verteilen` als Weg — „Noch nicht verteilt" ist TEXT, nie Link; e2e scannt aktiv jedes `href`
 * dieser Seite danach. Deshalb bekommt die Fuehrungskarte hier `verteilen={null}`: ohne
 * Verteil-Ziele kann der Modal gar nicht entstehen.
 *
 * DIE FREIGABE-WARTESCHLANGE IST KEINE EIGENE SEKTION MEHR: sie ist Rang 1 der Leiter und damit
 * entweder die Karte (n = 1, mit `FreigabeAktionen`) oder ein Primaerknopf auf `/freigaben`
 * (n > 1, nur bei `darfFreigabenSehen`). Die Route bleibt und ist der einzige Ort, der „meine" von
 * „in Vertretung" trennt (§3.1).
 */
export function EinstiegAuftrag({
  db,
  akteur,
  heute,
  lage,
}: {
  db: DB;
  akteur: Akteur;
  heute: string;
  /** Der Zustands-Selektor, EINMAL in `page.tsx` gerufen (§4.1). */
  lage: Lage;
}) {
  const person = akteur.person;
  // `aufgabenVonErsteller` ZEIGT NUR DIE EIGENEN AUFTRAEGE — fremde erscheinen strukturell nicht,
  // weil die Abfrage selbst auf `erstellerId` filtert (keine server- UND clientseitige Kopie
  // derselben Filterung, die auseinanderlaufen koennte).
  const meineAuftraege = aufgabenVonErsteller(db, person.id);
  const grund = kartenGrunddaten(db, akteur, heute, lage);

  const zeilen: AufgabenListeZeile[] = meineAuftraege.map((a) => ({
    aufgabe: a,
    rollenZusatz: empfaengerText(a, grund.namen),
  }));

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben" }]}
        titel="Meine Aufträge"
        kontext={lage.kontext}
        aktionen={
          // TEXTKNOPF IM SEITENKOPF, ALSO AUSSERHALB DES WRAPPERS (§3.3, §9/S9): der Zaehlriegel
          // faende ihn gar nicht — demotiert wurde er trotzdem, weil „hoechstens ein Primaerknopf"
          // fuer die GANZE Seite gilt und die Skizze in §5.3 ihn als Textknopf fuehrt.
          <Link href="/neu">Aufgabe einstellen</Link>
        }
      />

      <div data-testid="aufgaben-flaeche">
        <Fuehrungskarte
          lage={lage}
          heute={heute}
          eigenePersonId={person.id}
          verteilen={null}
          vertretungAnzahl={0}
          morgen={null}
          {...grund}
        />

        {/* ── 3 · DIE FLAECHE DER ROLLE: alle eigenen Auftraege, ungedeckelt (Regel D) ── */}
        <section id="auftraege" style={{ marginBlockStart: SPACE.xl, marginBlockEnd: SPACE.xl }}>
          {/*
           * DIE UEBERSCHRIFT DER ROLLENFLAECHE TRITT ZURUECK (Oberflaechen-Runde 2026-08-16, zweite
           * Haelfte) — dieselbe Aenderung wie bei `AnlassZone` (Befund 4) und bei „Diese Woche" auf
           * der BuFDi-Flaeche, mit derselben Klasse und derselben Rolle aus der Leiter.
           *
           * HIER WIEGT SIE AM SCHWERSTEN, WEIL DIESE FLAECHE NUR EINE UEBERSCHRIFT HAT: fuer die
           * Auftraggeber-Rolle gibt es Ebene 4 des Aufbaus gar nicht (s. Kopfkommentar), es steht
           * also EIN Abschnitt unter der Fuehrungskarte. Ein 20/600-Titel ueber acht Zeilen mit
           * 14px-Titeln war damit die groesste Schrift der halben Seite — fuer die Aussage
           * „hier kommt eine Liste".
           */}
          <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.sm}px` }}>
            Eigene Aufträge ({meineAuftraege.length})
          </h2>
          <AufgabenListe zeilen={zeilen} heute={heute} leerText="Noch keine eigenen Aufträge." />
        </section>

        {/* ── 5 · FUSS (Ebene 4 gibt es fuer diese Rolle nicht, s. Kopfkommentar) ── */}
        {/*
         * DER NEBENWEG IN TINTE STATT IN ROT (Befund 3, hier nachgezogen): „Archiv" ist Navigation,
         * kein Signal — dieselbe Klasse, die `EinstiegKoordination` fuer seine zwei Fusslinks
         * bereits traegt.
         */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          <Link href="/archiv" className={s.leiseLink}>
            Archiv
          </Link>
        </div>
      </div>
    </>
  );
}

/**
 * DER ROLLENZUSATZ EINER AUFTRAGGEBER-ZEILE (§3.6, §10 Prueffrage 7) — GENAU EINE Angabe:
 * „Empfänger: X" bzw. „Noch nicht verteilt". `zugewiesenAn === null` heisst „noch nicht verteilt"
 * (Status `eingegangen`, im Posteingang der Koordination) — das ist kein Fehlerfall, sondern der
 * Normalzustand einer frisch fremd eingestellten Aufgabe, deshalb ein eigener Satz statt eines
 * Gedankenstrichs. Ein STRING, keine Funktion (Falle 9).
 */
function empfaengerText(a: AufgabeRow, namen: Record<string, string>): string {
  if (a.zugewiesenAn === null) return "Noch nicht verteilt";
  return `Empfänger: ${namen[a.zugewiesenAn] ?? "—"}`;
}
