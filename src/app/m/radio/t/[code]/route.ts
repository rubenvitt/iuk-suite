import { NextResponse } from "next/server";
import { clientIpAus } from "@/core/ratelimit";
import { getDb } from "../../_db/client";
import { normalisiereCode } from "../../_lib/code";
import { gateFehlversuchBuchen, gateGesperrt } from "../../_lib/gateSchranke";
import { radioHostOderNull } from "../../_lib/host";
import { sanitizeReturnTo } from "../../_lib/returnTo";
import {
  AUSLEIH_COOKIE,
  ausleihCookieOptionen,
  ausleihGueltigkeitSekunden,
} from "../../_lib/ausleihSitzung";
import { loeseCodeEin } from "../../_lib/schreibpfade/codeEinloesung";

/**
 * DER GESCANNTE AUFSTELLER-QR — Spec 1 §3.3.2 (Zeilen 2274-2337). Aeusserer Pfad
 * `/t/<code>`, innerer `/m/radio/t/<code>` (`_lib/routen.test.ts`, Liste `AUSLEIH`).
 *
 * ⛔ WARUM EIN ROUTE HANDLER UND KEINE SERVER ACTION (Spec:2276-2280): ein gescannter
 * QR-Code ist ein GET AUS DER ADRESSZEILE. Eine Server Action ist ein POST auf eine
 * React-Referenz und aus einem Kamera-Scan nicht ausloesbar. Es gibt hier keine Wahl,
 * sondern nur die Frage, ob man sie richtig trifft.
 *
 * ✅ ⬜ A-L9 IST FUER DIESE DATEI ABGELESEN — am 2026-08-27, Planteil 5, Aufgabe T4. Bis dahin
 * stand hier woertlich: „DIESE DATEI HAT HEUTE NULL E2E, und der Mehrhost-Fall ist in Vitest
 * NICHT darstellbar: es gibt dort keinen zweiten Host, gegen den ein relatives `Location`
 * anders aufloeste als ein absolutes — DER BRUCH IST PER KONSTRUKTION UNSICHTBAR (⬜ A-L9; der
 * Nachweis gehoert Planteil 5)."
 *
 * DER NACHWEIS LIEGT JETZT VOR: `e2e/radio-hosts.spec.ts` faehrt den Zwei-Host-Aufbau und
 * prueft diese Route auf BEIDEN Hosts — der Fall „verbraucht einen Code vom fremden Host aus
 * nicht — bleibt auf dem eigenen einloesbar" sichert `zugangscodes.last_used_at` nach dem
 * Fremdversuch DIFFERENZIELL unveraendert zu und danach, auf dem eigenen Host, verschieden.
 *
 * ⛔ UND ER IST FALSIFIZIERT, NICHT NUR GRUEN. Sonde S-T4b hat den Host-Abgleich unten
 * probehalber entfernt: der Fall wurde rot — „der Riegel muss VOR jeder Wirkung greifen",
 * `Expected: 1787646656 / Received: 1787819470`. ⚠️ UND DABEI IST ETWAS GEMESSEN WORDEN, DAS
 * NIRGENDS SONST STEHT: der FREMDE Host antwortete auch OHNE den Riegel weiterhin mit 404 —
 * der Handler liefert dann seinen relativen 303 nach `/`, die Navigation folgt ihm auf
 * `feedback.localtest.me/`, und DIESE Wurzel liefert ihrerseits 404. ⛔ Der Statuscode allein
 * bewiese hier also nichts; die tragende Zeile ist die differenzielle auf `last_used_at`.
 *
 * Was diese Datei selbst liefert, bleibt unveraendert die PRUEFBARE FORM: 303, relatives
 * `Location` in JEDEM Zweig, Cookie auf DERSELBEN Antwort.
 */
export const dynamic = "force-dynamic";

