import type { ReactNode } from "react";
import "./files-public.css";

/**
 * DAS CHROME-LOSE GERUEST DER OEFFENTLICHEN ANSICHTEN — Fahne, Blatt, Kopfzeile.
 *
 * DREI Aufrufer, und der Ablageort in `_ui/` folgt daraus:
 *
 * 1. `(oeffentlich-share)/layout.tsx` — `/s/<id>`
 * 2. `(oeffentlich-inbox)/layout.tsx` — `/u/<token>`, `/u`
 * 3. der Rollen-Verteiler `page.tsx` (Spec §3.5) im Zweig `inbox` — er liegt
 *    AUSSERHALB aller Route-Groups (er muss beide Rollen bedienen), also greift
 *    das Inbox-Layout fuer ihn nicht und er bringt den Rahmen selbst mit. Genau
 *    daher stammt auch die Begruendung fuer die `--fp-*`-Trennung im Kopf von
 *    `files-public.css`: `page.tsx` laedt beide Stylesheets.
 *
 * Dreimal dasselbe Markup waere der Anfang der Drift — dann tragen drei Dateien
 * denselben Kopf und nur eine wird gepflegt.
 *
 * KEINE SHELL, KEIN antd, KEIN APP-SWITCHER (Spec §2.7, letzter Satz). Drei
 * Gruende, die zusammenfallen:
 *
 * 1. Diese Seiten sind anonym und login-frei. Ein App-Switcher zeigte auf
 *    Module, die die aufrufende Person nicht betreten darf — jeder Eintrag eine
 *    Sackgasse (Prueffrage aus `docs/design/README.md:236-242`).
 * 2. Ohne antd auf der Route existiert die RSC-Compound-Falle hier strukturell
 *    nicht: `Typography.Title` oder `Form.Item` in einer Server Component ergibt
 *    HTTP 500, und weder `pnpm build` noch Vitest finden das (Falle 1).
 * 3. Das Route-JS bleibt klein — die Ansicht wird auf einem fremden Handy
 *    geoeffnet, oft ueber Mobilfunk.
 *
 * KEIN Request-Zustand hier: keine `cookies()`, kein `auth()`, kein `await`. Die
 * Rollenzusicherung (`requireRolle`) gehoert in die beiden Layouts, die diesen
 * Rahmen benutzen — hier waere sie zweimal derselbe Riegel an der falschen
 * Stelle. Nebeneffekt, der die Zusagen ueberhaupt pruefbar macht: der Rahmen ist
 * synchron und damit aus einem Vitest heraus montierbar.
 *
 * Das Stylesheet haengt an DIESER Datei und nicht an den Layouts: ein globales
 * Stylesheet kommt nur an, wo es importiert wird, und das erste Layout, das den
 * Import vergisst, liefert eine unformatierte oeffentliche Seite aus. Hier gibt
 * es genau eine Stelle, die es mitbringt.
 */
export function OeffentlicherRahmen({
  kicker,
  children,
}: {
  /**
   * Die Zeile ueber der Ueberschrift: „Dateifreigabe" auf `/s/<id>`,
   * „Dateiabgabe" auf `/u/<token>` UND im Inbox-Zweig des Verteilers `page.tsx`.
   *
   * PFLICHT und bewusst OHNE Vorbelegung — die Pfadraeume sagen Verschiedenes,
   * und eine Vorbelegung waere die stille Variante davon, dass die Abgabeseite
   * sich als Freigabe ausgibt. Preis, der hier stehen soll statt zu ueberraschen:
   * die Skizze in Spec §3.5 (`<OeffentlicherRahmen><InboxStart /></…>`) ist
   * deshalb nicht woertlich uebernehmbar; der Verteiler muss `kicker` setzen und
   * bekommt sonst einen TypeScript-Fehler — laut, nicht still.
   */
  kicker: string;
  children: ReactNode;
}) {
  return (
    <div className="fp-seite">
      {/* Die 3px-Fahne ist reine Marke, kein Inhalt — eine der genau ZWEI
          Stellen mit DRK-Rot, und deshalb `aria-hidden`. */}
      <div className="fp-fahne" aria-hidden="true" />
      <div className="fp-blatt">
        <header className="fp-kopf">
          <p className="fp-kicker">
            {kicker}
            <span className="fp-wortzeichen">DRK</span>
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
