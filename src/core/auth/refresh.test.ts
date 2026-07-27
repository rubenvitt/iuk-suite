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

describe("tokenAuffrischen — was tatsaechlich angefragt wird", () => {
  /**
   * Die Tests oben pruefen nur `aufrufe.length`. Ein Tippfehler im Pfad der
   * Entdeckungs-URL kaeme trotzdem an `transportBauen`s Weiche vorbei (die
   * matcht per `url.includes("/.well-known/")`) und bliebe unbemerkt — alle
   * anderen Tests blieben gruen, in Produktion liefe die Entdeckung ins
   * Leere. Hier wird der Wortlaut der Anfragen selbst geprueft.
   */
  it("ruft die Entdeckung und danach den entdeckten Token-Endpoint mit dem alten Refresh-Token auf", async () => {
    const t = transportBauen({ token: erfolgsAntwort() });
    await tokenAuffrischen(abgelaufenerToken(), optionen(t));
    expect(t.aufrufe[0].url).toBe(ENTDECKUNG);
    expect(t.aufrufe[1].url).toBe(TOKEN_ENDPOINT);
    expect(t.aufrufe[1].init.method).toBe("POST");
    const body = new URLSearchParams(t.aufrufe[1].init.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-alt");
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
