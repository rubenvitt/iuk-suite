import { NextResponse } from "next/server";
import { lagerbuchHostOderNull } from "../../_lib/host";
import { absenderAus } from "../../_lib/absender";
import { gateGesperrt, gateFehlversuchBuchen } from "../../_lib/gateSchranke";
import { normalisiereCode } from "../../_lib/code";
import { sanitizeReturnTo } from "../../_lib/returnTo";
import { tokenZielPfad } from "../../_lib/tokenZiel";
import {
  HELFER_COOKIE, helferCookieOptionen, helferGueltigkeitSekunden,
} from "../../_lib/helferSitzung";
import { redeemToken } from "../../_lib/schreibpfade/tokenEinloesung";
import { getDb } from "../../_db/client";

/**
 * DER GESCANNTE ZUGANGS-KAERTCHEN-QR (§7.2.3). Aeusserer Pfad: /t/<code>,
 * innerer /m/lagerbuch/t/<code>.
 *
 * ⚠️ SIE HAT HEUTE NULL E2E (Falle 32), und der Mehrhost-Fall ist in Vitest
 * NICHT darstellbar: es gibt dort keinen zweiten Host, gegen den ein relatives
 * `Location` anders aufloeste als ein absolutes — DER BRUCH IST PER
 * KONSTRUKTION UNSICHTBAR. Der Nachweis liegt in Teil 6, T171; diese Datei
 * liefert die pruefbare FORM (303, relatives `Location` in JEDEM Zweig, Cookie
 * auf DERSELBEN Antwort).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const kopf = new Headers(req.headers);

  // SCHRITT 1 — Host. Die NICHT-werfende Form, und nicht die werfende: ein
  // `notFound()` ist keine brauchbare Antwort auf einen GESCANNTEN QR-Code, der
  // Handler baut seine 404 selbst (§2.6, Teil 1 T10).
  //
  // ⚠️ ER STEHT VOR ALLEM ANDEREN, und das ist der teuerste Teil der Zusage:
  // ein Riegel HINTER der Einloesung antwortete genauso mit 404, haette aber
  // `tokens.lastUsedAt` auf dem fremden Host schon geschrieben und die Sitzung
  // fuer die fremde Herkunft ausgestellt.
  if (!lagerbuchHostOderNull(kopf)) return new Response("Not found", { status: 404 });

  const { code } = await ctx.params;
  const url = new URL(req.url);

  // Nutzereingabe, und sie landet in einem `Location`-Kopf — dort schuetzt keine
  // React-Entkommung. `sanitizeReturnTo` laesst nur lokale Pfade durch (§3.7).
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const zumGate = (grund?: "zuviele" | "code") => {
    const ziel = new URLSearchParams();
    if (returnTo) ziel.set("returnTo", returnTo);
    if (grund) ziel.set("grund", grund);   // §3.9 — DAS GATE LIEST IHN (Falle 60)
    const suche = ziel.toString();
    return antwort(suche ? `/?${suche}` : "/");
  };

  const absender = absenderAus(kopf);                                // §3.5.2, einmal ermittelt

  // SCHRITT 2 — gesperrt? OHNE Datenbankzugriff. Die Sekundenzahl wird NICHT
  // mitgegeben: das Gate liest sie selbst aus derselben Schranke, mit denselben
  // Absender-Kopfzeilen (§7.2.4, §3.9).
  if (gateGesperrt(absender) !== null) return zumGate("zuviele");

  // SCHRITT 3 — normalisieren. `redeemToken` normalisiert NICHT selbst
  // (`_lib/schreibpfade/tokenEinloesung.ts`), und ein Aufruf ohne
  // `normalisiereCode` scheitert STILL am Erfolgspfad: die Gleichheitssuche
  // gegen `tokens.code` findet `482137` nicht, und die Helferin sieht
  // „unbekannt oder gesperrt" — mit einem RICHTIGEN Code auf einem laminierten
  // Kaertchen in der Hand.
  //
  // ⚠️ SIE STEHT ALS EIGENE ANWEISUNG DA, NICHT INLINE IM EINLOESEAUFRUF, und
  // das ist keine Formatierungsfrage: der Reihenfolge-Scan aus T64
  // (`_lib/bauform.test.ts`, Betreiberentscheidung B2) vergleicht die
  // TEXTPOSITIONEN der vier Riegel. In `redeemToken(normalisiereCode(x), …)`
  // steht `redeemToken(` textlich VOR `normalisiereCode(` — der Scan meldet
  // dann „Einloesung steht VOR normalisieren" fuer eine Datei, die sachlich
  // richtig ist (gemessen). Dieselbe Form tragen `_actions/gate.ts:71-75` und
  // `_actions/sitzung.ts:80-84`.
  const normalisiert = normalisiereCode(code);

  // SCHRITT 4 — einloesen. `redeemToken` NIMMT das Handle, es holt sich keins:
  // `_db/client.ts#getDb()` ist der einzige Opener des Moduls (§5.13.2), und ein
  // Schreibpfad, der ihn selbst riefe, waere der erste, der die Regel aufweicht.
  const res = await redeemToken(normalisiert, getDb());

  // SCHRITT 6 — Misserfolg. „unbekannt" und „gesperrt" sind von aussen NICHT
  // unterscheidbar; das Gate zeigt fuer beide denselben Satz (§3.9).
  if (!res.ok) {
    gateFehlversuchBuchen(absender);
    return zumGate("code");
  }

  // SCHRITT 5 — Erfolg. KEIN Budgetverbrauch: ein richtiger Code kostet nichts,
  // sonst sperrte sich eine Bereitschaft zu Schichtbeginn mit RICHTIGEN Codes
  // selbst aus (§3.5.3).
  const antw = antwort(returnTo ?? tokenZielPfad(res.zielTyp, res.zielId));
  antw.cookies.set(HELFER_COOKIE, res.cookieValue, helferCookieOptionen(helferGueltigkeitSekunden()));
  return antw;
}

/**
 * 303 mit RELATIVEM Location. Bewusst NICHT `NextResponse.redirect(…)`: das
 * verlangt eine ABSOLUTE URL, und jede absolute URL hier ist entweder aus einer
 * Basis-Variablen GERATEN (Falle 16) oder aus `req.url` gebaut — und `req.url`
 * traegt nach dem Rewrite den INNEREN Pfad (`m/files/_lib/hostRolle.ts:137-139`
 * schreibt das aus). Ein relatives Location loest der Browser gegen die URL
 * auf, die ER sah: den aeusseren Modul-Host (RFC 7231 §7.1.2). COOKIE UND
 * LANDUNG KOENNEN DAMIT KONSTRUKTIV NICHT AUSEINANDERFALLEN. Wer das
 * „repariert", bricht den Mehrhost-Betrieb.
 *
 * WAS DER BRUCH KOSTET: weicht die Basis vom anfragenden Host ab, gilt das
 * Cookie fuer den einen Host, die Landung passiert auf dem anderen — die
 * Helferin kommt OHNE Sitzung am Gate an, und zwar bei JEDEM Versuch erneut.
 * Der Code ist dabei nicht verloren: er bleibt gueltig, und `lastUsedAt` ist
 * „reines Anzeigefeld, OHNE Einfluss auf Gueltigkeit und (nach Entscheidung
 * 8-F) auch ohne Einfluss auf Loeschbarkeit" (`_db/schema.ts:412-413`).
 * ⚠️ NUETZLICH IST ER TROTZDEM NICHT MEHR: solange die Fehlkonfiguration
 * steht, fuehrt JEDER Scan JEDES laminierten Kaertchens dieselbe Sackgasse
 * herbei — gleichzeitig, fuer alle, und ohne Fehlermeldung, die auf die
 * Ursache zeigte. Das ist der Grund, warum diese Datei keine Basis-URL kennt.
 *
 * 303 und nicht 302: die Antwort auf ein GET soll auch nach dem Folgen ein GET
 * sein, und 303 sagt das ausdruecklich, statt es dem Browser zu ueberlassen.
 *
 * RUECKFALL, falls der E2E (Teil 6, T171) das widerlegt: Herkunft aus
 * `x-forwarded-host` bauen (`core/routing.ts:17-23`). NIE aus der
 * Konfiguration.
 */
function antwort(pfad: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: pfad } });
}
