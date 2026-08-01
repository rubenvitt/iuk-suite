// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToReadableStream } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * `/shares/<id>/bearbeiten` (Spec §7.3, §10.1; Plan T42).
 *
 * ZWEI EBENEN IN EINER DATEI, weil die Zusage ueber BEIDE laeuft:
 *
 *  - Die SERVER-Haelfte (`renderToReadableStream` bis `allReady`, echte
 *    migrierte Datenbank) besitzt die Vorbelegung: „das Ablauffeld traegt den
 *    Wert der ZEILE". Ein Markup-Test ist hier die ehrliche Ebene — die Zahl
 *    entsteht aus `expires_at` und einer Uhr, also serverseitig.
 *  - Die DOM-Haelfte (`test-dom`) besitzt, was das Formular ABSCHICKT. Und das
 *    ist die eigentliche Zusage: `bearbeitenAction` aendert nur, was die
 *    `FormData` MITBRINGT (`(verwaltung)/actions.ts`), eine Vorbelegung allein
 *    verhindert das Verkuerzen also NICHT. Im Gegenteil — die Datenbank fuehrt
 *    `expires_at` ABSOLUT, die Action schreibt `jetzt + n*86400s`: wer den
 *    korrekt vorbelegten Wert nur mitschickt, verschiebt den Ablauf trotzdem.
 *    Deshalb wird hier die `FormData` geprueft, nicht der angezeigte Wert.
 *
 * Die `FormData` entsteht ueber `new FormData(<form>)` — die Eintragsliste des
 * Formulars, genau das, was ein Absenden uebertruege. Ein Feld ohne `name`
 * faellt dabei heraus, und GENAU DAS ist der Mechanismus, um den es geht.
 */

// ---------------------------------------------------------------------------
// Mocks — vor jedem Import des Codes unter Test
// ---------------------------------------------------------------------------

const { bearbeitenMock, useActionStateMock, notFoundMock } = vi.hoisted(() => ({
  bearbeitenMock: vi.fn(),
  useActionStateMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("notFound()");
  }),
}));

/* `bearbeitenAction` liegt hinter `"use server"` und zieht Datenbank,
   `next/cache` und bcrypt nach. Hier interessiert nur, DASS das Formular sie an
   `useActionState` reicht — der Rumpf gehoert T37 und `actions.test.ts`. */
vi.mock("../../../actions", () => ({ bearbeitenAction: bearbeitenMock }));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

/**
 * `useActionState` wird ersetzt, damit der Zustand des Formulars im Test
 * STELLBAR ist — anders liesse sich „Feldfehler kommt am Feld an" nur ueber
 * einen echten Action-Umlauf herstellen, und der gehoert T37. Dieselbe Bauform
 * wie in `_ui/UploadInsel.test.tsx`.
 */
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

import { click, fill, mount, query, exists, rerender, unmount } from "@/app/m/qr/_lib/test-dom";
import type { ShareFormZustand } from "../../../actions";
import ShareBearbeitenSeite from "./page";
import { BearbeitenFormular, type BearbeitenFormularProps } from "./BearbeitenFormular";

const DIR = "./.data/files-bearbeiten-test";

/**
 * Die Uhr steht, und zwar NUR die Uhr (`toFake: ["Date"]`): die Restlaufzeit
 * entsteht aus `expires_at` minus `jetzt`, und mit einer laufenden Uhr waere
 * die erwartete Tageszahl vom Zeitpunkt des Testlaufs abhaengig — die Zusage
 * waere dann mal gruen und mal rot, ohne dass sich Kode aendert. Echte Timer
 * bleiben stehen, weil `renderToReadableStream` sie braucht.
 */
/*
 * ABSOLUTER ZEITPUNKT (`…Z`), NICHT `new Date(2026, 6, 25, 12, 0, 0)`: der
 * lokale Konstruktor liest die Zone des PROZESSES, `ablaufText` formatiert seit
 * `_lib/zeit.ts` fest auf `Europe/Berlin`. 10:00 UTC sind im Juli 12:00
 * Berliner Wanduhr — und das gilt auch im Container, der auf UTC laeuft.
 */
