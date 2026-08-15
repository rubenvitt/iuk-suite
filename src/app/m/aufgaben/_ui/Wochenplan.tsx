import Link from "next/link";
import type { AufgabeRow, PersonRow, RoutineRow } from "../_db/schema";
import { type Budget, fmtStunden, tagesBudget } from "../_lib/anzeige";
import { fmtTagKurz, fmtUhrzeit, wochenTage } from "../_lib/datum";
import { type TagesEintrag, tagesOrdnung } from "../_lib/tagesplan";
import { SPACE } from "@/core/theme/tokens";
import { Ikone } from "./ikonen";
import { RangKnoepfe } from "./RangKnoepfe";
import { ZiehBereich } from "./ZiehBereich";
import s from "./aufgaben.module.css";

/*
 * FUENF TAGESSPALTEN MO–FR (Spec §8.1). KEIN `"use client"` HIER — diese Datei bleibt Server
 * Component und liefert nur Markup samt Daten-Attributen; das ZIEHEN SELBST (Aufgabe 20, ab 768px)
 * sitzt in der Client-Insel `ZiehBereich.tsx`, die NUR die desktop-`.wochenGitter`-Ausprägung
 * umschliesst (`mobilTag` bleibt bei der Tagesliste, Ziehen existiert unter 768px nicht, Spec §8.5/
 * §9.6). Diese Datei rechnet fuer das Ziehen NICHTS zusaetzlich: `data-tag` (TagSpalte) und
 * `data-aufgabe-id`/`data-plan-index`/`data-plan-uhrzeit` (EintragZeile, s. dort) sind reine
 * Attribute, `ZiehBereich.tsx` liest sie nur. KEIN `Grid.useBreakpoint` — in Server Components
 * verboten und zeigt beim ersten Render die falsche Variante (Spec §9.6).
 *
 * BEIDE AUSPRAEGUNGEN RENDERN INS HTML, CSS BLENDET EINE AUS: `.wochenGitter`
 * (Desktop) und `.tagesListe` (Mobil) tragen `data-rolle`, damit ein Test ohne
 * Medienabfrage-Auswertung (jsdom wertet keine aus) beide finden kann. Die
 * MEDIENABFRAGE, die eine davon ausblendet, steht in `aufgaben.module.css`
 * und wird dort bewacht (`aufgaben-css.test.ts`).
 *
 * EINMAL GERECHNET, ZWEIMAL GERENDERT: `tagesOrdnung` und `tagesBudget`
 * laufen HIER EINMAL JE TAG (`tage` unten), und beide Ausprägungen bekommen
 * exakt dasselbe Ergebnisobjekt. Zwei getrennte Aufrufe — einer je
 * Ausprägung — liefen auseinander, sobald sich `aufgaben`/`routinen`
 * zwischen den beiden Aufrufen aendern koennten, und zwar GENAU DANN, wenn
 * niemand hinsieht (Brief). `Wochenplan.test.tsx` haelt das mit einer
 * Aufrufzaehlung fest, nicht nur mit einem Vergleich der beiden Ausgaben —
 * zwei reine Funktionen liefern bei gleichen Eingaben ohnehin dasselbe
 * Ergebnis, das allein bewiese also nicht, dass nur EINMAL gerechnet wurde.
 *
 * `montag`/`heute` KOMMEN ALS ARGUMENTE HEREIN, NIE AUS `new Date()` HIER —
 * die Zeitzone lebt ausschliesslich in `_lib/datum.ts`, und ein Test mit
 * fester Uhr braucht genau diesen Einstiegspunkt (Brief).
 *
 * AUFGABE 13 ERGAENZT ZWEI OPTIONALE FAEHIGKEITEN, BEIDE STANDARDMAESSIG AUS
 * (bestehende Aufrufer ohne die neuen Props verhalten sich unveraendert):
 *
 *  - `mobilTag`: der TAGESWAEHLER (Spec §9.6) blendet in der MOBILEN Ausprägung
 *    (`.tagesListe`) alle Tage AUSSER dem ausgewaehlten aus (inline `display:
 *    none` je Spalte) — server-berechnet aus dem `tag`-Suchparameter
 *    (`_lib/datum.ts`s `ausgewaehlterTag`), keine Client-Filterung noetig. Die
 *    DESKTOP-Ausprägung (`.wochenGitter`) bleibt davon unberuehrt und zeigt
 *    immer alle fuenf Spalten — der Tageswaehler existiert nur mobil.
 *  - `zeigeAktionen`/`rang`: nur wenn `darfPlanAendern` fuer die angezeigte
 *    Person wahr ist (Aufrufer entscheidet, diese Komponente prueft es nicht
 *    selbst), bekommt jeder AUFGABEN-Eintrag `RangKnoepfe` (Spec §8.5) —
 *    Routineneintraege NIE (Spec §8.1: "Routineblöcke ... tragen keine
 *    Aktionen"). `rang` MUSS aus `_db/queries.ts`s `rangGrenzen` stammen
 *    (dieselbe Skala wie `RangKnoepfe.tsx`s Kopfkommentar verlangt), nicht aus
 *    `tagesOrdnung`s gemischter Liste. Fehlt ein Eintrag in `rang` (sollte bei
 *    korrekter Aufrufung nicht vorkommen), gilt er defensiv als Rand auf
 *    beiden Seiten — lieber ein Knopf zu viel deaktiviert als ein serverseitig
 *    ohnehin abgelehnter Klick.
 */