/**
 * ⛔ EIN BENANNTER TYP UND KEIN INLINE-OBJEKT IN DER PARAMETERLISTE, UND DAS IST GEMESSEN,
 * NICHT STIL. `_lib/bauform.test.ts` schneidet den Koerper von `GET` mit `funktionsKoerper`
 * aus (`riegel.test.ts:205-220`), und das sucht die erste `{` NACH dem Funktionsnamen.
 * Stuende hier `ctx: { params: Promise<{ code: string }> }`, liese der Scan
 * `{ params: Promise<{ code: string }> }` als „Koerper" — nicht leer, also an der
 * Leer-Zusicherung vorbei, und alle vier Riegel „fehlten ganz" bei RICHTIGER
 * Implementierung (Sonde vom 2026-08-23 ueber genau diese Kopie).
 *
 * ⛔ ABSICHTLICH NICHT EXPORTIERT: Next prueft die Exporte einer `route.ts`, und ein
 * zusaetzlicher Export ist eine Grenze, die diese Datei nicht anzufassen braucht.
 */
type RouteKontext = { params: Promise<{ code: string }> };

export async function GET(req: Request, ctx: RouteKontext) {
  const kopf = new Headers(req.headers);

  /*
   * SCHRITT 1 — Host. Die NICHT-werfende Form, und nicht die werfende: ein `notFound()` ist
   * keine brauchbare Antwort auf einen GESCANNTEN QR-Code — es waere eine HTML-Fehlerseite
   * mit `Content-Type: text/html`. Der Handler baut seine 404 selbst
   * (`_lib/host.ts:62-63`, `riegel.test.ts:442-451` macht die werfende Form hier rot).
   *
   * ⛔ ER STEHT VOR ALLEM ANDEREN, UND DAS HAT DATENWIRKUNG (§3.4.6, Spec:2616-2629):
   * `/m/<modul>/*` antwortet auf JEDEM Host, der auf den Suite-Container terminiert —
   * `decideRoute` gatet nach Modul-SEGMENT, nicht nach Host (`src/core/routing.ts:56-68`),
   * und steigt bei `requiresAuth: false` sofort mit `true` aus. Ein Riegel HINTER der
   * Einloesung antwortete genauso mit 404, haette aber `last_used_at` auf dem fremden Host
   * schon geschrieben und die Sitzung fuer die fremde Herkunft ausgestellt. Das host-only
   * Cookie aus `_lib/ausleihSitzung.ts:207-219` ist die ZWEITE HAELFTE dieses Riegels — es
   * greift dort, wo die erste versagt. ⛔ BEIDE HAELFTEN, ODER KEINE.
   */
  if (!radioHostOderNull(kopf)) return new Response("Not found", { status: 404 });

  const { code } = await ctx.params;
  const url = new URL(req.url);

  /*
   * Nutzereingabe, und sie landet in einem `Location`-Kopf — dort schuetzt keine
   * React-Entkommung. `sanitizeReturnTo` laesst nur lokale Pfade durch
   * (`_lib/returnTo.ts:52-60`).
   */
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const zumGate = (grund?: "zuviele" | "code") => {
    const ziel = new URLSearchParams();
    if (returnTo) ziel.set("returnTo", returnTo);
    // ⛔ DAS GATE LIEST IHN (Spec:2400-2419) — und es liest die SEKUNDENZAHL nicht mit: die
    // holt es sich selbst aus derselben Schranke, mit denselben Absender-Kopfzeilen.
    if (grund) ziel.set("grund", grund);
    const suche = ziel.toString();
    return antwort(suche ? `/?${suche}` : "/");
  };

  // Ohne Zwischenschicht (Spec:3033-3035, `_lib/gateSchranke.ts:53-56`). Einmal ermittelt,
  // zweimal benutzt — Schritt 2 und Schritt 6.
  const absender = clientIpAus(kopf);

  /*
   * SCHRITT 2 — gesperrt? OHNE Datenbankzugriff, und ohne hier zu buchen: sonst
   * verlaengerte jeder Versuch waehrend der Sperre die Sperre
   * (`_lib/gateSchranke.ts:141-176`).
   */
  if (gateGesperrt(absender) !== null) return zumGate("zuviele");

  /*
   * SCHRITT 3 — normalisieren. `loeseCodeEin` normalisiert NICHT selbst
   * (`_lib/schreibpfade/codeEinloesung.ts:39-47`); ein Aufruf ohne diese Zeile scheitert
   * STILL am Erfolgspfad, weil die Gleichheitssuche gegen `zugangscodes.code` die
   * abweichende Schreibweise nicht findet.
   *
   * ⚠️ SIE STEHT ALS EIGENE ANWEISUNG DA, NICHT INLINE (Spec:2264-2268): der
   * Reihenfolge-Scan in `_lib/bauform.test.ts` vergleicht TEXTPOSITIONEN, und in
   * `loeseCodeEin(normalisiereCode(x), …)` stuende die Einloesung textlich VOR dem
   * Normalisieren. Dieselbe Form tragen `_actions/gate.ts` und `_actions/sitzung.ts`.
   */
  const normalisiert = normalisiereCode(code);

  // SCHRITT 4 — `loeseCodeEin` NIMMT das Handle, es holt sich keins
  // (`_lib/schreibpfade/codeEinloesung.ts:48-53`).
  const res = await loeseCodeEin(normalisiert, getDb());

  /*
   * SCHRITT 6 — Misserfolg. „unbekannt" und „gesperrt" sind von aussen NICHT unterscheidbar;
   * das Gate zeigt fuer beide denselben Satz (Spec:2334-2336, `_lib/gateTexte.ts`).
   */
  if (!res.ok) {
    gateFehlversuchBuchen(absender);
    return zumGate("code");
  }

  /*
   * SCHRITT 5 — Erfolg. KEIN Budgetverbrauch: ein richtiger Code kostet nichts, sonst
   * sperrte sich ein Funkraum voller Personen an DEMSELBEN Aufsteller mit RICHTIGEN Codes
   * selbst aus — bei `radio` der Regelfall, nicht der Randfall
   * (`_lib/gateSchranke.ts:185-189`).
   *
   * ⛔ DAS COOKIE LIEGT AUF DERSELBEN ANTWORT, DIE DEN 303 TRAEGT (Spec:2298-2302,
   * Bauform-Zulaessigkeitstafel Zeile 2). Zwei getrennte Antworten waeren ein Cookie, das
   * der Browser dem falschen Vorgang zuordnet.
   *
   * Ziel: `returnTo` hat Vorrang, sonst `/` — die Gate-Weiche, die mit gueltigem Zugang
   * selbst auf `/geraete` weiterleitet (Entscheidung E1). `radio` kennt kein hinterlegtes
   * Codeziel wie `lagerbuch`s `tokenZielPfad`.
   */
  const antw = antwort(returnTo ?? "/");
  antw.cookies.set(AUSLEIH_COOKIE, res.cookieValue, ausleihCookieOptionen(ausleihGueltigkeitSekunden()));
  return antw;
}

