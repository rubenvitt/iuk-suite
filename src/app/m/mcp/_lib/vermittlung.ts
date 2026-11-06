/**
 * AUTOMATISCH REGISTRIEREN, OBWOHL POCKET ID ES NICHT KANN: MCP-Clients wie Claude registrieren sich am
 * liebsten selbst (RFC 7591, DCR). Pocket ID kann das nicht, deshalb tritt der MCP-Host als Autorisierungsserver
 * auf (RFC 8414) und vermittelt nur:
 *
 * - `/register` gibt jedem Client den festen öffentlichen Client „Suite MCP“ (`MCP_CLIENT_ID`). So kommen auch
 *   ChatGPT (CIMD nur mit Schlüssel, das nimmt Pocket ID nicht) und andere Clients ohne eingetragene Client-ID an.
 * - `/authorize` schickt die Person zu Pocket ID, mit dem eigenen Rückweg `/callback` und der PKCE-Challenge des
 *   Clients. `/callback` gibt den Code von Pocket ID an den Rückweg des Clients weiter, mit dem eigenen `iss`
 *   (RFC 9207: der Client vergleicht ihn mit dem Aussteller, den er hier gefunden hat).
 * - `/token` reicht an Pocket ID weiter, mit dem eigenen Rückweg statt dem des Clients.
 *
 * Anmeldung, Sperre, Gruppen und die Tokens selbst bleiben bei Pocket ID; die Suite stellt nichts aus und sieht
 * den PKCE-Verifier nur auf dem Weg durch. Der `resource`-Parameter (RFC 8707) geht nicht weiter: Pocket ID
 * kennt ihn nicht, und der Empfänger steckt ohnehin in der Client-ID (`token.ts`).
 *
 * Angenommen werden nur Rückwege, die auch am Client in Pocket ID stünden (Runbook `mcp-inbetriebnahme.md`),
 * sonst wäre `/callback` eine offene Umleitung.
 */
import { randomBytes } from "node:crypto";
import { herkunft, istMcpHost, MCP_SCOPES } from "./ressource";
import { entdecke, mcpClientIds, type Discovery } from "./token";

export const PFADE = { registrierung: "/register", anmeldung: "/authorize", rueckweg: "/callback", token: "/token" } as const;

const ERLAUBTE_RUECKWEGE = [
  /^https:\/\/claude\.ai\/api\/mcp\/auth_callback$/,
  /^https:\/\/claude\.com\/api\/mcp\/auth_callback$/,
  /^https:\/\/chatgpt\.com\/connector_platform_oauth_redirect$/,
  /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/,
  /^http:\/\/localhost(:\d{1,5})?\/callback$/,
];

export function rueckwegErlaubt(uri: string): boolean {
  return ERLAUBTE_RUECKWEGE.some((m) => m.test(uri));
}

/** Die Metadaten des MCP-Hosts als Autorisierungsserver; `herkunft` ist zugleich sein `issuer`. */
export function autorisierungsserver(herkunft: string) {
  return {
    issuer: herkunft,
    authorization_endpoint: `${herkunft}${PFADE.anmeldung}`,
    token_endpoint: `${herkunft}${PFADE.token}`,
    registration_endpoint: `${herkunft}${PFADE.registrierung}`,
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
  };
}

// ---------------------------------------------------------------- Registrierung

export type Registrierung =
  | { ok: true; antwort: Record<string, unknown> }
  | { ok: false; fehler: "invalid_redirect_uri" | "invalid_client_metadata"; beschreibung: string };

