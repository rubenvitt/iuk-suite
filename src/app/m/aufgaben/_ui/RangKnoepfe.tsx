"use client";

import { Button } from "antd";
import { rangVerschiebenAction } from "../actions";
import { Ikone } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * AUF UND AB AUF `planRang`, INNERHALB EINES TAGES (Spec §8.5) — UND DIE GRUNDLAGE, AUF DER AUFGABE
 * 20 (ZIEHEN) AUFSETZT, OHNE SIE ZU ERSETZEN (Brief, Spec §8.5: „das ist mit der Tastatur bedienbar,
 * funktioniert auf dem Handy, und ist die Grundlage, auf der Abschnitt G aufsetzt"). Diese Insel
 * bleibt, wenn Aufgabe 20 kommt — sie ist der Weg, der auf dem Handy, mit der Tastatur und mit einem
 * Screenreader funktioniert, Ziehen ist keines davon.
 *
 * DER TAUSCH GEHOERT IN DIE ACTION (`rangVerschiebenAction`, `actions.ts`), NICHT HIERHER (Brief):
 * diese Komponente kennt nicht einmal die `id` des Nachbarn, den sie verdraengt — sie sagt nur
 * „hoch"/„runter", die Action ermittelt den Nachbarn selbst ueber `planEintraegeFuerTag`. Damit liegt
 * keine Fachlogik im Browser, und Aufgabe 20 muss sie nicht ein zweites Mal bauen.
 *
 * JEDE AKTION IST MIT DER TASTATUR ERREICHBAR UND AUSLOESBAR (Brief): zwei stinknormale
 * `<button type="submit">` in eigenen `<form>`s, keine Maus-only-Geste. `:focus-visible` mit
 * `outline-offset` deckt `aufgaben.module.css` bereits fuer `button` pauschal ab (Kommentar dort),
 * diese Datei muss dafuer nichts Eigenes bauen.
 *
 * `size="small"` STEHT HIER BEWUSST NICHT: `RangKnoepfe` sitzt in der Tagesliste
 * (`Wochenplan.tsx`, eine `<ul>`), nicht in einer antd-`Table`-Zeile wie `RoutinenTabelle.tsx`. Der
 * Vorgabewert ist bereits das richtige Mass (`docs/design/README.md`, Falle 4).
 *
 * ⚠️ DER VORGABEWERT IST SEIT DEM SHELL-UMBAU 44, NICHT 56. `aufgaben` steht im Registry auf
 * `shell: "full"`, und `FullShell` legt `ARBEITSDICHTE` (`core/theme/theme.ts`, `controlHeight: 44`)
 * ueber den Inhalt; 56/72 gilt nur noch fuer `MinimalShell` und fuer Ansichten ganz ohne Shell. An
 * DIESER Datei aendert das nichts — kein `size` ist weiterhin richtig. Wohl aber an der alten
 * Ausnahme, auf die der erste Absatz sich berief: „`size=\"small\"` in Tabellenzeilen" ist mit den
 * 56px gefallen (`docs/design/README.md`, Falle 4), und die sieben Stellen im Modul, die sie noch
 * nutzen, sind offen — siehe Befund A2 in `rebase-report.md`.
 *
 * DIE KNOEPFE TRAGEN TEXT **UND** EIN `aria-label` (Brief verlangt nur eines von beiden): der
 * sichtbare Text „Auf"/„Ab" traegt die Bedeutung fuer sehende Personen, das Icon daneben ist
 * `aria-hidden` (`ikonen.tsx`). Das `aria-label` ueberschreibt den zugaenglichen Namen zusaetzlich mit
 * dem Aufgabentitel: OHNE das waere der zugaengliche Name in einer Tagesliste mit vielen Zeilen
 * ueberall identisch „Auf"/„Ab" — eine Person, die per Screenreader von Knopf zu Knopf springt (statt
 * die umgebende Zeile mitzulesen), koennte zwei Zeilen dann nicht unterscheiden. Der sichtbare Text
 * bleibt trotzdem kurz, weil die Zeile selbst (Titel, Uhrzeit) bereits daneben steht.
 *
 * SKALA VON `istErste`/`istLetzte` — DIE AUFRUFERPFLICHT (Aufgabe 13/20 muessen sich daran halten,
 * hier nur dokumentiert, weil diese Aufgabe noch keine Seite einhaengt): beide Flags muessen aus
 * `planEintraegeFuerTag(db, personId, planDatum)` (`_db/queries.ts`) abgeleitet sein — GENAU DER
 * Liste, die `rangVerschiebenAction` selbst als Nachbarskala benutzt —, NICHT aus `tagesOrdnung`s
 * gemischter Liste (`_lib/tagesplan.ts`): die mischt Routinen ein, die keinen `planRang` und keine
 * Aktionen tragen (Spec §8.1) und wuerden die Position sonst verfaelschen. Der server-seitige
 * Grenzwurf in `rangVerschiebenAction` ist die tragende Pruefung; `disabled` hier ist nur die
 * AFFORDANZ — deaktiviert vorhanden, nicht weg, damit die Tabreihenfolge je Zeile gleich viele
 * Stopps traegt und die Position ablesbar bleibt (Brief).
 */
export function RangKnoepfe({
  aufgabeId,
  titel,
  istErste,
  istLetzte,
}: {
  aufgabeId: string;
  /** Fuer den zugaenglichen Namen der Knoepfe (s. Kopfkommentar) — der Titel der Aufgabe, nicht die
   * Uhrzeit oder ein Index, damit er in JEDER Zeile eindeutig bleibt. */
  titel: string;
  /** Bezogen auf `planEintraegeFuerTag`, NICHT auf `tagesOrdnung` (s. Kopfkommentar). */
  istErste: boolean;
  istLetzte: boolean;
}) {
  return (
    <div className={s.knopfzeile}>
      <form action={rangVerschiebenAction}>
        <input type="hidden" name="aufgabeId" value={aufgabeId} />
        <input type="hidden" name="richtung" value="hoch" />
        <Button htmlType="submit" disabled={istErste} aria-label={`„${titel}“ einen Rang nach oben verschieben`}>
          <Ikone name="rang-hoch" /> Auf
        </Button>
      </form>
      <form action={rangVerschiebenAction}>
        <input type="hidden" name="aufgabeId" value={aufgabeId} />
        <input type="hidden" name="richtung" value="runter" />
        <Button htmlType="submit" disabled={istLetzte} aria-label={`„${titel}“ einen Rang nach unten verschieben`}>
          <Ikone name="rang-runter" /> Ab
        </Button>
      </form>
    </div>
  );
}
