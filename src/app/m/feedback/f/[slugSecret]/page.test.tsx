import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../../_db/schema";
import {
  insertGroup,
  insertEvening,
  insertSurvey,
  activateSurvey,
  setSurveyStatus,
  insertResponse,
} from "../../_db/queries";
import { computeClosesAt } from "../../_lib/lifecycle";
import { STANDARD_QUESTIONS } from "../../_lib/questions";
import s from "./zettel.module.css";

/**
 * DIE FUENF UEBRIGEN ZUSTAENDE DERSELBEN ROUTE (Entwurf 3.2 B–F, 3.8).
 *
 * Was diese Datei bewacht, ist kein Aussehen, sondern zwei Zusagen, die still
 * brechen:
 *
 * 1. Es gibt KEINE stumme Weiterleitung mehr. Handys werden in einer Gruppe
 *    herumgegeben; die 24-Stunden-Cookie-Sperre machte die zweite Abgabe am
 *    geteilten Geraet unmoeglich, und zwar ohne ein Wort der Erklaerung.
 * 2. Der falsche Link verraet NICHT, ob es die Gruppe gibt. Wer Slugs raet,
 *    darf aus der Antwort nichts lernen — deshalb wird hier die Gleichheit der
 *    drei Ablehnungen als Zeichenkette verglichen, nicht "geprueft und gehofft".
 *
 * Der Pruefstand: echte In-Memory-DB (die Zustaende haengen an echten
 * Lifecycle-Spalten), gemockte Next-Raender. `notFound()` WIRFT hier absichtlich
 * mit einer sprechenden Meldung: bliebe der nackte 404 stehen, soll der Test das
 * sagen und nicht schweigen.
 */
const { redirectMock, cookieGetMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  cookieGetMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: () => {
    throw new Error("notFound(): nackter 404 statt Zustand F");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: cookieGetMock, set: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
/**
 * `next/font/google` braucht Nexts SWC-Plugin; unter Vitest wirft der Loader
 * beim IMPORT. Ohne diesen Mock scheitert jeder Test dieser Datei aus dem
 * falschen Grund — das sieht wie "Zustand fehlt" aus und ist "Font kaputt".
 */
vi.mock("next/font/google", () => ({
  Newsreader: () => ({ variable: "newsreader-var", className: "newsreader" }),
}));
vi.mock("../../_db/client", () => ({ getDb: () => db }));

import ParticipatePage from "./page";
import ThanksPage from "./thanks/page";
import { Zettel } from "./Zettel";

type DB = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let db: DB;

const quelle = (name: string) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

/** Mitternacht UTC eines Tages — so wie `evenings.date` es speichert. */
function mitternachtUtc(tageZurueck = 0): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - tageZurueck));
}

function seedGruppe(slug: string, secret: string) {
  return insertGroup(db, {
    name: "Bereitschaft Musterstadt",
    slug,
    secret,
    closeAfterHours: null,
    createdAt: new Date(),
  });
}

/**
 * Gruppe + Abend + Umfrage. Die Frist kommt AUSSCHLIESSLICH aus
 * `computeClosesAt(evening.date, hours)` — nie aus "jetzt + Stunden", sonst
 * prueft der Test eine Frist, die es im Betrieb nicht gibt.
 */