const JETZT = new Date("2026-07-25T10:00:00Z"); // 12:00 Berliner Wanduhr

/**
 * `mode: "timestamp"` fuehrt SEKUNDEN (`_db/schema.ts`) — geschrieben wird
 * deshalb ueber Drizzle mit `Date`-Objekten, damit nirgends ein Faktor 1000 von
 * Hand entsteht.
 */
const MILLISEKUNDEN_PRO_TAG = 24 * 60 * 60 * 1000;

/**
 * Genau sechs Tage — die Vorbelegung ist hier 6.
 *
 * DIESE VORRICHTUNG PRUEFT DIE RUNDUNG NICHT, und das ist ausdruecklich
 * festgehalten, weil sie danach aussieht: der Rest ist exakt 518400000 ms, und
 * `ceil`, `floor` und `round` liefern darauf alle 6. Wer die Rundungsregel aus
 * `page.tsx` pruefen will, braucht einen Rest, der NICHT auf der Tagesgrenze
 * liegt — dafuer gibt es `IN_FUENF_KOMMA_ZWEI_TAGEN`.
 */
const IN_SECHS_TAGEN = new Date(JETZT.getTime() + 6 * MILLISEKUNDEN_PRO_TAG);

/**
 * 5,2 Tage Restlaufzeit — die Vorrichtung, die die Rundungsregel BESITZT.
 *
 * `Math.ceil` liefert 6, `Math.floor` 5 und `Math.round` ebenfalls 5: die
 * gewaehlte Zahl 5,2 (und nicht etwa 5,5, wo `round` mit `ceil` gleichzoege)
 * unterscheidet alle drei Regeln in EINEM Fall.
 *
 * 5,2 * 86400 = 449280 — eine ganze SEKUNDE. Das ist keine Zierde: `expires_at`
 * fuehrt Sekunden (`mode: "timestamp"`), ein Bruchteil ginge beim Schreiben
 * verloren und die erwartete Zahl haenge dann an der Rundung der Datenbank
 * statt an der des Kodes.
 */
const IN_FUENF_KOMMA_ZWEI_TAGEN = new Date(JETZT.getTime() + 5.2 * MILLISEKUNDEN_PRO_TAG);

const VOR_EINEM_TAG = new Date(JETZT.getTime() - MILLISEKUNDEN_PRO_TAG);

/** Ein bcrypt-Hash in Form und Laenge — er darf im Markup NIE auftauchen. */
const HASH = "$2b$12$abcdefghijklmnopqrstuuOaBcDeFgHiJkLmNoPqRsTuVwXyZ012345";

/**
 * Die Werte, die `(verwaltung)/actions.ts` als „Schalter an" liest
 * (`KAESTCHEN_AN`). Sie sind dort modulprivat und stehen hier als Erwartung:
 * ein `<input type="checkbox">` ohne `value` sendet `"on"`, und ein Wert
 * ausserhalb dieser Liste machte „Passwort entfernen" STILL wirkungslos.
 */
const KAESTCHEN_AN = ["1", "true", "on"];

const START: ShareFormZustand = { ok: false, feldFehler: {}, werte: {} };

