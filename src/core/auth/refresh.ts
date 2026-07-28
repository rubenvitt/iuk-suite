import type { JWT } from "next-auth/jwt";
import { parseGroups } from "@/core/auth/groups";
import { parseFachgruppen } from "@/core/auth/fachgruppen";

type EnvLike = Record<string, string | undefined>;

/**
 * Der Netzwerkrand als Schnittstelle — strukturell kompatibel zu `fetch`, aber
 * so schmal, dass ein Test kein `Response`-Objekt bauen muss. Dasselbe Muster
 * wie `DirectoryTransport` in `core/directory/index.ts`; die Begruendung steht
 * dort und gilt hier woertlich.
 */
export type TokenTransport = (
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Budget fuer Entdeckung UND Token-Austausch zusammen. Der `jwt`-Callback
 *  laeuft im Anfragepfad; zwei Fuenf-Sekunden-Fenster waeren zehn Sekunden
 *  Wartezeit fuer den Nutzer. */
export const ZEITGRENZE_MS = 5_000;

/** Solange nach einem TRANSIENTEN Fehlschlag gar nicht erst gefragt wird.
 *  Ohne diese Bremse haelt die Suite einen wackelnden IdP aktiv nieder. */
export const BACKOFF_MS = 60_000;

/** Solange das Ergebnis einer Erneuerung im Prozess nachhallt (siehe unten). */
export const NACHHALL_MS = 60_000;

/** Ersatzfrist, wenn die Antwort weder `expires_at` noch `expires_in` nennt. */
export const ERSATZDAUER_S = 300;

/** Exportiert, weil `Gedaechtnis` darauf verweist — sonst waere der oeffentliche
 *  Typ ueber einen privaten definiert. */
export type Ergebnis =
  | { art: "erfolg"; felder: Partial<JWT> }
  | { art: "endgueltig" }
  | { art: "transient" };

export type Gedaechtnis = Map<string, { ergebnis: Promise<Ergebnis>; seitMs: number }>;

/**
 * PROZESSLOKALES GEDAECHTNIS GEGEN DOPPELTE ROTATION.
 *
 * Pocket ID rotiert Refresh-Tokens ohne Gnadenfrist (`RotateRefreshToken`,
 * store.go:200), und eine Wiederverwendung widerruft nicht nur den Token,
 * sondern die GESAMTE Sitzung (`handleRefreshTokenReuse` im Fosite-Fork).
 * Zwei gleichzeitige `/api/auth/session`-Anfragen — zwei Tabs, zwei
 * Modul-Hosts — tragen aber beide noch dasselbe alte Refresh-Token.
 *
 * Der Schluessel ist deshalb das ALTE Refresh-Token: „wer gibt genau dieses
 * Token aus". Der Nachhall ist der tragende Teil und nicht wegzukuerzen: die
 * zweite Anfrage ist typischerweise nicht gleichzeitig, sondern Sekunden
 * spaeter mit einem Cookie, das die erste noch nicht erneuert hatte.
 *
 * GRENZE, die im Betrieb gilt: das wirkt nur INNERHALB eines Prozesses. Die
 * Suite laeuft heute als ein Container (`output: "standalone"`). Kaeme je eine
 * zweite Replik dazu, degradiert dieser Schutz still auf nichts — dann braucht
 * es einen gemeinsamen Speicher.
 */
const gemeinsamesGedaechtnis: Gedaechtnis = new Map();

export type AuffrischOptionen = {
  /**
   * Ob das Ergebnis dieses Aufrufs ueberhaupt beim Browser ankommen kann.
   * `false` fuer `auth()` aus RSC/Server Action/Route Handler — dort wirft
   * next-auth das `Set-Cookie` weg (lib/index.js:91 liest nur `r.json()`).
   * Siehe `core/auth/config.ts`.
   */
  darfSchreiben: boolean;
  transport?: TokenTransport;
  jetzt?: () => number;
  env?: EnvLike;
  zeitgrenzeMs?: number;
  gedaechtnis?: Gedaechtnis;
};

// Kein Cast noetig: `Response` erfuellt `{ ok, status, json }` strukturell, und
// `{ method, headers, body, signal }` ist eine Teilmenge von `RequestInit`.
// Bricht das je im Typecheck, ist die Schnittstelle oben verrutscht — nicht
// wegcasten, sondern nachsehen.
const standardTransport: TokenTransport = (url, init) => fetch(url, init);

/**
 * Dekodiert den Mittelteil eines JWT OHNE Signaturpruefung.
 *
 * Das ist hier korrekt und die Begruendung gehoert an diese Stelle: das Token
 * kommt aus einer direkten, TLS-gesicherten Antwort des Token-Endpoints auf
 * eine mit Client-Secret authentifizierte Anfrage. Es ist nie durch den
 * Browser gelaufen. Der Fall, gegen den eine Signaturpruefung schuetzt — ein
 * untergeschobenes Token —, existiert auf diesem Weg nicht.
 *
 * `Buffer.from(…, "base64url")` und NICHT `atob`: base64url benutzt `-`/`_`
 * und laesst die Polsterung weg, `atob` wirft daran. Der Fehler waere still
 * gewesen (null -> alte Gruppen bleiben). `refresh.test.ts` haelt ein echtes
 * Segment vor, an dem `atob` nachweislich scheitert.
 */
export function idTokenAnsprueche(idToken: unknown): Record<string, unknown> | null {
  if (typeof idToken !== "string") return null;
  const teile = idToken.split(".");
  if (teile.length !== 3) return null;
  try {
    const nutzlast: unknown = JSON.parse(Buffer.from(teile[1], "base64url").toString("utf8"));
    if (!nutzlast || typeof nutzlast !== "object" || Array.isArray(nutzlast)) return null;
    return nutzlast as Record<string, unknown>;
  } catch {
    return null;
  }
}

type Umfeld = {
  transport: TokenTransport;
  env: EnvLike;
  zeitgrenzeMs: number;
  jetztMs: number;
};

async function endgueltigerFehler(antwort: {
  status: number;
  json: () => Promise<unknown>;
}): Promise<boolean> {
  // `invalid_grant` ist der OAuth-2.0-Code (RFC 6749 §5.2) fuer „dieses
  // Refresh-Token gilt nicht mehr". NUR er rechtfertigt einen Rauswurf, und
  // nur zusammen mit 400/401 — Pocket ID antwortet in diesem Fall mit 400.
  if (antwort.status !== 400 && antwort.status !== 401) return false;
  try {
    const koerper = (await antwort.json()) as { error?: unknown };
    return koerper?.error === "invalid_grant";
  } catch {
    return false;
  }
}

/** Fuehrt den Austausch wirklich durch. Wirft NIE — jeder Ausgang ist ein `Ergebnis`. */
async function austauschen(alterToken: string, umfeld: Umfeld): Promise<Ergebnis> {
  const { transport, env, zeitgrenzeMs, jetztMs } = umfeld;
  const issuer = env.POCKET_ID_ISSUER;
  if (!issuer) return { art: "transient" };

  try {
    // EIN Signal fuer beide Anfragen: das Budget gilt fuer den ganzen Vorgang.
    const signal = AbortSignal.timeout(zeitgrenzeMs);

    const entdeckung = await transport(`${issuer}/.well-known/openid-configuration`, { signal });
    if (!entdeckung.ok) return { art: "transient" };
    const konfig = (await entdeckung.json()) as { token_endpoint?: unknown };
    if (typeof konfig.token_endpoint !== "string") return { art: "transient" };

    const antwort = await transport(konfig.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: alterToken,
        client_id: env.POCKET_ID_CLIENT_ID ?? "",
        client_secret: env.POCKET_ID_CLIENT_SECRET ?? "",
      }).toString(),
      signal,
    });

    if (!antwort.ok) {
      return (await endgueltigerFehler(antwort)) ? { art: "endgueltig" } : { art: "transient" };
    }

    const erneuert = (await antwort.json()) as {
      access_token?: unknown;
      id_token?: unknown;
      refresh_token?: unknown;
      expires_at?: unknown;
      expires_in?: unknown;
    };

    // AB HIER IST DAS ALTE REFRESH-TOKEN TOT. Was jetzt noch verworfen wird,
    // kostet die Sitzung — deshalb wird jedes brauchbare Feld uebernommen,
    // auch wenn andere fehlen.
    const felder: Partial<JWT> = {};
    if (typeof erneuert.refresh_token === "string") felder.refreshToken = erneuert.refresh_token;
    if (typeof erneuert.access_token === "string") felder.accessToken = erneuert.access_token;
    if (typeof erneuert.id_token === "string") felder.idToken = erneuert.id_token;

    // Niemals NaN (dann wuerde nie wieder aufgefrischt) und niemals „jetzt"
    // (dann liefe jeder Request in einen neuen Austausch).
    felder.expiresAt =
      typeof erneuert.expires_at === "number"
        ? erneuert.expires_at
        : typeof erneuert.expires_in === "number"
          ? Math.floor(jetztMs / 1000) + erneuert.expires_in
          : Math.floor(jetztMs / 1000) + ERSATZDAUER_S;

    // Gruppen NEU aus dem frischen ID-Token, nicht aus dem alten Token
    // durchgereicht: sonst friert die Autorisierung beim Login ein und ein
    // Gruppenentzug in Pocket ID wirkt bis zu 30 Tage lang nicht. Pocket ID
    // berechnet die Claims bei JEDEM Grant neu (claims_service.go) und braucht
    // dafuer den `groups`-Scope — den fragt `pocketId.ts` an.
    const ansprueche = idTokenAnsprueche(erneuert.id_token);
    if (ansprueche) {
      felder.groups = parseGroups(ansprueche, env.POCKET_ID_GROUPS_CLAIM ?? "groups");
      felder.fachgruppen = parseFachgruppen(
        ansprueche,
        env.POCKET_ID_FACHGRUPPEN_CLAIM ?? "fachgruppen",
      );
    }

    return { art: "erfolg", felder };
  } catch {
    // Netzwerkfehler, Timeout, kaputtes JSON — alles transient.
    return { art: "transient" };
  }
}