function seedUmfrage(options: {
  slug: string;
  secret: string;
  tageZurueck?: number;
  hours?: number;
  topic?: string | null;
  aktivieren?: boolean;
}) {
  const { slug, secret, tageZurueck = 0, hours = 240, topic = null, aktivieren = true } = options;
  const group = seedGruppe(slug, secret);
  const date = mitternachtUtc(tageZurueck);
  const evening = insertEvening(db, {
    groupId: group.id,
    date,
    topic,
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
  const closesAt = computeClosesAt(date, hours);
  if (aktivieren) activateSurvey(db, survey.id, closesAt, new Date());
  return { group, evening, survey, closesAt, token: `${slug}-${secret}` };
}

async function baum(slugSecret: string): Promise<ReactNode> {
  return ParticipatePage({ params: Promise.resolve({ slugSecret }) });
}

async function seite(slugSecret: string): Promise<string> {
  return renderToStaticMarkup(await baum(slugSecret));
}

async function danke(slugSecret: string): Promise<string> {
  return renderToStaticMarkup(await ThanksPage({ params: Promise.resolve({ slugSecret }) }));
}

/**
 * Sucht eine Komponente im UNAUFGELOESTEN Baum. Zustand A enthaelt `Zettel` —
 * eine Client Component mit Hooks; sie serverseitig auszurendern wuerde hier
 * etwas anderes messen als "das Formular ist wieder da".
 */
function enthaelt(node: ReactNode, typ: unknown): boolean {
  if (Array.isArray(node)) return node.some((kind) => enthaelt(kind, typ));
  if (!isValidElement(node)) return false;
  if (node.type === typ) return true;
  return enthaelt((node.props as { children?: ReactNode }).children, typ);
}

/** Sichtbarer Text ohne Markup — fuer Wortlaut-Zusicherungen. */
function text(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  redirectMock.mockClear();
  cookieGetMock.mockReset();
  cookieGetMock.mockReturnValue(undefined);
});
afterEach(() => sqlite.close());

describe("Zustand C — zurzeit laeuft keine Umfrage", () => {
  it("nennt Gruppe, H1 und die Gueltigkeit des QR-Codes", async () => {
    seedGruppe("bereitschaft", "abc12");
    const markup = await seite("bereitschaft-abc12");
    expect(text(markup)).toContain("Zurzeit läuft keine Umfrage.");
    expect(text(markup)).toContain("Bereitschaft Musterstadt");
    expect(text(markup)).toContain("Der QR-Code bleibt gültig");
    expect(text(markup)).toContain("probier es am Ende des nächsten Abends noch einmal");
  });

  it("bietet „Neu laden“ als <a href> auf dieselbe URL — ohne JavaScript bedienbar", async () => {
    seedGruppe("bereitschaft", "abc12");
    const markup = await seite("bereitschaft-abc12");
    expect(markup).toMatch(/<a [^>]*href="\/f\/bereitschaft-abc12"[^>]*>Neu laden<\/a>/);
    // Kein Knopf: ein <button> ohne Formular braeuchte JavaScript.
    expect(markup).not.toContain("<button");
  });

  it("traegt kein Rot und kein Warndreieck — und nicht den Platzhalter aus Task 9", async () => {
    seedGruppe("bereitschaft", "abc12");
    const markup = await seite("bereitschaft-abc12");
    expect(markup).not.toContain("⚠");
    expect(markup).not.toMatch(/#c8000f/i);
    expect(text(markup)).not.toContain("Vielen Dank für dein Interesse");
  });

  it("zeigt C auch, wenn die Umfrage des letzten Abends noch im Entwurf steht", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12", aktivieren: false });
    expect(text(await seite(token))).toContain("Zurzeit läuft keine Umfrage.");
  });
});

describe("Zustand D — die Umfrage zu diesem Abend ist beendet", () => {
  it("zeigt Thema und Datum des Abends — der richtige Zettel, zu spaet", async () => {
    // Abend vorgestern, Frist 9 Stunden nach Ende des Abendtags: laengst um.
    const { token } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 2,
      hours: 9,
      topic: "Funk-Übung: Sprechgruppen",
    });
    const gelesen = text(await seite(token));
    expect(gelesen).toContain("Die Umfrage zu diesem Abend ist beendet.");
    expect(gelesen).toContain("Funk-Übung: Sprechgruppen");
    const tag = new Intl.DateTimeFormat("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(mitternachtUtc(2));
    expect(gelesen).toContain(tag);
    expect(text(await seite(token))).not.toContain("Diese Umfrage ist inzwischen geschlossen.");
  });

  it("nennt den Schliesszeitpunkt in der Zeitzone der Frist, nicht in UTC", async () => {
    // `computeClosesAt` rechnet in Europe/Berlin: Ende des Abendtags + 9h = 09:00
    // ORTSZEIT. Mit `timeZone: "UTC"` formatiert stuende hier 07:00 oder 08:00 —
    // und der Zettel nennte eine Uhrzeit, zu der noch offen war.
    const { token } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 2,
      hours: 9,
    });
    expect(text(await seite(token))).toMatch(/Sie wurde am .+ um 09:00 geschlossen\./);
  });

  it("nennt bei manuell geschlossener Umfrage den frueheren der beiden Zeitpunkte", async () => {
    // Frist noch Tage entfernt, aber die Gruppenleitung hat von Hand geschlossen:
    // `closesAt` waere hier eine Luege ueber die Zukunft.
    const { token, survey } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      hours: 240,
    });
    const geschlossen = new Date(Date.UTC(2026, 6, 23, 7, 0, 0));
    setSurveyStatus(db, survey.id, "closed", { closedAt: geschlossen });
    const gelesen = text(await seite(token));
    expect(gelesen).toContain("Sie wurde am 23. Juli um 09:00 geschlossen.");
    expect(gelesen).toContain("Danke, falls du schon abgestimmt hast.");
  });

  it("zeigt keinen Knopf und entsaettigt den Legendenstreifen", async () => {
    const { token } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 2,
      hours: 9,
    });
    const markup = await seite(token);
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<form");
    expect(markup).toContain("data-stumm");
    const css = quelle("./zettel.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const regel = css.match(/\.streifen\[data-stumm\][^{]*\{[^}]*\}/g) ?? [];
    expect(regel.length).toBeGreaterThan(0);
    expect(regel.join("\n")).toMatch(/var\(--linie-stark\)/);
    expect(regel.join("\n")).not.toMatch(/#c8000f/i);
  });
});

