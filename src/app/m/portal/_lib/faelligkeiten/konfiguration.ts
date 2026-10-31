/**
 * DER PUSH FÜR „WAS STEHT AN" — je Person ein eigenes Thema auf dem eigenen ntfy-Container (IDA-297),
 * und die Vorgabe ist AUS. Ohne `SUITE_FAELLIG_NTFY_SERVER` und Token gibt es weder Abo-Abschnitt noch
 * Versand: ein Thema, an das nie etwas geht, wäre eine Anleitung ins Leere.
 *
 * ⚠️ BEWUSST NICHT DAS THEMA DER SERVERWARTUNG UND NICHT NTFY.SH. Die Wartung braucht einen Server, der
 * weiterläuft, wenn der Suite-Server ausfällt (`serverwartung.ts`). Für eine Erinnerung an Fristen ist
 * das unkritisch: fällt der Server aus, kommt sie einen Tag später.
 *
 * ⚠️ SCHREIBEN NUR MIT TOKEN. Der Container läuft mit `deny-all` als Vorgabe; die Suite sendet als
 * eigener ntfy-Benutzer mit Token an `<präfix>*`, alle anderen dürfen dort höchstens lesen (Runbook
 * `docs/runbooks/faelligkeiten-ntfy.md`). Das Thema einer Person ist ein Zufallsname hinter dem Präfix;
 * wer ihn kennt, liest mit. Deshalb steht im Push kein Klarname (`core/faelligkeiten.ts`, Feld `person`).
 *
 * ⚠️ SERVERSEITIG, NICHT `NEXT_PUBLIC_*` — dieselbe Begründung wie in `serverwartung.ts`.
 * Kein `"use client"` (Falle 6).
 */
import { FAELLIG_ANZEIGENAME, ntfyAboAus, type NtfyAbo } from "@/app/m/portal/_lib/ntfy";

type EnvLike = Record<string, string | undefined>;

/** Der öffentliche ntfy-Server, so wie ihn die App erreicht, z. B. `https://ntfy.iuk-ue.de`. */
export const FAELLIG_SERVER_ENV = "SUITE_FAELLIG_NTFY_SERVER";
/** Das Token des ntfy-Benutzers, mit dem die Suite sendet (`tk_…`). */
export const FAELLIG_TOKEN_ENV = "SUITE_FAELLIG_NTFY_TOKEN";
/**
 * Optional: die Adresse, über die die Suite den Container erreicht (`http://ntfy` im Compose-Netz).
 * Ohne sie geht der Versand an `SUITE_FAELLIG_NTFY_SERVER`.
 *
 * ⚠️ NUR INTERNE ZIELE: ein Dienstname ohne Punkt (`ntfy`) oder Loopback. An diese Adresse geht das
 * Token der Suite; ein Tippfehler zu einem fremden Host schickte es nach draußen.
 */
export const FAELLIG_INTERN_ENV = "SUITE_FAELLIG_NTFY_INTERN";
/**
 * Optional: der Anfang jedes Themas. Er muss zur Zugriffsliste des Containers passen
 * (`SUITE_NTFY_AUTH_ACCESS`, `<präfix>*`).
 */
export const FAELLIG_PRAEFIX_ENV = "SUITE_FAELLIG_NTFY_PRAEFIX";
export const STANDARD_PRAEFIX = "iuk-faellig-";

/** Länge des Zufallsteils. 20 Zeichen aus 36 sind gut 100 Bit — nicht zu erraten. */
export const ZUFALL_LAENGE = 20;
const PRAEFIX = /^[A-Za-z0-9_-]{1,40}$/;

export { FAELLIG_ANZEIGENAME };

export interface Versand {
  /** `https://<server>` — daraus entsteht die Abo-Adresse für die App. */
  serverUrl: string;
  /** Wohin gepostet wird: die Wurzel des ntfy-Servers (öffentlich oder intern), ohne Schrägstrich. */
  basis: string;
  token: string;
  praefix: string;
}

