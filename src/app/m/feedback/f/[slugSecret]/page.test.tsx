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
  getSurvey,
  insertResponse,
} from "../../_db/queries";
import { computeClosesAt, TIME_ZONE } from "../../_lib/lifecycle";
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

/**
 * Spiegelt `geschlossenAm` aus page.tsx: "am 23. Juli um 09:00" — in der
 * Zeitzone, in der die Frist GERECHNET wurde, nicht in UTC.
 *
 * ZWEI Formatierer, kein kombinierter: ein kombinierter setzt eigene
 * Trennzeichen ("23. Juli, 09:00") und traefe den Satz der Seite nie. Und der
 * erwartete Satz wird HIER aus dem Zeitpunkt abgeleitet, statt als "23. Juli um
 * 09:00" hart zu stehen — ein hart geschriebener Kalendertag ist bei einem
 * relativen Fixture per Definition ab morgen falsch.
 */
function geschlossenAm(zeit: Date): string {
  const tag = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(zeit);
  const uhr = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(zeit);
  return `am ${tag} um ${uhr}`;
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

/**
 * `fehler` ist der Weg OHNE JavaScript (Entwurf 3.8): `submitResponseAction`
 * leitet dort auf `?fehler=…` um, weil den Rueckgabewert niemand liest. Ohne
 * Parameter aufgerufen bleibt `searchParams` weg — genau wie bei einem Scan.
 */
async function baum(slugSecret: string, fehler?: string | string[]): Promise<ReactNode> {
  return ParticipatePage({
    params: Promise.resolve({ slugSecret }),
    searchParams: fehler === undefined ? undefined : Promise.resolve({ fehler }),
  });
}

async function seite(slugSecret: string, fehler?: string | string[]): Promise<string> {
  return renderToStaticMarkup(await baum(slugSecret, fehler));
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

/**
 * Sichtbarer Text ohne Markup — fuer Wortlaut-Zusicherungen.
 *
 * Entitaeten werden aufgeloest, weil hier auf String-Markup gemessen wird und
 * nicht auf einem DOM-Knoten: React escapt in Textknoten `&`, `<`, `>`, `"` und
 * `'`, sodass eine Zusicherung sonst die Serialisierung statt des Wortlauts
 * pruefte — ein Apostroph in einem Fragetext reicht dafuer aus.
 *
 * NICHT ALS UNMOTIVIERT LOESCHEN: der konkrete Anlass war das damalige
 * Wortzeichen „I&K", das als `I&amp;K` im Markup stand. Es heisst seit der
 * Umbenennung „Sammelhaus" und traegt kein Ampersand mehr — die Regel bleibt
 * trotzdem richtig, sie hat nur gerade keinen so sichtbaren Zeugen.
 */
function text(markup: string): string {
  return (
    markup
      .replace(/<[^>]*>/g, " ")
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      // `&amp;` zuletzt, sonst wuerde aus `&amp;lt;` faelschlich `<`.
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
  );
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

/*
 * DIE H1 MUSS DEN ABEND BENENNEN (Entwurf 3.2 A Punkt 2). `topic ?? "Dienstabend
 * am …"` fing nur `null` — nicht den LEEREN String. Der Admin-Pfad normalisiert
 * leere Eingaben zu `null`, der IMPORT der Alt-Anwendung tut das nicht: dort
 * stand die Ueberschrift des Zettels leer da.
 */
describe("Zustand A — die Ueberschrift benennt den Abend", () => {
  it("nimmt das Thema, wenn eines gesetzt ist", async () => {
    const { token } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      topic: "Funk-Übung: Sprechgruppen",
    });
    expect(text(await seite(token))).toContain("Funk-Übung: Sprechgruppen");
  });

  it("faellt bei einem Thema aus reinem Leerraum auf `Dienstabend am …` zurueck", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12", topic: "   " });
    const markup = await seite(token);
    expect(text(markup)).toContain("Dienstabend am ");
    expect(markup).not.toMatch(/<h1[^>]*>\s*<\/h1>/);
  });
});

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
    // Der Zettel muss den Schluss in der ORTSZEIT DER FRIST nennen — in der
    // Zeitzone also, in der `computeClosesAt` gerechnet hat. Formatierte die
    // Seite mit `timeZone: "UTC"`, stuende dort ein bis zwei Stunden zu frueh,
    // und der Zettel nennte eine Uhrzeit, zu der noch offen war.
    //
    // Die Uhrzeit steht hier NICHT hart. `computeClosesAt` addiert die Stunden
    // als absolute Millisekunden auf das Ende des Abendtags (lifecycle.ts) — die
    // Wanduhrzeit bleibt ueber eine Zeitumstellung hinweg also gerade NICHT
    // erhalten: derselbe Fixture ergibt am Tag nach der Umstellung 08:00 bzw.
    // 10:00 statt 09:00. Eine hart geschriebene "09:00" macht die Suite zweimal
    // im Jahr rot, ohne dass sich eine Zeile Code geaendert hat. Erwartet wird
    // darum das aus dem geseedeten `closesAt` abgeleitete Wort — genau wie beim
    // manuellen Schluss weiter unten.
    const { token, closesAt } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 2,
      hours: 9,
    });
    expect(text(await seite(token))).toContain(`Sie wurde ${geschlossenAm(closesAt)} geschlossen.`);
  });

  it("nennt bei manuell geschlossener Umfrage den frueheren der beiden Zeitpunkte", async () => {
    // Frist noch Tage entfernt, aber die Gruppenleitung hat von Hand geschlossen:
    // `closesAt` waere hier eine Luege ueber die Zukunft.
    //
    // Der Schluss liegt RELATIV zu jetzt, nicht auf einem festen Kalendertag.
    // Zustand D hat mit `D_FENSTER_MS` eine Haltbarkeit (page.tsx): ein
    // absoluter Fixture-Zeitpunkt waechst mit jeder Wanduhr-Stunde weiter aus
    // dem Fenster heraus, und ab dem Tag, an dem er es verlaesst, antwortet die
    // Seite mit C statt D — der Test schlaegt dann DAUERHAFT fehl, ohne dass
    // sich eine Zeile Code geaendert haette. Auf die ganze Minute gerundet,
    // damit zwischen dem Formatieren hier und dem in der Seite keine Sekunde
    // driftet.
    const { token, survey, closesAt } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      hours: 240,
    });
    const geschlossen = new Date(Math.floor((Date.now() - 3 * 3600_000) / 60_000) * 60_000);
    setSurveyStatus(db, survey.id, "closed", { closedAt: geschlossen });
    /*
     * Beide Kandidaten muessen NACH dem Schliessen in der Zeile stehen, sonst
     * waehlt `schliesszeit` aus einem einelementigen Feld und das `min()` ist
     * gar nicht im Spiel — die Zusicherung unten waere dann aus dem trivialen
     * Grund gruen, dass es keine zweite Zeit zu verwechseln gibt.
     */
    expect(getSurvey(db, survey.id)?.closesAt).toBeInstanceOf(Date);
    const gelesen = text(await seite(token));
    expect(gelesen).toContain(`Sie wurde ${geschlossenAm(geschlossen)} geschlossen.`);
    // Die andere Haelfte von "der FRUEHERE der beiden": die Frist — gut zehn Tage
    // voraus — darf nicht auf dem Zettel stehen. Ohne diese Zusicherung wuerde
    // der Test auch ein `max()` durchlassen, solange irgendein Datum erscheint.
    expect(gelesen).not.toContain(`Sie wurde ${geschlossenAm(closesAt)} geschlossen.`);
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