describe("Zustand E — von diesem Geraet wurde schon abgestimmt", () => {
  it("leitet nicht mehr stumm weiter, sondern erklaert die Weitergabe", async () => {
    const { token, survey } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    cookieGetMock.mockImplementation((name: string) =>
      name === `feedback-${survey.id}` ? { name, value: "submitted" } : undefined,
    );
    const markup = await seite(token);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(text(markup)).toContain("Von diesem Gerät ist schon eine Rückmeldung abgegeben.");
    expect(text(markup)).toContain(
      "Wenn du das Handy weitergibst, kann die nächste Person einen leeren Bogen öffnen.",
    );
  });

  it("stellt „Leeren Bogen öffnen“ als natives <form> mit gebundener Server Action", async () => {
    const { token, survey } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    cookieGetMock.mockImplementation((name: string) =>
      name === `feedback-${survey.id}` ? { name, value: "submitted" } : undefined,
    );
    const markup = await seite(token);
    expect(markup).toContain("<form");
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Leeren Bogen öffnen<\/button>/);
    /*
     * Die Action muss UNGEWICKELT im `action`-Attribut stehen. React DOM gibt
     * einer gewoehnlichen Funktion `action="javascript:throw …"` — ohne
     * JavaScript ist der Knopf dann tot, und weder Typecheck noch Build sehen
     * das. Nur eine serialisierbare Server Action bekommt ein echtes POST-Ziel.
     */
    expect(quelle("./Zustaende.tsx")).toMatch(
      /action=\{releaseDeviceAction\.bind\(null, slugSecret, surveyId\)\}/,
    );
  });

  it("zeigt ohne Cookie wieder das Formular", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    expect(enthaelt(await baum(token), Zettel)).toBe(true);
  });
});