let zustand: ShareFormZustand = START;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(JETZT);

  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  vi.stubEnv("DATA_DIR", DIR);
  // Die Pflichtzahlen aus `_lib/grenzen.ts` (§9.3) — ohne sie wirft `grenzen()`.
  vi.stubEnv("FILES_MAX_DATEI_BYTES", String(100 * 1024 * 1024));
  vi.stubEnv("FILES_AV_MAX_BYTES", String(100 * 1024 * 1024));
  vi.stubEnv("FILES_MAX_ABLAUF_TAGE", "30");

  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  zustand = START;
  bearbeitenMock.mockReset();
  notFoundMock.mockClear();
  useActionStateMock.mockReset();
  useActionStateMock.mockImplementation(() => [zustand, () => {}, false]);
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  rmSync(DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

async function legeShare(vorgabe: {
  id: string;
  titel?: string;
  beschreibung?: string | null;
  ablaufAt?: Date;
  maxDownloads?: number | null;
  passwordHash?: string | null;
}) {
  const { getDb } = await import("../../../../_db/client");
  const { shares } = await import("../../../../_db/schema");
  getDb()
    .insert(shares)
    .values({
      id: vorgabe.id,
      title: vorgabe.titel ?? "Übung Nord",
      description: vorgabe.beschreibung ?? null,
      type: "folder",
      expiresAt: vorgabe.ablaufAt ?? IN_SECHS_TAGEN,
      maxDownloads: vorgabe.maxDownloads ?? null,
      downloadCount: 0,
      passwordHash: vorgabe.passwordHash ?? null,
      totalSize: 0,
      createdAt: JETZT,
      createdBy: "sub-1",
    })
    .run();
}

async function markup(id: string): Promise<string> {
  const baum = (await ShareBearbeitenSeite({ params: Promise.resolve({ id }) })) as ReactElement;
  const strom = await renderToReadableStream(baum);
  await strom.allReady;
  return await new Response(strom).text();
}

/**
 * Die Vorbelegung, wie sie die Seite fuer eine ungeschuetzte Freigabe bildet.
 *
 * AUSDRUECKLICH als `BearbeitenFormularProps` getypt und nicht abgeleitet: aus
 * `restTage: 6` folgerte TypeScript sonst `number`, und der abgelaufene Fall
 * (`restTage: null`) liesse sich gar nicht mehr stellen — der Test waere dann
 * nicht falsch, sondern nicht schreibbar.
 */
const STANDARD: BearbeitenFormularProps = {
  shareId: "sh1234abcd",
  titel: "Übung Nord",
  beschreibung: "Bilder vom Samstag",
  maxDownloadsText: "",
  hatPasswort: false,
  restTage: 6,
  /* Die Form, die `page.tsx` tatsaechlich uebergibt (`zeitpunktBerlin` aus
     `_lib/zeit.ts`) — eine erfundene Schreibweise im Pruefstand liesse eine
     Formatumstellung hier unbemerkt durchgehen. */
  ablaufText: "31.07.2026, 12:00",
  abgelaufen: false,
  maxAblaufTage: 30,
};

const formular = (ueberschrieben: Partial<BearbeitenFormularProps> = {}) => (
  <BearbeitenFormular {...STANDARD} {...ueberschrieben} />
);

/** Die Eintragsliste des Formulars — genau das, was ein Absenden uebertruege. */
function daten(): FormData {
  return new FormData(query<HTMLFormElement>("form"));
}

const ABLAUF = '[data-testid="files-bearbeiten-ablauf"]';
const ENTFERNEN = '[data-testid="files-bearbeiten-passwort-entfernen"]';

// ---------------------------------------------------------------------------
// Server-Haelfte
// ---------------------------------------------------------------------------

describe("die Seite laedt die Zeile", () => {
  it("ruft `notFound()` bei einer unbekannten Kennung", async () => {
    await expect(markup("gibtesnich")).rejects.toThrow("notFound()");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("belegt das Formular mit den TATSAECHLICHEN Werten der Zeile vor", async () => {
    await legeShare({
      id: "sh1234abcd",
      titel: "Übung Nord",
      beschreibung: "Bilder vom Samstag",
      maxDownloads: 5,
    });

    const html = await markup("sh1234abcd");
    expect(html).toContain("Übung Nord");
    expect(html).toContain("Bilder vom Samstag");
    expect(html).toContain('value="5"');
    // Der HASH ueberquert die Grenze nicht — `hatPasswort` entsteht in SQLite.
    expect(html).not.toContain(HASH);
    expect(html).not.toContain("$2b$");
  });

  it("belegt den Ablauf mit der RESTLAUFZEIT der Zeile vor, nicht mit `1`", async () => {
    await legeShare({ id: "sh1234abcd", ablaufAt: IN_SECHS_TAGEN });

    const html = await markup("sh1234abcd");
    // Der Alt-Defekt in einer Zeile: `useState(1)` — wer nur den Titel
    // korrigierte, verkuerzte den Share auf 24 Stunden (§7.3, Punkt 1).
    expect(html).toMatch(/data-testid="files-bearbeiten-ablauf"[^>]*value="6"/);
    expect(html).not.toMatch(/data-testid="files-bearbeiten-ablauf"[^>]*value="1"/);

    /*
     * UND DER ABLAUF ALS TEXT, in Berliner Wanduhrzeit. Die Restlaufzeit oben
     * ist eine DIFFERENZ und damit zonenfrei — sie kann den Defekt dieser Naht
     * strukturell nicht sehen. Der Text kann es: bis 2026-08-01 stand hier ein
     * Formatierer ohne `timeZone`, der die Zone des Prozesses las (im Container
     * UTC). `IN_SECHS_TAGEN` ist 2026-07-31T10:00:00Z, also 12:00 Berliner
     * Wanduhr — ohne feste Zone stuende dort im Container „10:00".
     */
    expect(html).toContain("31.07.2026, 12:00");
  });

  it("RUNDET eine angebrochene Restlaufzeit AUF — Abrunden verkuerzte die Freigabe", async () => {
    await legeShare({ id: "sh1234abcd", ablaufAt: IN_FUENF_KOMMA_ZWEI_TAGEN });

    const html = await markup("sh1234abcd");
    // 5,2 Tage: `ceil` → 6, `floor` → 5, `round` → 5. Die 6 ist die einzige
    // Zahl, die den Ablauf beim Wiedereinreichen nicht VERKUERZT — genau das
    // Verkuerzen ist der Alt-Defekt, den dieser Task nicht mitportiert
    // (§7.3, Punkt 1). Ohne diesen Fall ist die Wahl `Math.ceil` in `page.tsx`
    // durch keinen Test gedeckt.
    expect(html).toMatch(/data-testid="files-bearbeiten-ablauf"[^>]*value="6"/);
    expect(html).not.toMatch(/data-testid="files-bearbeiten-ablauf"[^>]*value="5"/);
  });

  it("laesst das Ablauffeld bei einer abgelaufenen Freigabe LEER", async () => {
    await legeShare({ id: "sh1234abcd", ablaufAt: VOR_EINEM_TAG });

    const html = await markup("sh1234abcd");
    // Eine geratene `1` waere hier dieselbe Klasse Fehler wie oben; „0 Tage"
    // lehnt die Action ausdruecklich ab. Also kein Wert — und ein Satz dazu.
    expect(html).toMatch(/data-testid="files-bearbeiten-ablauf"[^>]*value=""/);
    expect(html).toContain("Abgelaufen am");
  });

  it("fuehrt zurueck — die Seite ist keine Sackgasse", async () => {
    await legeShare({ id: "sh1234abcd" });
    expect(await markup("sh1234abcd")).toContain('href="/"');
  });
});

// ---------------------------------------------------------------------------
// DOM-Haelfte: was das Formular ABSCHICKT
// ---------------------------------------------------------------------------

describe("das Formular ist bedienbar", () => {
  it("reicht `bearbeitenAction` an `useActionState` durch", async () => {
    await mount(formular());
    expect(useActionStateMock.mock.calls[0][0]).toBe(bearbeitenMock);
    expect(useActionStateMock.mock.calls[0][1]).toEqual(START);
  });

  it("schickt die Kennung mit — ohne sie findet die Action die Zeile nicht", async () => {
    await mount(formular());
    expect(daten().get("id")).toBe("sh1234abcd");
  });

  it("laesst Titel und Beschreibung aendern", async () => {
    await mount(formular());
    await fill('input[name="title"]', "Übung Süd");
    await fill('textarea[name="description"]', "Neuer Text");

    const f = daten();
    expect(f.get("title")).toBe("Übung Süd");
    expect(f.get("description")).toBe("Neuer Text");
  });
});

describe("der Ablauf wird nur mitgeschickt, wenn er veraendert wurde", () => {
  it("sendet `expiryDays` NICHT, wenn nur der Titel korrigiert wird", async () => {
    await mount(formular({ restTage: 6 }));
    await fill('input[name="title"]', "Übung Süd");

    const f = daten();
    expect(f.get("title")).toBe("Übung Süd");
    // DIE Zusage dieses Tasks. `bearbeitenAction` liest ein FEHLENDES wie ein
    // leeres `expiryDays` als „nicht angefasst" — kaeme die 6 mit, schriebe sie
    // `jetzt + 6 Tage` und verschoebe den Ablauf bei JEDEM Speichern.
    expect(f.has("expiryDays")).toBe(false);
    // Angezeigt wird die Restlaufzeit trotzdem.
    expect(query<HTMLInputElement>(ABLAUF).value).toBe("6");
  });

  it("sendet `expiryDays`, sobald der Wert ein anderer ist", async () => {
    await mount(formular({ restTage: 6 }));
    await fill(ABLAUF, "10");
    expect(daten().get("expiryDays")).toBe("10");
  });

  it("sendet ihn wieder NICHT, wenn der Ursprungswert zurueckgestellt wird", async () => {
    await mount(formular({ restTage: 6 }));
    await fill(ABLAUF, "10");
    await fill(ABLAUF, "6");
    // Verglichen werden WERTE, nicht „wurde angefasst": 6 → 10 → 6 ist
    // unveraendert, und ein Merker „beruehrt" verschoebe den Ablauf trotzdem.
    expect(daten().has("expiryDays")).toBe(false);
  });

  it("sendet ihn bei einer abgelaufenen Freigabe erst, wenn eine Zahl dasteht", async () => {
    await mount(formular({ restTage: null, abgelaufen: true }));
    expect(daten().has("expiryDays")).toBe(false);

    await fill(ABLAUF, "3");
    expect(daten().get("expiryDays")).toBe("3");
  });
});

describe("das Download-Limit", () => {
  it('wird IMMER mitgeschickt — sonst waere „unbegrenzt“ unerreichbar', async () => {
    await mount(formular({ maxDownloadsText: "5" }));
    // Anders als beim Ablauf: `maxDownloads` liest die Action ueber
    // `formData.has(...)`, und ein fehlendes Feld heisst dort „nicht
    // angefasst". Ohne `name` liesse sich ein gesetztes Limit nie mehr loeschen.
    expect(daten().get("maxDownloads")).toBe("5");

    await fill('input[name="maxDownloads"]', "");
    expect(daten().get("maxDownloads")).toBe("");
  });
});

describe("Passwort setzen und entfernen", () => {
  it("belegt das Passwortfeld NIE vor", async () => {
    await mount(formular({ hatPasswort: true }));
    expect(query<HTMLInputElement>('input[name="password"]').value).toBe("");
  });

  it('bietet „Passwort entfernen“ nur bei einer geschuetzten Freigabe an', async () => {
    await mount(formular({ hatPasswort: false }));
    expect(exists(ENTFERNEN)).toBe(false);
    await unmount();

    await mount(formular({ hatPasswort: true }));
    expect(exists(ENTFERNEN)).toBe(true);
  });

  it('schickt „Passwort entfernen“ mit einem Wert, den die Action als gesetzt liest', async () => {
    await mount(formular({ hatPasswort: true }));
    expect(daten().has("passwortEntfernen")).toBe(false);

    await click(ENTFERNEN);
    const wert = daten().get("passwortEntfernen");
    // Ein Wert ausserhalb von `KAESTCHEN_AN` waere STILL wirkungslos: die
    // Action liest `istGesetzt` und liesse den Hash stehen.
    expect(typeof wert).toBe("string");
    expect(KAESTCHEN_AN).toContain(String(wert).toLowerCase());
  });

  it("nimmt ein neues Passwort entgegen", async () => {
    await mount(formular({ hatPasswort: true }));
    await fill('input[name="password"]', "Geheim-2026");
    expect(daten().get("password")).toBe("Geheim-2026");
  });

  /**
   * GEPRUEFT WIRD DER UEBERGANG, NICHT EIN FRISCHER MOUNT — und das ist der
   * ganze Punkt dieser beiden Faelle. Ein zweites `mount(formular())` mit
   * `zustand = { ok: true }` startete mit `useState("")` und `useState(false)`:
   * die Zusicherungen unten waeren dann OHNE JEDE AENDERUNG am Formular gruen
   * und pruefen nichts. Deshalb `rerender` — derselbe Baum, derselbe
   * Komponenten-Zustand, nur ein neues Action-Ergebnis.
   *
   * Der Zustand muss ein NEUES Objekt sein: das Formular erkennt die
   * abgeschlossene Runde an der Objektidentitaet. Der Mock liefert danach
   * stabil dasselbe Objekt — lieferte er bei jedem Aufruf ein frisches, liefe
   * der Abgleich endlos.
   */
  it("leert das Passwortfeld nach einem erfolgreichen Speichern", async () => {
    await mount(formular({ hatPasswort: true }));
    await fill('input[name="password"]', "Geheim-2026");
    expect(daten().get("password")).toBe("Geheim-2026");

    zustand = { ok: true };
    await rerender(formular({ hatPasswort: true }));

    // Sonst zeigt das Feld nach dem Speichern weiter Punkte, und das naechste
    // Speichern schickt dasselbe Passwort ein zweites Mal mit — zusammen mit
    // „Schutz entfernen" ergibt das die Meldung „nicht beides", obwohl in
    // dieser Runde niemand etwas eingetippt hat.
    expect(query<HTMLInputElement>('input[name="password"]').value).toBe("");
    expect(daten().get("password")).toBe("");
  });

  it('nimmt „Passwortschutz entfernen“ nach einem erfolgreichen Speichern zurueck', async () => {
    await mount(formular({ hatPasswort: true }));
    await click(ENTFERNEN);
    expect(daten().has("passwortEntfernen")).toBe(true);

    zustand = { ok: true };
    await rerender(formular({ hatPasswort: true }));

    // Ein stehengebliebenes Haekchen entfernte beim naechsten Speichern — etwa
    // einer Titelkorrektur — den Schutz ein zweites Mal, ungefragt.
    expect(daten().has("passwortEntfernen")).toBe(false);
    // antd 6 reicht `data-testid` an das `<input>` selbst durch — deshalb kein
    // Nachfahren-Selektor, sondern dasselbe Element wie beim `click`.
    expect(query<HTMLInputElement>(ENTFERNEN).checked).toBe(false);
  });
});

describe("Feldfehler kommen AM Feld an", () => {
  it("verknuepft jeden Feldfehler mit seinem Eingabefeld", async () => {
    zustand = {
      ok: false,
      feldFehler: {
        title: "Bitte einen Titel angeben.",
        expiryDays: "Laufzeit in ganzen Tagen, 1 bis 30.",
        maxDownloads: "Download-Limit als ganze Zahl ab 1 — leer lassen heisst unbegrenzt.",
        password: "Das Passwort braucht mindestens 8 Zeichen.",
      },
      werte: {},
    };
    await mount(formular({ hatPasswort: true }));

    for (const [selektor, text] of [
      ['input[name="title"]', "Bitte einen Titel angeben."],
      [ABLAUF, "Laufzeit in ganzen Tagen, 1 bis 30."],
      ['input[name="maxDownloads"]', "leer lassen heisst unbegrenzt"],
      ['input[name="password"]', "mindestens 8 Zeichen"],
    ] as const) {
      const feld = query<HTMLInputElement>(selektor);
      expect(feld.getAttribute("aria-invalid")).toBe("true");
      const beschrieben = feld.getAttribute("aria-describedby");
      expect(beschrieben).toBeTruthy();
      expect(query(`#${beschrieben}`).textContent).toContain(text);
    }
  });

  it("meldet eine verschwundene Freigabe als Ganzes, nicht an einem Feld", async () => {
    zustand = {
      ok: false,
      feldFehler: { id: "Diese Freigabe gibt es nicht (mehr)." },
      werte: {},
    };
    await mount(formular());
    expect(query('[data-testid="files-bearbeiten-fehler"]').textContent).toContain(
      "Diese Freigabe gibt es nicht (mehr).",
    );
  });
});