interface TagesDaten {
  tag: string;
  ordnung: TagesEintrag[];
  budget: Budget;
}

export interface RangGrenze {
  istErste: boolean;
  istLetzte: boolean;
  /**
   * Aufgabe 20: die Position dieser Aufgabe auf der `planEintraegeFuerTag`-Skala (dieselbe, aus der
   * `istErste`/`istLetzte` schon stammen) — `ZiehBereich.tsx` bildet damit eine Ablageposition auf
   * eine Anzahl `rangVerschiebenAction`-Schritte ab. `-1` ist der defensive Randwert, wenn ein
   * Eintrag in `rang` fehlt (s. `TagSpalte` unten): ein unbekannter Index macht die Zeile NICHT
   * ziehbar, statt mit einem geratenen Wert weiterzurechnen.
   */
  index: number;
}

export function Wochenplan({
  aufgaben,
  routinen,
  person,
  montag,
  heute,
  mobilTag,
  zeigeAktionen,
  rang,
}: {
  aufgaben: AufgabeRow[];
  routinen: RoutineRow[];
  person: PersonRow;
  /** Montag der angezeigten Woche, ISO. */
  montag: string;
  /** ISO-Tagesstring des heutigen Tages — fuer die Markierung der aktuellen Spalte. */
  heute: string;
  /** Nur mobil (`.tagesListe`) wirksam: die uebrigen vier Tage werden ausgeblendet, nicht entfernt. */
  mobilTag?: string;
  /** Nur wahr, wenn `darfPlanAendern` fuer `person` zutrifft — der Aufrufer entscheidet. */
  zeigeAktionen?: boolean;
  /** Aus `_db/queries.ts`s `rangGrenzen`, NICHT aus `tagesOrdnung` abgeleitet. */
  rang?: Record<string, RangGrenze>;
}) {
  const tage: TagesDaten[] = wochenTage(montag).map((tag) => ({
    tag,
    ordnung: tagesOrdnung(aufgaben, routinen, person.id, tag),
    budget: tagesBudget(aufgaben, routinen, person, tag),
  }));

  return (
    <>
      {/*
       * `ZiehBereich` IST `.wochenGitter` SELBST (s. Kopfkommentar dort) — nur diese Ausprägung
       * bekommt `ziehbar`: unter 768px ist `.wochenGitter` per CSS unsichtbar, und Ziehen existiert
       * dort nicht (Spec §9.6), deshalb bleibt die `.tagesListe`-Ausprägung unten unveraendert ohne
       * `ziehbar`.
       */}
      <ZiehBereich interaktiv={zeigeAktionen === true}>
        {tage.map((t) => (
          <TagSpalte
            key={t.tag}
            {...t}
            heute={heute}
            zeigeAktionen={zeigeAktionen}
            rang={rang}
            ziehbar
          />
        ))}
      </ZiehBereich>
      <div className={s.tagesListe} data-rolle="tagesliste">
        {tage.map((t) => (
          <TagSpalte
            key={t.tag}
            {...t}
            heute={heute}
            versteckt={mobilTag !== undefined && mobilTag !== t.tag}
            zeigeAktionen={zeigeAktionen}
            rang={rang}
          />
        ))}
      </div>
    </>
  );
}

