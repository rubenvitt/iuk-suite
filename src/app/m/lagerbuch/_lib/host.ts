import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der modul-eigene Host-Riegel — Entscheidung 10 (d), additiv zu (a), nach dem
 * produktiv laufenden Muster von `m/files/_lib/hostRolle.ts:90-121`. Anders als
 * `files` hat lagerbuch EINE Rolle, also drei Funktionen statt sechs.
 *
 * KEIN "use client": Server Components UND Route Handler lesen hier.
 *
 * WARUM ES IHN GIBT: `decideRoute` gatet interne Pfade nach dem MODUL AUS DEM
 * SEGMENT, nicht nach dem Host (core/routing.ts:58-66), und fuer ein Modul mit
 * `requiresAuth: false` steigt `canAccess` sofort mit true aus. Ohne diese Datei
 * beantwortet JEDER Host, der auf den Suite-Container terminiert,
 * /m/lagerbuch/t/<code> — und `redeemToken` schreibt `lastUsedAt`. Das Cookie
 * laege dann host-only auf dem fremden Host, und lagerbuch liefe dort
 * VOLLSTAENDIG: eine zweite Herkunft, die in keinem Runbook steht und aus der
 * echte Buchungen in ein append-only Journal laufen.
 *
 * Kein Gate faengt das: core/routing.test.ts:61-65 schreibt das Verhalten sogar
 * ausdruecklich fest, und Playwright faehrt gegen genau einen baseURL (Falle 57).
 */

/**
 * Ist das der Lagerbuch-Host? `moduleForHost(resolveHost(headers))?.key` und
 * NICHT ein direkter Vergleich gegen prodHostsFor:
 *
 * - `moduleForHost` (registry.ts) trifft `lagerbuch.localtest.me` VOR und
 *   UNABHAENGIG von prodHostsFor. Damit laeuft derselbe Code-Pfad in Dev, E2E und
 *   Produktion, OHNE dass SUITE_HOST_LAGERBUCH lokal gesetzt sein muss.
 * - `resolveHost` (routing.ts:36-41) wird WIEDERVERWENDET, nicht nachgebaut: seine
 *   Vorrangregel `x-forwarded-host` vor `host` ist nach dem Rewrite der Middleware
 *   die einzig richtige. Eine zweite Aufloesung waere der Ort, an dem beide
 *   auseinanderlaufen.
 *
 * ES GIBT KEINEN „kein Prod-Host konfiguriert -> durchlassen"-ZWEIG. Er waere die
 * Sperre, die sich selbst abschaltet: solange SUITE_HOST_LAGERBUCH fehlt, waere
 * genau der Zustand offen, gegen den die Datei gebaut ist. Die Praedikatsform
 * oben macht ihn ueberfluessig, weil sie den Dev-Host ohne jede Env deckt.
 */
export function istLagerbuchHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "lagerbuch";
}

/** Fuer LAYOUTS UND SEITEN, erste Anweisung. Wirft. Kein 403: die Existenz eines
 *  Pfades auf dem falschen Host wird nicht verraten (docs/design/README.md:237-242). */
export function requireLagerbuchHost(headers: Headers): void {
  if (!istLagerbuchHost(headers)) notFound();
}

/** Fuer ROUTE HANDLER. Wirft NIE — ein notFound() ist keine brauchbare Antwort auf
 *  einen gescannten QR-Code; der Handler baut seine 404 selbst. */
export function lagerbuchHostOderNull(headers: Headers): "lagerbuch" | null {
  return istLagerbuchHost(headers) ? "lagerbuch" : null;
}

