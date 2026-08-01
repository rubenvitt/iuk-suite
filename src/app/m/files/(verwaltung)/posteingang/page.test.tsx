// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import type { PosteingangTabelleProps } from "../../_ui/PosteingangTabelle";

/**
 * DIE POSTEINGANG-SEITE `(verwaltung)/posteingang/page.tsx` (Spec §8.6, §10.1;
 * Plan T43).
 *
 * WARUM ES DIESE DATEI GIBT — die Seite traegt die ZWEI Umrechnungen, die
 * keine andere Ebene besitzen kann:
 *
 *  - DIE EINHEIT DER ZEIT. `empfangen_at` ist eine Unix-SEKUNDE
 *    (`mode: "timestamp"`, `_db/schema.ts:193`), `Date.getTime()` liefert
 *    MILLISEKUNDEN. `PosteingangTabelle.test.tsx` kann das strukturell nicht
 *    sehen: sie liefert `empfangenSekunden` selbst als Prop und misst damit nur
 *    sich selbst. Ein Faktor-1000-Fehler waere im Betrieb STILL — der Filter
 *    „24 Stunden" zeigte dann die Abgaben der letzten 86,4 SEKUNDEN, ohne
 *    Fehler, ohne Logzeile, mit plausibel aussehender Datenlage. Deshalb steht
 *    hier BEIDES als Literal: der Wert in der Spalte und der erwartete Wert in
 *    der Prop.
 *  - DER WERTEBEREICH DES AV-STATUS. `alsAvStatus` macht aus einem Fremdwert
 *    `error`, NICHT „unbekannt, also freigegeben" (§6.2). Gemessen wird an
 *    `avStatus` selbst und nicht an `herunterladbar`: ohne den Riegel liefe
 *    `istFreigegeben("berichte")` ebenfalls auf `false` hinaus, und die
 *    Download-Sperre allein bliebe gruen.
 *
 * GEMESSEN WIRD AN DEN PROPS DES AUFGELOESTEN BAUMS (`(await Seite()).props`),
 * nicht am Markup: die Sekundenzahl steht in KEINEM sichtbaren Text — die
 * Tabelle zeigt das formatierte Datum, die Zahl ist der Anker des
 * Zeitraumfilters. Ein Markup-Scan koennte die Einheit deshalb gar nicht sehen.
 * Der Renderlauf darunter ist die zweite, andere Aussage: der Baum uebersteht
 * das Rendern (die antd-Fallen liefern HTTP 500, das `pnpm build` nicht sieht).
 *
 * GEGEN EINE ECHTE, MIGRIERTE DATENBANK, mit eigenem DATA_DIR: `actions.test.ts`
 * benutzt `./.data/files-posteingang-actions-test`, und zwei Dateien auf
 * demselben Pfad `rmSync`en und migrieren dieselbe SQLite-Datei PARALLEL
 * (`vitest.config.ts` dokumentiert genau diesen Fehlschlag).
 */

// ---------------------------------------------------------------------------
// Mocks — vor jedem Import des Codes unter Test
// ---------------------------------------------------------------------------

const { useActionStateMock } = vi.hoisted(() => ({ useActionStateMock: vi.fn() }));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

/*
 * Die Insel importiert die Server Action als WERT. Ohne diesen Mock zoegen
 * `next/cache` und `@/core/auth` in den Renderlauf — beide haben mit der Frage
 * dieser Datei nichts zu tun. `./actions` loest auf dieselbe absolute Datei auf
 * wie das `../(verwaltung)/posteingang/actions` der Insel.
 */
vi.mock("./actions", () => ({ inboxLoeschenAction: vi.fn() }));

import FilesPosteingangSeite from "./page";

// ---------------------------------------------------------------------------
// Vorrichtung
// ---------------------------------------------------------------------------

const DIR = "./.data/files-posteingang-page-test";

