import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./_db/schema";
import {
  insertGroup,
  insertEvening,
  insertSurvey,
  activateSurvey,
  activeSurveyForGroup,
  getSurvey,
  getGroup,
  getEvening,
  listEvenings,
  listResponses,
  listGroupMembers,
  setGroupMembers,
  upsertKnownUser,
} from "./_db/queries";
import { computeClosesAt, DEFAULT_CLOSE_AFTER_HOURS } from "./_lib/lifecycle";
import { STANDARD_QUESTIONS } from "./_lib/questions";
import { FEHLER_PARAMETER, JS_FELD } from "./_lib/absenden";

// Der Prüfstand: echte In-Memory-DB (der Limiter-Beweis darf nicht an gemockten
// Schreibern hängen — 15 Abgaben müssen als 15 ZEILEN nachweisbar sein), aber
// gemockte Next-Ränder. `headers()` liefert die IP, die der Test gerade spielt.
let currentIp = "203.0.113.7";

/**
 * `redirect` als no-op statt als Werfer: in Next wirft es intern, hier soll die
 * Action durchlaufen, damit der Rückgabewert `{ ok: true }` überhaupt beobachtbar
 * ist. Das Ziel des Sprungs wird stattdessen am Spion geprüft.
 * `cookies().set` ist ein geteilter Spion — bei einer abgelehnten Abgabe darf kein
 * Cookie gesetzt werden (sonst wäre das Gerät für 24h gesperrt, ohne abgestimmt zu haben).
 */
/**
 * `revalidatePath` und `auth` liegen ebenfalls im hoisted-Block: `loadActions()`
 * ruft `vi.resetModules()`, und ein im Factory erzeugtes `vi.fn()` wäre danach
 * ein ANDERER Spion als der, den die Action aufgerufen hat — die Assertion liefe
 * gegen eine leere Aufrufliste.
 */
const { redirectMock, cookieSetMock, cookieDeleteMock, revalidatePathMock, authMock } = vi.hoisted(
  () => ({
    redirectMock: vi.fn(),
    cookieSetMock: vi.fn(),
    cookieDeleteMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    authMock: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "cf-connecting-ip": currentIp }),
  cookies: async () => ({ set: cookieSetMock, get: vi.fn(), delete: cookieDeleteMock }),
}));
vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("./_db/client", () => ({ getDb: () => db }));

type DB = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let db: DB;

/**
 * Die Limiter leben als Modul-Singletons — ohne `resetModules()` schleppt jeder
 * Test die Treffer des vorigen mit und ein grüner Lauf wäre Zufall der
 * Reihenfolge.
 */
async function loadActions() {
  vi.resetModules();
  return import("./actions");
}

/** Mitternacht UTC des heutigen Tages — so wie `evenings.date` es speichert. */
function todayMidnightUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Gruppe + Abend + aktive Umfrage; Frist ausschließlich über computeClosesAt.
 * `daysAgo`/`hours` erlauben einen Abend in der Vergangenheit mit abgelaufener
 * Frist — nie "jetzt + Stunden".
 */
function seedActiveSurvey(slug: string, secret: string, daysAgo = 0, hours = 240) {
  const group = insertGroup(db, {
    name: slug,
    slug,
    secret,
    closeAfterHours: null,
    createdAt: new Date(),
  });
  const eveningDate = new Date(todayMidnightUtc().getTime() - daysAgo * 86400_000);
  const evening = insertEvening(db, {
    groupId: group.id,
    date: eveningDate,
    topic: null,
    notes: null,
    participantCount: null,
    createdAt: new Date(),
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(STANDARD_QUESTIONS),
    closeAfterHours: hours,
    createdAt: new Date(),
  });
  activateSurvey(db, survey.id, computeClosesAt(eveningDate, hours), new Date());
  return { group, survey, token: `${slug}-${secret}` };
}

/** Eine vollständig gefüllte Abgabe (8 Noten, ein Freitext). */
function submission(): FormData {
  const f = new FormData();
  for (const q of STANDARD_QUESTIONS) {
    if (q.type === "schulnote") f.set(q.id, "2");
  }
  f.set("q9", "War gut.");
  return f;
}

/** Nur die acht Noten, kein Freitext — Freitexte sind freiwillig. */
function ratingsOnly(): FormData {
  const f = new FormData();
  for (const q of STANDARD_QUESTIONS) {
    if (q.type === "schulnote") f.set(q.id, "3");
  }
  return f;
}

/**
 * Dieselbe Nutzlast, aber gekennzeichnet als „aus dem Browser mit JavaScript"
 * (Entwurf 3.8) — genau das, was `Zettel.absenden` per `daten.set` tut. Der
 * Unterschied ist nicht Kosmetik: OHNE dieses Feld leitet die Action bei einer
 * Abweisung um, statt zu antworten, denn ohne JavaScript liest niemand den
 * Rückgabewert.
 */
function mitJs(f: FormData): FormData {
  f.set(JS_FELD, "1");
  return f;
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  currentIp = "203.0.113.7";
  redirectMock.mockClear();
  cookieSetMock.mockClear();
  cookieDeleteMock.mockClear();
  revalidatePathMock.mockClear();
  authMock.mockReset();
  authMock.mockResolvedValue(null); // öffentliche Pfade: keine Sitzung
});
afterEach(() => sqlite.close());

describe("submitResponseAction: Ratelimit sperrt die eigene Gruppe nicht aus", () => {
  it("15 Abgaben derselben IP für dieselbe Umfrage in einer Minute gehen alle durch", async () => {
    // Der Kernfall: 15 Ehrenamtliche um 21:30 hinter EINER Vereins-WLAN-NAT-IP.
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 15; i++) {
      await submitResponseAction(token, submission());
    }

    expect(listResponses(db, survey.id)).toHaveLength(15);
  });

  it("bremst die 61. Abgabe derselben IP für dieselbe Umfrage im 10-Minuten-Fenster", async () => {
    // Die Obergrenze greift trotzdem — 60 pro 10 Minuten und Umfrage.
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 60; i++) {
      await submitResponseAction(token, submission());
    }
    expect(await submitResponseAction(token, mitJs(submission()))).toEqual({
      ok: false,
      code: "ratelimit",
    });

    expect(listResponses(db, survey.id)).toHaveLength(60);
  });

  it("zwei verschiedene Umfragen derselben IP haben getrennte Budgets", async () => {
    const { submitResponseAction } = await loadActions();
    const a = seedActiveSurvey("bereitschaft", "abc12");
    const b = seedActiveSurvey("jugendrotkreuz", "xyz98");

    for (let i = 0; i < 60; i++) {
      await submitResponseAction(a.token, submission());
    }
    expect(await submitResponseAction(a.token, mitJs(submission()))).toEqual({
      ok: false,
      code: "ratelimit",
    });

    // Umfrage B ist unberührt: eigener Schlüssel `${ip}|${surveyId}`.
    await submitResponseAction(b.token, submission());

    expect(listResponses(db, a.survey.id)).toHaveLength(60);
    expect(listResponses(db, b.survey.id)).toHaveLength(1);
  });
});

