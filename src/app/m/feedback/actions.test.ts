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
  getSurvey,
  listResponses,
} from "./_db/queries";
import { computeClosesAt } from "./_lib/lifecycle";
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
const { redirectMock, cookieSetMock, cookieDeleteMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  cookieSetMock: vi.fn(),
  cookieDeleteMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "cf-connecting-ip": currentIp }),
  cookies: async () => ({ set: cookieSetMock, get: vi.fn(), delete: cookieDeleteMock }),
}));
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
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