/**
 * DIE ZAHL IN DER SPALTE, als Literal. 1.784.980.800 ist der 25.07.2026,
 * 12:00 Uhr UTC — als Unix-SEKUNDE. Millisekunden derselben Zeit waeren
 * 1.784.980.800.000, also drei Groeszenordnungen daneben.
 */
const EMPFANGEN_SEKUNDEN = 1_784_980_800;
/** Einen Tag frueher — nur fuer die Reihenfolge. */
const AELTER_SEKUNDEN = EMPFANGEN_SEKUNDEN - 86_400;

/**
 * Die Obergrenze, an der eine Sekunde von einer Millisekunde zu unterscheiden
 * ist: 2·10^10 Sekunden waere das Jahr 2603, 2·10^10 Millisekunden das Jahr
 * 1970. Jede heutige Millisekundenzahl (~1,78·10^12) liegt darueber.
 */
const OBERGRENZE_SEKUNDEN = 20_000_000_000;

/** Zehn Zeichen aus dem nanoid-Alphabet — kuerzere IDs koennen kein Pfad werden. */
/**
 * Eine Adresse aus dem Dokumentationsbereich (RFC 5737) — sie kann keinem
 * echten Anschluss gehoeren, ist aber eine Zeichenfolge, die im Markup
 * AUFTAUCHEN koennte, wenn die Spalte je mitkaeme.
 */
const CLIENT_IP = "203.0.113.77";

