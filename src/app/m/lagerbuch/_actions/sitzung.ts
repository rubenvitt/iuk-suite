"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "../_lib/host";
import { absenderAus } from "../_lib/absender";
import { gateGesperrt, gateFehlversuchBuchen } from "../_lib/gateSchranke";
import { gateMeldung } from "../_lib/gateTexte";
import { normalisiereCode } from "../_lib/code";
import {
  HELFER_COOKIE, helferCookieOptionen, helferGueltigkeitSekunden,
} from "../_lib/helferSitzung";
import { redeemToken } from "../_lib/schreibpfade/tokenEinloesung";
import { getDb } from "../_db/client";
import type { HelferErgebnis } from "../_lib/actionTypen";

/**
 * DIE INLINE-ERNEUERUNG UND DER BEENDEN-KNOPF — §7.4.4.
 *
 * ⚠️ BEIDE STEHEN AUF DER AUSNAHMELISTE DES GUARD-SCANS, EINTRAEGE 2 UND 3
 * (§3.8.2, `_actions/guards.test.ts:41-45`). `erneuereSitzung` ERZEUGT die
 * Sitzung — ein Sitzungsriegel davor waere die Tuer, die sich selbst
 * abschliesst. `beenden` LOESCHT sie und muss auch dann noch wirken, wenn sie
 * laengst ungueltig ist; ein Riegel machte den Abmeldeknopf ausgerechnet in dem
 * Zustand unbrauchbar, in dem man ihn braucht.
 */

/**
 * DIE DRITTE GATE-FLAECHE (§7.4.4). Ein Fahrzeug-Check ist zehn bis zwanzig
 * Minuten Arbeit, und DER GESAMTE ZUSTAND LIEGT IM CLIENT
 * (`CheckFlow.tsx:62-71`: sechs `useState`). Laeuft die Sitzung ab oder wurde
 * das Cookie geraeumt (§7.10.4), fuehrt JEDER naheliegende Weg — Redirect aufs
 * Gate, Neuladen — durch das Verwerfen dieser Arbeit.
 *
 * ⚠️ DAS IST KEINE VERLAENGERUNG „AUF KNOPFDRUCK" im Sinne von §3.4.3, sondern
 * das dort geforderte „erneut scannen" — nur ohne die Seite zu verlassen. OHNE
 * ERNEUTE CODE-EINGABE PASSIERT NICHTS. Deshalb laeuft sie durch DASSELBE
 * Rate-Limit, DIESELBE Normalisierung, DENSELBEN Host-Riegel und DIESELBE
 * Protokollzeile wie das Gate (§7.5.2) — sie ist eine dritte Gate-Flaeche und
 * kein Sonderweg.
 *
 * SIE LEITET NICHT UM. Das ist der ganze Punkt: die Seite bleibt stehen, die
 * gezaehlten Mengen bleiben stehen, und die Helferin tippt danach erneut auf
 * „Abschliessen".
 *
 * Der `grund` ist in beiden Fehlerfaellen `"gesperrt"` und nicht `"sitzung"`:
 * `darfErneuern` (T63) schaltet auf `"sitzung"` das Erneuerungsfeld EIN — und
 * genau dieses Feld ist die Stelle, an der wir gerade stehen. Ein `"sitzung"`
 * hier baute ein zweites Feld im ersten auf.
 */
export async function erneuereSitzung(rohCode: string): Promise<HelferErgebnis<null>> {
  const kopf = await headers();

  // SCHRITT 1 — Host-Riegel, werfend (§7.3, Riegelfall).
  requireLagerbuchHost(kopf);

  const absender = absenderAus(kopf);   // §3.5.2 — einmal ermittelt, zweimal benutzt

  // SCHRITT 2 — Sperre, OHNE Datenbankzugriff, ohne Buchung.
  const sperrSekunden = gateGesperrt(absender);
  if (sperrSekunden !== null) {
    return {
      ok: false,
      grund: "gesperrt",
      text: gateMeldung("zuviele", sperrSekunden) ?? "Zu viele Fehlversuche.",
    };
  }

  // SCHRITT 3 — normalisieren (§7.5.3, Falle 24). `482137` findet `482-137`
  // ohne diese Zeile NICHT, und die Erneuerung scheitert MIT RICHTIGEN CODES —
  // an der Stelle, an der zwanzig Minuten Zaehlarbeit auf dem Spiel stehen.
  //
  // ⚠️ SIE STEHT ALS EIGENE ANWEISUNG DA, NICHT INLINE IM EINLOESEAUFRUF, und
  // das ist keine Formatierungsfrage: der Reihenfolge-Scan aus T64
  // (`_lib/bauform.test.ts:865`, Betreiberentscheidung B2) vergleicht die
  // TEXTPOSITIONEN der vier Riegel. In `redeemToken(normalisiereCode(x), …)`
  // steht `redeemToken(` textlich VOR `normalisiereCode(` — der Scan meldet
  // dann „Einloesung steht VOR normalisieren" fuer eine Datei, die sachlich
  // richtig ist. Dieselbe Form traegt `_actions/gate.ts:71-75`.
  const code = normalisiereCode(rohCode);

  // SCHRITT 4 — `redeemToken` NIMMT das Handle, es holt sich keins:
  // `_db/client.ts#getDb()` ist der einzige Opener des Moduls (§5.13.2).
  const res = await redeemToken(code, getDb());

  if (!res.ok) {
    // SCHRITT 6 — erst jetzt buchen.
    gateFehlversuchBuchen(absender);
    return {
      ok: false,
      grund: "gesperrt",
      text: gateMeldung("code", null) ?? "Dieser Code ist unbekannt oder wurde gesperrt.",
    };
  }

  // SCHRITT 5 — Erfolg, KEIN Budgetverbrauch, KEIN Redirect.
  (await cookies()).set(
    HELFER_COOKIE,
    res.cookieValue,
    helferCookieOptionen(helferGueltigkeitSekunden()),
  );
  return { ok: true, wert: null };
}