/**
 * D IST EIN ZUSTAND MIT HALTBARKEIT, KEIN DAUERZUSTAND.
 *
 * D sagt "richtiger Zettel, zu spaet" — eine Aussage ueber DEN Abend, von dem
 * die Person gerade kommt. Ohne zeitliche Grenze wurde daraus die haeufigste
 * Belegung dieser Seite: der QR-Code haengt dauerhaft im Gruppenraum, der Bogen
 * schliesst Donnerstag um 09:00, der naechste Abend wird erst am naechsten
 * Dienstag angelegt — und JEDER Scan von Donnerstag bis Mittwoch beantwortete mit
 * "Die Umfrage zu diesem Abend ist beendet." ueber einen wochenalten Abend. Ohne
 * Knopf, und vor allem ohne den Satz, den der Entwurf genau dafuer in C stellt:
 * der Aushang bleibt gueltig. Wer das liest, wirft den Zettel weg.
 */
describe("Abgrenzung C/D — D nur solange der Schluss frisch ist", () => {
  const QR_ZUSAGE = "Der QR-Code bleibt gültig — probier es am Ende des nächsten Abends noch einmal.";

  it("zeigt C, nicht D, wenn der beendete Abend drei Wochen her ist", async () => {
    const { token, survey } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 21,
      hours: 9,
      topic: "Funk-Übung: Sprechgruppen",
    });
    // Von Hand geschlossen, gleich nach der Frist — der Regelfall im Betrieb.
    setSurveyStatus(db, survey.id, "closed", {
      closedAt: new Date(mitternachtUtc(20).getTime() + 9 * 3600_000),
    });

    const gelesen = text(await seite(token));
    expect(gelesen).toContain("Zurzeit läuft keine Umfrage.");
    expect(gelesen).toContain(QR_ZUSAGE);
    expect(gelesen).not.toContain("Die Umfrage zu diesem Abend ist beendet.");
    // Und schon gar nicht das Thema eines Abends von vor drei Wochen.
    expect(gelesen).not.toContain("Funk-Übung: Sprechgruppen");
  });

  /*
   * Derselbe Fall, aber der Bogen steht noch auf `active`: niemand hat die Seite
   * seit der Frist aufgerufen, also hat der Lazy-Auto-Close nie gegriffen. Er
   * greift jetzt — und trotzdem ist "dieser Abend" die falsche Auskunft.
   */
  it("zeigt C auch dann, wenn der Auto-Close eine drei Wochen alte Frist nachholt", async () => {
    const { token, survey } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 21,
      hours: 9,
    });

    const gelesen = text(await seite(token));
    expect(gelesen).toContain("Zurzeit läuft keine Umfrage.");
    expect(gelesen).not.toContain("Die Umfrage zu diesem Abend ist beendet.");
    // Geschlossen wird trotzdem: das ist eine Frage der Daten, nicht der Anzeige.
    expect(getSurvey(db, survey.id)!.status).toBe("closed");
  });

  it("haelt an D fest, solange der Schluss frisch ist — der Abend von vorgestern", async () => {
    const { token } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 2,
      hours: 9,
    });
    expect(text(await seite(token))).toContain("Die Umfrage zu diesem Abend ist beendet.");
  });
});

