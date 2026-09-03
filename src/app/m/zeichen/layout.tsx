import localFont from "next/font/local";

/**
 * ARIMO — DIE SCHRIFT, GEGEN DIE DIE ZEICHEN VERMESSEN SIND (Spec §3.5).
 *
 * Gemessen tragen 160 von 242 Rezepten `<text font-family="Arimo">`, und die Textgeometrie im
 * Generat ist gegen Arimo gerechnet. Ohne die Schrift laufen „KatSL", „ÜMANV-S" und
 * „MLW IV Lbw" aus ihren Boxen — sichtbar erst im Browser, nie in einem Tor: jsdom rechnet
 * keine Glyphen (§9, H2).
 *
 * `next/font/local` UND NICHT `public/m/zeichen/`: so landet die Datei unter
 * `/_next/static/media/` mit Inhaltshash, und `/_next` steht in `PASSTHROUGH`
 * (`core/routing.ts:12`) — sie ist ohne Sitzung abrufbar. Unter `public/` liefe sie durch
 * `decideRoute` und waere bei `requiresAuth: true` gegatet (gemessen an
 * `uav/illustrationen.test.ts:8-13`, das nur durchkommt, weil `uav` `requiresAuth: false`
 * traegt).
 *
 * ⚠️ ES GIBT IM REPO KEIN ZWEITES `next/font/local`. Vorbild ist deshalb `src/app/layout.tsx`
 * mit fuenf `next/font/google`-Aufrufen — dieselbe Bauform, andere Quelle: der Aufruf steht auf
 * Modulebene (nie in der Komponente, sonst laedt Next die Schrift bei jedem Render neu), und
 * `variable:` deklariert eine CSS-Variable, die erst wirkt, wo jemand sie liest.
 *
 * `display: "block"` STATT DER VORGABE `swap`: mit `swap` zeigte der Browser die Beschriftungen
 * zuerst in der Rueckfallschrift — also genau in der Form, die aus den Boxen laeuft. `block`
 * haelt sie bis zu 3 s unsichtbar und faellt danach zurueck. Kurz unsichtbar ist besser als
 * kurz falsch.
 *
 * `preload` BLEIBT AUF DER VORGABE `true`, UND DAS IST EINE VORLEISTUNG FUER COMMIT 9: der
 * Vorlade-Verweis im HTML ist die Spur, an der der Service Worker die Schriftdatei findet
 * (Spec §3.5: sie kommt ueber `cacheReferencedAssets` von selbst mit). Wer hier `preload: false`
 * setzt, nimmt der Offline-Flaeche ihre Schrift, ohne dass ein Tor es sieht.
 *
 * ⚠️ DER DATEINAME TRAEGT ECKIGE KLAMMERN, weil das Quellprojekt seine variable Schrift so
 * ausliefert und `scripts/zeichen-generat.ts` sie unter diesem Namen kopiert. Unter `src/app/`
 * sind Klammern Nexts Syntax fuer dynamische Segmente — hier folgenlos, weil `_fonts` ein
 * privater Ordner ist (Unterstrich-Praefix) und vom Routing ausgenommen. Stolpert der
 * Font-Loader trotzdem darueber, wird die Datei zu `Arimo-variable.ttf` umbenannt: an ZWEI
 * Stellen, hier und in der `copyFileSync`-Zeile des Generators.
 *
 * ⚠️ `weight: "400 700"` IST GEMESSEN, KEINE UEBERNOMMENE VERMUTUNG: die `fvar`-Achse der
 * Datei traegt `wght 400 400 700` (Node-Skript gegen die rohen Bytes, siehe Aufgabenbrief
 * Schritt 11) — Minimum 400, Default 400, Maximum 700.
 */
const arimo = localFont({
  src: "./_fonts/Arimo[wght].ttf",
  weight: "400 700",
  style: "normal",
  variable: "--tz-zeichenschrift",
  display: "block",
});

/**
 * DER EINZIGE GEMEINSAME VORFAHRE BEIDER ROUTENGRUPPEN — `(shell)` und die `(rahmenlos)`, die
 * Aufgabe 9 anlegt. Next stapelt Layouts pro PFAD-SEGMENT, nicht pro Routengruppe; alles, was
 * beide Gruppen brauchen, gehoert deshalb hierher und nirgendwo sonst hin. Vorbild fuer die
 * duenne Form: `uav/layout.tsx`, `lagerbuch/layout.tsx`, `radio/layout.tsx` — sie tragen
 * ebenfalls keine `<Shell>`, damit ihre Zweige die Variante selbst entscheiden koennen.
 *
 * DER MANIFEST-VERWEIS VON HAND, MIT `crossOrigin="use-credentials"` (Spec §7.3). Ohne das
 * Attribut holt der Browser das Manifest OHNE Cookies und bekommt bei `requiresAuth: true` das
 * Login-HTML. Nexts `metadata.manifest` kann das Attribut nicht ausdruecken (Typ
 * `null | string | URL`) — deshalb der Knoten im Markup. React haengt ihn selbst in den
 * `<head>`: ein `<link>` mit `rel` und `href` und ohne `onLoad`/`onError` ist fuer React ein
 * hoistbarer Knoten (`react-dom` … `isHostHoistableType`), gleich wo er im Baum steht.
 *
 * ⚠️ BIS COMMIT 9 ANTWORTET `/manifest.webmanifest` MIT 404 — den Route Handler legt erst jene
 * Aufgabe an, und auf dem SUITE-Host bleibt es dauerhaft bei 404, weil der Pfad dort ins Portal
 * rewritet. Beides ist folgenlos (der Browser installiert dann eben keine PWA) und steht im
 * Commit-Text, damit es niemand fuer einen Fehler haelt.
 *
 * DER `<div>` TRAEGT NUR DIE KLASSE UND KEINEN `style` — er soll das Layout der Shell nicht
 * anfassen. Vorbild: `aufgaben/layout.tsx`, das aus demselben Grund einen Traeger AUSSERHALB
 * der Shell haelt.
 */
export default function ZeichenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={arimo.variable}>
      <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      {children}
    </div>
  );
}
