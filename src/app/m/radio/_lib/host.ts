import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * DER MODUL-EIGENE HOST-RIEGEL (Spec 1 §1.4, Zeilen 453-635).
 *
 * KEIN "use client": Server Components UND Route Handler lesen hier (Spec:455-456).
 *
 * WARUM ES IHN GIBT — Falle 61 der lagerbuch-Zaehlung (Spec:458-471). `decideRoute` gatet
 * einen internen Pfad `/m/<key>/...` NACH DEM MODUL AUS DEM SEGMENT, ohne jeden
 * Hostbezug (core/routing.ts:68-76), und `canAccess` steigt fuer ein Modul ohne
 * Auth-Pflicht sofort mit `true` aus (core/registry.ts:265). JEDER Host, der auf den
 * Suite-Container terminiert, antwortet damit auf /m/radio/*.
 *
 * ⚠️ BEI `radio` HAT DAS DATENWIRKUNG, nicht nur Sichtwirkung: das Einloesen unter
 * /t/<code> praegt eine Sitzung und ruehrt die Codezeile an. Das Sitzungscookie laege
 * host-only auf dem FREMDEN Host, und `radio` liefe dort vollstaendig — eine zweite
 * Herkunft, die in keinem Runbook steht und aus der echte Leihvorgaenge in die Datenbank
 * laufen.
 *
 * ⚠️ VERSCHAERFEND GEGENUEBER `lagerbuch` (Spec:473-476): der Alt-Kiosk legte seinen
 * Zugang im `localStorage` ab, also origin-gebunden — die Fehlerrichtung war ein STILLER
 * AUSFALL. Die Suite-Fassung nimmt ein Cookie. (Spec:473-476 belegt das mit
 * `radio-inventar/apps/frontend/src/lib/tokenStorage.ts:5-13`; die Alt-Anwendung liegt in
 * einem ANDEREN Repo und ist von hier aus nicht nachmessbar — der Beleg ist die
 * Spec-Zeile, nicht die Datei.)
 *
 * ⚠️ KEIN GATE FAENGT DAS: `src/core/routing.test.ts:62-65` schreibt das Middleware-Verhalten
 * ausdruecklich FEST, und Playwright faehrt gegen genau einen baseURL — ein zweiter Host
 * existiert im Lauf nicht (Spec:717, Falle 12 der Portierungsanalyse,
 * docs/radio-portierung-analyse.md:1384-1387).
 */

/**
 * Ist das der Radio-Host? `moduleForHost(resolveHost(headers))?.key` und NICHT ein
 * direkter Vergleich gegen `prodHostsFor`:
 *
 * - `moduleForHost` (registry.ts:251-258) trifft `radio.localtest.me` VOR und UNABHAENGIG
 *   von `prodHostsFor`. Damit laeuft derselbe Code-Pfad in Dev, E2E und Produktion, OHNE
 *   dass SUITE_HOST_RADIO lokal gesetzt sein muss.
 * - `resolveHost` (routing.ts:36-41) wird WIEDERVERWENDET, nicht nachgebaut: seine
 *   Vorrangregel `x-forwarded-host` vor `host` ist nach dem Rewrite der Middleware die
 *   einzig richtige. Eine zweite Aufloesung waere der Ort, an dem beide auseinanderlaufen.
 *
 * ES GIBT KEINEN „kein Prod-Host konfiguriert -> durchlassen"-ZWEIG (Spec §1.4.5,
 * Zeilen 609-635). Er waere die Sperre, die sich selbst abschaltet: solange
 * SUITE_HOST_RADIO fehlt — und vor dem Cutover fehlt sie —, waere genau der Zustand
 * offen, gegen den diese Datei gebaut ist. Die Praedikatsform oben macht ihn
 * ueberfluessig, weil sie den Dev-Host ohne jede Env deckt.
 */
export function istRadioHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "radio";
}

/** Fuer LAYOUTS UND SEITEN, erste Anweisung. Wirft notFound(). Kein 403: die Existenz
 *  eines Pfades auf dem falschen Host wird nicht verraten (Spec:691-694, §1.5). */
export function requireRadioHost(headers: Headers): void {
  if (!istRadioHost(headers)) notFound();
}

/** Fuer ROUTE HANDLER. Wirft NIE — ein notFound() ist keine brauchbare Antwort auf einen
 *  gescannten QR-Code; der Handler baut seine 404 selbst (Spec:500/525-527). */
export function radioHostOderNull(headers: Headers): "radio" | null {
  return istRadioHost(headers) ? "radio" : null;
}