/**
 * DIE FEHLERPFADE OHNE JAVASCRIPT (Entwurf 3.8).
 *
 * Ohne JavaScript ist die Abgabe ein nativer POST, und der Rueckgabewert der
 * Action erreicht niemanden: die Seite rendert unveraendert neu. Deshalb leitet
 * `submitResponseAction` dort auf `?fehler=…` um — und diese Seite muss den
 * Parameter LESEN, sonst ist die Umleitung nur ein anderer Weg zu derselben
 * Stille.
 */
describe("Fehlerpfade ohne JavaScript (`?fehler=`)", () => {
  it("nennt beim Ratelimit den Satz aus 3.8 samt Zurueck-Pfeil und laesst den Bogen stehen", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    const markup = await seite(token, "ratelimit");
    const gelesen = text(markup);
    expect(gelesen).toContain(
      "Gerade sind viele Rückmeldungen gleichzeitig unterwegs. Bitte einmal auf Absenden tippen.",
    );
    expect(gelesen).toContain("Mit dem Zurück-Pfeil des Browsers stehen deine Eingaben noch da.");
    expect(markup).toContain('role="alert"');
    // Der Bogen ist weiter da — es soll ja noch einmal gesendet werden.
    expect(enthaelt(await baum(token, "ratelimit"), Zettel)).toBe(true);
  });

  it("nennt bei fehlenden Noten den Satz aus 3.8", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    expect(text(await seite(token, "unvollstaendig"))).toContain("Da fehlten noch Noten.");
  });

  it("zeigt ohne Parameter kein Panel — der Regelfall bleibt der nackte Bogen", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    expect(await seite(token)).not.toContain("data-fehler");
  });

  /*
   * Ein Query-Parameter kann doppelt vorkommen; Next liefert dann ein Array. Ohne
   * Normalisierung faellt jeder Vergleich still durch — und der Fehlerpfad waere
   * wieder unsichtbar.
   */
  it("liest den Parameter auch, wenn er doppelt in der URL steht", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    expect(text(await seite(token, ["ratelimit", "ratelimit"]))).toContain(
      "Gerade sind viele Rückmeldungen gleichzeitig unterwegs.",
    );
  });

  /*
   * Der Wert kommt aus der URL. Ein Zugriff `FEHLER_TEXT[wert]` ohne
   * `Object.hasOwn` liefert bei `?fehler=constructor` eine FUNKTION aus dem
   * Prototyp — die landete als React-Kind im Baum und riss die einzige
   * oeffentliche Seite dieses Moduls mit.
   */
  it("laesst sich mit einem Prototyp-Namen nicht aus der Bahn werfen", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    for (const wert of ["constructor", "toString", "__proto__", "gibtsnicht"]) {
      const markup = await seite(token, wert);
      expect(markup).not.toContain("data-fehler");
      expect(markup).toContain("<form");
    }
  });

  it("traegt kein Rot in das Panel", async () => {
    const { token } = seedUmfrage({ slug: "bereitschaft", secret: "abc12" });
    expect(await seite(token, "ratelimit")).not.toMatch(/#c8000f/i);
  });

  /*
   * DER FALL, IN DEM SICH BEIDE FIXES BEGEGNEN: Frist vor Wochen abgelaufen, aber
   * niemand hat die Seite seither aufgerufen, also stand der Bogen noch auf
   * `active`. Jetzt sendet jemand ohne JavaScript ab — die Action schliesst nach,
   * weist ab und leitet auf `?fehler=geschlossen` um. Das Frische-Fenster wuerde
   * hier C liefern ("zurzeit laeuft keine Umfrage"), und die Person hat gerade
   * acht Noten abgeschickt: sie erfaehrt kein Wort darueber, was daraus wurde.
   * Deshalb hebelt der Parameter das Fenster aus — wer eben abgesendet hat, hat
   * mit GENAU diesem Bogen interagiert.
   */
  it("beantwortet `?fehler=geschlossen` mit D und dem ehrlichen Zusatz — auch bei alter Frist", async () => {
    const { token, survey } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 21,
      hours: 9,
      topic: "Funk-Übung: Sprechgruppen",
    });
    setSurveyStatus(db, survey.id, "closed", {
      closedAt: new Date(mitternachtUtc(20).getTime() + 9 * 3600_000),
    });

    const gelesen = text(await seite(token, "geschlossen"));
    expect(gelesen).toContain("Die Umfrage zu diesem Abend ist beendet.");
    expect(gelesen).toContain("Deine Rückmeldung konnte nicht mehr gespeichert werden.");
    // Der richtige Zettel wird benannt — der Abend, den die Person bewertet hat.
    expect(gelesen).toContain("Funk-Übung: Sprechgruppen");
  });

  it("nennt den Zusatz auch beim frisch geschlossenen Bogen, und sonst nie", async () => {
    const { token } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      tageZurueck: 2,
      hours: 9,
    });
    expect(text(await seite(token, "geschlossen"))).toContain(
      "Deine Rückmeldung konnte nicht mehr gespeichert werden.",
    );
    // Ohne Parameter ist D der Seitenaufruf-Zustand: da wurde nichts abgesendet.
    expect(text(await seite(token))).not.toContain(
      "Deine Rückmeldung konnte nicht mehr gespeichert werden.",
    );
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

  /*
   * DER WEITERGABE-ABSCHNITT IST UNBEDINGT (Entwurf 3.2 B). Er hing an einer
   * aktiven Umfrage — und genau dieser Weg loest das Problem des geteilten
   * Handys. Der Zustand ist erreichbar: die Frist kann zwischen dem Absenden und
   * dem Rendern dieser Seite ablaufen (Lazy-Auto-Close aus `lifecycle.ts`), und
   * dann stand die naechste Person vor einer Danke-Seite ohne jeden Ausweg.
   */
  it("stellt den Weitergabe-Abschnitt auch OHNE aktive Umfrage hin", async () => {
    const { token } = seedUmfrage({
      slug: "bereitschaft",
      secret: "abc12",
      aktivieren: false,
    });
    const markup = await danke(token);
    const gelesen = text(markup);
    expect(gelesen).toContain("Handy wandert weiter?");
    expect(gelesen).toContain("Leeren Bogen öffnen");
    /*
     * Ohne aktive Umfrage gibt es kein Cookie freizugeben (`page.tsx` liest es
     * nur im aktiven Zweig) — der Weg zum leeren Bogen ist dann eine gewoehnliche
     * Navigation. Kein Knopf, der eine Action ohne Umfrage-Id ruft.
     */
    expect(markup).toContain(`href="/f/${token}"`);
    expect(markup).not.toMatch(/<button[^>]*>Leeren Bogen öffnen<\/button>/);
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
      expect(text(markup)).toContain("Sammelhaus");
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

  it("nennt in keiner der Zustandsdateien Suite-Rot", async () => {
    for (const datei of ["./page.tsx", "./thanks/page.tsx", "./Zustaende.tsx"]) {
      expect(quelle(datei).replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#c8000f/i);
    }
  });
});
