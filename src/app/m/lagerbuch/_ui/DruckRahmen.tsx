import type { ReactNode } from "react";
import s from "./verwaltung.module.css";

/**
 * DER RAHMEN DES DRUCKASTS — ohne Shell, ohne Modulnavigation, ohne App-Switcher
 * (§2.9, §6.1.2). Er ist absichtlich fast leer: alles, was er zusaetzlich
 * renderte, landete auf dem Papier.
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
 * WARUM AUCH DER DRUCKAST IHN BRAUCHT, obwohl er keinen Chip rendert: die
 * Fokusregel und der Rueckweg aus §6.8.4 gelten unter BEIDEN Group-Layouts.
 * Die einzige Aussage, die das haelt, ist ein echter Abruf je Modus (§6.6.7).
 *
 * §6.8.4 nannte den Rueckweg „Brotkrume"; die Komponente dieses Namens ist am
 * 13.08.2026 geloescht worden. HIER FEHLT DESHALB NICHTS: dieser Rahmen traegt
 * konstruktionsbedingt keine Navigation, und die Seiten darin bringen ihren
 * Weg zurueck selbst mit — `EtikettenChrome.tsx:50` im Normalfall,
 * `etiketten/page.tsx:59` und `:88` in den beiden leeren Zustaenden.
 *
 * KEIN "use client": der Rahmen ist eine Server Component und darf deshalb
 * keinen Compound-Zugriff auf antd und keinen Icon-Import tragen. Er traegt
 * ueberhaupt kein antd.
 */
export function DruckRahmen({ children }: { children: ReactNode }) {
  return <div className={s.modul}>{children}</div>;
}