/** Eine Registrierung nach RFC 7591: immer derselbe öffentliche Client, wenn die Rückwege passen. */
export function registriere(eingabe: unknown, clientId: string, jetzt = Date.now()): Registrierung {
  const e = (eingabe && typeof eingabe === "object" ? eingabe : {}) as Record<string, unknown>;
  const rueckwege = e.redirect_uris;
  if (!Array.isArray(rueckwege) || rueckwege.length === 0 || !rueckwege.every((u) => typeof u === "string")) {
    return { ok: false, fehler: "invalid_redirect_uri", beschreibung: "redirect_uris fehlt" };
  }
  const fremd = rueckwege.filter((u) => !rueckwegErlaubt(u));
  if (fremd.length > 0) {
    return { ok: false, fehler: "invalid_redirect_uri", beschreibung: `Nicht erlaubt: ${fremd.join(", ")}` };
  }
  // Wer ein Geheimnis oder einen Schlüssel möchte, bekommt trotzdem einen öffentlichen Client (RFC 7591, 3.2.1:
  // der Server darf Metadaten ersetzen); die Antwort sagt `none`, und PKCE schützt den Code.
  return {
    ok: true,
    antwort: {
      client_id: clientId,
      client_id_issued_at: Math.floor(jetzt / 1000),
      client_name: typeof e.client_name === "string" ? e.client_name : "Suite MCP",
      redirect_uris: rueckwege,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: MCP_SCOPES.join(" "),
    },
  };
}

// ---------------------------------------------------------------- Merkzettel

const FRIST_MS = 10 * 60_000;
const MAX = 2000;

/** Kurzlebige Einträge im Prozess: ein Suite-Container, und eine Anmeldung dauert Minuten, nicht Stunden. */
class Merkzettel<T> {
  private eintraege = new Map<string, { wert: T; bis: number }>();
  lege(schluessel: string, wert: T, jetzt: number): void {
    if (this.eintraege.size >= MAX) {
      for (const [k, v] of this.eintraege) if (v.bis <= jetzt) this.eintraege.delete(k);
      if (this.eintraege.size >= MAX) this.eintraege.delete(this.eintraege.keys().next().value!);
    }
    this.eintraege.set(schluessel, { wert, bis: jetzt + FRIST_MS });
  }
  /** Einmal lesbar. */
  nimm(schluessel: string, jetzt: number): T | null {
    const e = this.eintraege.get(schluessel);
    this.eintraege.delete(schluessel);
    return e && e.bis > jetzt ? e.wert : null;
  }
  leere(): void {
    this.eintraege.clear();
  }
}

/** Offene Anmeldungen: unser `state` → Rückweg und `state` des Clients. */
const anmeldungen = new Merkzettel<{ rueckweg: string; state: string | null }>();
/** Ausgegebene Codes → der Rückweg, mit dem sie angefordert wurden (RFC 6749, 4.1.3). */
const codes = new Merkzettel<string>();

/** Nur für Tests. */
export function vergissAnmeldungen(): void {
  anmeldungen.leere();
  codes.leere();
}

export interface Umfeld {
  /** `https://mcp.iuk-ue.de` */
  herkunft: string;
  clientId: string;
  pocket: Discovery & { issuer: string };
  jetzt?: number;
}

/** Das Umfeld einer Anfrage auf dem MCP-Host; `null`, wenn hier nichts zu vermitteln ist (anderer Host, nicht eingerichtet). */
export async function umfeldFuer(kopf: Headers, env: Record<string, string | undefined> = process.env): Promise<Umfeld | null> {
  const issuer = env.POCKET_ID_ISSUER?.replace(/\/$/, "");
  const [clientId] = mcpClientIds(env);
  if (!istMcpHost(kopf) || !issuer || !clientId) return null;
  return { herkunft: herkunft(kopf), clientId, pocket: { ...(await entdecke(issuer)), issuer } };
}

export type Weiter =
  | { art: "umleiten"; ziel: string }
  | { art: "fehler"; status: number; text: string };

function mitParametern(basis: string, p: Record<string, string | null | undefined>): string {
  const url = new URL(basis);
  for (const [k, v] of Object.entries(p)) if (v != null) url.searchParams.set(k, v);
  return url.toString();
}

// ---------------------------------------------------------------- /authorize

