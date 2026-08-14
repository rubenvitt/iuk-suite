import type { AufgabeRow, PersonRow, RoutineRow } from "../_db/schema";
import { type Budget, fmtStunden, tagesBudget } from "../_lib/anzeige";
import { fmtTagKurz, fmtUhrzeit, wochenTage } from "../_lib/datum";
import { type TagesEintrag, tagesOrdnung } from "../_lib/tagesplan";
import { SPACE } from "@/core/theme/tokens";
import { Ikone } from "./ikonen";
import { RangKnoepfe } from "./RangKnoepfe";
import s from "./aufgaben.module.css";

/*
 * FUENF TAGESSPALTEN MO–FR (Spec §8.1). KEIN "use client" — die Interaktion
 * (Verschieben, Reihenfolge aendern) kommt in Aufgabe 12/20; hier wird nur
 * dargestellt. KEIN `Grid.useBreakpoint` — in Server Components verboten und
 * zeigt beim ersten Render die falsche Variante (Spec §9.6).
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
      <div className={s.wochenGitter} data-rolle="wochengitter">
        {tage.map((t) => (
          <TagSpalte key={t.tag} {...t} heute={heute} zeigeAktionen={zeigeAktionen} rang={rang} />
        ))}
      </div>
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
}: TagesDaten & {
  heute: string;
  versteckt?: boolean;
  zeigeAktionen?: boolean;
  rang?: Record<string, RangGrenze>;
}) {
  const istHeute = tag === heute;
  return (
    <div
      className={s.tagSpalte}
      aria-current={istHeute ? "date" : undefined}
      style={versteckt ? { display: "none" } : undefined}
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
                  zeigeAktionen && eintrag.art === "aufgabe" ? (rang?.[eintrag.id] ?? { istErste: true, istLetzte: true }) : undefined
                }
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
 */
function BudgetZeile({ budget }: { budget: Budget }) {
  const text = `${fmtStunden(budget.verplantMinuten)} / ${fmtStunden(budget.sollMinuten)} Std.${
    budget.ueberbucht ? " — überbucht" : ""
  }`;
  return <div className={budget.ueberbucht ? `${s.budget} ${s.budgetUeberbucht}` : s.budget}>{text}</div>;
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
 */
function EintragZeile({ eintrag, aktionen }: { eintrag: TagesEintrag; aktionen?: RangGrenze }) {
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

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: SPACE.sm }}>
      {zeit}
      <span>{eintrag.titel}</span>
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
