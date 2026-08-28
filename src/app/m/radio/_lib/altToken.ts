import { timingSafeEqual } from "node:crypto";
import { istCodeForm } from "./code";

/**
 * DIE BRUECKE FUER DEN GEDRUCKTEN ALT-QR — Betreiberentscheidung vom 2026-08-28.
 *
 * Der Kiosk-QR der Alt-Anwendung traegt `/?token=<base64 des API_TOKEN>`
 * (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:20-23`), und
 * `.superpowers/sdd/BERICHT-urls-und-adminzugang.md` §1.5 hatte entschieden, ihn verfallen zu
 * lassen — die Abhilfe sei betrieblich. Der Betreiber hat das am 2026-08-28 gekippt: die
 * haengenden Blaetter muessen weiter funktionieren.
 *
 * ⛔ WAS DIE BRUECKE NICHT IST: keine dritte Zugangsquelle. Auflage 4 aus
 * `_lib/ausleihZugang.ts` gilt unveraendert — der Alt-Token wird NIE als Sitzung akzeptiert.
 * Er wird nur UEBERSETZT: passt er, leitet das Gate auf `/t/<code>` weiter, und dort laeuft
 * dieselbe Einloesung wie fuer jeden Aufsteller-QR (Host-Riegel, Schranke, DB-Recheck,
 * `last_used_at`, signiertes Cookie). Widerruf geht damit ueber die Verwaltung: den
 * hinterlegten Zugangscode deaktivieren, und der Alt-QR ist tot — ohne Neustart.
 *
 * ⛔ UND SIE HAT DAS ABLAUFDATUM, das die Begruendung von Auflage 4 einfordert
 * („eine Doppelakzeptanz brauchte ein Ablaufdatum, das niemand setzt"): `RADIO_ALT_TOKEN_BIS`
 * ist PFLICHT, sobald `RADIO_ALT_TOKEN` gesetzt ist, und der Boot bricht ohne es ab.
 *
 * Drei Variablen, alle in `.env.example` beschrieben:
 *   RADIO_ALT_TOKEN       der Klartext-`API_TOKEN` des Alt-Kiosks (nicht die Base64-Form)
 *   RADIO_ALT_TOKEN_CODE  der Zugangscode, fuer den der Alt-QR steht, wie gedruckt
 *   RADIO_ALT_TOKEN_BIS   ISO-Datum (YYYY-MM-DD); ab diesem Tag ist die Bruecke aus
 */

type EnvLike = Record<string, string | undefined>;

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

function ablauf(env: EnvLike): Date | null {
  const roh = env.RADIO_ALT_TOKEN_BIS?.trim() ?? "";
  if (!ISO_TAG.test(roh)) return null;
  const d = new Date(`${roh}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Das Umleitungsziel fuer `?token=`, oder `null`, wenn die Bruecke nicht greift — aus
 * welchem Grund auch immer. Von aussen ist „aus", „falsch" und „abgelaufen" nicht
 * unterscheidbar; das Gate zeigt dann sein leeres Codefeld wie vor der Bruecke.
 *
 * ⛔ Der Vergleich ist zeitkonstant. Der Token ist ein Geheimnis, und ein `===` auf einer
 * oeffentlich erreichbaren Route verriete seine Laenge und sein Praefix ueber die Laufzeit.
 */
export function altTokenZiel(
  param: string | undefined,
  env: EnvLike = process.env,
  jetzt: Date = new Date(),
): string | null {
  const erwartet = env.RADIO_ALT_TOKEN?.trim() ?? "";
  const code = env.RADIO_ALT_TOKEN_CODE?.trim() ?? "";
  const bis = ablauf(env);
  if (!erwartet || !code || !bis || !param) return null;
  if (jetzt.getTime() >= bis.getTime()) return null;

  // Base64 strikt: was nach dem Rundlauf nicht zeichengleich ist, war kein Base64.
  const bytes = Buffer.from(param, "base64");
  if (bytes.toString("base64") !== param) return null;

  const soll = Buffer.from(erwartet);
  if (bytes.length !== soll.length || !timingSafeEqual(bytes, soll)) return null;

  return `/t/${code}`;
}

/** Boot-Meldungen. Leer, solange `RADIO_ALT_TOKEN` nicht gesetzt ist. WIRFT NIE. */
export function altTokenFehler(env: EnvLike = process.env, jetzt: Date = new Date()): string[] {
  if (!env.RADIO_ALT_TOKEN?.trim()) return [];
  const fehler: string[] = [];

  const code = env.RADIO_ALT_TOKEN_CODE?.trim() ?? "";
  if (!code) {
    fehler.push("RADIO_ALT_TOKEN ist gesetzt, aber RADIO_ALT_TOKEN_CODE fehlt: welcher Zugangscode soll für den alten QR-Code stehen?");
  } else if (!istCodeForm(code)) {
    fehler.push(`RADIO_ALT_TOKEN_CODE=${code} hat nicht die Form eines Zugangscodes (sieben Vierergruppen, wie gedruckt).`);
  }

  const bis = ablauf(env);
  if (!bis) {
    fehler.push("RADIO_ALT_TOKEN ist gesetzt, aber RADIO_ALT_TOKEN_BIS fehlt oder ist kein Datum der Form YYYY-MM-DD: die Brücke für den alten QR-Code braucht ein Ablaufdatum.");
  } else if (jetzt.getTime() >= bis.getTime()) {
    fehler.push(`RADIO_ALT_TOKEN_BIS=${env.RADIO_ALT_TOKEN_BIS?.trim()} liegt in der Vergangenheit: die Brücke ist abgelaufen — Variable leeren oder Datum verlängern.`);
  }
  return fehler;
}