function geteilterAustausch(
  alterToken: string,
  umfeld: Umfeld,
  gedaechtnis: Gedaechtnis,
): Promise<Ergebnis> {
  for (const [schluessel, eintrag] of gedaechtnis) {
    if (umfeld.jetztMs - eintrag.seitMs >= NACHHALL_MS) gedaechtnis.delete(schluessel);
  }
  const vorhanden = gedaechtnis.get(alterToken);
  if (vorhanden) return vorhanden.ergebnis;

  const ergebnis = austauschen(alterToken, umfeld);
  gedaechtnis.set(alterToken, { ergebnis, seitMs: umfeld.jetztMs });
  return ergebnis;
}

/**
 * Frischt den Zugriffstoken auf, wenn es noetig UND sinnvoll ist.
 *
 * Drei Ausgaenge statt zwei:
 *   Erfolg          -> neue Token, `error` und `refreshFailedAt` geloescht,
 *                      Gruppen aus dem neuen `id_token`
 *   Endgueltig tot  -> `error: "RefreshTokenError"`, `refreshFailedAt`
 *                      geloescht (nur bei 400/401 + `invalid_grant`) -> der
 *                      SessionGuard uebernimmt
 *   Transient       -> Token UNVERAENDERT zurueck, nur `refreshFailedAt`
 *                      gesetzt. Die Suite nutzt den Access-Token nirgends fuer
 *                      Ressourcenzugriffe (Autorisierung laeuft ueber
 *                      `token.groups`), ein abgelaufener schadet also nicht.
 *                      Das ist der richtige Preis fuer einen Netzaussetzer.
 */