/**
 * WO DIESE FUNKTIONEN GERUFEN WERDEN — verbindlich (§2.6). Route Handler haben
 * KEIN Layout; die Sperre erreicht sie ueber kein Group-Layout.
 *
 *   verwaltung/(arbeit)/layout.tsx      requireLagerbuchHost      Teil 5
 *   verwaltung/(druck)/layout.tsx       requireLagerbuchHost      Teil 6
 *   helfer/layout.tsx                   requireLagerbuchHost      Teil 4
 *   page.tsx (Gate)                     requireLagerbuchHost      Teil 4
 *   g/[code]/page.tsx, a/[…]/page.tsx   requireLagerbuchHost      Teil 4
 *   t/[code]/route.ts                   lagerbuchHostOderNull     Teil 4  ← Tuer mit Datenwirkung
 *   abmelden/route.ts                   lagerbuchHostOderNull     Teil 2/4
 *   manifest + vier Icon-Handler        lagerbuchHostOderNull     Teil 4
 *   einloesenAmGate, erneuereSitzung    requireLagerbuchHost      Teil 4  ← die WERFENDE Form
 *   requireHelferSitzung/-Schreibend    rufen requireLagerbuchHost INTERN, erste Anweisung
 *   JEDE Verwaltungs-Action             requireLagerbuchAdmin ruft requireLagerbuchHost INTERN,
 *                                       erste Anweisung (zugang.ts:252)      Teil 4/5
 *
 * DIE ZEILE ZU requireHelferSitzung/-Schreibend IST KEINE BEQUEMLICHKEIT. `requireHelfer` prueft heute
 * Cookie-Signatur und tokens.aktiv und gibt {tokenId, code} zurueck — KEINEN Host.
 * Ein helfer_session-Cookie, das ueber einen fremden Suite-Host entstanden ist, waere
 * dort ein VOLLGUELTIGER Ausweis fuer bucheEntnahmeHelfer und checkAbschluss. Weil der
 * Host-Riegel INNEN sitzt, ist die Zusage „jede Helfer-Action ist host-gebunden" durch
 * KONSTRUKTION wahr — nicht durch eine Liste, die die naechste Action vergisst.
 *
 * FUER DIE VERWALTUNGS-ACTIONS GILT DASSELBE, UND ZWAR SEIT T23 (frueher stand hier das
 * Gegenteil): sie erben den Host-Riegel ueber `requireLagerbuchAdmin`, das
 * `requireLagerbuchHost` als ERSTE Anweisung ruft (`zugang.ts:252`). ⚠️ Die Zeile dort ist
 * KEINE Redundanz zu den Layouts — eine Server Action hat kein Layout ueber sich; wer sie
 * fuer doppelt haelt und entfernt, oeffnet genau die Luecke, die der Absatz darueber fuer
 * die Helfer-Actions beschreibt.
 * Der Zugriffsriegel allein wuerde die Verwaltung tragen (er ist host-blind und
 * vollstaendig: eine Admin-Action auf fremdem Host verlangt dieselbe Gruppe wie auf der
 * eigenen Domain, ist also kein Autorisierungsproblem). Die Host-Zeile steht ZUSAETZLICH,
 * und das ist die STRENGERE Richtung: sie verhindert eine zweite funktionierende Herkunft
 * des Moduls, nicht einen Rechtefehler (`zugang.ts:220-226` begruendet es ausfuehrlich).
 *
 * ⚠️ Die Zahl der Hosts in SUITE_HOST_LAGERBUCH ist NICHT begrenzt: 0 (vor dem
 * Cutover), 1 (Normalfall) und ≥ 2 (abgeloeste Domain laeuft mit) sind alle erlaubt.
 * Es gibt deshalb KEIN validateLagerbuchHosts — Tippfehler, Protokoll/Port im Wert und
 * doppelt vergebene ENV-Hosts faengt bereits validateHostConfig (core/hosts.ts:65-100).
 * WAS DORT NICHT AUFFAELLT: ein Host, den ein ANDERES Modul ueber `prodHosts` in der
 * Registry fuehrt (z. B. `portal`s "iuk-ue.de"). validateHostConfig fuellt seine
 * Kollisions-Map ausschliesslich aus `envHostsFor` (core/hosts.ts) — ein
 * Registry-`prodHosts`-Eintrag erreicht sie nie. Steht SUITE_HOST_LAGERBUCH zufaellig
 * auf einer Domain, die ein VOR lagerbuch gelistetes Modul per prodHosts fuehrt, besteht
 * die Boot-Pruefung fehlerfrei, und `moduleForHost` liefert dennoch das fremde Modul —
 * dort entscheidet die Registry-Reihenfolge, nicht die Env.
 */
