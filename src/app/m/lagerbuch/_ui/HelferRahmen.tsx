import Link from "next/link";
import { uhrzeit } from "../_lib/zeit";
import { beenden } from "../_actions/sitzung";
import { Restzeit } from "./Restzeit";
import s from "./helfer.module.css";

/**
 * DER RAHMEN DES HELFER-ZWEIGS — §7.8.2.
 *
 * KEIN "use client": eine Server Component. Die einzige Insel darin ist
 * `_ui/Restzeit.tsx` (T67).
 *
 * ⚠️ DIE AKTIVMARKIERUNG IST EIN PROP (Falle 63). `HelferFrame.tsx:8-9`
 * steuert die zwei Tabs heute mit `pathname.startsWith("/helfer/check")`. Die
 * Suite hat gemessen, dass `usePathname()` den AEUSSEREN Pfad liefert
 * (`core/shell/SuiteNav.tsx:88-95`) — auf dem regulaeren Weg funktioniert das
 * also weiter. WAS BRICHT, IST DER ZWEITE WEG: `core/routing.ts:54-67`
 * behandelt bereits praefixierte Pfade eigens und schliesst `/m/*` bewusst
 * NICHT aus dem Matcher aus. `/m/lagerbuch/helfer/check` rendert also, und dort
 * beginnt der Pfad nicht mit `/helfer/check` — die Tab-Leiste markierte
 * dauerhaft „Entnahme", AUCH IM FAHRZEUG-CHECK.
 *
 * Und die Messung hat zwei Raender: sie steht gegen Next 16.2.6, die Suite
 * faehrt 16.2.11; und sie entstand per `curl` gegen den Dev-Server auf
 * Wildcard-DNS, ohne Reverse-Proxy. DER SERVER-PROP MACHT DIE FRAGE
 * GEGENSTANDSLOS — der Server kennt das Segment ohnehin.
 *
 * ⚠️ DIE DREI ANGABEN SIND PFLICHT-PROPS, KEINE OPTIONALS. Ein Layout kann
 * einer Seite keine Props reichen; deshalb wandert der Rahmen aus dem Layout in
 * die drei Seiten, die ihn brauchen, und die beiden Helfer-Seiten rufen
 * `requireHelferSitzung(getDb())` selbst noch einmal (§7.4.3 — dasselbe
 * gecachte Handle, derselbe Primaerschluessel-Lookup). `a/[artikelId]/page.tsx`
 * hat den Wert aus seiner eigenen Weiche, und SEIN ADMIN-ZWEIG RENDERT GAR
 * NICHT, sondern leitet um — nur deshalb duerfen beide Angaben Pflicht sein.
 *
 * ⚠️ DIE `href` SIND AEUSSERE PFADE und bleiben es. Innere
 * (`/m/lagerbuch/helfer/check`) waeren die naheliegende und falsche
 * Vereinheitlichung mit Falle 49 — sie wuerden auf dem aeusseren Host doppelt
 * praefixiert.
 *
 * ⚠️ DIE TAB-LEISTE IST EIN `<nav>`, obwohl §2 Punkt 3 dem Wortlaut nach jedes
 * `nav` fuer `/helfer/*` verbietet. Der Folgesatz begrenzt das erkennbar auf die
 * SUITE-Navigation („Das Modul-Wurzel-Layout traegt ausschliesslich
 * `metadata.manifest` und `{children}`"), und E11 verlangt
 * `data-testid="lb-tableiste"` ausdruecklich AM `<nav>`. Wer den Constraint
 * woertlich nimmt und ein `<div>` baut, bricht E11 und den Teil-6-Task T171
 * (Preflight-Scan, Befund 23).
 */
