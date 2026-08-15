import Link from "next/link";
import { Col, Row } from "antd";
import { alleAufgaben, freigabeDaten, verteilDaten } from "../_db/queries";
import type { DB } from "../_db/client";
import type { PersonRow } from "../_db/schema";
import { istUeberfaellig } from "../_lib/anzeige";
import { darfVerteilen } from "../_lib/zugang";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AufgabenListe } from "./AufgabenListe";
import { FreigabeZone } from "./FreigabeZone";
import { Kachel } from "./Kachel";
import { SeitenKopf } from "./SeitenKopf";
import { VerteilenTabelle } from "./VerteilenDialog";

/*
 * „VERTEILUNG" — DER KOORDINATIONS-EINSTIEG (Spec §8.2, Aufgabe 14). Server Component (kein
 * "use client") — sie liest `db` direkt, wie `EinstiegBufdi.tsx`; `page.tsx` bleibt duenn.
 *
 * WAS AUF DEN EINSTIEG GEHOERT UND WAS AUF `/verteilen` — ENTSCHIEDEN, NICHT STILL UEBERGANGEN
 * (Brief verlangt genau diese Entscheidung): Spec §8.2 beschreibt den Posteingang ALS TEIL DES
 * EINSTIEGS ("Koordination (Sarah) — 'Verteilung'" ist die Ueberschrift des ganzen Abschnitts, und
 * "/" IST fuer die Koordination dieser Einstieg). Die Posteingang-Tabelle steht deshalb HIER,
 * vollstaendig, nicht nur ein Verweis auf `/verteilen`. Die Route `/verteilen` bleibt TROTZDEM
 * bestehen, mit DERSELBEN Tabelle (`_ui/VerteilenDialog.tsx`s `VerteilenTabelle`, ein einziger
 * Baustein fuer beide Seiten) — sie ist die adressierbare Route aus Spec §8's Tabelle und traegt den
 * 404-Riegel aus Spec §8.3 (`auftrag`/`bufdi` bekommen 404, `koordination` 200). Die KPI-Kachel „Zu
 * verteilen" verlinkt deshalb NICHT auf `/verteilen` (das waere ein Knopf, der auf eine Kopie der
 * bereits sichtbaren Tabelle zeigt), sondern auf den Anker `#posteingang` auf derselben Seite —
 * dieselbe Form wie `EinstiegBufdi.tsx`s Kachel „Einzuplanen" (`#posteingang`).
 *
 * DIE FREIGABE-WARTESCHLANGE UND DIE UEBERFAELLIGKEITSLISTE STEHEN EBENFALLS INLINE: eine eigene
 * Ueberfaelligkeits-Route gibt es weiterhin nicht (Spec §8 fuehrt keine), ein Verweis dorthin waere
 * ein Knopf auf eine 404-Seite (Spec §7). Beide KPI-Kacheln verlinken deshalb auf einen Anker AUF
 * DIESER Seite (`#freigabe`, `#ueberfaellig`) — seit dem Abschlussreview (W4) gilt dasselbe fuer
 * die vierte Kachel und `#zurueckgewiesen`, s. dort. ALLE VIER Kacheln tragen damit ein Ziel,
 * sobald ihre Zahl > 0 ist; `EinstiegKoordination.test.tsx` prueft das ueber alle vier hinweg
 * statt je Kachel einzeln — genau diese Naht ist zweimal durchgerutscht.
 *
 * DIE FREIGABE-SEKTION IST SEIT AUFGABE 16 SCHREIBFAEHIG (vorher schreibgeschuetzt, Beobachtung aus
 * Aufgabe 15s Bericht): sie zeigte bislang nur `AufgabenListe` OHNE Freigeben-/Zurueckweisen-
 * Knoepfe — die Koordination sah hier etwas, womit sie nichts tun konnte, und musste erst nach
 * `/freigaben` wechseln. `FreigabeZone` (Aufgabe 15, wiederverwendet von `EinstiegAuftrag.tsx` UND
 * `/freigaben`) haengt jetzt auch hier ein, mit `freigabeDaten(db, person, heute)` als LADEFUNKTION
 * — dieselbe wie bei den beiden anderen Aufrufern, KEINE eigene, hier gehaltene Fassung von
 * `freigabenFuer`/`istVertretungsfreigabe` mehr (Vorbild `verteilDaten`s Fix-Runde-1-Lehre: zwei
 * separate Ladebloecke fuer dieselbe Sache laufen auseinander, ohne dass ein Test es sieht).
 *
 * `verteilDaten(db, heute)` (`_db/queries.ts`, Fix-Runde 1) IST DIE EINE LADEFUNKTION FUER DEN
 * POSTEINGANG — `verteilen/page.tsx` ruft SIE, NICHT eine zweite Fassung desselben Ladeblocks. Vor
 * dieser Aenderung riefen beide Seiten `bufdis(db, heute)`/`wochenAuslastungFuerBufdis`/`namenMap`
 * je EINZELN auf; ein Review deckte auf, dass ein Austausch von `bufdis()` gegen `aktivePersonen()`
 * genau HIER (der Seite, die die Koordination TAEGLICH benutzt) von keinem Test gesehen worden
 * waere. Mit einer gemeinsamen Funktion kann die Zielliste zwischen `/` und `/verteilen` nicht mehr
 * auseinanderlaufen.
 */
