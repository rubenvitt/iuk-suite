# Auth — Sitzungsdauer und Robustheit (Teilprojekt B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Netzaussetzer wirft niemanden mehr aus der Suite; nur ein wirklich totes Refresh-Token
tut das. Die Sitzung steht explizit auf 30 Tagen — und ist nur deshalb vertretbar, weil die Gruppen
im JWT ab jetzt bei jedem erfolgreichen Refresh aus dem neuen `id_token` nachgezogen werden statt
beim Login einzufrieren.

**Architecture:** Die Refresh-Logik zieht aus der NextAuth-Konfiguration in ein eigenes
`src/core/auth/refresh.ts` (reine Berechnung plus ein injizierter Transport, prüfbar wie
`suiteRedirect` und `authCookies`). Die Konfiguration selbst zieht nach `src/core/auth/config.ts`
und wird **pro Anfrage** gebaut — `NextAuth(request => …)` statt `NextAuth({…})`. Das ist kein
Selbstzweck: die Signatur `request === undefined` ist der einzige verlässliche Hinweis darauf, dass
Auth.js das `Set-Cookie` dieses Aufrufs wegwirft, und genau dort darf nicht aufgefrischt werden
(Begründung unten, „Der Befund, der alles trägt"). `src/core/auth/index.ts` schrumpft auf den
`NextAuth()`-Aufruf. Clientseitig bekommt `SessionGuard` einen sanften Re-Login mit einem
Zeitstempel-Riegel statt des sofortigen harten Logouts.

**Tech Stack:** Next.js 16 (App Router, RSC), Auth.js v5 (`next-auth@5.0.0-beta.30`,
`@auth/core@0.41.0`), Pocket ID (OIDC), Vitest (node + jsdom), Playwright.

---

## Der Befund, der alles trägt — bitte vor Task 1 lesen

Der Spec nennt in §2.1a das Einfrieren der Gruppen. Beim Lesen des Codes kam ein **zweiter** Befund
dazu, der dieselbe Wurzel hat und die Reihenfolge im Plan bestimmt. Beide sind nachgemessen, nicht
vermutet.

**(1) `auth()` in einer Server Component wirft das `Set-Cookie` weg.**

```js
// node_modules/next-auth/lib/index.js:91 — der RSC-Zweig von initAuth()
return Promise.resolve(headers()).then((h) => getSession(h, config).then((r) => r.json()));
```

Nur `r.json()` wird gelesen; `r.headers.getSetCookie()` nicht. Zum Vergleich der API-Routes-Zweig
(Z. 77–85) und der Middleware-Zweig (Z. 166–170) — beide propagieren `set-cookie` ausdrücklich.
`src/middleware.ts` gibt es in diesem Projekt **nicht** (geprüft), also bleibt für RSC nur der erste
Zweig.

Der `jwt`-Callback läuft trotzdem — bei **jedem** `auth()`:

```js
// node_modules/.pnpm/@auth+core@0.41.0/node_modules/@auth/core/lib/actions/session.js:28-32
const token = await callbacks.jwt({
    token: payload,
    ...(isUpdate && { trigger: "update" }),
    session: newSession,
});
```

**(2) Pocket ID rotiert Refresh-Tokens, ohne Gnadenfrist — und ein Wiederverwenden killt die ganze
Sitzung.**

```go
// pocket-id/pocket-id backend/internal/oidc/store.go:200
func (s *Store) RotateRefreshToken(ctx context.Context, requestID string, refreshTokenSignature string) error {
	if err := s.deactivateSession(ctx, sessionKindRefreshToken, refreshTokenSignature); err != nil {
		return err
	}
	return s.RevokeAccessToken(ctx, requestID)
}
```

```go
// pocket-id/fosite handler/oauth2/flow_refresh.go:47-52 — Wiederverwendung
if errors.Is(err, fosite.ErrInactiveToken) {
    if rErr := c.handleRefreshTokenReuse(ctx, signature, originalRequest); rErr != nil { … }
    return fosite.ErrInvalidGrant.WithWrap(err).WithHint("The refresh token was already used.")
}
```

`handleRefreshTokenReuse` widerruft **alle** zugehörigen Tokens, nicht nur das eine.

**Die beiden zusammen ergeben den Defekt, den der Spec nicht kennt:** eine Server Component ruft
`auth()`, der Access-Token ist abgelaufen, `refreshAccessToken` läuft, Pocket ID rotiert — und das
neue Refresh-Token landet in einem `Set-Cookie`, das Auth.js wegwirft. Das Cookie im Browser trägt
weiterhin das **verbrauchte** Token. Der nächste Refresh ist damit eine Wiederverwendung, Pocket ID
widerruft die gesamte Sitzung, und die Antwort ist `invalid_grant`. Nach der Änderung aus Spec §2.1
ist genau das der Auslöser für den harten Logout. Der Zyklus dauert eine Access-Token-Lebensdauer,
also **eine Stunde** (Pocket ID: `AccessTokenLifespan` ungesetzt → Fosite-Default `time.Hour`,
empirisch `expires_in` 3598–3600 in deren E2E-Test).

Das ist mit hoher Wahrscheinlichkeit die Ursache des gemeldeten „ich werde ständig rausgeworfen" —
und §2.1 allein würde sie **nicht** beheben, sondern nur den Fehlertext ändern.

**Die Antwort** ist die Konfigurationsfunktion. `NextAuth` nimmt laut
`node_modules/next-auth/index.d.ts:323` wahlweise ein Objekt oder
`(request: NextRequest | undefined) => Awaitable<NextAuthConfig>`. Im Funktionszweig
(`node_modules/next-auth/index.js:101-125`) gilt:

| Aufrufweg | Argument | `Set-Cookie` kommt an? |
|---|---|---|
| `handlers` GET/POST `/api/auth/*` | `config(req)` | ja |
| `auth()` in RSC / Server Action / Route Handler | `config(undefined)` | **nein** |
| `auth()` in Middleware / API Route | `config(req)` | ja |
| server-`signIn`/`signOut`/`unstable_update` | `config(undefined)` | — (kein Refresh nötig) |

Also: **auffrischen nur, wenn `request !== undefined`.** Das schließt gleichzeitig drei Löcher — die
verbrannte Rotation, die doppelte Refresh-Anfrage pro Seitenaufruf, und das nie persistierte
`refreshFailedAt` des Backoffs.

Der Takt bleibt trotzdem dicht genug: `SessionProvider` steht im Root-Layout und ruft
`GET /api/auth/session` beim Mount (`node_modules/next-auth/react.js:283`) und bei jedem
`visibilitychange` (`react.js:304-315`, `refetchOnWindowFocus` Default `true`). Jeder Seitenaufruf
im Browser trifft also den Pfad, auf dem aufgefrischt **und** gespeichert wird.

**Was danach als Restrisiko bleibt** — und deshalb in Task 1 noch mitbehandelt wird: zwei
*gleichzeitige* `/api/auth/session`-Anfragen (zwei Tabs, zwei Modul-Hosts) tragen beide noch das alte
Refresh-Token und lösen zwei Rotationen aus. Die zweite ist eine Wiederverwendung und tötet die
Sitzung. Dagegen steht ein prozesslokales Gedächtnis, das eine laufende Erneuerung teilt und ihr
Ergebnis 60 s nachhallen lässt.

**Der Satz, der drei Entwurfsentscheidungen entscheidet:** *Sobald der Token-Endpoint 200 antwortet,
ist das alte Refresh-Token tot.* Eine 200er-Antwort darf deshalb **nie** verworfen werden — auch
dann nicht, wenn ihr Inhalt unbrauchbar aussieht.

---

## Global Constraints

Diese gelten für **jede** Aufgabe.

- **Deutsche Bezeichner, Kommentare und Testbeschreibungen.** Passend zum umgebenden Code.
- **Befehle mit `rtk` präfigieren** (`rtk pnpm typecheck`, `rtk pnpm vitest run`, `rtk git commit`, …).
  Die Shell ist **fish** — kein `&&`-freies Bash-Idiom voraussetzen, keine `export VAR=…`-Syntax.
- **`pnpm lint` muss Exit 0 liefern.** Fehler blockieren die CI, Warnungen nicht; zwei Warnungen sind
  vorbestehend und dürfen stehen bleiben. Keine dritte hinzufügen.
- **Kein Compound-Zugriff auf antd in Server Components** (`Typography.Title`, `Form.Item`, …). Für B
  kaum relevant — `providers.tsx` ist eine Client Component —, gilt aber.
- **Regel für `src/core`:** nur was ein zweites, heute belegbares Modul braucht. Hier erfüllt: Auth
  ist Querschnitt, alle Module hängen daran.
- **Tests folgen dem Muster des Projekts:** reine Berechnungen bekommen ihre Umgebung als letzten
  Parameter mit Default `process.env` (`cookies.ts`, `redirect.ts`); Netz wird **injiziert**, nicht
  global gemockt (`core/directory/index.ts:99-107` begründet das ausführlich); DOM-Tests nutzen
  `src/app/m/qr/_lib/test-dom.tsx`. **Kein zweites Harness erfinden.**
- **jsdom nur, wo nötig:** `vitest.config.ts` setzt `environment: "node"` global; jsdom kommt per
  `// @vitest-environment jsdom` in **Zeile 1** der jeweiligen Testdatei.
- **Kein `globals: true`** — jede Testdatei importiert `describe`/`it`/`expect`/`vi` explizit.
- **Zeit fälschen** nur als `vi.useFakeTimers({ toFake: ["Date"] })` (Muster aus
  `src/app/m/feedback/actions.test.ts:530-532`: ein voller Timer-Fake hängt bei dynamischen Imports).
  In `refresh.test.ts` wird Zeit gar nicht gefälscht, sondern über `optionen.jetzt` injiziert.

---

## Bestehende Zusagen, die nicht brechen dürfen

| Zusage | Wo geprüft |
|---|---|
| `authCookies()` setzt Domain auf allen fünf Login-Cookies und fasst `csrfToken` nicht an | `core/auth/cookies.test.ts` |
| `authCookies()` überschreibt keine Defaults außer `domain` und `secure` | `core/auth/cookies.test.ts:79-81` |
| `pocketIdProvider()` aktiviert mindestens `state` und `pkce` | `core/auth/pocketId.test.ts` |
| `suiteRedirect` lässt nur Suite-Hosts durch | `core/auth/redirect.test.ts` |
| Der Abmelden-Knopf geht über `/api/auth/oidc-signout` | `core/shell/SuiteNav.test.tsx:108` |
| `/api/auth/oidc-signout` leitet auf `end_session_endpoint` bzw. `/login` | `app/api/auth/oidc-signout/route.test.ts` |
| Dev-Login funktioniert ohne jede Pocket-ID-Variable | `e2e/*` über `devLogin()` in `e2e/helpers/` |
| Login von einer Modul-Domain landet wieder auf der Modul-Domain | `e2e/keystone.spec.ts`, `core/auth/callbackUrl.test.ts` |

**Bewusst geändert wird:** `Providers` bekommt eine **Pflicht-Prop** `reauthProvider`. Einziger
Aufrufer ist `src/app/layout.tsx` (Task 5, Schritt 1 prüft das nach).

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/core/auth/refresh.ts` | **neu** — Erneuerung des Zugriffstokens: Klassifikation, Timeout, Backoff, Gruppen aus dem neuen `id_token`, prozesslokales Gedächtnis gegen Doppel-Rotation (Task 1) |
| `src/core/auth/refresh.test.ts` | **neu** — die Zusagen aus Spec §4, Zeile für Zeile (Task 1) |
| `src/types/next-auth.d.ts` | **ändern** — `refreshFailedAt?: number` im JWT (Task 1) |
| `src/core/auth/config.ts` | **neu** — die NextAuth-Konfiguration als Funktion über `request` (Task 2) |
| `src/core/auth/config.test.ts` | **neu** — Sitzungswerte, Einfrier-Regression, Schreibrecht-Weiche (Task 2, 3, 4) |
| `src/core/auth/index.ts` | **ändern** — schrumpft auf `NextAuth(authConfig)` (Task 2) |
| `src/core/auth/cookies.test.ts` | **ändern** — das Session-Cookie trägt kein `maxAge` (Task 4) |
| `src/core/auth/pocketId.ts` | **ändern** — `POCKET_ID_PROVIDER_ID`, `reauthProviderId()` (Task 5) |
| `src/core/auth/pocketId.test.ts` | **ändern** — `reauthProviderId` (Task 5) |
| `src/components/providers.tsx` | **ändern** — sanfte Re-Authentifizierung mit Zeitstempel-Riegel (Task 5) |
| `src/components/providers.test.tsx` | **neu** — erster DOM-Test unter `src/components/` (Task 5) |
| `src/app/layout.tsx` | **ändern** — reicht `reauthProvider` durch (Task 5) |
| `CLAUDE.md` | **ändern** — ein Absatz zur Frische der Gruppen unter „Zugriffsschutz" (Task 6) |

---

### Task 1: `refresh.ts` — die Erneuerung als prüfbare Einheit

**Files:**
- Create: `src/core/auth/refresh.ts`
- Create: `src/core/auth/refresh.test.ts`
- Modify: `src/types/next-auth.d.ts`

**Interfaces:**
- Consumes: `parseGroups(source: Record<string, unknown>, claim?: string): string[]` aus
  `@/core/auth/groups`; `parseFachgruppen(source: Record<string, unknown>, claim?: string): string[]`
  aus `@/core/auth/fachgruppen`; `JWT` aus `next-auth/jwt`.
- Produces:
  - `export type TokenTransport = (url: string, init: { method?: string; headers?: Record<string,string>; body?: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>`
  - `export type Ergebnis = { art: "erfolg"; felder: Partial<JWT> } | { art: "endgueltig" } | { art: "transient" }`
  - `export type Gedaechtnis = Map<string, { ergebnis: Promise<Ergebnis>; seitMs: number }>`
  - `export type AuffrischOptionen = { darfSchreiben: boolean; transport?: TokenTransport; jetzt?: () => number; env?: Record<string,string|undefined>; zeitgrenzeMs?: number; gedaechtnis?: Gedaechtnis }`
  - `export async function tokenAuffrischen(token: JWT, optionen: AuffrischOptionen): Promise<JWT>`
  - `export function idTokenAnsprueche(idToken: unknown): Record<string, unknown> | null`
  - `export const ZEITGRENZE_MS = 5_000`, `BACKOFF_MS = 60_000`, `NACHHALL_MS = 60_000`, `ERSATZDAUER_S = 300`

- [ ] **Step 1: Typerweiterung schreiben**

In `src/types/next-auth.d.ts` im Block `declare module "next-auth/jwt"` **nach** `expiresAt?: number;`
einfügen:

```ts
    /**
     * Zeitpunkt (ms) des letzten TRANSIENT gescheiterten Refresh-Versuchs.
     * Traegt den Backoff aus `core/auth/refresh.ts`: solange weniger als
     * BACKOFF_MS her, wird der Token-Endpoint gar nicht erst gerufen. Wird bei
     * jedem Erfolg wieder geleert. Ein ENDGUELTIGER Fehlschlag setzt statt
     * dessen `error` — die beiden Felder schliessen einander aus.
     */
    refreshFailedAt?: number;
```

- [ ] **Step 2: Test schreiben**

Neue Datei `src/core/auth/refresh.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { JWT } from "next-auth/jwt";
import {
  tokenAuffrischen,
  idTokenAnsprueche,
  type TokenTransport,
  type AuffrischOptionen,
  type Gedaechtnis,
} from "@/core/auth/refresh";

/**
 * DIE ERNEUERUNG DES ZUGRIFFSTOKENS.
 *
 * Kein Test hier fasst das Netz an: `tokenAuffrischen` bekommt seinen Transport
 * injiziert — dasselbe Muster und dieselbe Begruendung wie
 * `core/directory/index.ts:99-107`. Auch die Zeit ist injiziert (`jetzt`), damit
 * Backoff und Nachhall ohne Fake-Timer pruefbar sind; `AbortSignal.timeout`
 * laeuft an Vitests Fake-Timern ohnehin vorbei (nativer Node-Timer).
 *
 * Was hier festgehalten wird, ist nicht Kosmetik: Pocket ID ROTIERT
 * Refresh-Tokens ohne Gnadenfrist, und eine Wiederverwendung widerruft die
 * KOMPLETTE Sitzung (`handleRefreshTokenReuse` im Fosite-Fork). Jeder Pfad, der
 * eine 200er-Antwort verwirft, kostet die Sitzung.
 */

const ENV = {
  POCKET_ID_ISSUER: "https://id.example.test",
  POCKET_ID_CLIENT_ID: "suite",
  POCKET_ID_CLIENT_SECRET: "geheim",
};

const ENTDECKUNG = `${ENV.POCKET_ID_ISSUER}/.well-known/openid-configuration`;
const TOKEN_ENDPOINT = `${ENV.POCKET_ID_ISSUER}/api/oidc/token`;

/** Fester Zeitpunkt in ms — 2027-01-15T08:00:00Z, weit nach jedem `expiresAt` unten. */
const JETZT = 1_800_000_000_000;

function idTokenBauen(nutzlast: Record<string, unknown>): string {
  const kopf = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }), "utf8").toString("base64url");
  const koerper = Buffer.from(JSON.stringify(nutzlast), "utf8").toString("base64url");
  // Die Unterschrift wird bewusst NICHT geprueft — Begruendung in refresh.ts.
  return `${kopf}.${koerper}.keine-echte-unterschrift`;
}

