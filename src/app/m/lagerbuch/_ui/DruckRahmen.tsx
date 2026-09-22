import type { ReactNode } from "react";
import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import { LAGERBUCH_NAV } from "../_lib/nav";
import s from "./verwaltung.module.css";

/**
 * DER RAHMEN DES DRUCKASTS — seit DRK-406 MIT Kopfzeile und Modulnavigation am
 * Bildschirm, und ohne beides auf dem Papier.
 *
 * ⚠️ BIS DRK-406 WAR ER FAST LEER, und die Begründung dafür war richtig: alles,
 * was er zusätzlich renderte, landete auf dem Papier. Was sich geändert hat,
 * ist nicht diese Einsicht, sondern dass die Shell ihre eigenen Teile jetzt
 * ausblenden kann (`SuiteRahmen`, Prop `druck`) — `display: none` im
 * Druckkontext, und was so wegfällt, zählt für Chromiums
 * Seitengrößen-Entscheidung nicht mit (CLAUDE.md, Falle 18).
 *
 * ⚠️ WAS DAS BEHEBT: der Druckast war am BILDSCHIRM eine Sackgasse. Wer die
 * Ortskarten öffnete, hatte keine Navigation mehr — der einzige Weg zurück war
 * ein Textlink, den jede der drei Druckflächen selbst mitbringen musste (§11.7,
 * ausgeschrieben im Kopf jeder dieser Seiten). Auf einer Fläche, die man beim
 * Einrichten mehrfach hintereinander aufruft, ist das jedes Mal ein
 * Dokumentwechsel zu viel.
 *
 * ⚠️ ER BENUTZT `SuiteRahmen` DIREKT UND NICHT `Shell`/`FullShell`, und das ist
 * die tragende Zeile dieser Datei. `FullShell` hängt den schwebenden
 * RÜCKMELDEKNOPF ein (`core/rueckmeldung`, seit DRK-453; davor stand dort die
 * Formbricks-Einbindung, mit demselben Kopfkommentar aus demselben Grund).
 * Über `Shell` zu gehen wäre der bequeme Weg gewesen und hätte genau diese
 * Entscheidung im Vorbeigehen umgestoßen — ein Feedback-Knopf auf einem
 * Etikettenbogen.
 *
 * ⚠️ `Arbeitsdichte` KOMMT MIT, denn sie ist eine Eigenschaft des INHALTS, nicht
 * des Rahmens (`FullShell` schreibt das so aus). Ohne sie stünden die
 * Bedienelemente des Druck-Chromes auf 56/72 statt auf den 44px, die überall
 * sonst in der Verwaltung gelten — sichtbar größer als dieselben Knöpfe eine
 * Seite weiter.
 *
 * DIE EINE ZEILE, OHNE DIE DIE HALBE FARBENTSCHEIDUNG STILL INS LEERE LAEUFT:
 * `className={s.modul}`. Auf `.modul` liegen ALLE `--lb-*`- und
 * `--lb-ampel-*`-Variablen (§6.6.2a, §6.6.6). Ohne den Traeger loest jedes
 * `var(--lb-…)` ins Leere auf — und eine nicht aufloesbare CSS-Variable faellt
 * auf `transparent` zurueck und ist GUELTIGES CSS. Der Chip bekaeme Polster und
 * Rundung ohne Farbe, die Fokusregel verschwaende: HTTP 200, kein Log, und der
 * Scan aus §6.6.2a Punkt 4 bliebe gruen, weil er die Deklaration prueft und
 * nicht ihren Traeger.
 *
 * ⚠️ DER TRAEGER LIEGT AUSSEN, UM DIE SHELL HERUM. Innen — also nur um den
 * Inhalt — trügen Kopfzeile und Seitenleiste die Variablen nicht, und das
 * fiele erst im Dunkelmodus auf.
 *
 * KEIN "use client": der Rahmen ist eine Server Component und traegt deshalb
 * keinen Compound-Zugriff auf antd (Falle 1) und keinen Icon-Import (Falle 7).
 */
export function DruckRahmen({ children }: { children: ReactNode }) {
  return (
    <div className={s.modul}>
      <SuiteRahmen moduleKey="lagerbuch" nav={LAGERBUCH_NAV} druck>
        <Arbeitsdichte>{children}</Arbeitsdichte>
      </SuiteRahmen>
    </div>
  );
}
