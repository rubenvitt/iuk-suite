import type { ChipTon, PrioritaetForm } from "../_lib/anzeige";
import { PRIORITAET_FORM, PRIORITAET_TEXT, STATUS_TEXT, STATUS_TON } from "../_lib/anzeige";
import type { Prioritaet, Status } from "../_db/schema";
import s from "./aufgaben.module.css";

/*
 * ZUSTANDS- UND PRIORITAETS-CHIP — eigenes Markup, KEIN antd-`Tag` (Spec §9.1,
 * §9.2). Drei Gruende, jeder reicht allein:
 *
 *  1. `Tag color="error"` griffe auf `colorError` zu — also auf Suite-Rot,
 *     denn `colorError === colorPrimary === #c8000f`. Ein Zustands- oder
 *     Prioritaets-Chip in dieser Farbe laese sich als Primaerknopf lesen.
 *  2. Der Fehler waere nicht sichtbar kaputt, sondern nur FALSCH: `Tag
 *     color="error"` ist gueltiges antd, die Seite rendert, und am Bildschirm
 *     sieht nichts defekt aus. Kein Gate faengt das.
 *  3. `Tag.CheckableTag` ist ein Compound-Zugriff (Falle 1) und in einer
 *     Server Component verboten — die Versuchung entsteht spaetestens bei
 *     den Filtern (Aufgabe 7+), und wer `Tag` als Baustein etabliert, macht
 *     den Griff dorthin wahrscheinlicher.
 *
 * ZWEI KOMPONENTEN, NICHT EINE MIT „kind“-Flag: `StatusChip` und
 * `PrioritaetChip` haben an der Aufrufstelle je EINEN Wert (einen Status oder
 * eine Prioritaet), nie beide zugleich. Eine gemeinsame Komponente bräuchte
 * ein drittes Feld nur zur Unterscheidung der beiden Faelle und wäre an
 * jeder Aufrufstelle ein Feld mehr, das man falsch setzen kann. Beide teilen
 * sich `KLASSEN_ZEILE` als einzige Stelle, die Basis- und Farbklasse
 * zusammensetzt.
 *
 * TON-/FORMKLASSEN ALS `Record` UEBER DER GESCHLOSSENEN UNION, nie als
 * Indexzugriff auf das CSS-Modul (`s[ton]`): der ergibt bei einem Tippfehler
 * `undefined` als Klasse — das Element bekaeme Polster und Rundung, aber
 * KEINE FARBE, und kein Test, der nur auf den Text prueft, saehe das.
 *
 * JEDER CHIP TRAEGT DAS WORT (Spec §9.1: „Bedeutung nie allein ueber
 * Farbe"). Kein Icon-Import: dieser Baustein bleibt Server-Component-faehig
 * ohne jede Compound- oder Fremdpaket-Beruehrung.
 *
 * `.prioText` BEKOMMT KEINE CHIP-FORM (Spec §9.1, „nur Text, gedaempft“ —
 * die schwaechste Stufe der Rangskala): die Basisklasse `.chip` (Polster,
 * Pillenform) entfaellt fuer diese eine Form, waehrend `.prioGefuellt` und
 * `.prioKontur` sie tragen. `.prioKontur`/`.prioText` liegen auf
 * `--auf-papier` (dem Kartenhintergrund) — dort ist ihr AA-Kontrast in
 * `aufgaben-css.test.ts` gemessen; eine andere Traegerflaeche braeuchte eine
 * neue Messung.
 */

const TON_KLASSE: Record<ChipTon, string> = {
  grau: s.tonGrau,
  stahl: s.tonStahl,
  ocker: s.tonOcker,
  ok: s.tonOk,
  achtung: s.tonAchtung,
};

const FORM_KLASSE: Record<PrioritaetForm, string> = {
  gefuellt: s.prioGefuellt,
  kontur: s.prioKontur,
  text: s.prioText,
};

/** Nur `text` bleibt formlos (Spec §9.1) — die einzige Stelle, die das entscheidet. */
function klassenZeile(form: PrioritaetForm): string {
  return form === "text" ? FORM_KLASSE[form] : `${s.chip} ${FORM_KLASSE[form]}`;
}

export function StatusChip({ status }: { status: Status }) {
  return <span className={`${s.chip} ${TON_KLASSE[STATUS_TON[status]]}`}>{STATUS_TEXT[status]}</span>;
}

export function PrioritaetChip({ prioritaet }: { prioritaet: Prioritaet }) {
  return (
    <span className={klassenZeile(PRIORITAET_FORM[prioritaet])}>{PRIORITAET_TEXT[prioritaet]}</span>
  );
}
