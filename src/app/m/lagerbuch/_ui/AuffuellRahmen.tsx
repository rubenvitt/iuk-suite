import Link from "next/link";
import { Ikone } from "./ikonen";
import s from "./helfer.module.css";

/**
 * DER TRAEGER DER AUFFUELLANSICHT — DRK-313.
 *
 * KEIN "use client": eine Server Component. Sie hat keine Insel; die einzige
 * liegt im Inhalt (`_ui/Auffuellen.tsx`).
 *
 * ⚠️ WARUM NICHT `HelferRahmen` MIT EINEM DRITTEN TAB, obwohl die Flaeche
 * darunter im Entnahme-Stil gebaut ist. Die Tab-Leiste dort heisst woertlich
 * „Helfer-Bereiche" und fuehrt an die zwei Orte, die ein KAERTCHEN erreicht:
 * Entnahme und Check. Das Auffuellen erreicht ein Kaertchen nie — es ist eine
 * Handlung der GF, und ein dritter Tab daneben haette drei Kosten:
 *
 *  1. Er waere fuer die grosse Mehrheit der Sitzungen ein Ziel, das mit 404
 *    antwortet, oder er braeuchte eine Bedingung, die jede der vier
 *    aufrufenden Seiten selbst richtig ausrechnen muss. Vier Stellen, an denen
 *    ein `false` zu viel eine Sackgasse baut und ein `true` zu viel eine Tuer
 *    zeigt, die es nicht gibt.
 *  2. Er machte die Aktivmarkierung (`aktiv`) und damit jede der vierzehn
 *    Zusicherungen an `HelferRahmen` zu einer Aussage ueber drei statt zwei
 *    Zustaende — fuer einen Zweig, den der Helfer-Ast gar nicht hat.
 *  3. Die Leiste saesse auf einer Flaeche, auf der es nichts zu wechseln gibt.
 *
 * Der Weg HIERHER ist die Modulnavigation der Verwaltung („Bestand →
 * Auffuellen", `_lib/nav.ts`) — dieselbe Bauform, mit der DRK-305 „Entnahme"
 * und „Check durchfuehren" erreichbar gemacht hat. Der Weg ZURUECK steht im
 * Kopf, sonst waere der Klick eine Sackgasse.
 *
 * ⚠️ DER VARIABLENSATZ HAENGT AN `.rahmen` (§3.3, §7.7.4), und der Inhalt liegt
 * INNERHALB, nicht daneben: CSS-Variablen vererben, ein Geschwister sieht sie
 * nicht. Eine nicht aufloesbare Variable ist gueltiges CSS und faellt still auf
 * `transparent` zurueck (Falle 2).
 *
 * ⚠️ KEINE RESTZEIT UND KEIN „BEENDEN". Beide setzen eine Kaertchen-Sitzung
 * voraus; hier gibt es nur angemeldete Personen (der Riegel ist
 * `requireLagerbuchAdmin`). Ein „Beenden" raeumte ein Cookie, das es auf diesem
 * Weg nicht gibt, und setzte die Person wortlos aufs Gate, wo ein Code verlangt
 * wird, den sie nicht hat — derselbe Fehlschluss, den DRK-305 im `HelferRahmen`
 * behoben hat.
 */
export function AuffuellRahmen({
  etikett,
  children,
}: {
  /** „Angemeldet: …" — der einzige Satz, der sagt, wer hier gerade bucht.
   *  Aus `sitzungsEtikett`, damit beide Flaechen denselben Satz bilden. */
  etikett: string;
  children: React.ReactNode;
}) {
  return (
    <div className={s.rahmen}>
      <div className={s.streifen} data-rolle="lb-streifen" />

      <header className={s.kopf}>
        <div>
          <div className={s.marke}>
            LAGER<span className={s.markeAkzent}>BUCH</span>
          </div>
          <div className={s.etikett}>{etikett}</div>
        </div>

        {/*
          EIN ECHTER LINK, kein Knopf: die Verwaltung liegt auf demselben Host,
          aber ausserhalb dieses Rahmens — ein Dokumentwechsel ist hier das
          Richtige und liefert nebenbei frische Daten. AEUSSERER Pfad (Falle
          49): ein innerer `/m/lagerbuch/verwaltung` wuerde auf dem Modul-Host
          doppelt praefixiert.
        */}
        <Link className={s.beenden} href="/verwaltung">
          <Ikone name="pfeil-rechts" groesse={14} />
          Zur Verwaltung
        </Link>
      </header>

      <main className={s.inhalt}>{children}</main>
    </div>
  );
}