/**
 * WO DIESE FUNKTIONEN GERUFEN WERDEN — verbindlich (Spec §1.4.3, Zeilen 549-593).
 * Route Handler haben KEIN Layout ueber sich; die Sperre erreicht sie ueber kein
 * Group-Layout.
 *
 *   page.tsx (Gate)                        requireRadioHost      Planteil 3
 *   (ausleihe)/layout.tsx                  KEINER — das Zugangspraedikat ruft ihn intern
 *   (ausleihe)/geraete|ausleihen|rueckgabe KEINER — dito
 *   admin/(arbeit)/layout.tsx              requireRadioHost, dann requireRadioVerwaltung
 *                                          ✅ UMGESTELLT IN PLANTEIL 4, AUFGABE V3 —
 *                                          Betreiberentscheidung C.6/B4, zwei Rechtestufen wie
 *                                          im Bestand. Spec:4367 schreibt es fuer genau diese
 *                                          Zeile fest; Spec:4368 laesst (druck) auf
 *                                          requireRadioAdmin. Die Tabelle in §1.4.3 gibt den
 *                                          Stand VOR B4 wieder.
 *                                          ⛔ KEIN SCAN FAENGT DIE RICHTUNG: riegel.test.ts
 *                                          Klausel (a) nimmt im Arbeits-Zweig BEIDE Namen an,
 *                                          ein ODER; typecheck, lint und build sehen nichts.
 *                                          Der Waechter ist die namentliche Zusicherung „die
 *                                          zwei Huellen tragen JE IHRE Stufe" (V3). Faellt sie
 *                                          zurueck auf requireRadioAdmin, sperrt der
 *                                          Layout-Riegel jede Updater-Person mit 404, bevor
 *                                          eine Seite laeuft
 *   admin/(druck)/layout.tsx               requireRadioHost, dann requireRadioAdmin   Z6
 *   t/[code]/route.ts                      radioHostOderNull     Planteil 3  <- Tuer mit Datenwirkung
 *   abmelden/route.ts                      radioHostOderNull     Planteil 3
 *   admin/(arbeit)/geraete/export/route.ts radioHostOderNull + istRadioAdmin(await viewerOderNull())
 *                                          Planteil 4 — B11 (Spec:100, ausgeschrieben Spec:4379,
 *                                          bestaetigt B17 Spec:117): BEIDE nicht-werfend, der
 *                                          Handler baut seine Antwort selbst, und sie ist 404,
 *                                          nicht 403 (B10). ⛔ NIE requireRadioAdmin hier — das
 *                                          endet in redirect('/login?…') bzw. notFound(), und ein
 *                                          anonymer GET landete im Login-Umweg
 *   sw.js/route.ts                         hostAbweisung (Response | null)  Planteil 5
 *   requireRadioAdmin / requireRadioVerwaltung  requireRadioHost als ERSTE Anweisung — in
 *                                          zugang.ts, im gemeinsamen Koerper riegelAufStufe (V3)
 *   Zugangspraedikat der Ausleihe          requireRadioHost als ERSTE Anweisung  Planteil 3
 *   viewerOderNull                         ABSICHTLICH KEINER — Gegenregel, Spec §1.4.4
 *
 * (i) LAYOUTS UND SEITEN SIND BEQUEMLICHKEIT, KEINE SICHERHEITSGRENZE (Spec:569-571).
 * Route-Group-Grenzen sind keine Grenzen; eine Seite kann jederzeit aus einer Group
 * herauswachsen, und ein Layout schuetzt nichts, was es nicht umschliesst.
 *
 * (ii) JEDER ROUTE HANDLER BRAUCHT SEINE EIGENE ZEILE. Bei `radio` sind das VIER
 * (korrigiert, B13, Spec:573-579). Bei `requiresAuth: false` ist eine vergessene Zeile ein
 * offener Endpunkt auf JEDEM Suite-Host, typkorrekt und lint-sauber.
 *
 * (iii) DIE TRAGENDE SCHICHT IST DIE INNERSTE (Spec:581-593, Kapitel-4-Pflicht 16,
 * docs/radio-portierung-analyse.md:973-977). Server Actions haben KEIN Layout ueber sich.
 * Weil der Host-Riegel INNEN sitzt — in `requireRadioAdmin` und im Zugangspraedikat der
 * Ausleihe —, ist die Zusage „jede Action ist host-gebunden" durch KONSTRUKTION wahr,
 * nicht durch eine Liste, die die naechste Action vergisst.
 *
 * ⚠️ UND DIE UMKEHRUNG, sie ist die haeufigere Fehlerquelle: WER DAS ZUGANGSPRAEDIKAT
 * BENUTZT, RUFT DEN HOST-RIEGEL NICHT NOCH EINMAL (Pflicht 16). Ein zweiter Aufruf ist
 * die Behauptung, das Praedikat sei host-blind — und die naechste Person entfernt dann
 * den falschen der beiden. Vorbild fuer denselben Schluss:
 * `lagerbuch/_lib/bauform.test.ts:1597-1614`.
 *
 * ⚠️ ES GIBT KEIN `validateRadioHosts` (Spec §1.4.5, Falle 21 der Portierungsanalyse,
 * docs/radio-portierung-analyse.md:1536-1540). Eine Boot-Pruefung nach `files`-Vorbild
 * wuerde den Zustand VOR dem Cutover (0 Hosts) und den Zustand „abgeloeste Domain laeuft
 * mit" (>= 2 Hosts) faelschlich abbrechen — beide sind bei `radio` erlaubt, und der
 * Fehler zeigte sich als Startabbruch am schlechtesten Tag, den kein Test vorher
 * herstellt. Tippfehler im VARIABLENNAMEN, Protokoll/Port im Wert und doppelt vergebene
 * ENV-Hosts faengt bereits `validateHostConfig` (core/hosts.ts:65-99).
 *
 * ⚠️ WAS `validateHostConfig` NICHT SIEHT: einen Host, den ein ANDERES Modul ueber
 * `prodHosts` in der Registry fuehrt — heute `portal`s "iuk-ue.de" (registry.ts:59). Die
 * Kollisions-Karte wird ausschliesslich aus `envHostsFor` gefuellt (core/hosts.ts:78-94);
 * ein Registry-`prodHosts`-Eintrag erreicht sie nie. Das ist Handarbeit im Runbook.
 */