/**
 * 303 MIT RELATIVEM `Location`. ⛔ Bewusst NICHT `NextResponse.redirect(…)`: das verlangt
 * eine ABSOLUTE URL, und jede absolute URL hier ist entweder aus einer Basis-Variablen
 * GERATEN oder aus `req.url` gebaut — und `req.url` traegt nach dem Modul-Host-Rewrite den
 * INNEREN Pfad `/m/radio/…` (`src/app/m/files/_lib/hostRolle.ts:137-139` schreibt es aus).
 * Ein relatives `Location` loest der Browser gegen die URL auf, die ER sah (RFC 7231
 * §7.1.2). COOKIE UND LANDUNG KOENNEN DAMIT KONSTRUKTIV NICHT AUSEINANDERFALLEN.
 * `_lib/bauform.test.ts` verbietet die absolute Form ueber alle vier aeusseren Flaechen.
 *
 * WAS DER BRUCH KOSTET: weicht die Basis vom anfragenden Host ab, gilt das Cookie fuer den
 * einen Host, die Landung passiert auf dem anderen — die Person kommt OHNE Sitzung am Gate
 * an, und zwar bei JEDEM Versuch erneut, fuer ALLE gleichzeitig, ohne Fehlermeldung, die auf
 * die Ursache zeigt. ⚠️ BEI `radio` IST DAS TEURER ALS BEI `lagerbuch`, weil es KEIN
 * PARALLELFENSTER gibt (Spec:2284-2296): der einzige Rueckweg ist „Router zurueck".
 *
 * 303 UND NICHT 302: die Antwort auf ein GET soll auch nach dem Folgen ein GET sein, und 303
 * sagt das ausdruecklich, statt es dem Browser zu ueberlassen.
 */
function antwort(pfad: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: pfad } });
}