describe("submitResponseAction: Brute-Force-Schutz bleibt", () => {
  it("bremst die 11. Anfrage derselben IP mit unlesbarem Token in einer Minute", async () => {
    const { submitResponseAction } = await loadActions();
    seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 10; i++) {
      expect(await submitResponseAction("x", submission())).toEqual({ ok: false, code: "invalid" });
    }
    expect(await submitResponseAction("x", submission())).toEqual({ ok: false, code: "ratelimit" });
  });

  it("bremst die 11. Anfrage derselben IP mit falschem Secret in einer Minute", async () => {
    // Der geratene Secret-Fall — der Grund, warum überhaupt auf die IP gekeyt wird.
    const { submitResponseAction } = await loadActions();
    seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 10; i++) {
      expect(await submitResponseAction("bereitschaft-zzz99", submission())).toEqual({
        ok: false,
        code: "invalid",
      });
    }
    expect(await submitResponseAction("bereitschaft-zzz99", submission())).toEqual({
      ok: false,
      code: "ratelimit",
    });
  });

  it("ungültige Token verbrauchen kein Budget für gültige Abgaben derselben IP", async () => {
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 10; i++) {
      expect(await submitResponseAction("bereitschaft-zzz99", submission())).toEqual({
        ok: false,
        code: "invalid",
      });
    }
    for (let i = 0; i < 15; i++) {
      await submitResponseAction(token, submission());
    }

    expect(listResponses(db, survey.id)).toHaveLength(15);
  });

  it("eine andere IP hat ein eigenes Brute-Force-Budget", async () => {
    const { submitResponseAction } = await loadActions();
    seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 10; i++) {
      expect(await submitResponseAction("x", submission())).toEqual({ ok: false, code: "invalid" });
    }
    currentIp = "198.51.100.4";
    expect(await submitResponseAction("x", submission())).toEqual({ ok: false, code: "invalid" });
  });
});

/**
 * Pflichtprüfung als LETZTE Linie (Entwurf 3.6, letzter Punkt): die Oberfläche
 * verhindert Lücken zweifach (Lückenspringer mit JS, `required` ohne JS) — der
 * Server prüft unabhängig davon, damit eine vollständig leere Absendung
 * strukturell unmöglich ist.
 */