export function EinstiegKoordination({
  db,
  person,
  heute,
}: {
  db: DB;
  person: PersonRow;
  heute: string;
}) {
  const { posteingang: zuVerteilenListe, erstellerNamen, bufdis: bufdisListe, auslastung, tage } =
    verteilDaten(db, heute);

  // DIE UEBERFAELLIGKEITS- UND ZURUECKGEWIESEN-ZAHLEN SIND SYSTEMWEIT (alle Aufgaben, nicht nur die
  // eigenen) — die Koordination ist die einzige Rolle mit diesem Ueberblick (Spec §8.2).
  const alle = alleAufgaben(db);
  const ueberfaelligListe = alle.filter((a) => istUeberfaellig(a, heute));
  const zurueckgewiesenListe = alle.filter((a) => a.status === "zurueckgewiesen");

  // `freigabeDaten` (`_db/queries.ts`, Aufgabe 15) IST DIE EINE LADEFUNKTION FUER DIE
  // FREIGABE-WARTESCHLANGE — dieselbe, die `_ui/EinstiegAuftrag.tsx` UND `freigaben/page.tsx`
  // aufrufen. Sie wendet `darfFreigeben`/`istVertretungsfreigabe` bereits an; diese Datei baut
  // beides nicht mehr nach.
  const { meine: meineFreigabe, vertretung: vertretungFreigabe } = freigabeDaten(db, person, heute);
  const freigabeAnzahl = meineFreigabe.length + vertretungFreigabe.length;

  const kontext = `${zuVerteilenListe.length} zu verteilen · ${freigabeAnzahl} warten auf Freigabe.`;

  return (
    <>
      <SeitenKopf brotkrume={[{ label: "Aufgaben" }]} titel="Verteilung" kontext={kontext} />

      <Row gutter={[SPACE.sm, SPACE.sm]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={12} md={6}>
          <Kachel
            zahl={zuVerteilenListe.length}
            beschriftung="Zu verteilen"
            href={zuVerteilenListe.length > 0 ? "#posteingang" : undefined}
          />
        </Col>
        <Col xs={12} md={6}>
          <Kachel
            zahl={freigabeAnzahl}
            beschriftung="Freigabe offen"
            ton="ocker"
            href={freigabeAnzahl > 0 ? "#freigabe" : undefined}
          />
        </Col>
        <Col xs={12} md={6}>
          <Kachel
            zahl={ueberfaelligListe.length}
            beschriftung="Überfällig"
            ton="achtung"
            href={ueberfaelligListe.length > 0 ? "#ueberfaellig" : undefined}
          />
        </Col>
        <Col xs={12} md={6}>
          <Kachel
            zahl={zurueckgewiesenListe.length}
            beschriftung="Zurückgewiesen"
            ton="achtung"
            href={zurueckgewiesenListe.length > 0 ? "#zurueckgewiesen" : undefined}
          />
        </Col>
      </Row>

      <section id="posteingang" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Posteingang</h2>
        <VerteilenTabelle
          posteingang={zuVerteilenListe}
          erstellerNamen={erstellerNamen}
          bufdis={bufdisListe}
          auslastung={auslastung}
          tage={tage}
          heute={heute}
          darfVerteilen={darfVerteilen(person, heute)}
        />
      </section>

      <section id="freigabe" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Freigabe-Warteschlange</h2>
        <FreigabeZone meine={meineFreigabe} vertretung={vertretungFreigabe} heute={heute} />
      </section>

      <section id="ueberfaellig" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Überfällige Aufgaben</h2>
        <AufgabenListe
          zeilen={ueberfaelligListe.map((a) => ({ aufgabe: a }))}
          heute={heute}
          leerText="Keine überfälligen Aufgaben"
        />
      </section>

      {/*
       * DIE VIERTE KACHEL BEKOMMT IHR ZIEL (Abschlussreview W4) — bis dahin sah die Koordination
       * auf ihrer taeglichen Einstiegsseite eine Zahl zurueckgewiesener Aufgaben und hatte KEINEN
       * Weg zu ihnen: kein `href`, und `zurueckgewiesenListe` wurde im ganzen Modul nur fuer die
       * Zahl selbst verwendet. Die Aufschiebung aus Aufgabe 13 war richtig ("ein Knopf auf eine
       * 404-Seite waere schlechter als keiner"), nur wurde sie fuer diese eine Rolle nie
       * aufgeloest — `EinstiegBufdi.tsx` hat es in Aufgabe 16 fuer beide seiner Kacheln getan.
       *
       * DIESELBE FORM WIE DORT: ein Anker AUF DIESER Seite, kein Verweis auf `/archiv` (das zeigt
       * nur `abgeschlossene`) und keine erfundene gefilterte Route. SCHREIBGESCHUETZT aus
       * demselben Grund wie in `EinstiegBufdi.tsx`: die Aktion hat mit `/a/<id>`s Aktionszone
       * bereits einen Ort, ein zweiter Knopf hier waere dieselbe Aktion an zwei Stellen gehalten.
       */}
      <section id="zurueckgewiesen" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Zurückgewiesen</h2>
        <AufgabenListe
          zeilen={zurueckgewiesenListe.map((a) => ({ aufgabe: a }))}
          heute={heute}
          leerText="Keine zurückgewiesene Aufgabe."
        />
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Link href="/personen">Personenverwaltung</Link>
        {/*
         * ARCHIV (Aufgabe 16): jetzt ein echter Fusszeilen-Verweis, kein Verweis mehr ins Leere.
         * Die Ueberfaelligkeitsliste braucht trotzdem KEINEN eigenen zweiten Verweis: sie steht
         * bereits vollstaendig oben, ueber die KPI-Kachel „Ueberfaellig" erreichbar — `/archiv`
         * zeigt ohnehin nur `abgeschlossene`, nicht ueberfaellige Aufgaben.
         */}
        <Link href="/archiv">Archiv</Link>
      </div>
    </>
  );
}