export function anmeldungStarten(q: URLSearchParams, u: Umfeld): Weiter {
  const rueckweg = q.get("redirect_uri");
  // Ohne gültigen Rückweg wird nicht umgeleitet (RFC 6749, 4.1.2.1).
  if (q.get("client_id") !== u.clientId) return { art: "fehler", status: 400, text: "Unbekannter Client." };
  if (!rueckweg || !rueckwegErlaubt(rueckweg)) return { art: "fehler", status: 400, text: "Rückweg nicht erlaubt." };
  const state = q.get("state");
  const zurueck = (error: string, beschreibung: string): Weiter => ({
    art: "umleiten",
    ziel: mitParametern(rueckweg, { error, error_description: beschreibung, state, iss: u.herkunft }),
  });
  if (q.get("response_type") !== "code") return zurueck("unsupported_response_type", "Nur response_type=code.");
  const challenge = q.get("code_challenge");
  if (!challenge || q.get("code_challenge_method") !== "S256") return zurueck("invalid_request", "PKCE mit S256 ist Pflicht.");

  const unserState = randomBytes(24).toString("base64url");
  anmeldungen.lege(unserState, { rueckweg, state }, u.jetzt ?? Date.now());
  return {
    art: "umleiten",
    ziel: mitParametern(u.pocket.authorization_endpoint, {
      client_id: u.clientId,
      redirect_uri: `${u.herkunft}${PFADE.rueckweg}`,
      response_type: "code",
      // Immer mit `groups`: ohne die Gruppen kennt der Server die Rechte nicht.
      scope: MCP_SCOPES.join(" "),
      state: unserState,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: q.get("prompt"),
    }),
  };
}

// ---------------------------------------------------------------- /callback

export function anmeldungZurueck(q: URLSearchParams, u: Umfeld): Weiter {
  const jetzt = u.jetzt ?? Date.now();
  const offen = anmeldungen.nimm(q.get("state") ?? "", jetzt);
  if (!offen) return { art: "fehler", status: 400, text: "Die Anmeldung ist abgelaufen. Bitte neu verbinden." };
  const iss = q.get("iss");
  const weiter = (p: Record<string, string | null>): Weiter => ({
    art: "umleiten",
    ziel: mitParametern(offen.rueckweg, { ...p, state: offen.state, iss: u.herkunft }),
  });
  if (iss !== null && iss.replace(/\/$/, "") !== u.pocket.issuer) {
    return weiter({ error: "server_error", error_description: "Unerwarteter Aussteller." });
  }
  const code = q.get("code");
  if (!code) {
    return weiter({ error: q.get("error") ?? "server_error", error_description: q.get("error_description") });
  }
  codes.lege(code, offen.rueckweg, jetzt);
  return weiter({ code });
}

// ---------------------------------------------------------------- /token

export type TokenWeiter =
  | { ok: true; formular: URLSearchParams }
  | { ok: false; status: number; fehler: string; beschreibung: string };

export function tokenAnfrage(f: URLSearchParams, u: Umfeld): TokenWeiter {
  const nein = (fehler: string, beschreibung: string, status = 400): TokenWeiter => ({ ok: false, status, fehler, beschreibung });
  const clientId = f.get("client_id");
  if (clientId !== null && clientId !== u.clientId) return nein("invalid_client", "Unbekannter Client.", 401);
  const art = f.get("grant_type");
  if (art === "authorization_code") {
    const code = f.get("code");
    const verifier = f.get("code_verifier");
    if (!code || !verifier) return nein("invalid_request", "code und code_verifier sind Pflicht.");
    const rueckweg = codes.nimm(code, u.jetzt ?? Date.now());
    if (!rueckweg) return nein("invalid_grant", "Code unbekannt oder abgelaufen.");
    const angegeben = f.get("redirect_uri");
    if (angegeben !== null && angegeben !== rueckweg) return nein("invalid_grant", "Rückweg passt nicht zum Code.");
    return {
      ok: true,
      formular: new URLSearchParams({
        grant_type: art, code, code_verifier: verifier, client_id: u.clientId, redirect_uri: `${u.herkunft}${PFADE.rueckweg}`,
      }),
    };
  }
  if (art === "refresh_token") {
    const refresh = f.get("refresh_token");
    if (!refresh) return nein("invalid_request", "refresh_token ist Pflicht.");
    return { ok: true, formular: new URLSearchParams({ grant_type: art, refresh_token: refresh, client_id: u.clientId }) };
  }
  return nein("unsupported_grant_type", "Nur authorization_code und refresh_token.");
}