describe("submitResponseAction: Pflichtnoten", () => {
  const RATING_IDS = STANDARD_QUESTIONS.filter((q) => q.type === "schulnote").map((q) => q.id);

  it("lehnt eine vollständig leere Absendung ab und nennt alle acht Fragen", async () => {
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    expect(await submitResponseAction(token, mitJs(new FormData()))).toEqual({
      ok: false,
      code: "incomplete",
      missing: RATING_IDS,
    });

    expect(listResponses(db, survey.id)).toHaveLength(0);
    expect(cookieSetMock).not.toHaveBeenCalled();
    // Mit JavaScript wird NICHT umgeleitet: die Meldung gehört ins Formular,
    // sonst wären acht Noten und sechs Zeilen weg (Entwurf 3.8).
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("lehnt sieben von acht Noten ab und nennt genau die fehlende", async () => {
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");
    const form = ratingsOnly();
    form.delete("q5");

    expect(await submitResponseAction(token, mitJs(form))).toEqual({
      ok: false,
      code: "incomplete",
      missing: ["q5"],
    });

    expect(listResponses(db, survey.id)).toHaveLength(0);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("nimmt acht Noten ohne jeden Freitext an — Freitexte sind freiwillig", async () => {
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    expect(await submitResponseAction(token, ratingsOnly())).toEqual({ ok: true });

    expect(listResponses(db, survey.id)).toHaveLength(1);
    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith(`/f/${token}/thanks`);
  });

  it("zählt eine Note außerhalb 1–6 als fehlend, statt sie zu speichern", async () => {
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");
    const form = ratingsOnly();
    form.set("q3", "99999");

    expect(await submitResponseAction(token, mitJs(form))).toEqual({
      ok: false,
      code: "incomplete",
      missing: ["q3"],
    });

    expect(listResponses(db, survey.id)).toHaveLength(0);
  });
});

/** Entwurf 3.7: 500 Zeichen sind die physische Grenze, serverseitig gespiegelt. */
describe("submitResponseAction: Zeichengrenze der Freitexte", () => {
  it("speichert von 600 Zeichen genau die ersten 500", async () => {
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");
    const long = "a".repeat(600);
    const form = ratingsOnly();
    form.set("q9", long);

    expect(await submitResponseAction(token, form)).toEqual({ ok: true });

    const rows = listResponses(db, survey.id);
    expect(rows).toHaveLength(1);
    const answers = JSON.parse(rows[0]!.answers) as Record<string, unknown>;
    expect(answers.q9).toBe("a".repeat(500));
  });
});

/** Entwurf 3.8: `closed` gilt auch auf dem Submit-Pfad, nicht nur beim Anzeigen. */
describe("submitResponseAction: geschlossene Umfrage", () => {
  it("lehnt die Abgabe nach Fristablauf ab und schließt die Umfrage nach", async () => {
    const { submitResponseAction } = await loadActions();
    // Abend vor 10 Tagen, Frist eine Stunde nach dessen Tagesende → längst vorbei.
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12", 10, 1);

    expect(await submitResponseAction(token, mitJs(submission()))).toEqual({
      ok: false,
      code: "closed",
    });

    expect(listResponses(db, survey.id)).toHaveLength(0);
    expect(getSurvey(db, survey.id)!.status).toBe("closed");
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("meldet `none`, wenn die Gruppe gar keine aktive Umfrage hat", async () => {
    const { submitResponseAction } = await loadActions();
    const group = insertGroup(db, {
      name: "leer",
      slug: "leer",
      secret: "abc12",
      closeAfterHours: null,
      createdAt: new Date(),
    });
    expect(group.id).toBeGreaterThan(0);

    expect(await submitResponseAction("leer-abc12", submission())).toEqual({
      ok: false,
      code: "none",
    });
    expect(cookieSetMock).not.toHaveBeenCalled();
  });
});

/**
 * DIE FEHLERPFADE HABEN ZWEI WEGE (Entwurf 3.8) — und der zweite war still.
 *
 * Der Rückgabewert dieser Action ist nur mit JavaScript lesbar. Ohne JavaScript
 * ist die Abgabe ein nativer POST: React ruft die Action, verwirft das Ergebnis
 * und rendert dieselbe Seite neu. Läuft die Frist mitten in der Sitzung ab, hieß
 * das bis hierher: acht Noten getippt, „Rückmeldung absenden" gedrückt — und kein
 * Pixel ändert sich. Deshalb leitet die Action OHNE JavaScript auf `?fehler=…`
 * um, und MIT JavaScript darf sie das gerade nicht: ein `redirect()` in einer vom
 * Client aufgerufenen Action navigiert, und dann sind alle Eingaben weg.
 */
describe("submitResponseAction: Fehlerpfade ohne JavaScript", () => {
  it("leitet bei abgelaufener Frist auf `?fehler=geschlossen` um", async () => {
    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12", 10, 1);

    await submitResponseAction(token, submission());

    expect(redirectMock).toHaveBeenCalledWith(`/f/${token}?fehler=${FEHLER_PARAMETER.closed}`);
    // Der Nachschluss passiert trotzdem — er ist eine Frage der Daten.
    expect(getSurvey(db, survey.id)!.status).toBe("closed");
    expect(listResponses(db, survey.id)).toHaveLength(0);
  });

  it("leitet beim Ratelimit auf `?fehler=ratelimit` um", async () => {
    const { submitResponseAction } = await loadActions();
    const { token } = seedActiveSurvey("bereitschaft", "abc12");

    for (let i = 0; i < 60; i++) await submitResponseAction(token, submission());
    redirectMock.mockClear();
    await submitResponseAction(token, submission());

    expect(redirectMock).toHaveBeenCalledWith(`/f/${token}?fehler=${FEHLER_PARAMETER.ratelimit}`);
  });

  it("leitet bei fehlenden Noten auf `?fehler=unvollstaendig` um", async () => {
    const { submitResponseAction } = await loadActions();
    const { token } = seedActiveSurvey("bereitschaft", "abc12");

    await submitResponseAction(token, new FormData());

    expect(redirectMock).toHaveBeenCalledWith(`/f/${token}?fehler=${FEHLER_PARAMETER.incomplete}`);
  });

  it("leitet MIT JavaScript nicht um, sondern antwortet — die Eingaben bleiben stehen", async () => {
    const { submitResponseAction } = await loadActions();
    const abgelaufen = seedActiveSurvey("bereitschaft", "abc12", 10, 1);
    const offen = seedActiveSurvey("jugendrotkreuz", "xyz98");

    expect(await submitResponseAction(abgelaufen.token, mitJs(submission()))).toEqual({
      ok: false,
      code: "closed",
    });
    // Das Budget vollmachen: diese 60 Abgaben werden ANGENOMMEN und springen
    // deshalb auf `/thanks` — der Erfolgssprung, nicht die Fehlerumleitung.
    for (let i = 0; i < 60; i++) await submitResponseAction(offen.token, submission());
    redirectMock.mockClear();
    expect(await submitResponseAction(offen.token, mitJs(submission()))).toEqual({
      ok: false,
      code: "ratelimit",
    });

    expect(redirectMock).not.toHaveBeenCalled();
  });

  /*
   * `none` und `invalid` brauchen keinen Parameter: der native POST rendert
   * dieselbe Route neu, und `page.tsx` liefert dann von selbst Zustand C bzw. F
   * (3.8). Eine Umleitung wäre hier ein zweiter Weg zum selben Bild — und der
   * `invalid`-Fall würde sie ausgerechnet einem Slug-Rater ausliefern.
   */
  it("leitet bei `none` und `invalid` NICHT um — C und F entstehen beim Neurendern", async () => {
    const { submitResponseAction } = await loadActions();
    insertGroup(db, {
      name: "leer",
      slug: "leer",
      secret: "abc12",
      closeAfterHours: null,
      createdAt: new Date(),
    });

    await submitResponseAction("leer-abc12", submission());
    await submitResponseAction("leer-zzz99", submission());
    await submitResponseAction("x", submission());

    expect(redirectMock).not.toHaveBeenCalled();
  });
});

/**
 * Anonymität (Entwurf 3.9): der Siegeltext sagt "keine Uhrzeit". Deshalb trägt
 * jede Antwort Mitternacht UTC des Abenddatums, nicht den Abgabezeitpunkt — bei
 * 15 Personen wäre die Sekunde sonst ein Deanonymisierungskanal.
 */
describe("submitResponseAction: Zeitstempel verrät die Uhrzeit nicht", () => {
  afterEach(() => vi.useRealTimers());

  it("zwei Abgaben im Abstand von Sekunden erhalten identisch das Abenddatum", async () => {
    // Nur Date fälschen: die Actions importieren dynamisch, ein voller
    // Timer-Fake hängt statt zu scheitern.
    vi.useFakeTimers({ toFake: ["Date"] });
    const eveningDate = todayMidnightUtc();
    vi.setSystemTime(new Date(eveningDate.getTime() + 20 * 3600_000)); // 20:00 UTC, Frist offen

    const { submitResponseAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    await submitResponseAction(token, submission());
    vi.setSystemTime(new Date(eveningDate.getTime() + 20 * 3600_000 + 5_000));
    await submitResponseAction(token, submission());

    const rows = listResponses(db, survey.id);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.submittedAt.getTime()).toBe(eveningDate.getTime());
    }
  });
});

/**
 * HANDY-WEITERGABE (Entwurf 3.8).
 *
 * Handys werden in einer Gruppe herumgegeben. Die 24-Stunden-Cookie-Sperre machte
 * die zweite Abgabe am geteilten Gerät unmöglich — und zwar stumm. Diese Action
 * ist der Ausweg, und sie hat genau zwei Zusagen: das Cookie ist WEG (auch für
 * `path: "/"`, sonst liefert der Browser den Löschbefehl für den falschen Pfad
 * aus und die Sperre bleibt), und danach steht das Formular wieder da.
 */
describe("releaseDeviceAction: leerer Bogen für die nächste Person", () => {
  it("löscht das Cookie per `set` mit maxAge 0 und path /, nicht per `delete`", async () => {
    const { releaseDeviceAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    await releaseDeviceAction(token, survey.id);

    expect(cookieSetMock).toHaveBeenCalledWith(
      `feedback-${survey.id}`,
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
    expect(cookieDeleteMock).not.toHaveBeenCalled();
  });

  it("leitet auf das Formular derselben Gruppe, nicht auf die Danke-Seite", async () => {
    const { releaseDeviceAction } = await loadActions();
    const { token, survey } = seedActiveSurvey("bereitschaft", "abc12");

    await releaseDeviceAction(token, survey.id);

    expect(redirectMock).toHaveBeenCalledWith(`/f/${token}`);
  });

  /*
   * HIER STAND EIN TEST, DER NICHTS PRUEFEN KONNTE.
   *
   * "die naechste Abgabe derselben IP landet als eigene Zeile": zwei Abgaben mit
   * einem `releaseDeviceAction` dazwischen, erwartet zwei Zeilen. Er war gruen —
   * aber auch ohne die Freigabe. `submitResponseAction` LIEST das Dedup-Cookie
   * nie (es wird in dieser Datei nur gesetzt, gelesen wird es ausschliesslich in
   * page.tsx); zwei aufeinanderfolgende Abgaben ergeben immer zwei Zeilen. Der
   * Test konnte also nicht fehlschlagen, wenn die Freigabe kaputtgeht — genau die
   * Zusage, die er im Namen trug. Und solange der `cookies()`-Mock dieser Datei
   * `get: vi.fn()` ist, kann hier ueberhaupt keine Cookie-Zusage geprueft werden.
   *
   * Die beiden Zusagen liegen dort, wo sie fehlschlagen KOENNEN:
   *   - "zwei Abgaben derselben IP sind zwei Zeilen": oben, "15 Abgaben derselben
   *     IP …" (`toHaveLength(15)`) — strikt staerker.
   *   - "danach ist eine neue Abgabe moeglich": die Freigabe setzt `maxAge: 0`
   *     mit `path: "/"` und leitet aufs Formular (die zwei Tests direkt hier
   *     darueber), und ohne Cookie zeigt die Seite wieder den Bogen
   *     (page.test.tsx, "Zustand E — zeigt ohne Cookie wieder das Formular").
   */
});

/**
 * Ein angemeldeter Viewer, der Gruppenleitung EINER Gruppe ist: der Claim
 * `fachgruppen` trägt den Slug, `memberGroupIdsFor` löst ihn gegen `groups.slug`
 * auf. Kein Suite-Admin — der Zugang hängt damit an derselben Auflösung, die die
 * Oberfläche benutzt.
 */
function alsGruppenleitung(slug: string): void {
  authMock.mockResolvedValue({ user: { id: "leitung-1", groups: [], fachgruppen: [slug] } });
}

/** Gruppe + Abend (`daysAgo` Tage zurück) + Umfrage im Zustand `draft`. */
function seedDraftSurvey(slug: string, daysAgo: number, hours: number) {
  const group = insertGroup(db, {
    name: slug,
    slug,
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(),
  });
  const eveningDate = new Date(todayMidnightUtc().getTime() - daysAgo * 86400_000);
  const evening = insertEvening(db, {
    groupId: group.id,
    date: eveningDate,
    topic: null,
    notes: null,
    participantCount: null,
    createdAt: new Date(),
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(STANDARD_QUESTIONS),
    closeAfterHours: hours,
    createdAt: new Date(),
  });
  return { group, evening, survey, eveningDate };
}

/**
 * Fund 1.5/2: `activateSurveyAction` übergab `now` als `eveningDate`. Ein
 * Altbestands-Entwurf, der drei Tage später gestartet wird, bekam damit eine
 * Frist, die am KLICKZEITPUNKT hängt statt am Abenddatum — die Umfrage zu einem
 * Abend von Montag lief bis Donnerstag, weil sie am Mittwoch gestartet wurde.
 * Fristen kommen ausschließlich aus `computeClosesAt(evening.date, hours)`.
 */
describe("activateSurveyAction: die Frist hängt am Abenddatum, nicht am Klick", () => {
  it("Entwurf für einen Abend vor drei Tagen: closesAt richtet sich nach dem Abenddatum", async () => {
    const { activateSurveyAction } = await loadActions();
    const { survey, eveningDate } = seedDraftSurvey("bereitschaft", 3, 48);
    alsGruppenleitung("bereitschaft");

    const f = new FormData();
    f.set("id", String(survey.id));
    await activateSurveyAction(f);

    const nachher = getSurvey(db, survey.id)!;
    expect(nachher.status).toBe("active");
    expect(nachher.closesAt).toEqual(computeClosesAt(eveningDate, 48));
    // Und ausdrücklich NICHT die Frist ab jetzt — sonst wäre der Defekt zurück.
    expect(nachher.closesAt).not.toEqual(computeClosesAt(todayMidnightUtc(), 48));
  });

  it("die Stunden kommen aus der Umfrage, das Datum aus dem Abend (kein Vermischen)", async () => {
    const { activateSurveyAction } = await loadActions();
    const { survey, eveningDate } = seedDraftSurvey("jugend", 10, 24);
    alsGruppenleitung("jugend");

    const f = new FormData();
    f.set("id", String(survey.id));
    await activateSurveyAction(f);

    expect(getSurvey(db, survey.id)!.closesAt).toEqual(computeClosesAt(eveningDate, 24));
  });
});

/**
 * Fund 1.5/4: revalidiert wurden `/m/feedback` und `/m/feedback/admin` — letztere
 * Route existiert wegen der Klammer-Route-Group `(admin)` NIE, und das Cockpit
 * `/m/feedback/groups/{id}` stand in keiner der beiden Listen. Nach dem Klick
 * zeigte dieselbe Seite den alten Zustand. `"layout"` schließt die Unterrouten ein.
 */
describe("revalidate: der Pfad schließt das Cockpit ein", () => {
  it("nach dem Starten einer Umfrage wird /m/feedback als layout revalidiert", async () => {
    const { activateSurveyAction } = await loadActions();
    const { survey } = seedDraftSurvey("bereitschaft", 1, 48);
    alsGruppenleitung("bereitschaft");

    const f = new FormData();
    f.set("id", String(survey.id));
    await activateSurveyAction(f);

    expect(revalidatePathMock).toHaveBeenCalledWith("/m/feedback", "layout");
    // Die nie existierende Route ist weg — sie war der Grund, warum niemand
    // gemerkt hat, dass das Cockpit fehlt.
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/m/feedback/admin");
  });

  it("auch beim Beenden — dieselbe Seite muss den neuen Zustand zeigen", async () => {
    const { closeSurveyAction } = await loadActions();
    const { survey } = seedActiveSurvey("bereitschaft", "abc12");
    alsGruppenleitung("bereitschaft");

    const f = new FormData();
    f.set("id", String(survey.id));
    await closeSurveyAction(f);

    expect(revalidatePathMock).toHaveBeenCalledWith("/m/feedback", "layout");
  });
});

/**
 * EIN KLICK STATT FÜNF (Entwurf §2.3, §4.15/1). Der Hauptablauf war: Gruppe
 * öffnen → Abend-Formular absenden → Abend öffnen → „Umfrage erstellen" →
 * „Aktivieren". `createAndStartSurvey` (transaktional, `queries.ts:230`) hat das
 * Rezept längst — es fehlte nur der Aufrufer. Diese Action ist deshalb
 * absichtlich ein Zehnzeiler: sie parst, guardet und delegiert. Würde sie
 * `insertEvening` + `insertSurvey` + `activateSurvey` nachbauen, läge die
 * Ein-aktive-Invariante an zwei Stellen — und die zweite ist die ungetestete.
 */
describe("startFeedbackAction: Abend, aktive Umfrage und Frist in einem Klick", () => {
  /** Gruppe ohne eigene Frist — die Vorgabe DEFAULT_CLOSE_AFTER_HOURS greift. */
  function seedGroup(slug: string, closeAfterHours: number | null = null) {
    return insertGroup(db, {
      name: slug,
      slug,
      secret: "abc12",
      closeAfterHours,
      createdAt: new Date(),
    });
  }

  function startForm(groupId: number, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("groupId", String(groupId));
    f.set("date", "2026-07-22");
    f.set("topic", "Erste Hilfe Auffrischung");
    f.set("participantCount", "20");
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("ein Aufruf genügt: danach ist activeSurveyForGroup gesetzt", async () => {
    const { startFeedbackAction } = await loadActions();
    const g = seedGroup("bereitschaft");
    alsGruppenleitung("bereitschaft");

    const ergebnis = await startFeedbackAction({ ok: true }, startForm(g.id));

    expect(ergebnis).toEqual({ ok: true });
    const laufend = activeSurveyForGroup(db, g.id);
    expect(laufend).toBeDefined();
    expect(laufend!.survey.status).toBe("active");
    expect(laufend!.survey.activatedAt).not.toBeNull();
    expect(laufend!.evening.topic).toBe("Erste Hilfe Auffrischung");
    expect(laufend!.evening.participantCount).toBe(20);
    // Mitternacht UTC, so wie `evenings.date` es speichert.
    expect(laufend!.evening.date).toEqual(new Date("2026-07-22T00:00:00Z"));
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/feedback", "layout");
  });

  it("die Frist kommt aus computeClosesAt(evening.date, hours) und liegt nach dem Abend", async () => {
    const { startFeedbackAction } = await loadActions();
    const g = seedGroup("bereitschaft", 48);
    alsGruppenleitung("bereitschaft");

    // Abend in der ZUKUNFT: eine Frist „jetzt + 48h" läge davor und wäre sofort
    // sichtbar falsch — genau der Fund 1.5/2 an der zweiten Stelle.
    const abend = new Date(todayMidnightUtc().getTime() + 7 * 86400_000);
    const iso = abend.toISOString().slice(0, 10);
    await startFeedbackAction({ ok: true }, startForm(g.id, { date: iso }));

    const laufend = activeSurveyForGroup(db, g.id)!;
    expect(laufend.survey.closesAt).toEqual(computeClosesAt(abend, 48));
    expect(laufend.survey.closesAt!.getTime()).toBeGreaterThan(abend.getTime());
    expect(laufend.survey.closesAt).not.toEqual(computeClosesAt(todayMidnightUtc(), 48));
  });

  it("ohne eigene Frist der Gruppe gilt DEFAULT_CLOSE_AFTER_HOURS", async () => {
    const { startFeedbackAction } = await loadActions();
    const g = seedGroup("bereitschaft", null);
    alsGruppenleitung("bereitschaft");

    await startFeedbackAction({ ok: true }, startForm(g.id, { date: "2026-07-22" }));

    const laufend = activeSurveyForGroup(db, g.id)!;
    expect(laufend.survey.closeAfterHours).toBe(DEFAULT_CLOSE_AFTER_HOURS);
    expect(laufend.survey.closesAt).toEqual(
      computeClosesAt(new Date("2026-07-22T00:00:00Z"), DEFAULT_CLOSE_AFTER_HOURS),
    );
  });

  it("nutzt die Transaktion: bei laufender Umfrage bleibt danach genau EINE aktiv", async () => {
    const { startFeedbackAction } = await loadActions();
    const { group, survey } = seedActiveSurvey("bereitschaft", "abc12");
    alsGruppenleitung("bereitschaft");

    await startFeedbackAction({ ok: true }, startForm(group.id, { date: "2026-07-23" }));

    // Direkt per SQL gezählt: `activeSurveyForGroup` nutzt `.get()` und würde
    // eine verletzte Invariante stumm verdecken.
    const aktive = (
      sqlite
        .prepare(
          "SELECT COUNT(*) AS c FROM surveys s JOIN evenings e ON e.id = s.evening_id" +
            " WHERE e.group_id = ? AND s.status = 'active'",
        )
        .get(group.id) as { c: number }
    ).c;
    expect(aktive).toBe(1);
    expect(getSurvey(db, survey.id)!.status).toBe("closed");
    expect(activeSurveyForGroup(db, group.id)!.survey.id).not.toBe(survey.id);
  });

  it("fehlendes Datum: Fehler am Feld, Eingaben bleiben stehen, nichts wird angelegt", async () => {
    const { startFeedbackAction } = await loadActions();
    const g = seedGroup("bereitschaft");
    alsGruppenleitung("bereitschaft");

    const ergebnis = await startFeedbackAction({ ok: true }, startForm(g.id, { date: "" }));

    // KEIN throw: eine technische Fehlerseite kann keinen Feldfehler tragen und
    // wirft die Eingaben weg.
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) throw new Error("unerreichbar");
    expect(ergebnis.fieldErrors.date).toMatch(/fehlt/i);
    expect(ergebnis.values.topic).toBe("Erste Hilfe Auffrischung");
    expect(ergebnis.values.participantCount).toBe("20");
    expect(activeSurveyForGroup(db, g.id)).toBeUndefined();
    expect(listEvenings(db, g.id)).toHaveLength(0);
    // Kein Erfolg, kein revalidate.
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("unlesbares Datum: ebenfalls Feldfehler statt Ausnahme", async () => {
    const { startFeedbackAction } = await loadActions();
    const g = seedGroup("bereitschaft");
    alsGruppenleitung("bereitschaft");

    const ergebnis = await startFeedbackAction({ ok: true }, startForm(g.id, { date: "22.07.2026" }));

    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) throw new Error("unerreichbar");
    expect(ergebnis.fieldErrors.date).toBeTruthy();
    expect(listEvenings(db, g.id)).toHaveLength(0);
  });

  it("eine fremde Gruppe wirft — eine Zugriffsverletzung ist kein Feldfehler", async () => {
    const { startFeedbackAction } = await loadActions();
    const fremd = seedGroup("jugendrotkreuz");
    alsGruppenleitung("bereitschaft");

    await expect(startFeedbackAction({ ok: true }, startForm(fremd.id))).rejects.toThrow();
    expect(listEvenings(db, fremd.id)).toHaveLength(0);
  });

  it("leere Teilnehmerzahl bleibt leer — es wird kein Nenner erfunden", async () => {
    const { startFeedbackAction } = await loadActions();
    const g = seedGroup("bereitschaft");
    alsGruppenleitung("bereitschaft");

    await startFeedbackAction({ ok: true }, startForm(g.id, { participantCount: "", topic: "" }));

    const laufend = activeSurveyForGroup(db, g.id)!;
    expect(laufend.evening.participantCount).toBeNull();
    expect(laufend.evening.topic).toBeNull();
  });
});

describe("beendeFeedbackAction: der geplante Schluss-Schritt", () => {
  it("schließt genau die genannte Umfrage und revalidiert das Cockpit", async () => {
    const { beendeFeedbackAction } = await loadActions();
    const { survey } = seedActiveSurvey("bereitschaft", "abc12");
    alsGruppenleitung("bereitschaft");

    const f = new FormData();
    f.set("surveyId", String(survey.id));
    await beendeFeedbackAction(f);

    const nachher = getSurvey(db, survey.id)!;
    expect(nachher.status).toBe("closed");
    expect(nachher.closedAt).not.toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/feedback", "layout");
  });

  it("eine fremde Gruppe wirft", async () => {
    const { beendeFeedbackAction } = await loadActions();
    const fremd = seedActiveSurvey("jugendrotkreuz", "xyz98");
    alsGruppenleitung("bereitschaft");

    const f = new FormData();
    f.set("surveyId", String(fremd.survey.id));
    await expect(beendeFeedbackAction(f)).rejects.toThrow();
    expect(getSurvey(db, fremd.survey.id)!.status).toBe("active");
  });
});

/** Suite-Admin: `groups` trägt die Suite-Admin-Gruppe, `fachgruppen` ist leer. */
function alsAdmin(): void {
  authMock.mockResolvedValue({
    user: { id: "admin-1", groups: ["dashboard-admins"], fachgruppen: [] },
  });
}

/**
 * ZONE e — GRUPPE BEARBEITEN (Entwurf §2.6, §4.4). Die Action hatte keinen
 * Aufrufer und deshalb auch keine Feldfehler: sie schrieb, was ankam, und einen
 * leeren Namen ebenso still wie eine unlesbare Frist.
 *
 * `slug` ist NICHT editierbar (§2.6): er steckt in jedem gedruckten QR-Code. Ein
 * Slug-Wechsel ist funktional dasselbe wie „Neues Secret erzeugen" und gehört
 * nicht in ein Speichern-Formular — die Action muss das Feld deshalb ignorieren,
 * auch wenn es im POST steht.
 */
describe("updateGroupAction: Name und Frist ändern, Slug nie", () => {
  function seedGroup(slug = "bereitschaft", closeAfterHours: number | null = 48) {
    return insertGroup(db, {
      name: "Bereitschaft",
      slug,
      secret: "abc12",
      closeAfterHours,
      createdAt: new Date(),
    });
  }
  function form(id: number, over: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("id", String(id));
    f.set("name", "Bereitschaft Mitte");
    f.set("closeAfterHours", "72");
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  }

  it("speichert Name und Standard-Schließfrist", async () => {
    const { updateGroupAction } = await loadActions();
    const g = seedGroup();
    alsGruppenleitung("bereitschaft");

    const ergebnis = await updateGroupAction({ ok: true }, form(g.id));

    expect(ergebnis.ok).toBe(true);
    const nachher = getGroup(db, g.id)!;
    expect(nachher.name).toBe("Bereitschaft Mitte");
    expect(nachher.closeAfterHours).toBe(72);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/feedback", "layout");
  });

  it("ignoriert ein mitgeschicktes slug-Feld — der Slug steht auf jedem Aushang", async () => {
    const { updateGroupAction } = await loadActions();
    const g = seedGroup();
    alsGruppenleitung("bereitschaft");

    await updateGroupAction({ ok: true }, form(g.id, { slug: "neuer-slug" }));

    expect(getGroup(db, g.id)!.slug).toBe("bereitschaft");
  });

  it("leerer Name: Fehler am Feld, nichts geschrieben, nichts revalidiert", async () => {
    const { updateGroupAction } = await loadActions();
    const g = seedGroup();
    alsGruppenleitung("bereitschaft");

    const ergebnis = await updateGroupAction({ ok: true }, form(g.id, { name: "  " }));

    if (ergebnis.ok) throw new Error("erwartet: Feldfehler");
    expect(ergebnis.fieldErrors.name).toBeTruthy();
    expect(ergebnis.values.closeAfterHours).toBe("72"); // Eingaben gehen nicht verloren
    expect(getGroup(db, g.id)!.name).toBe("Bereitschaft");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("unlesbare Frist: Fehler am Feld statt stillem Zurücksetzen auf die Vorgabe", async () => {
    const { updateGroupAction } = await loadActions();
    const g = seedGroup("bereitschaft", 48);
    alsGruppenleitung("bereitschaft");

    const ergebnis = await updateGroupAction({ ok: true }, form(g.id, { closeAfterHours: "x" }));

    if (ergebnis.ok) throw new Error("erwartet: Feldfehler");
    expect(ergebnis.fieldErrors.closeAfterHours).toBeTruthy();
    expect(getGroup(db, g.id)!.closeAfterHours).toBe(48);
  });

  it("leere Frist heisst Vorgabe-benutzen und ist kein Fehler", async () => {
    const { updateGroupAction } = await loadActions();
    const g = seedGroup("bereitschaft", 48);
    alsGruppenleitung("bereitschaft");

    const ergebnis = await updateGroupAction({ ok: true }, form(g.id, { closeAfterHours: "" }));

    expect(ergebnis.ok).toBe(true);
    expect(getGroup(db, g.id)!.closeAfterHours).toBeNull();
  });

  it("eine fremde Gruppe wirft — eine Zugriffsverletzung ist kein Feldfehler", async () => {
    const { updateGroupAction } = await loadActions();
    const fremd = seedGroup("jugendrotkreuz");
    alsGruppenleitung("bereitschaft");

    await expect(updateGroupAction({ ok: true }, form(fremd.id))).rejects.toThrow();
    expect(getGroup(db, fremd.id)!.name).toBe("Bereitschaft");
  });
});

/**
 * ABEND BEARBEITEN (Entwurf §2.5 „Bearbeiten", §2.4). Zwei Zusagen, die still
 * brechen:
 *
 * 1. DIE TEILNEHMERZAHL IST NACHTRAGBAR. Sie ist der Nenner jeder Rücklaufquote
 *    und wird typischerweise erst am Abend selbst bekannt. Ein Patch, der die
 *    ganze Zeile überschreibt, hätte dabei Thema und Notizen genullt — der
 *    Dialog schickt nur, was er zeigt.
 * 2. WIRD DAS DATUM EINES LAUFENDEN ABENDS GEÄNDERT, WIRD DIE FRIST NEU
 *    GERECHNET. `evenings.date` ist der Anker von `computeClosesAt`; ohne
 *    Neurechnung zeigte die Frist auf den alten Anker, und die Umfrage schließt
 *    zu einem Zeitpunkt, der zu keinem Datum auf der Seite passt.
 */
describe("updateEveningAction: Teilnehmerzahl nachtragen, Frist neu ankern", () => {
  it("trägt die Teilnehmerzahl nach, ohne Thema und Notizen zu nullen", async () => {
    const { updateEveningAction } = await loadActions();
    const group = insertGroup(db, {
      name: "Bereitschaft",
      slug: "bereitschaft",
      secret: "abc12",
      closeAfterHours: null,
      createdAt: new Date(),
    });
    const evening = insertEvening(db, {
      groupId: group.id,
      date: todayMidnightUtc(),
      topic: "Funkübung",
      notes: "Kartenmaterial fehlte",
      participantCount: null,
      createdAt: new Date(),
    });
    alsGruppenleitung("bereitschaft");

    const f = new FormData();
    f.set("id", String(evening.id));
    f.set("participantCount", "18");
    await updateEveningAction(f);

    const nachher = getEvening(db, evening.id)!;
    expect(nachher.participantCount).toBe(18);
    expect(nachher.topic).toBe("Funkübung");
    expect(nachher.notes).toBe("Kartenmaterial fehlte");
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/feedback", "layout");
  });

  it("neues Datum bei laufender Umfrage: closesAt kommt aus computeClosesAt(neuesDatum, h)", async () => {
    const { updateEveningAction } = await loadActions();
    const { survey } = seedActiveSurvey("bereitschaft", "abc12", 0, 48);
    const eveningId = getSurvey(db, survey.id)!.eveningId;
    alsGruppenleitung("bereitschaft");

    const neu = "2026-07-22";
    const f = new FormData();
    f.set("id", String(eveningId));
    f.set("date", neu);
    await updateEveningAction(f);

    const nachher = getSurvey(db, survey.id)!;
    expect(getEvening(db, eveningId)!.date).toEqual(new Date(`${neu}T00:00:00Z`));
    // Dieselbe Vorrangregel wie activateSurveyAction: survey → group → Vorgabe.
    expect(nachher.closesAt).toEqual(computeClosesAt(new Date(`${neu}T00:00:00Z`), 48));
    expect(nachher.status).toBe("active");
  });

  it("unverändertes Datum lässt closesAt unangetastet", async () => {
    const { updateEveningAction } = await loadActions();
    const { survey } = seedActiveSurvey("bereitschaft", "abc12", 0, 48);
    const eveningId = getSurvey(db, survey.id)!.eveningId;
    const vorher = getSurvey(db, survey.id)!.closesAt;
    alsGruppenleitung("bereitschaft");

    const iso = new Date(getEvening(db, eveningId)!.date).toISOString().slice(0, 10);
    const f = new FormData();
    f.set("id", String(eveningId));
    f.set("date", iso);
    f.set("participantCount", "18");
    await updateEveningAction(f);

    expect(getSurvey(db, survey.id)!.closesAt).toEqual(vorher);
  });

  it("eine geschlossene Umfrage bekommt keine neue Frist — sie läuft nicht mehr", async () => {
    const { updateEveningAction, closeSurveyAction } = await loadActions();
    const { survey } = seedActiveSurvey("bereitschaft", "abc12", 0, 48);
    const eveningId = getSurvey(db, survey.id)!.eveningId;
    alsGruppenleitung("bereitschaft");
    const zu = new FormData();
    zu.set("id", String(survey.id));
    await closeSurveyAction(zu);
    const vorher = getSurvey(db, survey.id)!.closesAt;

    const f = new FormData();
    f.set("id", String(eveningId));
    f.set("date", "2026-07-22");
    await updateEveningAction(f);

    expect(getSurvey(db, survey.id)!.closesAt).toEqual(vorher);
    expect(getSurvey(db, survey.id)!.status).toBe("closed");
  });

  it("ein fremder Abend wirft", async () => {
    const { updateEveningAction } = await loadActions();
    const { survey } = seedActiveSurvey("jugendrotkreuz", "xyz98");
    const eveningId = getSurvey(db, survey.id)!.eveningId;
    alsGruppenleitung("bereitschaft");

    const f = new FormData();
    f.set("id", String(eveningId));
    f.set("participantCount", "18");
    await expect(updateEveningAction(f)).rejects.toThrow();
    expect(getEvening(db, eveningId)!.participantCount).toBeNull();
  });
});

/**
 * DIE ZUORDNUNG DER GRUPPENLEITER (Entwurf §2.6 Punkt 2). Ohne sie sieht in
 * Produktion kein Gruppenleiter seine Gruppe — die Zuordnung war ausschließlich
 * per Datenbankeingriff möglich.
 *
 * SIE IST ADMIN-SACHE, und das ist der wichtigste Test der Aufgabe: würde die
 * Action nur `guardGroup` benutzen, dürfte eine Gruppenleitung sich beliebige
 * Personen in die EIGENE Gruppe holen — und damit auch sich selbst weitere
 * Gruppen, sobald sie eine einzige geschenkt bekommt. Der Negativtest läuft
 * deshalb gegen die eigene Gruppe, nicht gegen eine fremde: gegen eine fremde
 * würde schon `guardGroup` werfen und der Test wäre blind.
 *
 * Beide Richtungen gehen über `setGroupMembers` (ersetzt vollständig) mit einer
 * SERVERSEITIG gelesenen Ist-Liste — die gewünschte Liste vom Client zu
 * übernehmen wäre Mass-Assignment.
 */
describe("Zuordnung der Leitung: Admin-Sache, Hinzufügen und Entfernen", () => {
  function seedGroup(slug = "bereitschaft") {
    return insertGroup(db, {
      name: slug,
      slug,
      secret: "abc12",
      closeAfterHours: null,
      createdAt: new Date(),
    });
  }
  function form(groupId: number, kennung: string): FormData {
    const f = new FormData();
    f.set("groupId", String(groupId));
    f.set("kennung", kennung);
    return f;
  }

  it("Admin ordnet eine Kennung zu — die bestehende Zuordnung bleibt", async () => {
    const { addGroupLeaderAction } = await loadActions();
    const g = seedGroup();
    setGroupMembers(db, g.id, ["alt-1"]);
    alsAdmin();

    const ergebnis = await addGroupLeaderAction({ ok: true }, form(g.id, "neu-1"));

    expect(ergebnis.ok).toBe(true);
    expect(listGroupMembers(db, g.id).sort()).toEqual(["alt-1", "neu-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/feedback", "layout");
  });

  it("eine E-Mail wird über das Nutzerverzeichnis auf die Kennung aufgelöst", async () => {
    const { addGroupLeaderAction } = await loadActions();
    const g = seedGroup();
    upsertKnownUser(db, {
      userId: "sub-abc",
      name: "Anna Beispiel",
      email: "anna@drk.example",
      seenAt: new Date(),
    });
    alsAdmin();

    await addGroupLeaderAction({ ok: true }, form(g.id, "Anna@DRK.example"));

    expect(listGroupMembers(db, g.id)).toEqual(["sub-abc"]);
  });

  it("unbekannte E-Mail: Fehler am Feld, keine Zuordnung auf eine E-Mail-Adresse", async () => {
    const { addGroupLeaderAction } = await loadActions();
    const g = seedGroup();
    alsAdmin();

    const ergebnis = await addGroupLeaderAction({ ok: true }, form(g.id, "wer@drk.example"));

    if (ergebnis.ok) throw new Error("erwartet: Feldfehler");
    expect(ergebnis.fieldErrors.kennung).toBeTruthy();
    expect(listGroupMembers(db, g.id)).toEqual([]);
  });

  it("leere Eingabe: Fehler am Feld, nichts geschrieben", async () => {
    const { addGroupLeaderAction } = await loadActions();
    const g = seedGroup();
    alsAdmin();

    const ergebnis = await addGroupLeaderAction({ ok: true }, form(g.id, "   "));

    if (ergebnis.ok) throw new Error("erwartet: Feldfehler");
    expect(ergebnis.fieldErrors.kennung).toBeTruthy();
    expect(listGroupMembers(db, g.id)).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("Entfernen funktioniert, nicht nur Hinzufügen — und trifft nur die genannte Kennung", async () => {
    const { removeGroupLeaderAction } = await loadActions();
    const g = seedGroup();
    setGroupMembers(db, g.id, ["u1", "u2"]);
    alsAdmin();

    const f = new FormData();
    f.set("groupId", String(g.id));
    f.set("userId", "u1");
    await removeGroupLeaderAction(f);

    expect(listGroupMembers(db, g.id)).toEqual(["u2"]);
  });

  it("NEGATIVTEST: eine Gruppenleitung darf nicht einmal die EIGENE Gruppe zuordnen", async () => {
    const { addGroupLeaderAction, removeGroupLeaderAction } = await loadActions();
    const g = seedGroup("bereitschaft");
    setGroupMembers(db, g.id, ["leitung-1"]);
    alsGruppenleitung("bereitschaft");

    await expect(addGroupLeaderAction({ ok: true }, form(g.id, "kumpel-1"))).rejects.toThrow();
    const raus = new FormData();
    raus.set("groupId", String(g.id));
    raus.set("userId", "leitung-1");
    await expect(removeGroupLeaderAction(raus)).rejects.toThrow();

    expect(listGroupMembers(db, g.id)).toEqual(["leitung-1"]);
  });
});