const ALT_GRUPPEN = ["da-feedback-admin", "fg-kueche"];

function abgelaufenerToken(zusatz: Partial<JWT> = {}): JWT {
  return {
    sub: "u-1",
    groups: [...ALT_GRUPPEN],
    fachgruppen: ["kueche"],
    accessToken: "at-alt",
    idToken: idTokenBauen({ groups: ALT_GRUPPEN, fachgruppen: ["kueche"] }),
    refreshToken: "rt-alt",
    // Sekunden seit Epoche, laengst vorbei.
    expiresAt: 1_000,
    ...zusatz,
  };
}

type Antwort = { ok: boolean; status: number; koerper: unknown };

/** Ein Transport, der feste Antworten ausliefert und jeden Aufruf mitschreibt. */
function transportBauen(antworten: { entdeckung?: Antwort; token?: Antwort }) {
  const aufrufe: Array<{ url: string; init: Parameters<TokenTransport>[1] }> = [];
  const t: TokenTransport = async (url, init) => {
    aufrufe.push({ url, init });
    const a = url.includes("/.well-known/")
      ? (antworten.entdeckung ?? { ok: true, status: 200, koerper: { token_endpoint: TOKEN_ENDPOINT } })
      : (antworten.token ?? { ok: true, status: 200, koerper: {} });
    return { ok: a.ok, status: a.status, json: async () => a.koerper };
  };
  return Object.assign(t, { aufrufe });
}

function erfolgsAntwort(zusatz: Record<string, unknown> = {}): Antwort {
  return {
    ok: true,
    status: 200,
    koerper: {
      access_token: "at-neu",
      refresh_token: "rt-neu",
      id_token: idTokenBauen({ groups: ALT_GRUPPEN, fachgruppen: ["kueche"] }),
      expires_in: 3600,
      ...zusatz,
    },
  };
}

/** Frische Optionen — vor allem ein FRISCHES Gedaechtnis pro Test. */
function optionen(
  transport: TokenTransport,
  zusatz: Partial<AuffrischOptionen> = {},
): AuffrischOptionen {
  return {
    darfSchreiben: true,
    transport,
    jetzt: () => JETZT,
    env: ENV,
    gedaechtnis: new Map() as Gedaechtnis,
    ...zusatz,
  };
}

describe("tokenAuffrischen — wann ueberhaupt gerufen wird", () => {
  it("laesst ein noch gueltiges Token unangetastet und fragt niemanden", async () => {
    const t = transportBauen({});
    const gueltig = abgelaufenerToken({ expiresAt: Math.floor(JETZT / 1000) + 600 });
    const ergebnis = await tokenAuffrischen(gueltig, optionen(t));
    expect(t.aufrufe).toHaveLength(0);
    expect(ergebnis).toBe(gueltig);
  });

  /**
   * DIE WICHTIGSTE WEICHE DES GANZEN PLANS.
   *
   * `auth()` in einer Server Component wirft das `Set-Cookie` weg
   * (next-auth/lib/index.js:91 liest nur `r.json()`). Ein Refresh auf diesem
   * Weg rotiert das Refresh-Token bei Pocket ID und verliert das neue —
   * der naechste Versuch ist eine Wiederverwendung, und die widerruft die
   * gesamte Sitzung. Ohne Schreibrecht wird deshalb gar nicht erst gefragt.
   */
  it("fragt ohne Schreibrecht gar nicht erst — der RSC-Pfad wuerde die Rotation verbrennen", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const token = abgelaufenerToken();
    const ergebnis = await tokenAuffrischen(token, optionen(t, { darfSchreiben: false }));
    expect(t.aufrufe).toHaveLength(0);
    expect(ergebnis).toBe(token);
    expect(ergebnis.refreshFailedAt).toBeUndefined();
  });

  it("versucht ein bereits endgueltig gescheitertes Token nicht erneut", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const ergebnis = await tokenAuffrischen(
      abgelaufenerToken({ error: "RefreshTokenError" }),
      optionen(t),
    );
    expect(t.aufrufe).toHaveLength(0);
    expect(ergebnis.error).toBe("RefreshTokenError");
  });

  it("ohne Refresh-Token ist die Sitzung endgueltig vorbei", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const ergebnis = await tokenAuffrischen(
      abgelaufenerToken({ refreshToken: undefined }),
      optionen(t),
    );
    expect(t.aufrufe).toHaveLength(0);
    expect(ergebnis.error).toBe("RefreshTokenError");
  });
});

describe("tokenAuffrischen — Fehler unterscheiden", () => {
  it("invalid_grant mit 400 beendet die Sitzung", async () => {
    const t = transportBauen({
      token: { ok: false, status: 400, koerper: { error: "invalid_grant" } },
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.error).toBe("RefreshTokenError");
    expect(ergebnis.refreshFailedAt).toBeUndefined();
  });

  /**
   * Ein falsches Client-Secret ist ein Konfigurationsfehler des Betreibers,
   * kein totes Token. Wer daraus einen Logout macht, wirft bei jedem
   * Fehlgriff in der .env die halbe Belegschaft raus.
   */
  it("400 mit einem anderen Fehlercode ist transient", async () => {
    const t = transportBauen({
      token: { ok: false, status: 400, koerper: { error: "invalid_client" } },
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.error).toBeUndefined();
    expect(ergebnis.refreshFailedAt).toBe(JETZT);
  });

  it("invalid_grant mit 500 ist transient — nur 400 und 401 zaehlen", async () => {
    const t = transportBauen({
      token: { ok: false, status: 500, koerper: { error: "invalid_grant" } },
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.error).toBeUndefined();
    expect(ergebnis.refreshFailedAt).toBe(JETZT);
  });

  it("5xx laesst Token, Gruppen und Refresh-Token unveraendert", async () => {
    const t = transportBauen({ token: { ok: false, status: 502, koerper: {} } });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.error).toBeUndefined();
    expect(ergebnis.groups).toEqual(ALT_GRUPPEN);
    expect(ergebnis.refreshToken).toBe("rt-alt");
    expect(ergebnis.accessToken).toBe("at-alt");
    expect(ergebnis.refreshFailedAt).toBe(JETZT);
  });

  it("ein Netzwerkfehler ist transient", async () => {
    const t: TokenTransport = async () => {
      throw new TypeError("fetch failed");
    };
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.error).toBeUndefined();
    expect(ergebnis.refreshFailedAt).toBe(JETZT);
  });

  it("eine unbrauchbare Entdeckungsantwort ist transient", async () => {
    const t = transportBauen({
      entdeckung: { ok: true, status: 200, koerper: { kein_token_endpoint: true } },
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.error).toBeUndefined();
    expect(ergebnis.refreshFailedAt).toBe(JETZT);
    // Der Token-Endpoint wurde nie gerufen: nur die Entdeckung steht im Protokoll.
    expect(t.aufrufe).toHaveLength(1);
  });
});

describe("tokenAuffrischen — Timeout", () => {
  /**
   * ECHTER `AbortSignal.timeout`, echte Zeit, nur sehr kurz. Der Transport
   * antwortet NIE und loest erst am Abbruch aus — genau wie `fetch`. Damit
   * prueft dieser Test, dass das Signal wirklich feuert, statt nur seine
   * Anwesenheit zu behaupten.
   */
  it("bricht einen haengenden Endpoint ab und wertet das als transient", async () => {
    const haengt: TokenTransport = (_url, init) =>
      new Promise((_, ablehnen) => {
        init.signal.addEventListener("abort", () => ablehnen(init.signal.reason));
      });
    const ergebnis = await tokenAuffrischen(
      abgelaufenerToken(),
      optionen(haengt, { zeitgrenzeMs: 20 }),
    );
    expect(ergebnis.error).toBeUndefined();
    expect(ergebnis.refreshFailedAt).toBe(JETZT);
  });

  it("gibt BEIDEN Anfragen dasselbe, noch nicht ausgeloeste Abbruchsignal mit", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(t.aufrufe).toHaveLength(2);
    for (const { init } of t.aufrufe) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal.aborted).toBe(false);
    }
    // Ein Budget fuer beide Anfragen zusammen, nicht zweimal fuenf Sekunden.
    expect(t.aufrufe[0].init.signal).toBe(t.aufrufe[1].init.signal);
  });
});