export interface SendeZiel {
  basis: string;
  thema: string;
  token: string;
}

let schonGewarnt = false;

/** Nur für Tests: die Warnsperre zurücknehmen. */
export function _warnsperreZuruecksetzen(): void {
  schonGewarnt = false;
}

function warneEinmal(meldung: string, warnen: (m: string) => void): void {
  if (schonGewarnt) return;
  schonGewarnt = true;
  warnen(meldung);
}

function wurzel(roh: string): string | null {
  try {
    const u = new URL(roh);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.search || u.hash || u.username || u.password || u.pathname.replace(/\/+$/, "") !== "") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Ein Compose-Dienstname (ohne Punkt) oder Loopback — nichts, was über das Internet aufgelöst wird. */
function istIntern(host: string): boolean {
  return LOOPBACK.has(host) || /^[a-z0-9][a-z0-9_-]*$/i.test(host);
}

/** Ist der Versand eingerichtet? `null` heißt: kein Abo-Abschnitt, kein Takt. Warnungen nennen keine Werte. */
export function versand(env: EnvLike = process.env, warnen: (m: string) => void = console.warn): Versand | null {
  const roh = env[FAELLIG_SERVER_ENV]?.trim();
  if (!roh) return null;
  const serverUrl = wurzel(roh);
  if (!serverUrl) {
    warneEinmal(`${FAELLIG_SERVER_ENV} ist keine Server-Adresse der Form https://<server> — der Push für „Was steht an" bleibt aus.`, warnen);
    return null;
  }
  const token = env[FAELLIG_TOKEN_ENV]?.trim();
  if (!token) {
    warneEinmal(`${FAELLIG_SERVER_ENV} ist gesetzt, ${FAELLIG_TOKEN_ENV} fehlt — der Push für „Was steht an" bleibt aus.`, warnen);
    return null;
  }
  const praefixRoh = env[FAELLIG_PRAEFIX_ENV]?.trim();
  let praefix = STANDARD_PRAEFIX;
  if (praefixRoh) {
    if (PRAEFIX.test(praefixRoh)) praefix = praefixRoh;
    else warneEinmal(`${FAELLIG_PRAEFIX_ENV} enthält Zeichen, die ntfy nicht annimmt — es gilt „${STANDARD_PRAEFIX}".`, warnen);
  }
  let basis = serverUrl;
  const intern = env[FAELLIG_INTERN_ENV]?.trim();
  if (intern) {
    const w = wurzel(intern);
    if (w && istIntern(new URL(w).hostname)) basis = w;
    else warneEinmal(`${FAELLIG_INTERN_ENV} ist keine interne http(s)-Adresse (Dienstname wie „ntfy" oder Loopback) — gesendet wird an den öffentlichen Server.`, warnen);
  }
  return { serverUrl, basis, token, praefix };
}

/** Das Abo einer Person für die Anleitung (App-Link, Server, Thema). */
export function aboFuer(v: Versand, thema: string): NtfyAbo | null {
  return ntfyAboAus(`${v.serverUrl}/${thema}`, FAELLIG_ANZEIGENAME);
}

export function sendeZielFuer(v: Versand, thema: string): SendeZiel {
  return { basis: v.basis, thema, token: v.token };
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Ein neues Thema: Präfix plus Zufallsteil, ohne Bezug zur Person. */
export function neuesThema(praefix: string, zufall: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // 252 = 7 · 36: Bytes darüber verwerfen, sonst kämen die ersten Zeichen öfter vor.
  let teil = "";
  while (teil.length < ZUFALL_LAENGE) {
    for (const b of zufall(ZUFALL_LAENGE * 2)) {
      if (b < 252 && teil.length < ZUFALL_LAENGE) teil += ALPHABET[b % 36];
    }
  }
  return `${praefix}${teil}`;
}