function TagSpalte({
  tag,
  ordnung,
  budget,
  heute,
  versteckt,
  zeigeAktionen,
  rang,
  ziehbar,
}: TagesDaten & {
  heute: string;
  versteckt?: boolean;
  zeigeAktionen?: boolean;
  rang?: Record<string, RangGrenze>;
  /** NUR bei der Desktop-(`.wochenGitter`)-Ausprägung gesetzt — s. Kopfkommentar `ZiehBereich.tsx`. */
  ziehbar?: boolean;
}) {
  const istHeute = tag === heute;
  return (
    <div
      className={s.tagSpalte}
      aria-current={istHeute ? "date" : undefined}
      style={versteckt ? { display: "none" } : undefined}
      // `data-tag` IST DAS ZIEL-ATTRIBUT, DAS `ZiehBereich.tsx` per `closest()` findet (Aufgabe 20)
      // — nur gesetzt, wo Ziehen ueberhaupt existiert (`ziehbar`), s. Kopfkommentar dort.
      data-tag={ziehbar ? tag : undefined}
    >
      <div className={s.tagKopf}>{fmtTagKurz(tag)}</div>
      <BudgetZeile budget={budget} />
      {ordnung.length === 0 ? (
        <p>Nichts eingeplant.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {ordnung.map((eintrag) => (
            <li key={`${eintrag.art}-${eintrag.id}`}>
              <EintragZeile
                eintrag={eintrag}
                aktionen={
                  zeigeAktionen && eintrag.art === "aufgabe"
                    ? (rang?.[eintrag.id] ?? { istErste: true, istLetzte: true, index: -1 })
                    : undefined
                }
                ziehbar={ziehbar}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Auslastung ist NEUTRAL/GRAPHIT, nie Statusfarbe (Spec §9.3) — ein
 * ueberbuchter Tag bekommt Kante PLUS Text, keinen roten Balken: Menge ist
 * keine Statusaussage.
 *
 * DER ZUSATZ „— überbucht" STEHT IN EINER EIGENEN SPANNE, DAS ZAHLENPAAR NICHT (Nach-Rebase-Runde,
 * Befund B): `.budget` traegt `white-space: nowrap`, damit „9,17 / 7,80 Std." als EIN Wert
 * zusammenbleibt — mit dem Zusatz war die Zeile gemessene 167px breit und damit breiter als jede
 * Tagesspalte in jeder Fensterbreite. `.budgetHinweis` gibt genau dem Anhang seinen Umbruch zurueck,
 * dem Zahlenpaar nicht. DAS FUEHRENDE LEERZEICHEN MUSS INNERHALB der Spanne stehen (Begruendung an
 * `.budgetHinweis` in `aufgaben.module.css`); `textContent` bleibt dadurch unveraendert, die
 * bestehenden `toContain`-Zusicherungen gelten weiter.
 */
function BudgetZeile({ budget }: { budget: Budget }) {
  return (
    <div className={budget.ueberbucht ? `${s.budget} ${s.budgetUeberbucht}` : s.budget}>
      {`${fmtStunden(budget.verplantMinuten)} / ${fmtStunden(budget.sollMinuten)} Std.`}
      {budget.ueberbucht ? <span className={s.budgetHinweis}>{" — überbucht"}</span> : null}
    </div>
  );
}

/**
 * Feste Uhrzeiten stehen in `.ankerSpur` und zeigen sie; freie Eintraege
 * tragen `.ohneAnker` und zeigen KEINE Uhrzeit (Spec §8.1) — sie haben keine.
 *
 * ROUTINEBLOECKE SIND SICHTBAR ALS SOLCHE MARKIERT (`.routineZeile`, Icon
 * `routine`) UND TRAGEN KEINE AKTIONEN: eine Routine ist kein
 * Aufgabendatensatz, sie hat keinen Status, keinen Nachweis, keine
 * Freigabe (Spec §8.1) — deshalb bekommt nur `art === "routine"` die eigene
 * Klasse und das Icon; eine Aufgaben-Zeile bleibt schmuckloses Layout, damit
 * die Markierung tatsaechlich EINE Bedeutung tragen bleibt statt fuer beide
 * Arten gleich auszusehen.
 *
 * `aktionen` (eine `RangGrenze`) ist NUR fuer `art === "aufgabe"` gesetzt —
 * eine Routine bekommt sie strukturell nie (Spec §8.1: "Routineblöcke ...
 * tragen keine Aktionen"), der Aufrufer (`TagSpalte`) filtert das bereits.
 * Aus demselben Grund bekommt auch nur `art === "aufgabe"` je einen Ziehgriff — Routinen sind nie
 * ziehbar, strukturell, nicht per Sonderfall-Abfrage hier (Spec §8.1, Brief Aufgabe 20).
 *
 * DER AUFGABENTITEL IST SEIT AUFGABE 20 EIN LINK AUF `/a/<id>` (Fund aus Aufgabe 19: der Wochenplan
 * war bis hierhin die einzige Modulansicht ohne Weg zur Detailseite, anders als
 * `AufgabenListe.tsx`). `draggable={false}` DARAUF IST BEWUSST (Brief: „ein Link und ein Ziehgriff
 * auf demselben Element vertragen sich schlecht“) — ein `<a>` ist in Browsern von sich aus
 * ziehbar (Lesezeichen-Ziehgeste); ohne diese Zeile wuerde ein an der LINK-Flaeche begonnener Zug
 * die native Link-Zieh-Geste ausloesen (sichtbar als Ziel-Ghost, aber wirkungslos, weil
 * `ZiehBereich.tsx`s `onDragStart` nur auf `[data-aufgabe-id]` reagiert — s. dort) statt sauber
 * INS LEERE zu laufen. Die eigentliche Ziehflaeche ist der SEPARATE Ziehgriff (`⠿`) davor, der
 * selbst kein Link ist und deshalb mit dem Titel nicht kollidiert — GENAU DIE im Brief vorgeschlagene
 * Loesung („ein eigener Ziehgriff neben dem Titel“), im ECHTEN BROWSER geprueft (kein Unit-Test kann
 * eine versehentliche Navigation beim Ziehen zeigen, Brief).
 *
 * DER ZIEHGRIFF SELBST TRAEGT KEIN `aufgaben.module.css`-KLASSE: `cursor`/`data-*` stehen inline,
 * damit diese Aufgabe keine neue Regel und keine zweite Medienabfrage in die Datei schuldet (Bericht
 * begruendet das ausfuehrlich) — ein reines Textzeichen (`⠿`, U+283F), `aria-hidden`, weil es keine
 * eigene, von der Zeile losgeloeste Bedeutung traegt und NICHT fokussierbar ist (Ziehen ist keine
 * tastaturbediente Aktion, `RangKnoepfe` bleibt dafuer der Weg, Spec §8.5).
 */
function EintragZeile({
  eintrag,
  aktionen,
  ziehbar,
}: {
  eintrag: TagesEintrag;
  aktionen?: RangGrenze;
  ziehbar?: boolean;
}) {
  const zeit = eintrag.zeigtUhrzeit ? (
    <span className={s.ankerSpur}>{fmtUhrzeit(eintrag.minuten)}</span>
  ) : (
    <span className={s.ohneAnker}>ohne Uhrzeit</span>
  );

  if (eintrag.art === "routine") {
    return (
      <div className={s.routineZeile}>
        {zeit}
        <Ikone name="routine" />
        <span>{eintrag.titel}</span>
      </div>
    );
  }

  // Nur ziehbar, wenn die Desktop-Ausprägung es erlaubt UND ein echter Rang-Index vorliegt
  // (`index: -1` ist der defensive Randwert aus `TagSpalte`, s. `RangGrenze`-Kommentar) — ein
  // unbekannter Index macht die Zeile lieber nicht ziehbar, statt mit einer geratenen Position
  // weiterzurechnen.
  const zeigeZiehgriff = ziehbar === true && aktionen !== undefined && aktionen.index >= 0;

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: SPACE.sm }}>
      {zeit}
      {zeigeZiehgriff ? (
        <span
          draggable
          data-aufgabe-id={eintrag.id}
          data-plan-index={aktionen!.index}
          data-plan-uhrzeit={eintrag.aufgabe?.planUhrzeit ?? ""}
          aria-hidden="true"
          style={{ cursor: "grab" }}
        >
          ⠿
        </span>
      ) : null}
      <Link href={`/a/${eintrag.id}`} draggable={false}>
        {eintrag.titel}
      </Link>
      {aktionen ? (
        <RangKnoepfe
          aufgabeId={eintrag.id}
          titel={eintrag.titel}
          istErste={aktionen.istErste}
          istLetzte={aktionen.istLetzte}
        />
      ) : null}
    </div>
  );
}