describe("Zustand F — dieser Link stimmt nicht", () => {
  it("gestaltet die Ablehnung statt eines nackten 404", async () => {
    const markup = await seite("gibtsnicht-abc12");
    expect(text(markup)).toContain("Dieser Link stimmt nicht.");
    expect(text(markup)).toContain(
      "Vielleicht ist er unvollständig kopiert. Scanne den QR-Code am besten noch einmal.",
    );
  });

  it("verraet nicht, ob es die Gruppe gibt", async () => {
    seedGruppe("bereitschaft", "abc12");
    const falschesSecret = await seite("bereitschaft-zzzzz");
    const fremderSlug = await seite("gibtsnicht-abc12");
    const kaputtesToken = await seite("x");
    expect(falschesSecret).toBe(fremderSlug);
    expect(kaputtesToken).toBe(fremderSlug);
    expect(falschesSecret).not.toContain("Bereitschaft Musterstadt");
    expect(falschesSecret).not.toContain("bereitschaft");
  });
});

describe("Danke-Seite (Zustand B)", () => {
  it("zeigt „Danke.“, die anonyme Bestaetigung und den Weitergabe-Abschnitt", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    const gelesen = text(await danke(token));
    expect(gelesen).toContain("Danke.");
    expect(gelesen).toContain("Deine Rückmeldung ist eingegangen — anonym.");
    expect(gelesen).toContain("Handy wandert weiter?");
    expect(gelesen).toContain(
      "Deine Antwort ist gespeichert und lässt sich nicht mehr ändern. " +
        "Für die nächste Person kannst du einen leeren Bogen öffnen.",
    );
    expect(await danke(token)).toMatch(
      /<button[^>]*type="submit"[^>]*>Leeren Bogen öffnen<\/button>/,
    );
  });

  it("zeigt keine Antworten mehr auf dem Schirm — das Handy wandert weiter", async () => {
    const { token, survey, evening } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    insertResponse(db, survey.id, { q1: 2, q9: "Mein geheimer Satz" }, evening.date);
    const markup = await danke(token);
    expect(markup).not.toContain("Mein geheimer Satz");
    expect(markup).not.toContain("q9");
  });

  it("lehnt einen falschen Link genauso ab wie das Formular", async () => {
    expect(text(await danke("gibtsnicht-abc12"))).toContain("Dieser Link stimmt nicht.");
  });
});

describe("Gemeinsame Huelle aller Zustaende", () => {
  it("traegt in jedem Zustand Fahne, Kicker und Wortzeichen genau einmal", async () => {
    seedGruppe("leer", "abc12");
    const { token } = seedUmfrage({ slug: "beendet", secret: "abc12", tageZurueck: 2, hours: 9 });
    const zustaende = [
      await seite("leer-abc12"),
      await seite(token),
      await seite("gibtsnicht-abc12"),
      await danke(token),
    ];
    for (const markup of zustaende) {
      expect(markup.match(new RegExp(`class="[^"]*${s.fahne}[^"]*"`, "g"))?.length).toBe(1);
      expect(markup.match(new RegExp(s.wortzeichen, "g"))?.length).toBe(1);
      expect(text(markup)).toContain("Rückmeldung zum Dienstabend");
      expect(text(markup)).toContain("DRK");
    }
  });

  it("baut die Zustaende aus der gemeinsamen Huelle, nicht aus kopiertem Markup", async () => {
    // Ein zweites `<div className={s.fahne}` irgendwo waere der Anfang der
    // Drift: dann tragen zwei Dateien denselben Kopf und nur eine wird gepflegt.
    for (const datei of ["./page.tsx", "./thanks/page.tsx"]) {
      expect(quelle(datei)).not.toContain("s.fahne");
      expect(quelle(datei)).not.toContain("s.kicker");
    }
    expect(quelle("./Zustaende.tsx")).toContain("s.fahne");
  });

  it("bleibt serverseitig — die Weitergabe braucht kein JavaScript", async () => {
    for (const datei of ["./page.tsx", "./thanks/page.tsx", "./Zustaende.tsx"]) {
      expect(quelle(datei)).not.toMatch(/^\s*["']use client["']/m);
    }
  });

  it("nennt in keiner der Zustandsdateien DRK-Rot", async () => {
    for (const datei of ["./page.tsx", "./thanks/page.tsx", "./Zustaende.tsx"]) {
      expect(quelle(datei).replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#c8000f/i);
    }
  });
});
