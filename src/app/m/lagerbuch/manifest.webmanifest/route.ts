import { hostAbweisung } from "../_lib/hostRiegel";
import { LAGERBUCH_MARKE, LAGERBUCH_ORGANISATION, LAGERBUCH_ZEILE } from "../_lib/marke";

/**
 * DAS PWA-MANIFEST — §7.10.2. Route Handler UNTER dem Modul, nicht in `app/`
 * oder `public/` (§2.7). Der Browser sieht ihn auf einem Root-Pfad des
 * MODUL-Hosts; auf jedem anderen Host rewritet derselbe Pfad in DESSEN Modul
 * und laeuft ins Leere.
 *
 * ⚠️ DER HOST-RIEGEL IST DIE ERSTE ANWEISUNG — sonst bewirbt JEDER Suite-Host
 * eine Lagerbuch-PWA (Falle 56). Zusammen mit `metadata.manifest` im
 * MODUL-Layout (Teil 1, T6) statt im Root-Layout ist das die vollstaendige
 * Abhilfe: heute steht der Verweis in lagerbuchs Root-Layout (`layout.tsx:28`),
 * und dort wuerde ihn in der Suite jeder Host tragen.
 *
 * ⚠️ `hostAbweisung` RUFT `lagerbuchHostOderNull` UND NICHT die werfende Form
 * `requireLagerbuchHost`:
 * ein `notFound()` waere eine HTML-Fehlerseite mit `Content-Type: text/html`,
 * und der Browser meldete „manifest fetch failed" statt eines sauberen 404. Die
 * `??`-Form ist Absicht — sie macht „erste Anweisung" strukturell wahr
 * (`_lib/hostRiegel.ts`).
 *
 * DER INHALT IST GEMESSEN, NICHT GERATEN — gegen `../lagerbuch` @ ca04eb1,
 * `src/app/manifest.webmanifest/route.ts`. Von den acht Werten sind SECHS 1:1
 * uebernommen (`name` der Form nach, ohne den Leerzweig fuer eine fehlende
 * Organisation, den es bei einer Konstanten nicht geben kann); `description`
 * und `scope` sind ENTSCHEIDUNGEN und keine Portierung:
 *   - `description` ist alt `APP_TAGLINE` = „Materialverwaltung"
 *     (`src/lib/config.ts:32`, `stack.env.example:5`, `compose.yaml:10`); der
 *     Wert hier kommt aus `_lib/marke.ts` (§10.2, Teil 3 T33).
 *   - `scope` kennt das Alt-Manifest gar nicht.
 *
 * Die Haerte bleibt: diese Werte bestimmen auf jedem Helfer-Handy Symbol,
 * Splash-Farbe und Startziel — UND SIE WERDEN BEIM INSTALLIEREN EINGEBRANNT.
 * Ein spaeterer Tausch erreicht kein Geraet, auf dem die App schon liegt.
 *
 * ⚠️ DIE DREI TEXTWERTE KOMMEN AUS `_lib/marke.ts`, NICHT AUS DER
 * PROZESSUMGEBUNG (§10.2). Fuer `name` gilt A-T3-4 aus derselben Datei: der
 * wahre Organisationsname ist eine Runbook-Eingabe.
 *
 * ⚠️ `start_url: "/"` und `scope: "/"` BLEIBEN RICHTIG — der Browser sieht den
 * externen Modul-Host, der Rewrite ist serverintern unsichtbar. BEDINGUNG:
 * `SUITE_HOST_LAGERBUCH` ist gesetzt. Ist es das nicht, zeigt `start_url` aufs
 * PORTAL, und eine installierte PWA startet im falschen Modul
 * (Runbook-Eingabe R2, §7.13.4).
 */
export const dynamic = "force-dynamic";

const MANIFEST = {
  name: `${LAGERBUCH_MARKE} · ${LAGERBUCH_ORGANISATION}`,
  short_name: LAGERBUCH_MARKE,
  description: LAGERBUCH_ZEILE,
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#EEF0F1",
  theme_color: "#C8000F",
  icons: [
    /**
     * ⚠️ `/pwa-icon.svg`, NICHT `/icon.svg`. Der Plan begruendet das damit, dass
     * der Alt-Eintrag (`manifest.webmanifest/route.ts:19`) auf eine Datei zeige,
     * DIE ES NICHT GIBT — das ist NACHGEMESSEN FALSCH und schliesst aus dem
     * falschen Verzeichnis: `../lagerbuch/public/` enthaelt sie nicht, aber
     * `../lagerbuch/src/app/icon.svg` gibt es (385 Bytes), Next liefert eine
     * App-Router-Metadatendatei unter `/icon.svg` aus, und `_lib/pwaIcons.ts`
     * nennt genau diese Datei als Portierungsquelle des Zeichens.
     *
     * Der tragfaehige Grund ist ein anderer und staerker: eine `app/icon.svg`
     * laege in der SUITE an der Wurzel und wuerde von jedem Host getragen —
     * dieselbe Falle 56, gegen die dieser ganze Task gebaut ist —, und ein
     * Verzeichnis `icon.svg/` mit `route.ts` unter dem Modul stuende gegen Nexts
     * Metadatendatei-Konvention fuer dieses Segment. Ergebnis unveraendert (E7),
     * Begruendung tragfaehig.
     */
    { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" },
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export function GET(req: Request): Response {
  return hostAbweisung(req) ?? new Response(JSON.stringify(MANIFEST), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