/**
 * DER BEENDEN-KNOPF im Rahmenkopf — portiert aus `helfer/actions.ts:7`.
 *
 * ⚠️ WARUM ES IHN NEBEN `abmelden/route.ts` (Teil 2, T26) GIBT, und warum das
 * KEIN Doppel ist:
 *
 *  * `/abmelden` ist der Weg fuer den SPERR- UND DEN ABLAUFFALL.
 *    `requireHelferSitzung` laeuft aus `helfer/layout.tsx`, und das ist eine
 *    SERVER COMPONENT — dort ist `cookies()` versiegelt, `delete` wirft
 *    (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53`
 *    traegt den Satz „Cookies can only be modified in a Server Action or Route
 *    Handler" woertlich). Ein Layout kann das Cookie also nicht raeumen.
 *  * `beenden` ist der Weg fuer den KNOPF. Eine Server Action DARF Cookies
 *    setzen. Ein Knopf, der stattdessen ueber den GET-Handler ginge, waere ein
 *    LINK — und damit vorlade- und prefetch-faehig. EIN PREFETCH, DER DIE
 *    SITZUNG BEENDET, ist genau die Sorte Fehler, die niemand reproduziert.
 *
 * ⚠️ ES RAEUMT NUR DAS COOKIE. Serverseitig wird NICHTS widerrufen — es gibt
 * kein `jti` und keinen Einzelwiderruf (Falle 20, ausdruecklich nicht behoben,
 * §7.4.1). Wer denselben Code erneut eingibt, ist wieder drin. Das ist gewollt:
 * der Knopf heisst „Beenden", nicht „Kaertchen sperren"; sperren tut die
 * Verwaltung (§6.2.2, Zeile 22).
 *
 * ⚠️ KEIN HOST-RIEGEL. Der schlechteste denkbare Zustand ist eine Sitzung, die
 * man nicht mehr loswird. `beenden` entfernt ein host-only Cookie; auf einem
 * fremden Host gibt es keins, und der Aufruf ist dort wirkungslos statt
 * schaedlich.
 */
export async function beenden(): Promise<void> {
  /*
   * `helferCookieOptionen(0)` statt `cookies().delete(...)` — DIE ATTRIBUTE
   * MUESSEN BEIM LOESCHEN DIESELBEN SEIN WIE BEIM SETZEN (`helferSitzung.ts:132-135`,
   * §3.4.2), und die eine Funktion, die das garantiert, gibt es schon.
   * `abmelden/route.ts` haelt es bereits genauso, mit ausgeschriebener Warnung.
   *
   * ⚠️ DIE ALT-FASSUNG (`helfer/actions.ts:7`) RIEF `delete(HELFER_COOKIE)`, UND
   * DAS IST GEMESSEN ZU WENIG: Nexts `delete(name)` erzeugt
   * `set({name, value:"", expires: new Date(0)})` OHNE `path`
   * (`next/dist/compiled/@edge-runtime/cookies/index.js:302-304`, Next 16.2.11
   * im Arbeitsbaum nachgeschlagen). Der Browser scopet ein `Set-Cookie` ohne
   * `Path` auf das Verzeichnis der Anfrage — ein Action-POST von
   * `/helfer/check` loeschte also unter `/helfer/`, waehrend das echte Cookie
   * unter `Path=/` UEBERLEBT. Der Knopf leitete trotzdem auf `/` um und saehe
   * aus wie ein Erfolg; die Sitzung stuende noch. Das Alt-Modul kam damit
   * durch, weil es `helferCookieOptionen` noch nicht kannte.
   */
  (await cookies()).set(HELFER_COOKIE, "", helferCookieOptionen(0));
  redirect("/");   // AEUSSERER Pfad — die Modulwurzel ist das Gate (§2.1 b)
}
