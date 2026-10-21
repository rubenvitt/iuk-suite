/**
 * Die HTTP-Seite der HiOrg-Anbindung: Anmeldeadresse, Code-Tausch, Erneuerung, Kontoname und die
 * Personalliste. Reine Funktionen über ein übergebenes `fetch`, damit die Tests ohne Netz laufen.
 *
 * Endpunkte (https://api.hiorg-server.de/docs; „Der OAuth-Pfad ist abweichend von der restlichen API
 * versioniert!“): `/oauth/v1/authorize`, `/oauth/v1/token`, `/oauth/v1/userinfo`, `/core/v1/personal`.
 *
 * PKCE (S256) geht mit, obwohl die Doku es nicht nennt: der Server antwortet im Stil der PHP-League-
 * Bibliothek, die PKCE prüft, sobald eine `code_challenge` kommt — und ohne sie nichts verlangt.
 * Antworten von HiOrg werden nie protokolliert: sie tragen Personaldaten bzw. Tokens.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { HIORG_SCOPE, type HiorgKonfiguration } from "./konfiguration";
import { lesePersonal, type QuellPerson } from "./person";

export type Abruf = typeof fetch;

const ZEITLIMIT_MS = 20_000;
/** Obergrenzen gegen eine Endlosschleife über `links.next`. */
const HOECHSTENS_SEITEN = 50;
const HOECHSTENS_PERSONEN = 5_000;

export class HiorgFehler extends Error {
  constructor(message: string, readonly art: "anmeldung" | "abruf" | "antwort" = "abruf") {
    super(message);
  }
}

const zufall = () => randomBytes(32).toString("base64url");

export function neuerVorgang(): { state: string; verifier: string; challenge: string } {
  const verifier = zufall();
  return { state: zufall(), verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function anmeldeAdresse(k: HiorgKonfiguration, state: string, challenge: string): string {
  const q = new URLSearchParams({
    response_type: "code", client_id: k.clientId, redirect_uri: k.rueckruf, scope: HIORG_SCOPE, state,
    code_challenge: challenge, code_challenge_method: "S256",
  });
  if (k.organisation) q.set("ov", k.organisation);
  return `${k.basis}/oauth/v1/authorize?${q.toString()}`;
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
});
export type Tokens = { accessToken: string; refreshToken: string | null; laeuftAbIn: number };

async function tokenAnfrage(k: HiorgKonfiguration, abruf: Abruf, felder: Record<string, string>): Promise<Tokens> {
  let antwort: Response;
  try {
    antwort = await abruf(`${k.basis}/oauth/v1/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ ...felder, client_id: k.clientId, client_secret: k.clientSecret }).toString(),
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      cache: "no-store",
    });
  } catch {
    throw new HiorgFehler("HiOrg-Server ist gerade nicht erreichbar.");
  }
  if (antwort.status === 400 || antwort.status === 401) {
    throw new HiorgFehler("HiOrg-Server hat die Anmeldung nicht angenommen. Bitte neu verbinden.", "anmeldung");
  }
  if (!antwort.ok) throw new HiorgFehler(`HiOrg-Server antwortet mit Status ${antwort.status}.`);
  const t = tokenSchema.safeParse(await antwort.json().catch(() => null));
  if (!t.success) throw new HiorgFehler("HiOrg-Server hat kein lesbares Token geliefert.", "antwort");
  return { accessToken: t.data.access_token, refreshToken: t.data.refresh_token ?? null, laeuftAbIn: t.data.expires_in ?? 300 };
}

export function tauscheCode(k: HiorgKonfiguration, abruf: Abruf, code: string, verifier: string): Promise<Tokens> {
  return tokenAnfrage(k, abruf, { grant_type: "authorization_code", code, redirect_uri: k.rueckruf, code_verifier: verifier });
}

/** HiOrg kann bei jeder Erneuerung ein neues Refresh-Token ausgeben; das alte gilt dann nicht mehr. */
export function erneuere(k: HiorgKonfiguration, abruf: Abruf, refreshToken: string): Promise<Tokens> {
  return tokenAnfrage(k, abruf, { grant_type: "refresh_token", refresh_token: refreshToken, scope: HIORG_SCOPE });
}

async function hole(abruf: Abruf, url: string, accessToken: string): Promise<unknown> {
  let antwort: Response;
  try {
    antwort = await abruf(url, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/vnd.api+json, application/json" },
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      cache: "no-store",
    });
  } catch {
    throw new HiorgFehler("HiOrg-Server ist gerade nicht erreichbar.");
  }
  if (antwort.status === 401) throw new HiorgFehler("Die Verbindung zu HiOrg-Server ist abgelaufen. Bitte neu verbinden.", "anmeldung");
  if (antwort.status === 403) throw new HiorgFehler("Das verbundene HiOrg-Konto darf das Personal nicht lesen. Bitte mit einem Konto mit Personal-Leserecht neu verbinden.", "anmeldung");
  if (antwort.status === 503) throw new HiorgFehler("HiOrg-Server wird gerade gewartet. Bitte später noch einmal versuchen.");
  if (!antwort.ok) throw new HiorgFehler(`HiOrg-Server antwortet mit Status ${antwort.status}.`);
  return antwort.json().catch(() => {
    throw new HiorgFehler("HiOrg-Server hat keine lesbare Antwort geliefert.", "antwort");
  });
}

const userinfoSchema = z.object({ name: z.string().optional(), preferred_username: z.string().optional() });

/** Nur der Anzeigename des verbundenen Kontos („verbunden als …“); E-Mail, Geburtstag usw. bleiben liegen. */
export async function kontoName(k: HiorgKonfiguration, abruf: Abruf, accessToken: string): Promise<string> {
  const u = userinfoSchema.safeParse(await hole(abruf, `${k.basis}/oauth/v1/userinfo`, accessToken));
  const name = u.success ? (u.data.name?.trim() || u.data.preferred_username?.trim()) : undefined;
  return (name || "HiOrg-Konto").slice(0, 120);
}

/**
 * Die ganze Personalliste, schon bei HiOrg auf die gewählten Kontostatus beschränkt
 * (`filter[status]`). Folgt `links.next`, falls HiOrg seitenweise ausliefert, und nur auf demselben
 * Host — ein `next` anderswohin bekäme sonst das Access-Token mitgeschickt.
 */
export async function holePersonal(
  k: HiorgKonfiguration, abruf: Abruf, accessToken: string, status: string,
): Promise<{ personen: QuellPerson[]; unlesbar: number }> {
  const start = new URL(`${k.basis}/core/v1/personal`);
  if (status) start.searchParams.set("filter[status]", status);
  const personen: QuellPerson[] = [];
  let unlesbar = 0;
  let url: string | null = start.toString();
  for (let seite = 0; url !== null; seite++) {
    if (seite >= HOECHSTENS_SEITEN) throw new HiorgFehler("HiOrg-Server liefert mehr Seiten als erwartet; Abgleich abgebrochen.", "antwort");
    const gelesen = lesePersonal(await hole(abruf, url, accessToken));
    if (!gelesen.ok) throw new HiorgFehler(gelesen.fehler, "antwort");
    personen.push(...gelesen.personen);
    unlesbar += gelesen.unlesbar;
    if (personen.length > HOECHSTENS_PERSONEN) throw new HiorgFehler("HiOrg-Server liefert mehr Personen als erwartet; Abgleich abgebrochen.", "antwort");
    const weiter: string | null = gelesen.weiter;
    url = weiter && new URL(weiter).host === start.host ? weiter : null;
  }
  return { personen, unlesbar };
}