export function HelferRahmen({
  aktiv,
  sitzungsetikett,
  laeuftAb,
  children,
}: {
  aktiv: "entnahme" | "check";
  sitzungsetikett: string;
  laeuftAb: Date;
  children: React.ReactNode;
}) {
  /*
   * EINE Ablesung fuer die Schwelle. `new Date()` und NICHT `Date.now()`:
   * `react-hooks/purity` verbietet den Aufruf einer unreinen Funktion im Render
   * und ist im Projekt ein Lint-FEHLER (gemessen: `pnpm lint` bricht mit
   * „Cannot call impure function during render" auf genau dieser Zeile). Dieselbe
   * Form wie `files/(verwaltung)/posteingang/page.tsx:56`. `.getTime()` bleibt
   * reine ms-Arithmetik und damit zonenunabhaengig (§5.16).
   */
  const jetzt = new Date();

  return (
    <div className={s.rahmen}>
      <div className={s.streifen} data-rolle="lb-streifen" />

      <header className={s.kopf}>
        <div>
          <div className={s.marke}>
            LAGER<span className={s.markeAkzent}>BUCH</span>
          </div>
          <div className={s.etikett}>{sitzungsetikett}</div>
          {/*
            DIE EINE AUFRUFFORM. Uhrzeit und Schwelle rechnet der SERVER, die
            Insel zeigt und aktualisiert nur (§3.4.3 Punkt 1). `uhrzeit()` ist
            zonenexplizit (§4.5); die Differenz zweier Zeitstempel ist reine
            ms-Arithmetik und damit zonenunabhaengig (§5.16).

            ⚠️ DIE 30 MINUTEN STEHEN HIER NOCH EINMAL, statt aus `Restzeit.tsx`
            importiert zu werden — DAS IST FALLE 6, NICHT NACHLAESSIGKEIT.
            `Restzeit.tsx` traegt "use client"; ein WERT von dort kaeme in dieser
            Server Component als Client-Referenz an, HTTP 500 fuer die ganze
            Seite — und weder `pnpm build` noch Vitest sehen es. Wandert die
            Schwelle, gehoert sie in ein Modul ohne "use client" (`_lib/`).
          */}
          <Restzeit
            uhrzeit={uhrzeit(laeuftAb)}
            laeuftAb={laeuftAb}
            warntInitial={laeuftAb.getTime() - jetzt.getTime() <= 30 * 60_000}
          />
        </div>

        {/*
          FORMULAR, KEIN LINK. `beenden` ist eine Server Action (T74) — ein Link
          auf einen GET-Handler waere vorlade- und prefetch-faehig, und ein
          Prefetch, der die Sitzung beendet, ist genau die Sorte Fehler, die
          niemand reproduziert. Der Sperr- und der Ablauffall gehen ueber
          `/abmelden` (Teil 2, T26), weil ein LAYOUT kein Cookie raeumen kann.
        */}
        <form action={beenden}>
          <button className={s.beenden} type="submit">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" />
            </svg>
            Beenden
          </button>
        </form>
      </header>

      <main className={s.inhalt}>{children}</main>

      {/*
        `data-testid` und `aria-label` sind ZUSICHERUNGEN an Teil 6, T171
        (§7.8.2 Punkt 5). Wer sie umbenennt, macht die einzige Pruefung fuer
        Falle 63 stumm.

        `aria-current="page"` IST DIE ZUSAGE, die CSS-Klasse folgt daraus
        (`helfer.module.css:143`, `.tab[aria-current="page"]`) — nicht
        umgekehrt. Beide Tabs tragen deshalb DIESELBE Klassenliste; damit
        prueft der E2E dieselbe Sache, die die Bildschirmleserin hoert.
      */}
      <nav className={s.tableiste} aria-label="Helfer-Bereiche" data-testid="lb-tableiste">
        <Link
          href="/helfer"
          className={s.tab}
          aria-current={aktiv === "entnahme" ? "page" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <span>Entnahme</span>
        </Link>
        <Link
          href="/helfer/check"
          className={s.tab}
          aria-current={aktiv === "check" ? "page" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 5h6M5 8h14v12H5zM9 13l2 2 4-4" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Fahrzeug-Check</span>
        </Link>
      </nav>
    </div>
  );
}
