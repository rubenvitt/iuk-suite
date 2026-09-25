/**
 * Die Anmeldeseite des Einsatzbuch-Rechners (`/anmelden`, Spec §12, Drahtvertrag Nr. 1) — ohne
 * Suite-Chrome, ohne `notFound()`: eine ungültige Anmeldung zeigt eine eigene Seite, kein 404.
 *
 * Bewusst KEIN `requireEinsatzbuchZugang` aus `_lib/zugang.ts`: der wirft bei fehlender Gruppe
 * `notFound()` und leitet ohne Sitzung mit einer FESTEN `callbackUrl` (`/m/einsatzbuch`) um. Diese
 * Seite braucht beides anders — „Kein Zugang zum Einsatzbuch“ statt 404, und einen `callbackUrl`,
 * der die Anmeldeparameter der App trägt, sonst stünde die App nach dem Login ohne ihre Query da.
 */
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hatEinsatzbuchZugang, type Viewer } from "../zugang";
import { GEHEIMNIS } from "./token";

const PORT_MIN = 1024;
const PORT_MAX = 65535;
// Nur Ziffern, keine führende Null (Brief Schritt 2: "port=08080" wird abgewiesen).
const PORT_RE = /^[1-9]\d*$/;
const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const NAME_MAX = 60;

export type Anmeldeparameter = {
  port: number;
  state: string;
  challenge: string;
  einrichtung: { art: "echt" | "test"; name: string } | null;
};

/** Ein Query-Parameter kann doppelt vorkommen; Next liefert dann ein Array. Der erste gewinnt. */
function einzelwert(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Liest und prüft die Anmeldeparameter (Drahtvertrag Nr. 1). `null` heißt: die Adresse ist
 * unvollständig oder verstümmelt — die Seite zeigt dann „Anmeldung nicht möglich“.
 */
export function leseAnmeldeparameter(sp: Record<string, string | string[] | undefined>): Anmeldeparameter | null {
  const portRaw = einzelwert(sp.port);
  if (!portRaw || !PORT_RE.test(portRaw)) return null;
  const port = Number(portRaw);
  if (!Number.isSafeInteger(port) || port < PORT_MIN || port > PORT_MAX) return null;

  const state = einzelwert(sp.state);
  if (!state || !STATE_RE.test(state)) return null;

  const challenge = einzelwert(sp.challenge);
  if (!challenge || !GEHEIMNIS.test(challenge)) return null;

  const artRaw = einzelwert(sp.art);
  let einrichtung: Anmeldeparameter["einrichtung"] = null;
  if (artRaw !== undefined) {
    if (artRaw !== "echt" && artRaw !== "test") return null;
    const name = einzelwert(sp.name)?.trim();
    if (!name || name.length < 1 || name.length > NAME_MAX) return null;
    einrichtung = { art: artRaw, name };
  }
  return { port, state, challenge, einrichtung };
}

/**
 * Der kanonische Pfad samt Query, WIE `leseAnmeldeparameter` ihn gelesen hat — für den
 * Login-`callbackUrl` und (Schritt 4) die Ersetzen-Frage. Eine feste Feldreihenfolge statt der
 * rohen Query macht den Vergleich in Tests exakt, ohne die Bedeutung zu ändern: der Browser
 * reicht `callbackUrl` unverändert durch `absoluteCallbackUrl` (`src/components/login-form.tsx`)
 * an dieselbe Seite zurück, die ihn gelesen hat.
 */
export function anmeldePfad(p: Anmeldeparameter): string {
  const params = new URLSearchParams({ port: String(p.port), state: p.state, challenge: p.challenge });
  if (p.einrichtung) {
    params.set("art", p.einrichtung.art);
    params.set("name", p.einrichtung.name);
  }
  return `/anmelden?${params.toString()}`;
}

/** Immer `http://127.0.0.1:<port>/rueckruf…` (Drahtvertrag, Abschnitt „Loopback-Rückruf“). */
export function rueckrufUrl(
  p: { port: number; state: string },
  q: { code: string } | { fehler: "kein_zugang" | "abgebrochen" },
): string {
  const params = new URLSearchParams();
  if ("code" in q) {
    params.set("code", q.code);
    params.set("state", p.state);
  } else {
    params.set("state", p.state);
    params.set("fehler", q.fehler);
  }
  return `http://127.0.0.1:${p.port}/rueckruf?${params.toString()}`;
}

export type Anmeldezugang =
  | { art: "anmelden"; loginUrl: string }
  | { art: "kein_zugang" }
  | { art: "ok"; viewer: Viewer };

/**
 * Entscheidet den Zugang zur Anmeldeseite und auditiert SELBST (`auditLoginRequired` bzw.
 * `auditDenied`) — die Seite (`page.tsx`) braucht damit keinen eigenen Audit-Zweig neben ihrem
 * `redirect(loginUrl)`; der Manifest-Eintrag dafür ist `excluded` mit der Begründung „Anmeldeumweg
 * ohne Sitzung; Audit per auditLoginRequired in _lib“.
 */
export async function anmeldezugang(pfadMitQuery: string): Promise<Anmeldezugang> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("einsatzbuch");
    return { art: "anmelden", loginUrl: `/login?callbackUrl=${encodeURIComponent(pfadMitQuery)}` };
  }
  if (!hatEinsatzbuchZugang(viewer.groups)) {
    auditDenied("einsatzbuch", auditActor(viewer));
    return { art: "kein_zugang" };
  }
  return { art: "ok", viewer };
}