export async function tokenAuffrischen(token: JWT, optionen: AuffrischOptionen): Promise<JWT> {
  const {
    darfSchreiben,
    transport = standardTransport,
    jetzt = () => Date.now(),
    env = process.env,
    zeitgrenzeMs = ZEITGRENZE_MS,
    gedaechtnis = gemeinsamesGedaechtnis,
  } = optionen;

  const jetztMs = jetzt();

  // Einmal endgueltig gescheitert heisst: nicht weiter anklopfen. Der
  // SessionGuard raeumt die Sitzung ab; jeder weitere Versuch waere ein
  // Reuse-Versuch gegen ein Token, das Pocket ID bereits widerrufen hat.
  if (token.error === "RefreshTokenError") return token;
  if (typeof token.expiresAt !== "number") return token;
  if (jetztMs / 1000 <= token.expiresAt) return token;

  // VOR dem Netz, nie danach: ein Austausch, dessen Ergebnis weggeworfen wird,
  // verbrennt die Rotation und toetet die Sitzung.
  if (!darfSchreiben) return token;

  if (typeof token.refreshFailedAt === "number" && jetztMs - token.refreshFailedAt < BACKOFF_MS) {
    // NICHT nachstempeln — sonst schoebe jeder Request das Fenster vor sich her
    // und der Backoff liefe nie ab.
    return token;
  }

  const alterToken = typeof token.refreshToken === "string" ? token.refreshToken : null;
  if (!alterToken) return { ...token, error: "RefreshTokenError" };

  const ergebnis = await geteilterAustausch(
    alterToken,
    { transport, env, zeitgrenzeMs, jetztMs },
    gedaechtnis,
  );

  if (ergebnis.art === "endgueltig")
    return { ...token, error: "RefreshTokenError", refreshFailedAt: undefined };
  if (ergebnis.art === "transient") return { ...token, refreshFailedAt: jetztMs };
  return { ...token, ...ergebnis.felder, error: undefined, refreshFailedAt: undefined };
}
