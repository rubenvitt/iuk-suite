import s from "./helfer.module.css";

/**
 * DER TRAEGER FUER SEITEN OHNE SITZUNG — heute genau eine: das Gate
 * (`page.tsx`, §7.2.4).
 *
 * KEIN "use client": eine Server Component, die nur `children` durchreicht.
 *
 * WARUM ER EXISTIERT und die Gate-Seite die Klasse nicht selbst schreibt: der
 * gesamte Variablensatz (`--lb-*`, `--lb-ampel-*`) haengt an `.rahmen` (§3.3,
 * §7.7.4). Schriebe jede Seite die Klasse selbst, gaebe es mehrere Stellen, an
 * denen jemand sie vergisst — und der Fehler waere STILL: eine nicht
 * aufloesbare CSS-Variable ist gueltiges CSS und faellt auf `transparent`
 * zurueck (Falle 2). Ein benannter Traeger ist EINE Stelle.
 *
 * ⚠️ DER INHALT LIEGT INNERHALB von `.rahmen`, nicht daneben. CSS-Variablen
 * vererben; ein Geschwister sieht sie nicht. Genau das prueft
 * `rahmen.test.tsx` als ENTHALTENHEIT und nicht als blosse Klassenpraesenz.
 *
 * KEIN Kopf und KEINE Tab-Leiste. Beide setzen eine Sitzung voraus; eine
 * Tab-Leiste auf dem Gate zeigte zwei Ziele, die ohne Sitzung beide sofort
 * wieder hierher zuruecklaufen.
 */
export function OeffentlicherRahmen({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.rahmen}>
      <div className={s.streifen} data-rolle="lb-streifen" />
      <div className={s.oeffentlichInhalt}>{children}</div>
    </div>
  );
}
