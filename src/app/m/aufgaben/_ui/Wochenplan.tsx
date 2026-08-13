import type { AufgabeRow, PersonRow, RoutineRow } from "../_db/schema";
import { type Budget, fmtStunden, tagesBudget } from "../_lib/anzeige";
import { fmtTagKurz, fmtUhrzeit, wochenTage } from "../_lib/datum";
import { type TagesEintrag, tagesOrdnung } from "../_lib/tagesplan";
import { SPACE } from "@/core/theme/tokens";
import { Ikone } from "./ikonen";
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
 */

interface TagesDaten {
  tag: string;
  ordnung: TagesEintrag[];
  budget: Budget;
}

export function Wochenplan({
  aufgaben,
  routinen,
  person,
  montag,
  heute,
}: {
  aufgaben: AufgabeRow[];
  routinen: RoutineRow[];
  person: PersonRow;
  /** Montag der angezeigten Woche, ISO. */
  montag: string;
  /** ISO-Tagesstring des heutigen Tages — fuer die Markierung der aktuellen Spalte. */
  heute: string;
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
          <TagSpalte key={t.tag} {...t} heute={heute} />
        ))}
      </div>
      <div className={s.tagesListe} data-rolle="tagesliste">
        {tage.map((t) => (
          <TagSpalte key={t.tag} {...t} heute={heute} />
        ))}
      </div>
    </>
  );
}

function TagSpalte({ tag, ordnung, budget, heute }: TagesDaten & { heute: string }) {
  const istHeute = tag === heute;
  return (
    <div className={s.tagSpalte} aria-current={istHeute ? "date" : undefined}>
      <div className={s.tagKopf}>{fmtTagKurz(tag)}</div>
      <BudgetZeile budget={budget} />
      {ordnung.length === 0 ? (
        <p>Nichts eingeplant.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {ordnung.map((eintrag) => (
            <li key={`${eintrag.art}-${eintrag.id}`}>
              <EintragZeile eintrag={eintrag} />
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
 */
function EintragZeile({ eintrag }: { eintrag: TagesEintrag }) {
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
    <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
      {zeit}
      <span>{eintrag.titel}</span>
    </div>
  );
}