const ID_A = "inbox00001";
const ID_B = "inbox00002";
const LINK_ID = "linkAAAAAA";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  vi.stubEnv("DATA_DIR", DIR);
  /*
   * Die drei Pflichtzahlen aus §9.3. `grenzen()` wirft sonst schon beim
   * Modulimport, und der Fehlschlag saehe wie ein Defekt der Seite aus.
   */
  vi.stubEnv("FILES_MAX_DATEI_BYTES", "12582912");
  vi.stubEnv("FILES_AV_MAX_BYTES", "12582912");
  vi.stubEnv("FILES_MAX_ABLAUF_TAGE", "7");

  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  useActionStateMock.mockReset();
  useActionStateMock.mockImplementation((_action: unknown, start: unknown) => [
    start,
    vi.fn(),
    false,
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

/**
 * ROH ueber better-sqlite3 geschrieben, nicht ueber Drizzle — und das ist der
 * Kern: nur so steht die Zahl, die in der Spalte LIEGT, als Literal im Test.
 * Ueber Drizzle mit einem `Date` liefe die Umrechnung, die hier geprueft wird,
 * ein zweites Mal und im Test selbst.
 *
 * `ignore_check_constraints` ist fuer den Fremdwert noetig: der Wertebereich
 * steht als `CONSTRAINT inbox_files_av_status_check` in der Migration (§4.3).
 * Genau diesen Fall — eine Spalte, die trotz Constraint etwas Sechstes traegt
 * (Restore, Fremdimport, manuelles UPDATE) — faengt `alsAvStatus` ab.
 */
function legeZeile(vorgabe: {
  id: string;
  empfangenSekunden: number;
  avStatus: string;
  tokenId?: string | null;
  dateiname?: string;
  clientIp?: string | null;
}): void {
  const sqlite = new Database(`${DIR}/files.db`);
  sqlite.pragma("ignore_check_constraints = ON");
  sqlite
    .prepare(
      `INSERT INTO inbox_files
         (id, token_id, dateiname, kategorie, hinweis, mime_type, size,
          client_ip_unbestaetigt, empfangen_at, bytes_vollstaendig_at,
          av_status, av_geprueft_at)
       VALUES (?, ?, ?, 'dokumente', NULL, 'text/plain', 2048, ?, ?, ?, ?, ?)`,
    )
    .run(
      vorgabe.id,
      vorgabe.tokenId ?? null,
      vorgabe.dateiname ?? `${vorgabe.id}.txt`,
      vorgabe.clientIp ?? null,
      vorgabe.empfangenSekunden,
      vorgabe.empfangenSekunden,
      vorgabe.avStatus,
      vorgabe.empfangenSekunden,
    );
  sqlite.close();
}

function legeAbgabelink(): void {
  const sqlite = new Database(`${DIR}/files.db`);
  sqlite
    .prepare(
      `INSERT INTO zugangslinks
         (id, name, token_start, token_hash, created_at, created_by, expires_at,
          revoked_at, budget_dateien, budget_bytes, verbraucht_dateien, verbraucht_bytes)
       VALUES (?, 'Übung Nord', 'dz-abcd', 'hash-a', ?, 'sub-1', ?, NULL, 10, 1000000, 0, 0)`,
    )
    .run(LINK_ID, EMPFANGEN_SEKUNDEN, EMPFANGEN_SEKUNDEN + 86_400);
  sqlite.close();
}

/** Die Props, mit denen die Seite die Insel aufruft. */
async function props(): Promise<PosteingangTabelleProps> {
  const baum = (await FilesPosteingangSeite()) as ReactElement<PosteingangTabelleProps>;
  return baum.props;
}

// ---------------------------------------------------------------------------

describe("Posteingang-Seite — die Einheit der Zeit", () => {
  it("reicht `empfangenSekunden` als Unix-SEKUNDE weiter, nicht als Millisekunde", async () => {
    legeZeile({ id: ID_A, empfangenSekunden: EMPFANGEN_SEKUNDEN, avStatus: "clean" });

    const { zeilen } = await props();

    expect(zeilen).toHaveLength(1);
    // DER EXAKTE WERT: die Zahl aus der Spalte, unveraendert.
    expect(zeilen[0].empfangenSekunden).toBe(EMPFANGEN_SEKUNDEN);
    // UND DIE GROESZENORDNUNG, als zweite, unabhaengige Aussage: eine
    // Millisekundenzahl laege drei Groeszenordnungen darueber.
    expect(zeilen[0].empfangenSekunden).toBeLessThan(OBERGRENZE_SEKUNDEN);
    // Der formatierte Text kommt aus DERSELBEN Quelle und ist nicht leer.
    expect(zeilen[0].empfangenText).not.toBe("");
  });

  it("reicht `jetztSekunden` als Unix-SEKUNDE weiter — dieselbe Einheit wie die Zeilen", async () => {
    legeZeile({ id: ID_A, empfangenSekunden: EMPFANGEN_SEKUNDEN, avStatus: "clean" });

    const { jetztSekunden } = await props();

    /*
     * Ein Fenster in SEKUNDEN, ohne `Date.now()/1000` im Test — die Umrechnung
     * unter Test darf hier nicht ein zweites Mal stehen. 1,7·10^9 ist 2023,
     * 2·10^9 ist 2033; die heutige Millisekundenzahl (~1,78·10^12) liegt weit
     * auszerhalb.
     */
    expect(jetztSekunden).toBeGreaterThan(1_700_000_000);
    expect(jetztSekunden).toBeLessThan(2_000_000_000);
    // Beide Zahlen muessen VERGLEICHBAR sein: der Zeitraumfilter rechnet
    // `jetztSekunden - empfangenSekunden`. Eine Zeile von 2026 liegt vor jetzt.
    expect(jetztSekunden).toBeGreaterThan(0);
  });

  it("sortiert neueste zuerst", async () => {
    legeZeile({ id: ID_A, empfangenSekunden: AELTER_SEKUNDEN, avStatus: "clean" });
    legeZeile({ id: ID_B, empfangenSekunden: EMPFANGEN_SEKUNDEN, avStatus: "clean" });

    const { zeilen } = await props();

    expect(zeilen.map((z) => z.id)).toEqual([ID_B, ID_A]);
  });
});

describe("Posteingang-Seite — der Wertebereich des AV-Status", () => {
  it("macht aus einem Fremdwert in `av_status` `error`, nicht „freigegeben“", async () => {
    legeZeile({ id: ID_A, empfangenSekunden: EMPFANGEN_SEKUNDEN, avStatus: "berichte" });

    const { zeilen } = await props();

    // AM STATUS SELBST gemessen: ohne den Riegel stuende hier `berichte`, und
    // die Zelle zeigte einen Zustand, den es nicht gibt. `herunterladbar` allein
    // waere blind — `istFreigegeben("berichte")` ist ebenfalls `false`.
    expect(zeilen[0].avStatus).toBe("error");
    expect(zeilen[0].herunterladbar).toBe(false);
  });

  it("laesst `clean` unveraendert und gibt die Zeile frei", async () => {
    legeZeile({ id: ID_A, empfangenSekunden: EMPFANGEN_SEKUNDEN, avStatus: "clean" });

    const { zeilen } = await props();

    // DER GEGENFALL, ohne den „immer error" und „nie herunterladbar" gruen
    // blieben.
    expect(zeilen[0].avStatus).toBe("clean");
    expect(zeilen[0].herunterladbar).toBe(true);
  });

  it("gibt eine Zeile mit `scanning` NICHT frei", async () => {
    legeZeile({ id: ID_A, empfangenSekunden: EMPFANGEN_SEKUNDEN, avStatus: "scanning" });

    const { zeilen } = await props();

    expect(zeilen[0].avStatus).toBe("scanning");
    // Fail-closed (§6.3): solange nicht freigegeben ist, bleibt der Download zu.
    expect(zeilen[0].herunterladbar).toBe(false);
  });
});

describe("Posteingang-Seite — Abgabelink und Altbestand", () => {
  it("laesst eine Zeile OHNE `token_id` stehen und meldet sie als Altbestand", async () => {
    legeZeile({ id: ID_A, empfangenSekunden: EMPFANGEN_SEKUNDEN, avStatus: "clean" });

    const { zeilen } = await props();

    // EIN INNER JOIN liesze genau diese Zeile verschwinden, und zwar ohne jede
    // Meldung: `token_id` ist NULL fuer den gesamten Altbestand (§4.6).
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].abgabelink).toBeNull();
  });

  it("haengt an eine Zeile MIT `token_id` Kennung, Tokenanfang und Name", async () => {
    legeAbgabelink();
    legeZeile({
      id: ID_A,
      empfangenSekunden: EMPFANGEN_SEKUNDEN,
      avStatus: "clean",
      tokenId: LINK_ID,
    });

    const { zeilen } = await props();

    expect(zeilen[0].abgabelink).toEqual({
      id: LINK_ID,
      tokenStart: "dz-abcd",
      name: "Übung Nord",
    });
  });
});

describe("Posteingang-Seite — der Renderlauf", () => {
  it("uebersteht das Rendern und zeigt den Dateinamen", async () => {
    legeAbgabelink();
    legeZeile({
      id: ID_A,
      empfangenSekunden: EMPFANGEN_SEKUNDEN,
      avStatus: "clean",
      tokenId: LINK_ID,
      dateiname: "lage.txt",
      clientIp: CLIENT_IP,
    });

    const markup = renderToStaticMarkup((await FilesPosteingangSeite()) as ReactElement);

    expect(markup).toContain("lage.txt");
    /*
     * DIE UNBESTAETIGTE IP UEBERQUERT DIE RSC-GRENZE GAR NICHT ERST (§8.6): sie
     * steht in keiner Spalte der Abfrage. Geprueft wird gegen einen WERT, der in
     * der Zeile wirklich steht — gegen den Spaltennamen zu pruefen waere gruen
     * durch Bauart, denn ein Spaltenname kommt in Markup ohnehin nie vor.
     * Nachgemessen: mit `clientIpUnbestaetigt` in der Spaltenliste der Abfrage
     * und der Adresse in einer Zelle wird dieser Test rot.
     */
    expect(markup).not.toContain(CLIENT_IP);
  });
});
