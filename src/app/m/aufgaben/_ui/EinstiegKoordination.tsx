import Link from "next/link";
import { Col, Row } from "antd";
import {
  alleAufgaben,
  allePersonen,
  bufdis,
  freigabenFuer,
  posteingang,
  wochenAuslastungFuerBufdis,
} from "../_db/queries";
import type { DB } from "../_db/client";
import type { PersonRow } from "../_db/schema";
import { istUeberfaellig, namenMap } from "../_lib/anzeige";
import { montagDerWoche, wochenTage } from "../_lib/datum";
import { darfVerteilen, istVertretungsfreigabe } from "../_lib/zugang";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AufgabenListe } from "./AufgabenListe";
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
 * DIE FREIGABE-WARTESCHLANGE UND DIE UEBERFAELLIGKEITSLISTE STEHEN EBENFALLS INLINE, aus demselben
 * Grund: `/freigaben` (Aufgabe 15) und eine eigene Ueberfaelligkeits-Route (Aufgabe 16, `/archiv`)
 * existieren heute noch nicht — ein Verweis dorthin waere ein Knopf auf eine 404-Seite (Spec §7).
 * Beide KPI-Kacheln verlinken deshalb auf einen Anker AUF DIESER Seite (`#freigabe`,
 * `#ueberfaellig`), nicht auf eine noch nicht gebaute Route.
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
  const zuVerteilenListe = posteingang(db);
  const bufdisListe = bufdis(db, heute);
  const tage = wochenTage(montagDerWoche(heute));
  const auslastung = wochenAuslastungFuerBufdis(db, bufdisListe, tage);
  const erstellerNamen = namenMap(allePersonen(db));

  // DIE UEBERFAELLIGKEITS- UND ZURUECKGEWIESEN-ZAHLEN SIND SYSTEMWEIT (alle Aufgaben, nicht nur die
  // eigenen) — die Koordination ist die einzige Rolle mit diesem Ueberblick (Spec §8.2).
  const alle = alleAufgaben(db);
  const ueberfaelligListe = alle.filter((a) => istUeberfaellig(a, heute));
  const zurueckgewiesenListe = alle.filter((a) => a.status === "zurueckgewiesen");

  // DIESELBE ABLEITUNG WIE `freigebenAction`/`istVertretungsfreigabe` (`_lib/zugang.ts`) — die
  // Trennung „meine"/„in Vertretung" ist keine zweite Bedingung, sondern dasselbe Praedikat, das
  // auch die Verlaufszeile "Freigegeben von X in Vertretung fuer Y" erzeugt.
  const freigabeListe = freigabenFuer(db, person, heute);
  const meineFreigabe = freigabeListe.filter((a) => !istVertretungsfreigabe(person, a));
  const vertretungFreigabe = freigabeListe.filter((a) => istVertretungsfreigabe(person, a));

  const kontext = `${zuVerteilenListe.length} zu verteilen · ${freigabeListe.length} warten auf Freigabe.`;

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
            zahl={freigabeListe.length}
            beschriftung="Freigabe offen"
            ton="ocker"
            href={freigabeListe.length > 0 ? "#freigabe" : undefined}
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
          <Kachel zahl={zurueckgewiesenListe.length} beschriftung="Zurückgewiesen" ton="achtung" />
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
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
          <div>
            <h3 style={{ ...SCHRIFT.text, fontWeight: 600, margin: `0 0 ${SPACE.xs}px` }}>Meine</h3>
            <AufgabenListe
              zeilen={meineFreigabe.map((a) => ({ aufgabe: a }))}
              heute={heute}
              leerText="Keine Freigabe offen"
            />
          </div>
          <div>
            <h3 style={{ ...SCHRIFT.text, fontWeight: 600, margin: `0 0 ${SPACE.xs}px` }}>
              In Vertretung
            </h3>
            <AufgabenListe
              zeilen={vertretungFreigabe.map((a) => ({ aufgabe: a }))}
              heute={heute}
              leerText="Keine Freigabe in Vertretung offen"
            />
          </div>
        </div>
      </section>

      <section id="ueberfaellig" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Überfällige Aufgaben</h2>
        <AufgabenListe
          zeilen={ueberfaelligListe.map((a) => ({ aufgabe: a }))}
          heute={heute}
          leerText="Keine überfälligen Aufgaben"
        />
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Link href="/personen">Personenverwaltung</Link>
        {/*
         * ARCHIV: KEIN VERWEIS INS LEERE (Spec §7) — `/archiv` entsteht erst in Aufgabe 16. Die
         * Ueberfaelligkeitsliste braucht hier keinen zweiten Fusszeilen-Verweis: sie steht bereits
         * vollstaendig oben, ueber die KPI-Kachel „Ueberfaellig" erreichbar.
         */}
      </div>
    </>
  );
}
