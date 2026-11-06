/**
 * WER RUFT DEN MCP-SERVER AUF (IDA-367): das Bearer-Token aus `Authorization`, ausgestellt von Pocket ID für den
 * OIDC-Client des MCP-Servers. Die Suite ist hier nur Resource Server (MCP-Autorisierung, RFC 9728): sie stellt
 * keine eigenen Tokens aus, Anmeldung, Sperre und Gruppen bleiben bei Pocket ID.
 *
 * Geprüft wird zweimal:
 * 1. Signatur, Aussteller, Ablauf und Empfänger des JWT. Der Empfänger (`aud`) muss ein Client aus
 *    `MCP_CLIENT_ID` sein — sonst könnte ein Token, das eine andere Anwendung von Pocket ID bekommen hat, hier
 *    die Rechte seiner Person ausüben (Confused Deputy).
 * 2. Die Gruppen und der Name kommen vom Userinfo-Endpunkt, nicht aus dem Token: das Zugriffstoken trägt sie
 *    nicht, und so wirkt ein Gruppenentzug spätestens nach `PERSON_TTL_MS` — schneller als in der App, deren
 *    Gruppen nur mit dem Token-Refresh nachziehen.
 */
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { parseGroups } from "@/core/auth/groups";

type EnvLike = Record<string, string | undefined>;

export interface McpPerson {
  /** Der OIDC-`sub` — dieselbe Kennung wie `session.user.id` in der App und im Audit-Log. */
  sub: string;
  name: string | null;
  email: string | null;
  groups: string[];
}

export type TokenErgebnis =
  | { ok: true; person: McpPerson }
  | { ok: false; grund: "fehlt" | "ungueltig" | "nicht_eingerichtet" };

/** Was die Prüfung von außen braucht — in Tests ersetzbar. */
export interface TokenPruefer {
  issuer: string;
  clientIds: readonly string[];
  schluessel: JWTVerifyGetKey;
  userinfo: (token: string) => Promise<Record<string, unknown> | null>;
  jetzt?: () => number;
}

/** Die Clients, deren Tokens der MCP-Server annimmt: `MCP_CLIENT_ID`, mehrere durch Komma. */
export function mcpClientIds(env: EnvLike = process.env): string[] {
  return (env.MCP_CLIENT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Der Bearer-Wert aus dem Kopf, sonst `null`. */
export function bearerAus(kopf: string | null): string | null {
  const m = kopf?.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i);
  return m ? m[1] : null;
}

const PERSON_TTL_MS = 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { person: McpPerson; bis: number }>();

/** Nur für Tests. */
export function vergissPersonen(): void {
  cache.clear();
}

function streuwert(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function pruefeToken(kopf: string | null, p: TokenPruefer): Promise<TokenErgebnis> {
  const token = bearerAus(kopf);
  if (!token) return { ok: false, grund: "fehlt" };
  if (p.clientIds.length === 0) return { ok: false, grund: "nicht_eingerichtet" };
  const jetzt = (p.jetzt ?? Date.now)();

  const schluessel = streuwert(token);
  const gemerkt = cache.get(schluessel);
  if (gemerkt && gemerkt.bis > jetzt) return { ok: true, person: gemerkt.person };

  let sub: string;
  try {
    const { payload } = await jwtVerify(token, p.schluessel, {
      issuer: p.issuer,
      audience: [...p.clientIds],
      currentDate: new Date(jetzt),
      algorithms: ["RS256", "ES256", "EdDSA"],
    });
    if (typeof payload.sub !== "string" || payload.sub === "") return { ok: false, grund: "ungueltig" };
    sub = payload.sub;
  } catch {
    return { ok: false, grund: "ungueltig" };
  }

  let info: Record<string, unknown> | null;
  try {
    info = await p.userinfo(token);
  } catch {
    info = null;
  }
  // Ein Userinfo zu einer anderen Person ist kein Versehen, das man still übergeht.
  if (!info || info.sub !== sub) return { ok: false, grund: "ungueltig" };

  const text = (w: unknown) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);
  const person: McpPerson = {
    sub,
    name: text(info.name) ?? text(info.display_name) ?? text(info.preferred_username),
    email: text(info.email),
    groups: parseGroups(info),
  };
  if (cache.size >= CACHE_MAX) {
    for (const [k, v] of cache) if (v.bis <= jetzt) cache.delete(k);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  }
  cache.set(schluessel, { person, bis: jetzt + PERSON_TTL_MS });
  return { ok: true, person };
}

// ---------------------------------------------------------------- Pocket ID als Gegenüber

interface Discovery { jwks_uri: string; userinfo_endpoint: string }
let discovery: { issuer: string; wert: Promise<Discovery> } | null = null;
let jwks: { uri: string; set: JWTVerifyGetKey } | null = null;

function entdecke(issuer: string): Promise<Discovery> {
  if (discovery?.issuer !== issuer) {
    const wert = fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`discovery ${r.status}`);
        const d = (await r.json()) as Partial<Discovery>;
        if (typeof d.jwks_uri !== "string" || typeof d.userinfo_endpoint !== "string") throw new Error("discovery unvollständig");
        return { jwks_uri: d.jwks_uri, userinfo_endpoint: d.userinfo_endpoint };
      });
    // Ein Fehlschlag bleibt nicht hängen: der nächste Aufruf fragt neu.
    wert.catch(() => { if (discovery?.wert === wert) discovery = null; });
    discovery = { issuer, wert };
  }
  return discovery.wert;
}

/** Die Prüfung gegen das Pocket ID aus `POCKET_ID_ISSUER`; `null`, wenn der Server nicht eingerichtet ist. */
export function pocketIdPruefer(env: EnvLike = process.env): TokenPruefer | null {
  const issuer = env.POCKET_ID_ISSUER?.replace(/\/$/, "");
  const clientIds = mcpClientIds(env);
  if (!issuer || clientIds.length === 0) return null;
  return {
    issuer,
    clientIds,
    schluessel: async (kopf, token) => {
      const { jwks_uri } = await entdecke(issuer);
      if (jwks?.uri !== jwks_uri) jwks = { uri: jwks_uri, set: createRemoteJWKSet(new URL(jwks_uri)) };
      return jwks.set(kopf, token);
    },
    userinfo: async (token) => {
      const { userinfo_endpoint } = await entdecke(issuer);
      const r = await fetch(userinfo_endpoint, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!r.ok) return null;
      const info = (await r.json()) as unknown;
      return info && typeof info === "object" ? (info as Record<string, unknown>) : null;
    },
  };
}