describe("tokenAuffrischen — Backoff", () => {
  it("ruft innerhalb des Fensters gar nicht erst an", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const token = abgelaufenerToken({ refreshFailedAt: JETZT - 30_000 });
    const ergebnis = await tokenAuffrischen(token, optionen(t));
    expect(t.aufrufe).toHaveLength(0);
    expect(ergebnis).toBe(token);
  });

  /**
   * DIE FALLE, DIE EIN NAIVER BACKOFF STELLT: wer bei jedem GEBLOCKTEN Aufruf
   * `refreshFailedAt` neu stempelt, schiebt das Fenster vor sich her. Bei einem
   * Request pro Sekunde liefe es nie ab — die Sitzung haette dann fuer immer
   * eingefrorene Gruppen und niemand wuerde es merken.
   */
  it("stempelt bei einem geblockten Aufruf NICHT nach", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const ergebnis = await tokenAuffrischen(
      abgelaufenerToken({ refreshFailedAt: JETZT - 30_000 }),
      optionen(t),
    );
    expect(ergebnis.refreshFailedAt).toBe(JETZT - 30_000);
  });

  it("versucht es nach Ablauf des Fensters wieder", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const ergebnis = await tokenAuffrischen(
      abgelaufenerToken({ refreshFailedAt: JETZT - 61_000 }),
      optionen(t),
    );
    expect(t.aufrufe).toHaveLength(2);
    expect(ergebnis.accessToken).toBe("at-neu");
    expect(ergebnis.refreshFailedAt).toBeUndefined();
  });
});

describe("tokenAuffrischen — Gruppen aus dem neuen id_token", () => {
  it("zieht Gruppen und Fachgruppen aus dem NEUEN id_token nach", async () => {
    const t = transportBauen({
      token: erfolgsAntwort({
        id_token: idTokenBauen({ groups: ["fg-kueche"], fachgruppen: ["kueche", "technik"] }),
      }),
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.groups).toEqual(["fg-kueche"]);
    expect(ergebnis.fachgruppen).toEqual(["kueche", "technik"]);
  });

  /**
   * DIE REGRESSION GEGEN DAS EINFRIEREN. Vorher stand hier
   * `["da-feedback-admin", "fg-kueche"]`; Pocket ID hat der Person alles
   * entzogen. Geprueft wird die LEERE MENGE, nicht „hat sich veraendert" —
   * ein Test auf `not.toEqual(alt)` waere auch gruen, wenn eine einzige
   * Gruppe uebrig bliebe, die laengst weg sein muesste.
   */
  it("ein Gruppenentzug in Pocket ID kommt an: aus zwei Gruppen wird die leere Menge", async () => {
    const t = transportBauen({
      token: erfolgsAntwort({ id_token: idTokenBauen({ groups: [], fachgruppen: [] }) }),
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.groups).toEqual([]);
    expect(ergebnis.fachgruppen).toEqual([]);
  });

  it("ohne id_token in der Antwort bleiben die alten Gruppen stehen", async () => {
    const alt = abgelaufenerToken();
    const t = transportBauen({ token: erfolgsAntwort({ id_token: undefined }) });
    const ergebnis = await tokenAuffrischen(alt, optionen(t));
    expect(ergebnis.groups).toEqual(ALT_GRUPPEN);
    expect(ergebnis.idToken).toBe(alt.idToken);
    expect(ergebnis.accessToken).toBe("at-neu");
  });

  it("bei einem transienten Fehler bleiben die alten Gruppen stehen", async () => {
    const t = transportBauen({ token: { ok: false, status: 503, koerper: {} } });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.groups).toEqual(ALT_GRUPPEN);
    expect(ergebnis.fachgruppen).toEqual(["kueche"]);
  });

  it("respektiert einen abweichenden Gruppen-Claim aus der Umgebung", async () => {
    const t = transportBauen({
      token: erfolgsAntwort({ id_token: idTokenBauen({ roles: ["chef"], groups: ["falsch"] }) }),
    });
    const ergebnis = await tokenAuffrischen(
      abgelaufenerToken(),
      optionen(t, { env: { ...ENV, POCKET_ID_GROUPS_CLAIM: "roles" } }),
    );
    expect(ergebnis.groups).toEqual(["chef"]);
  });
});

describe("tokenAuffrischen — eine 200er-Antwort wird nie verworfen", () => {
  /**
   * Sobald der Token-Endpoint 200 antwortet, ist das ALTE Refresh-Token tot
   * (`RotateRefreshToken` in Pocket IDs store.go:200). Wer die Antwort dann
   * wegen eines fehlenden Feldes verwirft, macht den naechsten Versuch zur
   * Wiederverwendung — und die widerruft bei Pocket ID die GANZE Sitzung.
   */
  it("uebernimmt das neue Refresh-Token auch ohne access_token", async () => {
    const t = transportBauen({
      token: { ok: true, status: 200, koerper: { refresh_token: "rt-neu", expires_in: 3600 } },
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.refreshToken).toBe("rt-neu");
    expect(ergebnis.error).toBeUndefined();
    expect(ergebnis.refreshFailedAt).toBeUndefined();
  });

  /**
   * Ohne `expires_in` UND ohne `expires_at` rechnete die alte Fassung
   * `Date.now()/1000 + undefined` = NaN. `NaN > x` ist immer falsch — die
   * Sitzung haette danach NIE wieder aufgefrischt und die Gruppen waeren
   * endgueltig eingefroren, ohne dass irgendwo ein Fehler auftaucht.
   */
  it("setzt eine Ersatzdauer statt NaN, wenn die Antwort keine Frist nennt", async () => {
    const t = transportBauen({
      token: { ok: true, status: 200, koerper: { access_token: "at-neu", refresh_token: "rt-neu" } },
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.expiresAt).toBe(Math.floor(JETZT / 1000) + 300);
    expect(Number.isFinite(ergebnis.expiresAt)).toBe(true);
  });

  it("bevorzugt expires_at, wenn beides kommt", async () => {
    const t = transportBauen({
      token: erfolgsAntwort({ expires_at: 2_000_000_000, expires_in: 3600 }),
    });
    const ergebnis = await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(ergebnis.expiresAt).toBe(2_000_000_000);
  });
});

describe("tokenAuffrischen — Gedaechtnis gegen doppelte Rotation", () => {
  it("zwei gleichzeitige Aufrufe verbrauchen das Refresh-Token nur EINMAL", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const gemeinsam = optionen(t);
    const [a, b] = await Promise.all([
      tokenAuffrischen(abgelaufenerToken(), gemeinsam),
      tokenAuffrischen(abgelaufenerToken(), gemeinsam),
    ]);
    // Genau eine Entdeckung und genau ein Token-Austausch, nicht zwei.
    expect(t.aufrufe).toHaveLength(2);
    expect(a.refreshToken).toBe("rt-neu");
    expect(b.refreshToken).toBe("rt-neu");
  });

  /**
   * Der Fall, den ein reines „laufende Anfragen zusammenlegen" NICHT faengt:
   * Tab A ist fertig und hat das Cookie erneuert, Tab B kommt Sekunden spaeter
   * mit dem alten Cookie an. Ohne Nachhall waere das eine Wiederverwendung.
   */
  it("ein Nachzuegler mit dem alten Refresh-Token bekommt das gespeicherte Ergebnis", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const gedaechtnis: Gedaechtnis = new Map();
    await tokenAuffrischen(abgelaufenerToken(), optionen(t, { gedaechtnis }));
    const spaeter = await tokenAuffrischen(
      abgelaufenerToken(),
      optionen(t, { gedaechtnis, jetzt: () => JETZT + 30_000 }),
    );
    expect(t.aufrufe).toHaveLength(2);
    expect(spaeter.refreshToken).toBe("rt-neu");
    expect(spaeter.accessToken).toBe("at-neu");
  });

  it("nach dem Nachhall wird wieder wirklich gefragt", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    const gedaechtnis: Gedaechtnis = new Map();
    await tokenAuffrischen(abgelaufenerToken(), optionen(t, { gedaechtnis }));
    await tokenAuffrischen(
      abgelaufenerToken(),
      optionen(t, { gedaechtnis, jetzt: () => JETZT + 61_000 }),
    );
    expect(t.aufrufe).toHaveLength(4);
    expect(gedaechtnis.size).toBe(1);
  });
});

describe("idTokenAnsprueche", () => {
  /**
   * DER GRUND, WARUM HIER `Buffer.from(…, "base64url")` UND NICHT `atob` STEHT.
   *
   * Das Segment unten ist echt (aus einem JSON mit `?`-Zeichen erzeugt): es
   * enthaelt ein `_` aus dem URL-sicheren Alphabet und hat eine Laenge, die
   * ohne Polsterung auskommt. `atob` wirft daran einen InvalidCharacterError.
   * Mit `atob` waere die Gruppenaktualisierung STILL ausgefallen — der
   * `catch`-Zweig haette `null` geliefert, und der Code haette brav die alten
   * Gruppen behalten. Gruen, plausibel, falsch.
   */
  const ECHTES_SEGMENT =
    "eyJzdWIiOiJ1LTEiLCJncm91cHMiOlsiZGEtZmVlZGJhY2stYWRtaW4iLCJmZy1rdWVjaGUiXSwiZmFjaGdydXBwZW4iOlsia3VlY2hlIl0sInByb2JlIjoiPz8_In0";

  it("dekodiert ein Segment, an dem atob scheitert", () => {
    expect(ECHTES_SEGMENT).toMatch(/_/);
    expect(ECHTES_SEGMENT).not.toContain("=");
    expect(() => atob(ECHTES_SEGMENT)).toThrow();

    const ansprueche = idTokenAnsprueche(`kopf.${ECHTES_SEGMENT}.unterschrift`);
    expect(ansprueche).toEqual({
      sub: "u-1",
      groups: ["da-feedback-admin", "fg-kueche"],
      fachgruppen: ["kueche"],
      probe: "???",
    });
  });

  it("liefert null statt zu werfen, wenn nichts Brauchbares kommt", () => {
    expect(idTokenAnsprueche(undefined)).toBeNull();
    expect(idTokenAnsprueche(42)).toBeNull();
    expect(idTokenAnsprueche("nur.zwei")).toBeNull();
    expect(idTokenAnsprueche("a.@@@nicht-base64@@@.c")).toBeNull();
    // Gueltiges base64url, aber kein Objekt — darf nicht als Anspruchsmenge durchgehen.
    expect(idTokenAnsprueche(`a.${Buffer.from("[1,2]", "utf8").toString("base64url")}.c`)).toBeNull();
  });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

```bash
rtk pnpm vitest run src/core/auth/refresh.test.ts
```
Expected: FAIL — `src/core/auth/refresh.ts` existiert nicht (Auflösungsfehler beim Import).

- [ ] **Step 4: `refresh.ts` implementieren**

Neue Datei `src/core/auth/refresh.ts`:

```ts
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

  // EIN Signal fuer beide Anfragen: das Budget gilt fuer den ganzen Vorgang.
  const signal = AbortSignal.timeout(zeitgrenzeMs);

  try {
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
 *   Endgueltig tot  -> `error: "RefreshTokenError"` (nur bei 400/401 +
 *                      `invalid_grant`) -> der SessionGuard uebernimmt
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

  if (ergebnis.art === "endgueltig") return { ...token, error: "RefreshTokenError" };
  if (ergebnis.art === "transient") return { ...token, refreshFailedAt: jetztMs };
  return { ...token, ...ergebnis.felder, error: undefined, refreshFailedAt: undefined };
}
```

**Wenn TypeScript `Buffer` nicht kennt:** `import { Buffer } from "node:buffer";` an den Anfang der
Datei. Die Datei läuft ausschließlich im Node-Runtime (kein `middleware.ts` im Projekt, also keine
Edge-Umgebung); wer je Middleware ergänzt, muss diese Zeile prüfen.

- [ ] **Step 5: Test laufen lassen**

```bash
rtk pnpm vitest run src/core/auth/refresh.test.ts
```
Expected: PASS (alle Blöcke grün).

**Wenn „gibt BEIDEN Anfragen dasselbe Abbruchsignal mit" fehlschlägt** mit `aborted === true`: die
Testmaschine ist nicht zu langsam für 5 s — dann ist das Signal versehentlich pro Anfrage neu
erzeugt worden. Nicht den Test aufweichen.

- [ ] **Step 6: Typecheck, Lint und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint
rtk git add src/core/auth/refresh.ts src/core/auth/refresh.test.ts src/types/next-auth.d.ts
rtk git commit -m "feat(core/auth): Token-Erneuerung als pruefbare Einheit mit Backoff und frischen Gruppen"
```

---

### Task 2: Die Konfiguration ausziehen — `config.ts`

**Files:**
- Create: `src/core/auth/config.ts`
- Create: `src/core/auth/config.test.ts`
- Modify: `src/core/auth/index.ts`

**Interfaces:**
- Consumes: alles, was `index.ts` heute importiert, plus `NextRequest` (nur als Typ) aus `next/server`.
- Produces: `export function authConfig(request: NextRequest | undefined): NextAuthConfig`

**Was sich am Verhalten ändert — und was nicht.** Die Konfiguration wird ab jetzt **pro Anfrage**
gebaut statt einmal beim Modulstart. Das ist der von next-auth vorgesehene Weg
(`node_modules/next-auth/index.js:101-125`), und `setEnvDefaults` läuft dann eben pro Anfrage auf
einem frischen Objekt statt einmal auf einem geteilten — das ist eher sauberer, weil
`setEnvDefaults` sein Argument mutiert. Die Provider-Objekte werden ebenfalls pro Anfrage gebaut;
Auth.js führt `parseProviders` ohnehin pro Anfrage aus. In diesem Task bleibt der `jwt`-Callback
inhaltlich unverändert; das Einhängen von `refresh.ts` macht Task 3.

- [ ] **Step 1: Test schreiben**

Neue Datei `src/core/auth/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { authConfig } from "@/core/auth/config";

/**
 * DIE KONFIGURATION IST AB HIER EIN PRUEFGEGENSTAND.
 *
 * Vorher steckte sie im `NextAuth({…})`-Aufruf und war nur ueber einen vollen
 * Auth.js-Aufbau erreichbar. Als Funktion ueber `request` ist sie ein Objekt,
 * das man anschauen und dessen Callbacks man direkt rufen kann.
 */

const jwtCallback = (request: NextRequest | undefined) => {
  const rueckruf = authConfig(request).callbacks?.jwt;
  if (!rueckruf) throw new Error("Die Konfiguration hat keinen jwt-Callback");
  return rueckruf;
};

describe("authConfig — Sitzung", () => {
  it("faehrt die JWT-Strategie", () => {
    expect(authConfig(undefined).session?.strategy).toBe("jwt");
  });
});

describe("authConfig — Gruppen einfrieren (Regression)", () => {
  /**
   * DER BEFUND AUS SPEC §2.1a AN SEINER WURZEL.
   *
   * `profile` liefert Auth.js NUR beim initialen Sign-in — bei jedem weiteren
   * `jwt`-Aufruf ist es `undefined` (belegt: die vier Aufrufstellen in
   * @auth/core/lib/actions/callback/index.js gegen die eine in
   * actions/session.js:28-32, die weder `user` noch `account` noch `profile`
   * uebergibt). Wer den `if (profile)`-Zweig einmal ohne diese Bedingung
   * schreibt, loescht bei jedem Request alle Gruppen.
   */
  it("laesst die Gruppen stehen, wenn kein profile mitkommt", async () => {
    const token = await jwtCallback(undefined)({
      token: { groups: ["da-feedback-admin"], fachgruppen: ["kueche"] },
    } as never);
    expect(token?.groups).toEqual(["da-feedback-admin"]);
    expect(token?.fachgruppen).toEqual(["kueche"]);
  });

  it("uebernimmt Gruppen und Fachgruppen aus dem profile beim Sign-in", async () => {
    const token = await jwtCallback(undefined)({
      token: {},
      profile: { groups: ["fg-kueche"], fachgruppen: ["kueche"] },
      // `expires_at` bewusst WEIT in der Zukunft: mit einem abgelaufenen Wert
      // liefe dieser Test in den Erneuerungspfad und damit ans echte Netz.
      // Kein Test in diesem Projekt fasst das Netz an.
      account: {
        access_token: "at",
        id_token: "it",
        refresh_token: "rt",
        expires_at: 4_000_000_000,
      },
    } as never);
    expect(token?.groups).toEqual(["fg-kueche"]);
    expect(token?.fachgruppen).toEqual(["kueche"]);
    expect(token?.accessToken).toBe("at");
    expect(token?.expiresAt).toBe(4_000_000_000);
  });

  it("uebernimmt die Gruppen des Dev-Logins aus user", async () => {
    const token = await jwtCallback(undefined)({
      token: {},
      user: { groups: ["dev-gruppe"] },
    } as never);
    expect(token?.groups).toEqual(["dev-gruppe"]);
  });
});

describe("authConfig — session-Callback", () => {
  const bauen = (token: Record<string, unknown>) => {
    const rueckruf = authConfig(undefined).callbacks?.session;
    if (!rueckruf) throw new Error("Die Konfiguration hat keinen session-Callback");
    return rueckruf({ session: { user: {} }, token } as never);
  };

  it("reicht Gruppen, Fachgruppen und die Kennung durch", async () => {
    const sitzung = (await bauen({
      groups: ["a"],
      fachgruppen: ["b"],
      sub: "u-1",
    })) as { user: Record<string, unknown> };
    expect(sitzung.user.groups).toEqual(["a"]);
    expect(sitzung.user.fachgruppen).toEqual(["b"]);
    expect(sitzung.user.id).toBe("u-1");
  });

  it("reicht den Fehler an den Client durch — daran haengt der SessionGuard", async () => {
    const sitzung = (await bauen({ error: "RefreshTokenError" })) as { error?: string };
    expect(sitzung.error).toBe("RefreshTokenError");
  });

  it("setzt isAdmin nicht ohne die Suite-Admin-Gruppe", async () => {
    const sitzung = (await bauen({ groups: ["irgendwas"] })) as { user: { isAdmin: boolean } };
    expect(sitzung.user.isAdmin).toBe(false);
  });
});

describe("authConfig — Querschnitt", () => {
  it("haelt die Login-Seite und die Cookie-Konfiguration fest", () => {
    const konfig = authConfig(undefined);
    expect(konfig.pages?.signIn).toBe("/login");
    // Die fuenf Login-Cookies kommen aus authCookies() — geprueft in cookies.test.ts.
    expect(Object.keys(konfig.cookies ?? {}).sort()).toEqual([
      "callbackUrl",
      "nonce",
      "pkceCodeVerifier",
      "sessionToken",
      "state",
    ]);
  });

  it("laesst ein Ziel auf der Modul-Domain durch, ein fremdes nicht", () => {
    const rueckruf = authConfig(undefined).callbacks?.redirect;
    if (!rueckruf) throw new Error("Die Konfiguration hat keinen redirect-Callback");
    const basis = "https://iuk-ue.de";
    expect(rueckruf({ url: "/x", baseUrl: basis } as never)).toBe("https://iuk-ue.de/x");
    expect(rueckruf({ url: "https://boese.example/x", baseUrl: basis } as never)).toBe(basis);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
rtk pnpm vitest run src/core/auth/config.test.ts
```
Expected: FAIL — `src/core/auth/config.ts` existiert nicht.

- [ ] **Step 3: `config.ts` anlegen**

Neue Datei `src/core/auth/config.ts` — der bisherige Inhalt von `index.ts` ab `const providers`,
Wort für Wort, in eine Funktion gehoben:

```ts
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import type { NextRequest } from "next/server";

import { parseGroups, parseDevGroups } from "@/core/auth/groups";
import { parseFachgruppen } from "@/core/auth/fachgruppen";
import { devLoginEnabled } from "@/core/auth/devLogin";
import { pocketIdProvider } from "@/core/auth/pocketId";
import { authCookies } from "@/core/auth/cookies";
import { suiteRedirect } from "@/core/auth/redirect";
import { suiteAdminGroup } from "@/core/groups";

/**
 * Die NextAuth-Konfiguration — als FUNKTION ueber die Anfrage, nicht als Objekt.
 *
 * Der Grund ist keine Kosmetik. next-auth ruft diese Funktion je nach Weg mit
 * oder ohne Anfrage (`node_modules/next-auth/index.js:101-125`):
 *
 *   `handlers` GET/POST /api/auth/*      -> config(req)        Set-Cookie kommt an
 *   `auth()` in RSC / Server Action      -> config(undefined)  Set-Cookie wird VERWORFEN
 *   `auth()` in Middleware / API Route   -> config(req)        Set-Cookie kommt an
 *
 * Der RSC-Zweig liest ausschliesslich `r.json()` (lib/index.js:91) und wirft
 * die Cookie-Header weg. `request === undefined` ist damit der einzige
 * verlaessliche Hinweis darauf, dass sich ein Token-Refresh hier nicht nur
 * nicht lohnt, sondern SCHADET: Pocket ID rotiert das Refresh-Token, das neue
 * ginge verloren, und der naechste Versuch waere eine Wiederverwendung, die
 * die ganze Sitzung widerruft. Siehe `refresh.ts`.
 */
export function authConfig(request: NextRequest | undefined): NextAuthConfig {
  const providers = [
    ...(devLoginEnabled()
      ? [
          Credentials({
            id: "dev-login",
            name: "Dev Login",
            credentials: { email: {}, groups: {} },
            authorize(credentials) {
              const email = String(credentials?.email ?? "dev@localtest.me");
              return {
                id: `dev:${email}`,
                name: "Dev User",
                email,
                groups: parseDevGroups(credentials?.groups),
              };
            },
          }),
        ]
      : []),
    // Register the Pocket ID OIDC provider only when it is actually configured.
    // Auth.js validates EVERY configured provider on EVERY /api/auth/* request, so an
    // issuer-less oidc provider makes assertConfig throw (500) for the whole route —
    // breaking dev-login-only environments where no Pocket ID env vars are set.
    // Production sets POCKET_ID_ISSUER, so real SSO still registers there.
    ...(process.env.POCKET_ID_ISSUER ? [pocketIdProvider()] : []),
  ];

  return {
    providers,
    // Auth.js always needs a secret to encrypt the session JWT. Use AUTH_SECRET when
    // set; otherwise fall back to a fixed insecure secret ONLY while dev-login is active
    // (dev mode) so a bare `pnpm dev` works out of the box. In production dev-login is
    // off, so this stays undefined and Auth.js fails loudly if AUTH_SECRET is missing.
    secret:
      process.env.AUTH_SECRET ??
      (devLoginEnabled() ? "dev-only-insecure-secret-not-for-production" : undefined),
    session: {
      strategy: "jwt",
    },
    pages: {
      signIn: "/login",
    },
    // Nicht nur das Session-Cookie: state/pkce/nonce/callbackUrl brauchen dieselbe
    // Domain, sonst scheitert jeder Login, der auf einer Modul-Domain beginnt —
    // die ersten drei laut, callbackUrl still auf der falschen Seite. Warum
    // csrfToken aussen vor bleibt, steht in cookies.ts.
    cookies: authCookies(),
    callbacks: {
      async jwt({ token, profile, user, account }) {
        // On initial sign-in, store OAuth tokens
        if (account) {
          token.accessToken = account.access_token;
          token.idToken = account.id_token;
          token.refreshToken = account.refresh_token;
          token.expiresAt = account.expires_at;
        }

        // Extract groups from the OIDC profile
        if (profile) {
          token.groups = parseGroups(profile as Record<string, unknown>);
          // Fachgruppen-Attribut: derselbe Weg, dieselbe Vertrauensbasis wie
          // `groups` (signiertes ID-Token). Es benennt die Fachgruppen-Slugs, für
          // die die Person Gruppenleitung ist; aufgelöst wird es erst im Modul.
          token.fachgruppen = parseFachgruppen(profile as Record<string, unknown>);
        }
        if (user?.groups) {
          token.groups = user.groups;
        }

        // Refresh expired access token
        if (token.expiresAt && Date.now() / 1000 > (token.expiresAt as number)) {
          return refreshAccessToken(token);
        }

        return token;
      },
      session({ session, token }) {
        const groups = (token.groups as string[]) ?? [];
        session.user.groups = groups;
        session.user.fachgruppen = (token.fachgruppen as string[]) ?? [];
        // Suite-weit, nicht modul-bezogen: "ist Betreiber". Für die Frage
        // "darf dieser Nutzer Modul X administrieren?" gibt es isModuleAdmin
        // aus core/groups — session.user.isAdmin beantwortet sie NICHT.
        session.user.isAdmin = groups.includes(suiteAdminGroup());
        if (token.sub) {
          session.user.id = token.sub;
        }
        if (token.error) {
          session.error = token.error as string;
        }
        return session;
      },
      // Laeuft heute NIE: `authorized` ruft next-auth nur im Middleware-/
      // Route-Wrapper-Zweig (lib/index.js:133), und `src/middleware.ts` gibt es
      // in diesem Projekt nicht. Bleibt als Vorgabe fuer den Tag stehen, an dem
      // eine Middleware dazukommt — die muesste dann einen `matcher` tragen,
      // sonst sperrt sie die login-freien Ansichten von `feedback` aus.
      authorized({ auth: session }) {
        return !!session?.user;
      },
      // Ohne diesen Callback wirft Auth.js jedes Ziel ausserhalb von AUTH_URL aufs
      // Portal zurück — und AUTH_URL ist auf jedem Modul-Host derselbe Wert. Warum
      // eine Allowlist und keine Blanko-Erlaubnis: siehe redirect.ts.
      redirect({ url, baseUrl }) {
        return suiteRedirect({ url, baseUrl });
      },
    },
    trustHost: true,
  };
}
```

**Achtung:** `refreshAccessToken` steht in diesem Zwischenstand noch nicht zur Verfügung — die
Funktion zieht in Schritt 4 mit um und wird in Task 3 durch `tokenAuffrischen` ersetzt. Kopiere sie
für diesen einen Zwischenschritt unverändert aus `index.ts` (samt `getOIDCConfig`) mit nach
`config.ts`, damit der Umzug für sich genommen typprüfbar bleibt. Task 3 löscht beide wieder.

- [ ] **Step 4: `index.ts` schrumpfen**

`src/core/auth/index.ts` vollständig ersetzen durch:

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/core/auth/config";

/**
 * Die Konfiguration wird PRO ANFRAGE gebaut, nicht einmal beim Modulstart —
 * `NextAuth(fn)` statt `NextAuth(obj)`. Warum das noetig ist und was
 * `request === undefined` bedeutet, steht in `config.ts`. Diese Datei enthaelt
 * bewusst nichts weiter: alles Pruefbare liegt in `config.ts`, `refresh.ts`,
 * `cookies.ts` und `redirect.ts`.
 */
export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
```

- [ ] **Step 5: Test laufen lassen**

```bash
rtk pnpm vitest run src/core/auth/config.test.ts
```
Expected: PASS

- [ ] **Step 6: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
rtk git add src/core/auth/config.ts src/core/auth/config.test.ts src/core/auth/index.ts
rtk git commit -m "refactor(core/auth): Konfiguration als Funktion ueber die Anfrage"
```

**Falls `pnpm build` bricht** mit einem Typfehler an `NextAuth(authConfig)`: der Funktionszweig
erwartet `(request: NextRequest | undefined) => Awaitable<NextAuthConfig>`
(`node_modules/next-auth/index.d.ts:323`). Dann stimmt der Parametertyp nicht — `NextRequest` kommt
aus `next/server` und muss als `import type` stehen, sonst zieht es Laufzeitcode in die Datei.

---

### Task 3: Die Erneuerung einhängen — und die Schreibrecht-Weiche

**Files:**
- Modify: `src/core/auth/config.ts`
- Modify: `src/core/auth/config.test.ts`

**Interfaces:**
- Consumes: `tokenAuffrischen(token: JWT, optionen: AuffrischOptionen): Promise<JWT>` aus Task 1.
- Produces: keine neuen Signaturen.

- [ ] **Step 1: Test schreiben**

In `src/core/auth/config.test.ts` zunächst die Vitest-Einfuhr erweitern — sonst meldet `pnpm lint`
`vi`/`beforeEach` als undefiniert (Fehler, nicht Warnung):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
```

Dann **oben** ergänzen (vor dem `import { authConfig }`, damit `vi.mock` vor dem Modulimport greift):

```ts
const { auffrischenMock } = vi.hoisted(() => ({ auffrischenMock: vi.fn() }));

/**
 * Die Erneuerung als Spion — und zwar BEOBACHTBAR, nicht nur stillgelegt. Der
 * Test unten prueft nicht, DASS sie gerufen wird, sondern MIT WELCHEM
 * Schreibrecht. Ohne den Mock ginge dieser Test ans echte Netz.
 */
vi.mock("@/core/auth/refresh", () => ({ tokenAuffrischen: auffrischenMock }));
```

Und ein `beforeEach`, das den Spion zurücksetzt und durchreichen lässt:

```ts
beforeEach(() => {
  auffrischenMock.mockReset();
  auffrischenMock.mockImplementation(async (token: unknown) => token);
});
```

Danach diesen Block ans Ende der Datei:

```ts
describe("authConfig — Schreibrecht-Weiche", () => {
  const abgelaufen = { expiresAt: 1_000, refreshToken: "rt", groups: ["a"] };

  /**
   * DER TEUERSTE DEFEKT DIESES TEILPROJEKTS, IN EINER ZUSICHERUNG.
   *
   * `auth()` in einer Server Component bekommt `config(undefined)`, und
   * next-auth wirft dort das `Set-Cookie` weg (lib/index.js:91). Wuerde hier
   * aufgefrischt, rotierte Pocket ID das Refresh-Token, das neue ginge
   * verloren, und der naechste Versuch waere eine Wiederverwendung — die
   * widerruft bei Pocket ID die GANZE Sitzung. Der Nutzer flöge dann jede
   * Stunde raus, und es saehe aus wie ein Sitzungsproblem.
   */
  it("meldet dem RSC-Pfad KEIN Schreibrecht", async () => {
    await jwtCallback(undefined)({ token: { ...abgelaufen } } as never);
    expect(auffrischenMock).toHaveBeenCalledTimes(1);
    expect(auffrischenMock.mock.calls[0][1]).toMatchObject({ darfSchreiben: false });
  });

  it("meldet dem /api/auth/*-Pfad Schreibrecht", async () => {
    // `as unknown as` und nicht `as`: ein Objektliteral mit einem Feld ist
    // strukturell zu weit von NextRequest entfernt, TypeScript lehnt den
    // direkten Cast ab. Hier zaehlt nur, DASS etwas uebergeben wird.
    const anfrage = { url: "https://iuk-ue.de/api/auth/session" } as unknown as NextRequest;
    await jwtCallback(anfrage)({ token: { ...abgelaufen } } as never);
    expect(auffrischenMock).toHaveBeenCalledTimes(1);
    expect(auffrischenMock.mock.calls[0][1]).toMatchObject({ darfSchreiben: true });
  });

  /**
   * Die Ablaufpruefung gehoert AUSSCHLIESSLICH nach refresh.ts. Bliebe sie
   * zusaetzlich hier stehen, gaebe es zwei Wahrheiten ueber „ist abgelaufen"
   * — und die eine wuerde eines Tages angepasst und die andere nicht.
   */
  it("uebergibt die Entscheidung ueber den Ablauf an refresh.ts", async () => {
    await jwtCallback(undefined)({
      token: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    } as never);
    expect(auffrischenMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
rtk pnpm vitest run src/core/auth/config.test.ts
```
Expected: FAIL — `tokenAuffrischen` wird nicht gerufen (`toHaveBeenCalledTimes(1)` findet 0).

- [ ] **Step 3: Implementieren**

In `src/core/auth/config.ts`: `getOIDCConfig` und `refreshAccessToken` **löschen**, den Import
ergänzen

```ts
import { tokenAuffrischen } from "@/core/auth/refresh";
```

und im `jwt`-Callback den Block

```ts
        // Refresh expired access token
        if (token.expiresAt && Date.now() / 1000 > (token.expiresAt as number)) {
          return refreshAccessToken(token);
        }

        return token;
```

ersetzen durch

```ts
        // Ob ueberhaupt aufgefrischt werden muss — und ob es sich lohnt —
        // entscheidet refresh.ts. `darfSchreiben` ist der Kern: nur wenn das
        // Ergebnis dieses Aufrufs beim Browser ankommen kann, darf das
        // Refresh-Token bei Pocket ID rotiert werden. Siehe Kopfkommentar.
        return tokenAuffrischen(token, { darfSchreiben: request !== undefined });
```

Prüfe im selben Schritt, dass `parseGroups`/`parseFachgruppen` noch importiert sind (sie werden im
`profile`-Zweig weiter gebraucht) und dass kein Import verwaist zurückbleibt — `pnpm lint` meldet
das als Fehler, nicht als Warnung.

- [ ] **Step 4: Test laufen lassen**

```bash
rtk pnpm vitest run src/core/auth/config.test.ts src/core/auth/refresh.test.ts
```
Expected: PASS

- [ ] **Step 5: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
rtk git add src/core/auth/config.ts src/core/auth/config.test.ts
rtk git commit -m "fix(core/auth): nur auffrischen, wenn das Ergebnis auch ankommt"
```

---

### Task 4: Sitzungsdauer explizit — und was das Cookie damit zu tun hat

**Files:**
- Modify: `src/core/auth/config.ts`
- Modify: `src/core/auth/config.test.ts`
- Modify: `src/core/auth/cookies.test.ts`

**Interfaces:**
- Produces: `export const SITZUNGSDAUER_S = 30 * 24 * 60 * 60`,
  `export const SITZUNGS_AUFFRISCHUNG_S = 24 * 60 * 60` in `config.ts`.

**Korrektur am Spec, §2.3.** Der Spec schreibt, `updateAge` mache die Sitzung „rollierend" und
Auth.js leite das `maxAge` des Cookies aus `session.maxAge` ab. Beides stimmt so nicht, und beides
ist nachgemessen:

1. **`updateAge` ist unter `strategy: "jwt"` wirkungslos.** Es wird ausschließlich im
   Datenbank-Zweig gelesen (`@auth/core/lib/actions/session.js:77-92`, dort drosselt es den
   DB-Schreibvorgang). Der JWT-Zweig (Z. 21-56) hat keinerlei Drosselung: `callbacks.jwt`,
   `jwt.encode` und `sessionStore.chunk` laufen bedingungslos.
2. **Rollierend ist die Sitzung trotzdem** — aber aus einem anderen Grund: der JWT-Zweig setzt bei
   *jedem* Aufruf `expires: fromDate(sessionMaxAge)` neu (Z. 33 und 45-51). Da `SessionProvider` im
   Root-Layout steht und beim Mount `GET /api/auth/session` ruft (`next-auth/react.js:283`),
   verlängert jeder Seitenaufruf im Browser die Sitzung um volle 30 Tage.
3. **Das Session-Cookie hat gar kein `maxAge`.** `defaultCookies()`
   (`@auth/core/lib/utils/cookie.js:48-56`) setzt für `sessionToken` nur `httpOnly`, `sameSite`,
   `path`, `secure`. Die Ablaufzeit reist als `Expires`, pro Schreibvorgang aus `session.maxAge`
   berechnet.

Die Werte trotzdem hinschreiben: `maxAge` steuert wirklich die Sitzungs- und (über `init.js:86`)
die JWT-Lebensdauer, und `updateAge` dokumentiert die Absicht und trägt, falls je auf
Datenbank-Sessions umgestellt wird. Der Kommentar muss aber sagen, was gilt — sonst folgt der
nächste Leser einer Behauptung, die der Code nicht einlöst.

- [ ] **Step 1: Test schreiben**

In `src/core/auth/config.test.ts` den Block `describe("authConfig — Sitzung")` ersetzen durch:

```ts
describe("authConfig — Sitzung", () => {
  it("faehrt die JWT-Strategie", () => {
    // Voraussetzung dafuer, dass eine Sitzung ueber mehrere Modul-Hosts ohne
    // gemeinsame Datenbank traegt. Ein Wechsel auf "database" waere keine
    // Feineinstellung, sondern ein anderer Betrieb.
    expect(authConfig(undefined).session?.strategy).toBe("jwt");
  });

  it("setzt 30 Tage explizit statt sie vom Default zu erben", () => {
    // 30 Tage entsprechen dem heutigen Auth.js-Default (init.js:38). Sie hier
    // hinzuschreiben aendert nichts — es schuetzt vor einem stillen
    // Default-Wechsel bei einem Auth.js-Update.
    expect(authConfig(undefined).session?.maxAge).toBe(2_592_000);
  });

  /**
   * `updateAge` ist unter `strategy: "jwt"` WIRKUNGSLOS: gelesen wird es nur im
   * Datenbank-Zweig (@auth/core/lib/actions/session.js:77-92). Rollierend ist
   * die Sitzung trotzdem, aber ueber einen anderen Weg — der JWT-Zweig setzt
   * `expires` bei JEDEM Aufruf neu (Z. 33, 45-51), und `SessionProvider` ruft
   * `/api/auth/session` bei jedem Mount. Der Wert steht hier als Absicht und
   * fuer den Fall, dass je auf Datenbank-Sessions umgestellt wird.
   */
  it("haelt updateAge fest, auch wenn es unter der JWT-Strategie nichts tut", () => {
    expect(authConfig(undefined).session?.updateAge).toBe(86_400);
  });
});
```

In `src/core/auth/cookies.test.ts` **ans Ende** des bestehenden `describe`-Blocks anfügen:

```ts
  /**
   * DAS SESSION-COOKIE FOLGT DER SITZUNG — UND ZWAR NUR, WEIL HIER KEIN
   * maxAge STEHT.
   *
   * Auth.js gibt dem Session-Cookie kein `maxAge`
   * (`defaultCookies` in @auth/core/lib/utils/cookie.js:48-56 setzt nur
   * httpOnly/sameSite/path/secure); die Ablaufzeit reist als `Expires`, pro
   * Schreibvorgang aus `session.maxAge` berechnet (actions/session.js:33,45-51).
   *
   * Ein hier gesetztes `maxAge` ueberlebte den Merge in
   * `SessionStore.chunk` (cookie.js:161 — `{...option.options, ...options}`,
   * und pro Schreibvorgang kommt nur `expires` dazu) und wuerde laut
   * RFC 6265 §4.1.2.2 gegen `Expires` GEWINNEN. Die Sitzung liefe dann nach
   * einer festen Frist ab, egal was `session.maxAge` sagt — und niemand
   * suchte den Grund in dieser Datei.
   */
  it("setzt auf dem Session-Cookie kein maxAge — sonst schluege es Auth.js' Expires", () => {
    expect(WITH.sessionToken?.options).not.toHaveProperty("maxAge");
    expect(WITHOUT.sessionToken?.options).not.toHaveProperty("maxAge");
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
rtk pnpm vitest run src/core/auth/config.test.ts src/core/auth/cookies.test.ts
```
Expected: FAIL in `config.test.ts` (`maxAge`/`updateAge` sind `undefined`); `cookies.test.ts` ist
bereits grün — der neue Test dort ist eine Absicherung gegen eine künftige Änderung, kein Nachweis
eines Defekts. Das ist beabsichtigt und in seinem Kommentar begründet.

- [ ] **Step 3: Implementieren**

In `src/core/auth/config.ts` **über** `export function authConfig` einfügen:

```ts
/**
 * 30 Tage. Entspricht dem heutigen Auth.js-Default (init.js:38) und ist fuer
 * ein internes Werkzeug mit SSO reichlich. Vertretbar ist die Laenge nur,
 * WEIL die Gruppen im Token bei jedem erfolgreichen Refresh frisch aus dem
 * `id_token` gezogen werden (`refresh.ts`) — sonst behielte jemand entzogene
 * Rechte einen Monat lang.
 */
export const SITZUNGSDAUER_S = 30 * 24 * 60 * 60;

/**
 * Ebenfalls der Auth.js-Default. ACHTUNG: unter `strategy: "jwt"` liest Auth.js
 * diesen Wert NICHT — er wird nur im Datenbank-Zweig ausgewertet
 * (actions/session.js:77-92). Rollierend ist die Sitzung trotzdem, weil der
 * JWT-Zweig `expires` bei jedem Aufruf neu setzt und `SessionProvider` bei
 * jedem Mount `/api/auth/session` ruft. Der Wert steht als Absicht hier und
 * traegt, falls je auf Datenbank-Sessions umgestellt wird.
 */
export const SITZUNGS_AUFFRISCHUNG_S = 24 * 60 * 60;
```

Und den `session`-Block ersetzen:

```ts
    session: {
      strategy: "jwt",
      maxAge: SITZUNGSDAUER_S,
      updateAge: SITZUNGS_AUFFRISCHUNG_S,
    },
```

- [ ] **Step 4: Test laufen lassen**

```bash
rtk pnpm vitest run src/core/auth/config.test.ts src/core/auth/cookies.test.ts
```
Expected: PASS

- [ ] **Step 5: Typecheck, Lint und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint
rtk git add src/core/auth/config.ts src/core/auth/config.test.ts src/core/auth/cookies.test.ts
rtk git commit -m "feat(core/auth): Sitzungsdauer explizit auf 30 Tage, Cookie folgt ihr"
```

---

### Task 5: Sanfte Re-Authentifizierung mit Zeitstempel-Riegel

**Files:**
- Modify: `src/core/auth/pocketId.ts`
- Modify: `src/core/auth/pocketId.test.ts`
- Modify: `src/components/providers.tsx`
- Create: `src/components/providers.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces:
  - `export const POCKET_ID_PROVIDER_ID = "pocket-id"` und
    `export function reauthProviderId(env?: Record<string,string|undefined>): string | null` in
    `pocketId.ts`
  - `export function Providers({ children, reauthProvider }: { children: React.ReactNode; reauthProvider: string | null })`
  - `export const REAUTH_MARKE = "iuk-reauth"`, `export const REAUTH_SPERRE_MS = 5 * 60 * 1000`,
    `export function sanfterVersuchErlaubt(jetzt?: number): boolean` in `providers.tsx`
- Consumes: `signIn`, `signOut`, `useSession`, `SessionProvider` aus `next-auth/react`.

#### Abweichung vom Spec §2.4: Zeitstempel statt Einmalmarke

Der Spec verlangt „ein Versuch pro Seitenbesuch", festgehalten als Marke in `sessionStorage`. Beim
Durchspielen trägt das nicht:

**Die vom Spec befürchtete Schleife gibt es nicht.** Ist die Sitzung auch bei Pocket ID tot, zeigt
Pocket ID ein Anmeldeformular und schickt niemanden automatisch zurück (`SESSION_DURATION`, Default
60 Minuten, ist Pocket IDs eigene Login-Sitzung). Lebt sie noch, kommt der Nutzer mit einem
**frischen** Token zurück, und `error` ist weg. In beiden Fällen ist nach einem Durchlauf Schluss.

**Die echten Löcher sind andere:**

1. **Die Marke wird nie geräumt.** Wer einmal sanft re-authentifiziert hat, trägt die Marke für den
   Rest des Tabs. Sechs Stunden später führt ein echtes `invalid_grant` sofort zum harten Logout,
   obwohl der sanfte Weg getragen hätte. Räumt man sie dagegen bei Erfolg, entsteht genau die
   Schleife, die der Riegel verhindern soll: Erfolg → Marke weg → nächster Fehler → Re-Login → …
   Beides ist falsch; ein Zeitstempel ist keines von beidem.
2. **Doppelt ausgeführte Effekte verbrauchen den einzigen Versuch.** React ruft `useEffect` in der
   Entwicklungsfassung zweimal auf. Der erste Lauf setzt die Marke und startet `signIn` — das drei
   HTTP-Umläufe braucht, bevor es navigiert (`next-auth/react.js:130,152,153-168`). Der zweite Lauf
   sieht die Marke schon stehen und feuert `signOut` **während** `signIn` noch läuft.
3. **`sessionStorage` kann werfen** (Safari im privaten Modus, gesperrter Speicher). Ein `try`, das
   den sanften Weg trotzdem geht, ist genau die Entscheidung, die eine Schleife erlaubt.

**Also:** `sessionStorage` bleibt (die Begründung des Specs dafür stimmt — der Re-Login ist eine
volle Seitennavigation, ein `useRef` überlebt sie nicht; und die Marke soll mit dem Tab enden). Aber
gespeichert wird ein **Zeitstempel**, und ein sanfter Versuch ist nur erlaubt, wenn der letzte
länger als `REAUTH_SPERRE_MS` (5 Minuten) her ist. Dazu ein `useRef` **zusätzlich**, das pro Mount
höchstens eine Handlung zulässt, und ein `catch`, das **hart abmeldet** statt es sanft zu versuchen.

Fünf Minuten sind gut gewählt: der Access-Token von Pocket ID lebt eine Stunde, echte
Zusammenstöße kommen also höchstens stündlich — die Sperre feuert nie versehentlich, blockt aber
jede Schleife, die schneller als alle fünf Minuten kreist.

**Mehrere Tabs:** `sessionStorage` gehört zum Tab. Jeder Tab hat seine eigene Sperre — zwei Tabs
können also zwei Navigationen auslösen. Das ist hinnehmbar und die Alternative (`localStorage`)
wäre schlechter: sie hielte die Sperre über Tage. Nach einem erfolgreichen Re-Login in Tab A holt
sich Tab B spätestens beim nächsten `visibilitychange` eine frische Sitzung
(`next-auth/react.js:304-315`, `refetchOnWindowFocus` Default `true`) und sieht den Fehler gar
nicht mehr.

- [ ] **Step 1: Prüfen, wer `Providers` benutzt**

```bash
rtk grep 'from "@/components/providers"' src
```
Expected: genau ein Treffer, `src/app/layout.tsx`. Findet sich ein zweiter, muss er in Schritt 5
mitgezogen werden — die neue Prop ist Pflicht.

- [ ] **Step 2: Test für `reauthProviderId` schreiben**

In `src/core/auth/pocketId.test.ts` ergänzen:

```ts
import { pocketIdProvider, reauthProviderId, POCKET_ID_PROVIDER_ID } from "@/core/auth/pocketId";

describe("reauthProviderId", () => {
  /**
   * Der SessionGuard darf `signIn("pocket-id")` nur rufen, wenn es diesen
   * Provider auch gibt. Sonst faende `signIn` ihn nicht in der Providerliste
   * und navigierte hart auf die Login-Seite (`next-auth/react.js:131-142`,
   * dort steht sogar ein TODO dazu) — ein Rauswurf mit anderem Anstrich.
   * Serverseitig gibt es keinen Weg, die Providerliste abzufragen:
   * `getProviders` ist eine Client-Funktion, und NextAuth() gibt seine Config
   * nicht heraus (`next-auth/index.js:131-144`).
   */
  it("nennt den Provider, wenn Pocket ID konfiguriert ist", () => {
    expect(reauthProviderId({ POCKET_ID_ISSUER: "https://id.example.test" })).toBe(
      POCKET_ID_PROVIDER_ID,
    );
  });

  it("liefert null ohne Issuer — dort gibt es nur den Dev-Login", () => {
    expect(reauthProviderId({})).toBeNull();
    expect(reauthProviderId({ POCKET_ID_ISSUER: "" })).toBeNull();
  });

  it("nennt genau die Kennung, unter der der Provider registriert ist", () => {
    expect(pocketIdProvider().id).toBe(POCKET_ID_PROVIDER_ID);
  });
});
```

- [ ] **Step 3: `pocketId.ts` ergänzen**

In `src/core/auth/pocketId.ts` **über** `const SCOPES` einfügen:

```ts
type EnvLike = Record<string, string | undefined>;

/** Die Kennung, unter der der Provider registriert ist. Der SessionGuard
 *  uebergibt sie an `signIn` — sie muss woertlich stimmen. */
export const POCKET_ID_PROVIDER_ID = "pocket-id";

/**
 * Ob ein stiller Re-Login ueberhaupt moeglich ist. Dieselbe Bedingung, unter
 * der `config.ts` den Provider registriert: ohne `POCKET_ID_ISSUER` laeuft die
 * Instanz auf Dev-Login, und `signIn("pocket-id")` liefe dort ins Leere.
 */
export function reauthProviderId(env: EnvLike = process.env): string | null {
  return env.POCKET_ID_ISSUER ? POCKET_ID_PROVIDER_ID : null;
}
```

und in `pocketIdProvider()` die Zeile `id: "pocket-id",` ersetzen durch `id: POCKET_ID_PROVIDER_ID,`.

- [ ] **Step 4: Test für `providers.tsx` schreiben**

Neue Datei `src/components/providers.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, useEffect, useState } from "react";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * DER SESSIONGUARD — die einzige Stelle, an der die Suite von sich aus
 * abmeldet.
 *
 * Erster DOM-Test unter `src/components/`, deshalb der Mock hier vollstaendig:
 * `SuiteNav.test.tsx` mockt aus `next-auth/react` nur `signOut`, hier braucht
 * es zusaetzlich `useSession` und `SessionProvider`.
 */
const { useSessionMock, signInMock, signOutMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: useSessionMock,
  signIn: signInMock,
  signOut: signOutMock,
}));

import {
  Providers,
  sanfterVersuchErlaubt,
  REAUTH_MARKE,
  REAUTH_SPERRE_MS,
} from "@/components/providers";

function sitzung(fehler?: string) {
  useSessionMock.mockReturnValue({ data: fehler ? { error: fehler } : {}, status: "authenticated" });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sitzung();
});

afterEach(async () => {
  await unmount();
  // Stellt die Storage-Spione aus den Fail-closed-Tests wieder her.
  vi.restoreAllMocks();
});

describe("SessionGuard — der Normalfall", () => {
  it("meldet niemanden ab, solange kein Fehler ansteht", async () => {
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("laesst die Kinder durch", async () => {
    await mount(
      <Providers reauthProvider="pocket-id">
        <p data-testid="inhalt">da</p>
      </Providers>,
    );
    expect(document.querySelector('[data-testid="inhalt"]')).not.toBeNull();
  });
});

describe("SessionGuard — sanfte Re-Authentifizierung", () => {
  it("versucht beim ersten RefreshTokenError einen stillen Re-Login", async () => {
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(signInMock).toHaveBeenCalledTimes(1);
    // `redirectTo`, NICHT `callbackUrl`: letzteres ist in v5 veraltet
    // (next-auth/lib/client.d.ts:38) und `login-form.tsx` faehrt schon so.
    expect(signInMock).toHaveBeenCalledWith("pocket-id", { redirectTo: window.location.href });
  });

  it("merkt sich den Versuch als Zeitstempel", async () => {
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    const marke = Number(sessionStorage.getItem(REAUTH_MARKE));
    expect(Number.isFinite(marke)).toBe(true);
    expect(Math.abs(Date.now() - marke)).toBeLessThan(5_000);
  });

  /**
   * DER RIEGEL. Kommt der Nutzer aus dem Re-Login mit demselben Fehler zurueck,
   * darf er nicht wieder weggeschickt werden — das saehe im Browser aus wie ein
   * Absturz. Der zweite Mount ist genau dieser Rueckweg: eine volle
   * Seitennavigation, neuer React-Baum, aber derselbe Tab und damit dasselbe
   * sessionStorage.
   */
  it("faellt beim zweiten Fehler im selben Tab auf den harten Logout zurueck", async () => {
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    await unmount();
    signInMock.mockClear();

    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  it("laesst nach Ablauf der Sperre wieder einen sanften Versuch zu", async () => {
    sessionStorage.setItem(REAUTH_MARKE, String(Date.now() - REAUTH_SPERRE_MS - 1_000));
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("ignoriert eine unlesbare Marke und versucht es sanft", async () => {
    sessionStorage.setItem(REAUTH_MARKE, "kaputt");
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Springt die Uhr zurueck (Zeitumstellung, NTP-Korrektur), liegt die Marke in
   * der Zukunft. Die Differenz ist dann negativ und damit kleiner als die
   * Sperre — der Riegel haelt. Das ist die richtige Richtung: im Zweifel
   * blocken, nicht durchlassen.
   */
  it("blockt auch, wenn die Marke in der Zukunft liegt", () => {
    sessionStorage.setItem(REAUTH_MARKE, String(Date.now() + 60_000));
    expect(sanfterVersuchErlaubt()).toBe(false);
  });
});

describe("SessionGuard — wo der sanfte Weg nicht traegt", () => {
  it("meldet ohne Pocket-ID-Provider hart ab", async () => {
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider={null}>inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  /**
   * Faellt der Speicher aus (Safari im privaten Modus), gibt es keinen Riegel.
   * Dann wird NICHT sanft versucht: eine Schleife im Browser ist schlimmer als
   * ein Logout. Fail closed.
   */
  it("meldet hart ab, wenn sessionStorage wirft", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Speicher gesperrt");
    });
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("meldet hart ab, wenn der Speicher beim Schreiben wirft", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Speicher voll");
    });
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});

describe("SessionGuard — doppelt ausgefuehrte Effekte", () => {
  /**
   * React ruft Effekte in der Entwicklungsfassung ZWEIMAL auf. Ohne den
   * Mount-Riegel verbrauchte der erste Lauf den einen erlaubten Versuch und der
   * zweite feuerte `signOut` — waehrend `signIn` noch seine drei HTTP-Umlaeufe
   * macht (next-auth/react.js:130,152,153-168). Ergebnis: Ab- und Anmeldung
   * gleichzeitig.
   *
   * Die Sonde daneben ist der Teil, der diesen Test ehrlich haelt: sie belegt,
   * dass die Umgebung WIRKLICH doppelt ausfuehrt. Faellt das eines Tages weg,
   * schlaegt die Sonde fehl und sagt es — statt dass die Zusage still ihre
   * Aussagekraft verliert.
   */
  it("handelt trotz doppelt laufender Effekte genau einmal", async () => {
    const laeufe: number[] = [];
    function Sonde() {
      const [, setzen] = useState(0);
      useEffect(() => {
        laeufe.push(1);
        setzen((n) => n + 1);
      }, []);
      return null;
    }

    sitzung("RefreshTokenError");
    await mount(
      <StrictMode>
        <Providers reauthProvider="pocket-id">
          <Sonde />
        </Providers>
      </StrictMode>,
    );

    expect(laeufe.length, "Die Umgebung fuehrt Effekte nicht doppelt aus — dieser Test misst nichts mehr").toBe(2);
    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Test laufen lassen, Fehlschlag prüfen**

```bash
rtk pnpm vitest run src/components/providers.test.tsx src/core/auth/pocketId.test.ts
```
Expected: FAIL — `REAUTH_MARKE` wird nicht exportiert, `Providers` kennt `reauthProvider` nicht,
`reauthProviderId` existiert nicht.

- [ ] **Step 6: `providers.tsx` implementieren**

`src/components/providers.tsx` vollständig ersetzen durch:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";

/** Schluessel der Re-Login-Marke im sessionStorage des Tabs. */
export const REAUTH_MARKE = "iuk-reauth";

/**
 * Wie lange nach einem sanften Versuch kein zweiter erlaubt ist.
 *
 * Fuenf Minuten, weil Pocket IDs Access-Token eine Stunde lebt: echte
 * Zusammenstoesse kommen hoechstens stuendlich, die Sperre feuert also nie
 * versehentlich — blockt aber jede Schleife, die schneller kreist.
 */
export const REAUTH_SPERRE_MS = 5 * 60 * 1000;

/**
 * Darf jetzt ein sanfter Re-Login versucht werden? Setzt bei „ja" zugleich die
 * Marke.
 *
 * ZEITSTEMPEL, NICHT EINMALMARKE — der Spec (§2.4) sah eine einmalige Marke
 * pro Seitenbesuch vor; die traegt nicht. Wird sie nie geraeumt, faellt ein
 * echter zweiter Fehlschlag Stunden spaeter sofort auf den harten Logout.
 * Wird sie bei Erfolg geraeumt, entsteht genau die Schleife, die sie
 * verhindern soll (Erfolg -> Marke weg -> Fehler -> Re-Login -> …). Ein
 * Zeitstempel ist keines von beidem.
 *
 * `sessionStorage` und nicht `useRef`: der Re-Login ist eine volle
 * Seitennavigation, ein Ref ueberlebt sie nicht. Und nicht `localStorage`: die
 * Marke soll mit dem Tab enden, nicht wochenlang liegen bleiben.
 *
 * Wirft der Speicher (Safari im privaten Modus, gesperrter Speicher), lautet
 * die Antwort NEIN. Ohne Riegel nicht sanft versuchen: eine Schleife im
 * Browser ist schlimmer als ein Logout.
 */
export function sanfterVersuchErlaubt(jetzt: number = Date.now()): boolean {
  try {
    const roh = window.sessionStorage.getItem(REAUTH_MARKE);
    const letzter = roh === null ? Number.NaN : Number(roh);
    if (Number.isFinite(letzter) && jetzt - letzter < REAUTH_SPERRE_MS) return false;
    window.sessionStorage.setItem(REAUTH_MARKE, String(jetzt));
    return true;
  } catch {
    return false;
  }
}

function SessionGuard({
  children,
  reauthProvider,
}: {
  children: React.ReactNode;
  reauthProvider: string | null;
}) {
  const { data: session } = useSession();
  // Hoechstens EINE Handlung pro Mount. React fuehrt Effekte in der
  // Entwicklungsfassung doppelt aus; ohne diesen Riegel verbrauchte der erste
  // Lauf den erlaubten sanften Versuch und der zweite feuerte `signOut`,
  // waehrend `signIn` noch seine drei HTTP-Umlaeufe macht.
  const gehandelt = useRef(false);

  useEffect(() => {
    if (session?.error !== "RefreshTokenError") return;
    if (gehandelt.current) return;
    gehandelt.current = true;

    // Ohne Pocket ID (Dev-Login-Instanz) gibt es niemanden, bei dem man sich
    // still neu anmelden koennte: `signIn` faende den Provider nicht und
    // navigierte hart auf die Login-Seite (next-auth/react.js:131-142).
    if (!reauthProvider || !sanfterVersuchErlaubt()) {
      // Ueber oidc-signout, sonst laeuft die Sitzung beim Identity Provider
      // weiter und der naechste Login-Klick meldet wortlos denselben Nutzer an.
      //
      // `callbackUrl` hier bewusst, obwohl drei Zeilen tiefer `redirectTo`
      // steht: `SuiteNav.tsx:242` und `oidc-signout/route.test.ts` fahren auf
      // dieser Schreibweise. Sie zu vereinheitlichen ist ein eigener Umbau,
      // kein Nebeneffekt dieser Aenderung — wer es hier still angleicht,
      // bricht `SuiteNav.test.tsx`.
      signOut({ callbackUrl: "/api/auth/oidc-signout" });
      return;
    }

    // `redirectTo`, nicht das veraltete `callbackUrl` (next-auth/lib/client.d.ts:38).
    // Absolut, damit der Nutzer auf DER Modul-Domain landet, von der er kam —
    // Auth.js loeste ein relatives Ziel gegen AUTH_URL auf, also aufs Portal
    // (siehe core/auth/callbackUrl.ts).
    signIn(reauthProvider, { redirectTo: window.location.href });
  }, [session?.error, reauthProvider]);

  return children;
}

export function Providers({
  children,
  reauthProvider,
}: {
  children: React.ReactNode;
  /**
   * Kennung des Providers fuer den stillen Re-Login, oder `null`, wenn es
   * keinen gibt. Kommt aus einer Server-Umgebung (`app/layout.tsx` ueber
   * `reauthProviderId()`) — eine Client Component kann `POCKET_ID_ISSUER`
   * nicht lesen, und serverseitig gibt next-auth die Providerliste nicht
   * heraus (`getProviders` ist eine Client-Funktion).
   */
  reauthProvider: string | null;
}) {
  return (
    <SessionProvider>
      <SessionGuard reauthProvider={reauthProvider}>{children}</SessionGuard>
    </SessionProvider>
  );
}
```

- [ ] **Step 7: `layout.tsx` anpassen**

In `src/app/layout.tsx` den Import ergänzen:

```ts
import { reauthProviderId } from "@/core/auth/pocketId";
```

und die Zeile `<Providers>` ersetzen durch:

```tsx
          {/* Serverseitig aufgeloest: die Client-Komponente kann POCKET_ID_ISSUER
              nicht lesen. Ohne Pocket ID bleibt es beim harten Logout. */}
          <Providers reauthProvider={reauthProviderId()}>
```

Das schließende `</Providers>` bleibt unverändert.

- [ ] **Step 8: Test laufen lassen**

```bash
rtk pnpm vitest run src/components/providers.test.tsx src/core/auth/pocketId.test.ts src/app/layout.test.ts
```
Expected: PASS

**Falls „handelt trotz doppelt laufender Effekte genau einmal" an der Sonde scheitert** (`laeufe.length`
ist 1): dann führt die Testumgebung Effekte nicht doppelt aus, und der Test kann die Zusage nicht
mehr belegen. Nicht die Sonde entfernen — stattdessen den Riegel über zwei aufeinanderfolgende
`mount`-Aufrufe prüfen (das deckt denselben Code, nur den anderen Weg) und im Kommentar
festhalten, warum.

- [ ] **Step 9: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
rtk git add src/components/providers.tsx src/components/providers.test.tsx src/core/auth/pocketId.ts src/core/auth/pocketId.test.ts src/app/layout.tsx
rtk git commit -m "feat(core/auth): sanfter Re-Login mit Zeitstempel-Riegel statt sofortigem Logout"
```

---

### Task 6: Messen statt glauben — und die Querschnittsregel festhalten

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** keine.

- [ ] **Step 1: Die Pocket-ID-Version der eigenen Instanz feststellen**

Alles, was Task 1 über Rotation, Wiederverwendung und die frischen Gruppen im `id_token` annimmt,
gilt für Pocket ID **ab v2** (seit der Umstellung auf den Fosite-Fork). Läuft auf `id.iuk-ue.de`
noch eine v1, ist §2.1a des Specs wirkungslos und der Zweig „kein `id_token` → alte Gruppen bleiben"
wäre der einzige, der je läuft.

```bash
rtk curl -s https://id.iuk-ue.de/.well-known/openid-configuration
```

Erwartet: ein `token_endpoint` unter `/api/oidc/token` und ein `end_session_endpoint`. Die Version
steht in der Admin-Oberfläche von Pocket ID (Fußzeile) bzw. am Container-Tag in der `compose.yaml`
der Pocket-ID-Instanz. **Ist sie < 2.0, hier abbrechen und Rücksprache halten** — dann braucht die
Gruppenfrische einen UserInfo-Abruf statt des `id_token`, und das ist eine andere Änderung.

- [ ] **Step 2: Die zentrale Zusage einmal an der echten Instanz messen**

Das ist die Abnahme, die kein Unit-Test leisten kann. Auf der laufenden Instanz (Staging oder
Produktion, nach dem Ausrollen):

1. Als Testnutzer anmelden, Zugriff auf eine gruppengeschützte Seite bestätigen.
2. In Pocket ID die Gruppe entziehen.
3. Warten, bis der Access-Token abläuft (Pocket ID: eine Stunde — `AccessTokenLifespan` ist nicht
   konfigurierbar), dann die Seite neu laden.
4. Erwartet: der Zugriff ist weg, **ohne** dass sich der Nutzer neu anmelden musste.

Vorher — heute, vor dieser Änderung — bliebe der Zugriff bis zum Ende der Sitzung bestehen. Genau
das ist der Unterschied, der die 30 Tage erst vertretbar macht.

- [ ] **Step 3: Die Querschnittsregel in `CLAUDE.md` festhalten**

Im Abschnitt „Zugriffsschutz" **nach** dem Absatz über `isModuleAdmin` einfügen:

```markdown
**Gruppen im JWT sind nur so frisch wie der letzte erfolgreiche Token-Refresh.** Sie werden beim
Login gesetzt und bei jedem erfolgreichen Refresh aus dem neuen `id_token` nachgezogen
(`core/auth/refresh.ts`) — der Takt ist damit die Access-Token-Lebensdauer von Pocket ID (eine
Stunde), nicht die Sitzungsdauer (30 Tage). Zwei Folgen für jedes Modul: ein Gruppenentzug wirkt
mit bis zu einer Stunde Verzug, und wo das zu lang ist, muss die Berechtigung serverseitig aus der
Datenbank aufgelöst werden statt aus `session.user.groups`.

Aufgefrischt wird **nur** auf dem `/api/auth/*`-Pfad, nicht bei `auth()` aus einer Server Component:
dort wirft next-auth das `Set-Cookie` weg, und Pocket ID rotiert Refresh-Tokens ohne Gnadenfrist —
ein verlorenes neues Token macht den nächsten Versuch zur Wiederverwendung und kostet die ganze
Sitzung. Wer je eine `middleware.ts` ergänzt, ändert damit auch dieses Verhalten (dort kommt das
Cookie an) und muss einen `matcher` setzen, sonst sperrt der `authorized`-Callback die login-freien
Ansichten von `feedback` aus.
```

- [ ] **Step 4: Volle Prüfkette**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
rtk pnpm exec playwright test
```
Expected: alles grün, `pnpm lint` mit Exit 0 und **zwei** Warnungen (die vorbestehenden).

- [ ] **Step 5: Commit**

```bash
rtk git add CLAUDE.md
rtk git commit -m "docs: Frische der Gruppen und der Refresh-Pfad als Querschnittsregel"
```

---

## Self-Review

### Spec-Abdeckung

| Spec | Umgesetzt in | Abweichung |
|---|---|---|
| §2.1 Transiente Fehler von echten unterscheiden | Task 1 (`austauschen`, `endgueltigerFehler`) | keine |
| §2.1a Gruppen aus dem neuen `id_token` | Task 1 (`idTokenAnsprueche`, Feld `groups`/`fachgruppen`) | keine — zusätzlich belegt, dass Pocket ID die Claims bei jedem Grant neu berechnet |
| §2.2 Timeout | Task 1 (`AbortSignal.timeout`, ein Signal für Entdeckung **und** Austausch) | **erweitert:** auch die Discovery-Anfrage bekommt das Signal; ohne sie wäre die Zusage nur halb eingelöst |
| §2.2 Backoff | Task 1 (`refreshFailedAt`, `BACKOFF_MS`) | keine |
| §2.2 Kein Retry innerhalb eines Aufrufs | Task 1 | keine |
| §2.3 Sitzungsdauer explizit | Task 4 | **Begründung korrigiert:** `updateAge` ist unter der JWT-Strategie wirkungslos; rollierend ist die Sitzung über `expires` pro Schreibvorgang |
| §2.3 Cookie folgt der Session | Task 4 (`cookies.test.ts`) | **Mechanismus korrigiert:** `Expires`, nicht `maxAge`; die Zusage ist, dass hier **kein** `maxAge` steht |
| §2.4 Sanfte Re-Authentifizierung | Task 5 | **Riegel geändert:** Zeitstempel + Mount-Ref + Fail-closed statt Einmalmarke (begründet in Task 5) |
| §2.4 `reauthProvider`-Prop | Task 5 | keine |
| §3 Kein Wechsel auf DB-Sessions, keine Verlängerung über 30 Tage, kein Retry-Sturm | Task 4, Task 1 | keine |
| §4 Testtabelle, alle zwölf Zeilen | Task 1 (8), Task 4 (2), Task 5 (2) | **ergänzt:** Rotationsschutz, `darfSchreiben`, Einfrier-Regression im `jwt`-Callback |
| §4 Refresh-Logik zieht nach `core/auth/refresh.ts` | Task 1 | keine |

**Über den Spec hinaus, mit Begründung im Plantext:** die Schreibrecht-Weiche (Task 3) und das
prozesslokale Gedächtnis (Task 1). Beide gehen auf denselben, im Spec nicht enthaltenen Befund
zurück: Pocket ID rotiert Refresh-Tokens ohne Gnadenfrist, und `auth()` in RSC wirft das
`Set-Cookie` weg. Ohne sie würde §2.1 den gemeldeten Defekt nicht beheben, sondern nur umbenennen.

### Typkonsistenz

- `TokenTransport` wird in Task 1 definiert und nur dort verwendet; `refresh.test.ts` importiert ihn
  als Typ für seinen Attrappen-Transport. Die Rückgabe (`{ ok, status, json }`) ist strukturell eine
  Teilmenge von `Response`, deshalb passt der Standardtransport ohne Umbau.
- `AuffrischOptionen.darfSchreiben` ist **Pflicht** — dadurch ist ein Aufrufer, der die Weiche
  vergisst, ein Typfehler und kein stiller Defekt. `config.ts` ist der einzige Aufrufer.
- `Gedaechtnis = Map<string, { ergebnis: Promise<Ergebnis>; seitMs: number }>` wird exportiert, weil
  `refresh.test.ts` eigene Instanzen anlegt. `Ergebnis` bleibt intern.
- `authConfig(request: NextRequest | undefined): NextAuthConfig` passt auf die Signatur, die
  `NextAuth` im Funktionszweig erwartet (`next-auth/index.d.ts:323`).
- `JWT.refreshFailedAt?: number` steht in `src/types/next-auth.d.ts`; ohne diese Zeile schlägt schon
  `refresh.ts` im Typecheck fehl.
- `Providers({ children, reauthProvider })` — `reauthProvider` ist Pflicht, `layout.tsx` ist der
  einzige Aufrufer (Task 5, Schritt 1 prüft das nach).
- `reauthProviderId(env?): string | null` folgt dem `EnvLike`-Muster von `authCookies`/`suiteRedirect`.

### Bekannte Risiken beim Ausführen

1. **Der Zwischenstand in Task 2, Schritt 3** trägt `refreshAccessToken` und `getOIDCConfig` doppelt
   (aus `index.ts` mit umgezogen), bis Task 3 sie löscht. Wer Task 2 und 3 zusammenzieht, spart den
   Zwischenschritt — der Plan trennt sie, damit der reine Umzug für sich prüfbar bleibt.
2. **`vi.mock("@/core/auth/refresh", …)` in `config.test.ts`** muss vollständig sein: sobald
   `config.ts` etwas anderes als `tokenAuffrischen` aus `refresh.ts` importiert, bricht der Mock mit
   „No export named …". Dann den Mock erweitern, nicht `vi.importActual` mischen (das zöge den
   echten `fetch`-Standardtransport in den Test).
3. **`AbortSignal.timeout` läuft an Vitests Fake-Timern vorbei** (nativer Node-Timer). Deshalb hat
   `refresh.test.ts` seine Zeit injiziert und benutzt für den Timeout-Test eine echte, sehr kurze
   Frist. Wer dort auf `vi.useFakeTimers()` umstellt, bekommt einen Test, der hängt.
4. **Der StrictMode-Test in Task 5** hängt daran, dass React Effekte doppelt ausführt. Die Sonde im
   Test sagt es laut, falls nicht — Schritt 8 nennt den Ausweichweg.
5. **`Buffer` in `refresh.ts`.** Läuft heute nur im Node-Runtime. Käme je eine `middleware.ts` dazu
   (Edge), müsste der Dekoder auf eine polsterungsfeste `atob`-Variante umgestellt werden. Der Test
   mit dem echten Segment würde das sofort zeigen.
6. **Das prozesslokale Gedächtnis wirkt nur in einem Prozess.** Die Suite läuft als ein Container
   (`output: "standalone"`). Eine zweite Replik machte den Schutz still wirkungslos — dann bräuchte
   es einen gemeinsamen Speicher, und das wäre eine eigene Änderung.
7. **Ein Restrisiko bleibt bewusst unbehandelt:** bricht die Verbindung, *nachdem* Pocket ID
   rotiert, aber *bevor* die Antwort ankommt, ist das gespeicherte Refresh-Token tot und der nächste
   Versuch eine Wiederverwendung — Sitzung weg, `invalid_grant`, harter Logout. Ohne Gnadenfrist auf
   IdP-Seite ist das nicht zu retten. Der sanfte Re-Login aus Task 5 fängt genau diesen Fall in der
   Regel unsichtbar ab, solange Pocket IDs eigene Sitzung noch lebt (Default 60 Minuten).
8. **`pnpm lint`** darf danach weiterhin genau die zwei vorbestehenden Warnungen zeigen. Ein
   verwaister Import in `config.ts` nach Task 3 wäre ein **Fehler** und blockierte die CI.
