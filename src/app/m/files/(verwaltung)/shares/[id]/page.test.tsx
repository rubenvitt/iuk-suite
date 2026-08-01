// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * DIE SHARE-DETAILSEITE `/shares/[id]` (Spec §7.3, §7.8, §7.9, §10.1, §10.2;
 * Plan T41, die acht Punkte).
 *
 * ZWEI RENDERWEGE, zwei verschiedene Aussagen:
 *
 *  - `renderToStaticMarkup` ueber den AUFGELOESTEN Baum (`await Seite(...)`): das
 *    fertige Serverbild samt echter, migrierter Datenbank UND echter Ablage. Nur
 *    so faellt auf, wenn eine Groesze aus `total_size` statt aus den Zeilen kommt
 *    oder eine Datei ohne Blob als „freigegeben" erscheint — beides ist an
 *    Vorrichtungswerten in Props nicht zu sehen.
 *  - `mount` (Harness aus `qr/_lib/test-dom.tsx`, KEIN zweites erfunden): die
 *    Aktionen der Insel. Bestaetigungsdialog und QR-Dialog entstehen erst NACH
 *    einem Klick und stehen dann in einem PORTAL an `document.body` — ein
 *    Markup-Test kann sie strukturell nicht sehen.
 *
 * DIE ABLAGE IST ECHT, und das ist keine Bequemlichkeit: `ladeShareDetail`
 * misst je vollstaendiger Zeile die Blob-Laenge (`_db/queries.ts:gemessen`).
 * Ohne geschriebene Blobs traegt JEDE Zeile `blobFehlt` — der Normalfall
 * „freigegeben" waere dann gar nicht erreichbar und der Test bewiese das
 * Gegenteil dessen, was er behauptet.
 */

// ---------------------------------------------------------------------------
// Mocks — vor jedem Import des Codes unter Test
// ---------------------------------------------------------------------------

const { useActionStateMock, loeschenMock, aufstockenMock, bearbeitenMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  loeschenMock: vi.fn(),
  aufstockenMock: vi.fn(),
  bearbeitenMock: vi.fn(),
}));

/* Wie in `SharesTabelle.test.tsx`: der Zustand je ACTION, nicht je
   Aufrufreihenfolge — die Seite ruft `useActionState` mehrfach. */
vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

/* Ohne diesen Mock zoegen die echten Server Actions `better-sqlite3`,
   `next/cache` und `bcryptjs` in den Renderlauf. */
vi.mock("../../../(verwaltung)/actions", () => ({
  shareLoeschenAction: loeschenMock,
  downloadsAufstockenAction: aufstockenMock,
  bearbeitenAction: bearbeitenMock,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound(): diese Freigabe gibt es nicht");
  },
  // `useRouter` wirft ausserhalb des `AppRouterContext`; `next/link` liest ihn.
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "10.0.3.14:3000",
      "x-forwarded-host": "files.example.test",
      "x-forwarded-proto": "https",
    }),
}));

import ShareDetailSeite from "./page";
import { click, clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

// ---------------------------------------------------------------------------
// Vorrichtung
// ---------------------------------------------------------------------------

const DIR = "./.data/files-detail-test";

/**
 * IDs sind nanoid(10): `_lib/storage.ts` weist jede andere Form mit
 * `UngueltigeId` ab, und die Detailseite saehe dann JEDE Datei als „nicht
 * auffindbar" — der Test bewiese seine Aussage dann nirgends.
 */
const SHARE = "sh-aaaaaa1";
const DATEI_A = "fi-aaaaaa1";
const DATEI_B = "fi-aaaaaa2";
const DATEI_C = "fi-aaaaaa3";
const DATEI_D = "fi-aaaaaa4";
/** `infected` UND ohne Blob — die Kombination, die die Zweigreihenfolge in
 *  `zustand()` ueberhaupt erst entscheidbar macht (siehe den Test unten). */
const DATEI_E = "fi-aaaaaa5";

/*
 * `mode: "timestamp"` fuehrt SEKUNDEN, nicht Millisekunden wie im Modul `qr` —
 * geschrieben wird deshalb ueber Drizzle mit `Date`-Objekten, damit nirgends ein
 * Faktor 1000 von Hand entsteht.
 */
const JETZT = new Date(2026, 6, 25, 12, 0, 0);
const IN_SECHS_TAGEN = new Date(2026, 6, 31, 14, 0, 0);

/**
 * `shares.total_size` steht bewusst auf einer Zahl, die mit KEINER Zeilensumme
 * uebereinstimmt: 987.654.321 Byte sind „941,9 MiB", die Zeilensumme ist
 * „476,8 MiB". Ohne diesen Unterschied waere Punkt 3 gruen, ohne etwas zu
 * pruefen (§7.3: Dashboard und Detailseite zeigten dieselbe Groesze aus ZWEI
 * Quellen).
 */
const TOTAL_SIZE_FALLE = 987_654_321;
const TOTAL_SIZE_FALLE_TEXT = "941,9 MiB";

const HASH = "$2b$12$abcdefghijklmnopqrstuuOaBcDeFgHiJkLmNoPqRsTuVwXyZ012345";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  vi.stubEnv("DATA_DIR", DIR);
  vi.stubEnv("SUITE_HOST_FILES", "files.example.test,drop.example.test");
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  zustaende.clear();
  absender.clear();
  useActionStateMock.mockReset();
  useActionStateMock.mockImplementation((action: unknown, start: unknown) => [
    zustaende.get(action) ?? start,
    abschickenFuer(action),
    false,
  ]);
});

afterEach(async () => {
  await unmount();
  vi.unstubAllEnvs();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  rmSync(DIR, { recursive: true, force: true });
});

const zustaende = new Map<unknown, unknown>();
const absender = new Map<unknown, ReturnType<typeof vi.fn>>();

function abschickenFuer(action: unknown): ReturnType<typeof vi.fn> {
  const vorhanden = absender.get(action);
  if (vorhanden) return vorhanden;
  const neu = vi.fn();
  absender.set(action, neu);
  return neu;
}

async function legeShare(vorgabe: {
  id?: string;
  titel?: string;
  beschreibung?: string | null;
  typ?: string;
  ablaufAt?: Date;
  maxDownloads?: number | null;
  downloadCount?: number;
  passwordHash?: string | null;
  totalSize?: number;
  erstelltVon?: string;
} = {}) {
  const { getDb } = await import("../../../_db/client");
  const { shares } = await import("../../../_db/schema");
  getDb()
    .insert(shares)
    .values({
      id: vorgabe.id ?? SHARE,
      title: vorgabe.titel ?? "Übung Nord",
      description: vorgabe.beschreibung ?? null,
      type: vorgabe.typ ?? "folder",
      expiresAt: vorgabe.ablaufAt ?? IN_SECHS_TAGEN,
      maxDownloads: vorgabe.maxDownloads ?? null,
      downloadCount: vorgabe.downloadCount ?? 0,
      passwordHash: vorgabe.passwordHash ?? null,
      totalSize: vorgabe.totalSize ?? TOTAL_SIZE_FALLE,
      createdAt: JETZT,
      createdBy: vorgabe.erstelltVon ?? "sub-1",
    })
    .run();
}

async function legeDatei(vorgabe: {
  id: string;
  shareId?: string;
  dateiname?: string;
  groesse?: number;
  avStatus?: "scanning" | "clean" | "infected" | "error" | "unscanned";
  vollstaendig?: boolean;
  /** Blob wirklich schreiben? `false` ergibt den Zustand „nicht auffindbar". */
  mitBlob?: boolean;
}) {
  const { getDb } = await import("../../../_db/client");
  const { shareFiles } = await import("../../../_db/schema");
  const shareId = vorgabe.shareId ?? SHARE;
  const vollstaendig = vorgabe.vollstaendig ?? true;
  const groesse = vorgabe.groesse ?? 250_000_000;
  getDb()
    .insert(shareFiles)
    .values({
      id: vorgabe.id,
      shareId,
      filename: vorgabe.dateiname ?? "bericht.pdf",
      mimeType: "application/pdf",
      size: groesse,
      createdAt: JETZT,
      bytesVollstaendigAt: vollstaendig ? JETZT : null,
      avStatus: vorgabe.avStatus ?? "clean",
      avGeprueftAt: JETZT,
    })
    .run();

  if (vollstaendig && (vorgabe.mitBlob ?? true)) {
    const pfad = `${DIR}/files/${shareId}/${vorgabe.id}`;
    mkdirSync(dirname(pfad), { recursive: true });
    // Der Inhalt ist beliebig: `ladeShareDetail` misst nur, OB ein Blob liegt.
    writeFileSync(pfad, "x");
  }
}

async function legeLog(vorgabe: {
  dateiId?: string | null;
  ip?: string | null;
  agent?: string | null;
  zeit?: Date;
  anzahl?: number;
} = {}) {
  const { getDb } = await import("../../../_db/client");
  const { downloadLogs } = await import("../../../_db/schema");
  const anzahl = vorgabe.anzahl ?? 1;
  const werte = Array.from({ length: anzahl }, (_, i) => ({
    shareId: SHARE,
    fileId: vorgabe.dateiId === undefined ? DATEI_A : vorgabe.dateiId,
    clientIpUnbestaetigt: vorgabe.ip === undefined ? "192.168.178.0" : vorgabe.ip,
    userAgent: vorgabe.agent === undefined ? "Mozilla/5.0 (Test)" : vorgabe.agent,
    zeit: new Date((vorgabe.zeit ?? JETZT).getTime() + i * 1000),
  }));
  for (const wert of werte) {
    getDb()
      .insert(downloadLogs)
      .values({
        shareId: wert.shareId,
        fileId: wert.fileId,
        clientIpUnbestaetigt: wert.clientIpUnbestaetigt,
        userAgent: wert.userAgent,
        downloadedAt: wert.zeit,
      })
      .run();
  }
}

/** Der aufgeloeste Seitenbaum — die Seite ist eine asynchrone Server Component. */
async function baum(id = SHARE, logs?: string): Promise<ReactElement> {
  return (await ShareDetailSeite({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(logs === undefined ? {} : { logs }),
  })) as ReactElement;
}

async function markup(id = SHARE, logs?: string): Promise<string> {
  return renderToStaticMarkup(await baum(id, logs));
}

/** Das Serverbild als DOM — bequemer als Zeichenkettensuche fuer Zeilen. */
async function dom(id = SHARE, logs?: string): Promise<HTMLElement> {
  const wirt = document.createElement("div");
  wirt.innerHTML = await markup(id, logs);
  return wirt;
}

/** Der Text EINER Tabellenzeile; `rowKey` landet als `data-row-key` am `<tr>`. */
function zeilentext(wirt: HTMLElement, schluessel: string): string {
  const tr = wirt.querySelector(`tr[data-row-key="${schluessel}"]`);
  expect(tr, `keine Tabellenzeile mit dem Schluessel ${schluessel}`).not.toBeNull();
  return (tr?.textContent ?? "").replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Der Quelltext-Riegel: was eine SERVER COMPONENT nicht importieren darf
// ---------------------------------------------------------------------------

describe("die Seite bleibt eine Server Component, die sich auch ausführen lässt", () => {
  /**
   * GEMESSEN, NICHT VERMUTET (2026-08-01, erster echter Abruf dieser Route):
   * ein Import aus `@ant-design/icons` in DIESER Datei ergibt
   * `TypeError: (0 , _react.createContext) is not a function` und **HTTP 500 für
   * die ganze Seite**. Das Paket trägt kein `"use client"` (siehe den Kommentar
   * in `core/shell/icons.ts`), Next wertet es also in der RSC-Umgebung aus — und
   * dort ruft es `createContext` auf Modulebene.
   *
   * WARUM DAS EIN QUELLTEXT-SCAN SEIN MUSS: unter Vitest gibt es die
   * RSC-Bedingung nicht. `renderToStaticMarkup` in dieser Datei rendert die
   * antd-Icons klaglos, `pnpm build` und `pnpm typecheck` bleiben grün — dieser
   * Test ist der einzige Ort im Gate, an dem der Rückfall auffällt. Dieselbe
   * Familie wie Falle 6 aus `docs/design/README.md`, nur andersherum.
   *
   * In einer CLIENT-Insel sind die antd-Icons unverändert richtig; die Zusage
   * gilt genau für die beiden Server Components dieses Tasks.
   */
  it("importiert `@ant-design/icons` weder in der Seite noch im Audit-Log", () => {
    for (const pfad of [
      "src/app/m/files/(verwaltung)/shares/[id]/page.tsx",
      "src/app/m/files/_ui/AuditLog.tsx",
    ]) {
      // OHNE Kommentare: beide Dateien SCHREIBEN über diese Falle, und ein Scan
      // über den Rohtext fiele über die eigene Begründung.
      const quelle = readFileSync(pfad, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(quelle, `${pfad} darf keine Client-Direktive tragen`).not.toContain('"use client"');
      expect(quelle, `${pfad} importiert @ant-design/icons`).not.toContain("@ant-design/icons");
    }
  });
});

// ---------------------------------------------------------------------------
// Punkt 1 — unbekannte ID
// ---------------------------------------------------------------------------

describe("Punkt 1 — unbekannte ID", () => {
  it("laeuft bei einer unbekannten ID in `notFound()`", async () => {
    await legeShare();
    await expect(baum("sh-zzzzzz9")).rejects.toThrow(/notFound/);
  });

  it("rendert eine bekannte ID — sonst waere der Test darueber trivial gruen", async () => {
    await legeShare();
    expect(await markup()).toContain("Übung Nord");
  });
});

// ---------------------------------------------------------------------------
// Punkt 2 — AV-Zustand je Datei als Text UND Symbol
// ---------------------------------------------------------------------------

describe("Punkt 2 — je Datei ein Zustand als Text plus Symbol", () => {
  beforeEach(async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, dateiname: "a.pdf", avStatus: "clean" });
    await legeDatei({ id: DATEI_B, dateiname: "b.pdf", avStatus: "scanning" });
    await legeDatei({ id: DATEI_C, dateiname: "c.pdf", avStatus: "infected" });
    await legeDatei({ id: DATEI_D, dateiname: "d.pdf", avStatus: "clean", mitBlob: false });
    // Die FUENFTE Zeile traegt BEIDE Befunde gleichzeitig — ohne sie ist die
    // Zweigreihenfolge in `zustand()` unbeobachtbar (Begruendung am Test unten).
    await legeDatei({ id: DATEI_E, dateiname: "e.pdf", avStatus: "infected", mitBlob: false });
  });

  it("benennt freigegeben, wird geprueft, gesperrt und nicht auffindbar mit Text", async () => {
    const wirt = await dom();
    expect(zeilentext(wirt, DATEI_A)).toContain("freigegeben");
    expect(zeilentext(wirt, DATEI_B)).toContain("wird geprüft");
    expect(zeilentext(wirt, DATEI_C)).toContain("gesperrt");
    // Der Blob fehlt, obwohl die Zeile `clean` und vollstaendig ist — ohne
    // eigene Pruefung erschiene sie als „freigegeben" (§10.1).
    expect(zeilentext(wirt, DATEI_D)).toContain("nicht auffindbar");
    expect(zeilentext(wirt, DATEI_D)).not.toContain("freigegeben");
  });

  /**
   * DIE REIHENFOLGE DER ZWEIGE IST DIE AUSSAGE: AV **vor** dem Blob. Eine
   * infizierte Datei, deren Blob schon weg ist, bleibt „gesperrt" — andersherum
   * verschwiege die Ansicht den Fund und meldete bloss einen Ablagefehler.
   *
   * DIESE ZEILE IST DER EINZIGE ORT, AN DEM DIE REIHENFOLGE SICHTBAR WIRD.
   * `DATEI_C` ist `infected` MIT Blob, `DATEI_D` ist `clean` OHNE Blob: bei
   * beiden trifft nur EIN Zweig, die Reihenfolge ist an ihnen also gar nicht zu
   * messen. Belegt: die `blobFehlt`-Pruefung vor die `!freigegeben`-Pruefung
   * gezogen liess vorher alle 34 Tests gruen.
   */
  it("nennt eine infizierte Datei OHNE Blob „gesperrt“, nicht „nicht auffindbar“", async () => {
    const zeile = zeilentext(await dom(), DATEI_E);
    expect(zeile, "der Fund muss die Ablage schlagen").toContain("gesperrt");
    expect(zeile, "„nicht auffindbar“ verschwiege den Fund").not.toContain("nicht auffindbar");
  });

  it("traegt zu jedem Zustand ein Symbol — Text plus Symbol, nie Farbe allein", async () => {
    const wirt = await dom();
    const gesehen = new Set<string>();
    // BEWUSST OHNE `DATEI_E`: sie ist ebenfalls „gesperrt" und traegt damit
    // dasselbe Symbol wie `DATEI_C`. Mitgezaehlt bliebe die Menge zwar 4, die
    // Zahl unten hiesse dann aber „fuenf Zeilen, vier Formen" statt „vier
    // Zustaende, vier Formen" — und genau das ist die Aussage.
    for (const datei of [DATEI_A, DATEI_B, DATEI_C, DATEI_D]) {
      const tr = wirt.querySelector(`tr[data-row-key="${datei}"]`);
      const svg = tr?.querySelector("svg path");
      expect(svg, `kein Symbol in Zeile ${datei}`).not.toBeNull();
      gesehen.add(svg?.getAttribute("d") ?? "");
    }
    // VIER verschiedene Zustaende, vier verschiedene Innenformen: ein einziges
    // Symbol fuer alles waere zwar „ein Symbol", truege aber keine Aussage.
    expect(gesehen.size).toBe(4);
  });

  /**
   * `colorError === colorPrimary === #c8000f`: ein rotes `Tag` fuer „infiziert"
   * saehe auf einer Datenflaeche aus wie eine Primaeraktion (§10.1,
   * `docs/design/README.md`, Falle 3). Der Text allein waere gruen, auch wenn das
   * Tag rot ist — deshalb die Zusicherung ueber die ABWESENHEIT der Klasse.
   */
  it("faerbt „gesperrt“ nicht rot ein", async () => {
    const quelle = await markup();
    expect(quelle).not.toContain("ant-tag-red");
    expect(quelle).not.toContain("ant-alert-error");
  });

  it("zeigt bei fehlendem Blob KEINE Groesze, sondern den Zustand", async () => {
    const wirt = await dom();
    // 250.000.000 Byte = „238,4 MiB" — die Zeile mit Blob traegt die Zahl,
    // die ohne Blob nicht (§10.1: „statt einer Groesze").
    expect(zeilentext(wirt, DATEI_A)).toContain("238,4 MiB");
    expect(zeilentext(wirt, DATEI_D)).not.toContain("238,4 MiB");
  });

  it("weist eine Zeile ohne Bytes als unvollstaendig aus (§4.4)", async () => {
    const wirt = await dom();
    expect(wirt.textContent).not.toContain("nicht vollständig übertragen");

    await legeDatei({ id: "fi-bbbbbb1", dateiname: "e.pdf", vollstaendig: false, groesse: 0 });
    expect(zeilentext(await dom(), "fi-bbbbbb1")).toContain("nicht vollständig übertragen");
  });
});

// ---------------------------------------------------------------------------
// Punkt 3 — die Groeszensumme kommt AUS DEN ZEILEN
// ---------------------------------------------------------------------------

describe("Punkt 3 — Summe aus den Zeilen, `total_size` nirgends", () => {
  it("summiert die Zeilen und zeigt `total_size` nicht daneben", async () => {
    await legeShare({ totalSize: TOTAL_SIZE_FALLE });
    await legeDatei({ id: DATEI_A, groesse: 250_000_000 });
    await legeDatei({ id: DATEI_B, groesse: 250_000_000 });

    const quelle = await markup();
    // 2 × 250.000.000 Byte = 476,8 MiB (binaer, §9.1: das truegerische Paar).
    expect(quelle).toContain("476,8 MiB");
    expect(quelle).not.toContain(TOTAL_SIZE_FALLE_TEXT);
    expect(quelle).not.toContain(String(TOTAL_SIZE_FALLE));
  });

  /**
   * ZWEI ZAHLEN AUS DERSELBEN MISCHUNG: die BYTE-Summe und die ANZAHL. Die
   * Anzahl war unbewacht — `anzahlVollstaendig = detail.dateien.length` (die
   * unvollstaendigen Zeilen mitgezaehlt) liess vorher alle 34 Tests gruen, weil
   * kein Test vollstaendige und unvollstaendige Zeilen mischte UND danach die
   * Anzahl las. Die Zahl speist zwei sichtbare Stellen: diese Metadatenzeile und
   * die Loeschen-Bestaetigung (§7.3, Punkt 7 unten).
   */
  it("zaehlt unvollstaendige Zeilen weder in die Summe noch in die Anzahl", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, groesse: 250_000_000 });
    await legeDatei({ id: DATEI_B, groesse: 250_000_000, vollstaendig: false });
    // Nur die vollstaendige Zeile: 238,4 MiB, nicht 476,8 MiB.
    const kopf = query2(await dom(), "[data-testid='files-detail-metadaten']");
    expect(kopf).toContain("238,4 MiB");
    expect(kopf).not.toContain("476,8 MiB");
    // EINE vollstaendige Zeile bei ZWEI Zeilen — „Dateien: 2 (1 unvollständig)"
    // waere eine Dateizahl, die es nicht gibt.
    expect(kopf).toContain("Dateien: 1 (1 unvollständig)");
    expect(kopf).not.toContain("Dateien: 2");
  });
});

describe("die Metadaten tragen Zustand, Menge und Datum", () => {
  /**
   * DER ABLAUFZUSTAND KOMMT VON DER UHR DES SERVERS. Rechnete ihn der Browser,
   * entschieden beide an der Ablaufsekunde verschieden — die Seite stünde auf
   * „gültig", während jeder Download 410 antwortet (`_db/queries.ts:ladeShare`).
   */
  it("nennt eine abgelaufene Freigabe abgelaufen — und eine gültige nicht", async () => {
    await legeShare({ ablaufAt: new Date(Date.now() - 60_000) });
    expect(query2(await dom(), "[data-testid='files-detail-metadaten']")).toContain("abgelaufen");

    delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
    rmSync(`${DIR}/files.db`, { force: true });
    const sqlite = new Database(`${DIR}/files.db`);
    migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
    sqlite.close();
    delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

    await legeShare({ ablaufAt: new Date(Date.now() + 3_600_000) });
    expect(query2(await dom(), "[data-testid='files-detail-metadaten']")).not.toContain(
      "abgelaufen",
    );
  });

  it("nennt Passwortschutz mit Ja/Nein statt mit einem Symbol allein", async () => {
    await legeShare({ passwordHash: HASH });
    const kopf = query2(await dom(), "[data-testid='files-detail-metadaten']");
    expect(kopf).toContain("Passwort: Ja");
    // Und der Hash überquert die Grenze NICHT (§7.3, Analyse Falle 11).
    expect(await markup()).not.toContain("$2b$");
  });
});

function query2(wirt: HTMLElement, selektor: string): string {
  const el = wirt.querySelector(selektor);
  expect(el, `Element nicht gefunden: ${selektor}`).not.toBeNull();
  return (el?.textContent ?? "").replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Punkt 4 — das Audit-Log
// ---------------------------------------------------------------------------

describe("Punkt 4 — Audit-Log, Nachladeweg und Spaltenueberschrift", () => {
  beforeEach(async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, dateiname: "a.pdf" });
  });

  it("schreibt die Spaltenueberschrift als „IP (unbestätigt, gekürzt)“", async () => {
    await legeLog();
    const wirt = await dom();
    const ueberschriften = Array.from(wirt.querySelectorAll("th")).map((th) => th.textContent);
    expect(ueberschriften).toContain("IP (unbestätigt, gekürzt)");
  });

  it("zeigt `Datei <name>` und bei `file_id = NULL` `ZIP`", async () => {
    await legeLog({ dateiId: DATEI_A });
    await legeLog({ dateiId: null });
    const text = (await dom()).textContent?.replace(/\s+/g, " ") ?? "";
    expect(text).toContain("Datei a.pdf");
    expect(text).toContain("ZIP");
  });

  /**
   * `download_logs` traegt KEINEN Fremdschluessel und kein Cascade (§4.5), und
   * `DELETE /api/upload/<fileId>` kann eine einzelne Zeile entfernen: eine
   * Logzeile kann also auf eine Datei zeigen, die es nicht mehr gibt. Ohne
   * benannten Rueckfall stuende dort „Datei undefined".
   */
  it("nennt eine nicht mehr vorhandene Datei benannt statt `undefined`", async () => {
    await legeLog({ dateiId: "fi-weg0001" });
    const text = (await dom()).textContent ?? "";
    expect(text).not.toContain("undefined");
    expect(text).toContain("nicht mehr vorhanden");
  });

  it("zeigt ohne Suchparameter hoechstens 100 Zeilen und verlinkt auf `?logs=200`", async () => {
    await legeLog({ anzahl: 101 });
    const wirt = await dom();
    expect(logZeilen(wirt)).toBe(100);
    const mehr = wirt.querySelector("[data-testid='files-auditlog-mehr']");
    expect(mehr, "kein „mehr laden“").not.toBeNull();
    expect(mehr?.getAttribute("href")).toBe(`/shares/${SHARE}?logs=200`);
  });

  it("blendet „mehr laden“ aus, wenn es nichts mehr zu laden gibt", async () => {
    await legeLog({ anzahl: 3 });
    const wirt = await dom();
    expect(logZeilen(wirt)).toBe(3);
    expect(wirt.querySelector("[data-testid='files-auditlog-mehr']")).toBeNull();
  });

  /**
   * DER NACHLADEWEG IST EIN SUCHPARAMETER DER SERVER COMPONENT, und die Klemmung
   * gehoert der Seite: `ladeAuditLog` nimmt die Grenze entgegen und klemmt
   * ausdruecklich NICHT (`_db/queries.ts`). Drei Bedingungen, und jede einzeln:
   * Vorgabe, Vielfaches, Obergrenze.
   */
  it("klemmt `?logs=` auf ein Vielfaches von 100", async () => {
    await legeLog({ anzahl: 260 });
    expect(logZeilen(await dom(SHARE, "250"))).toBe(200);
    expect(logZeilen(await dom(SHARE, "200"))).toBe(200);
  });

  it("faellt bei unbrauchbaren Werten auf die Vorgabe 100 zurueck", async () => {
    await legeLog({ anzahl: 150 });
    for (const roh of ["abc", "0", "-5", "1.5", "", "0x10"]) {
      expect(logZeilen(await dom(SHARE, roh)), `?logs=${roh}`).toBe(100);
    }
  });

  it("klemmt nach oben auf 1000 und nennt den Zustand statt eines toten Links", async () => {
    await legeLog({ anzahl: 1001 });
    const wirt = await dom(SHARE, "5000");
    expect(logZeilen(wirt)).toBe(1000);
    // Ein „mehr laden“, das nichts mehr nachlaedt, waere eine Sackgasse.
    expect(wirt.querySelector("[data-testid='files-auditlog-mehr']")).toBeNull();
    expect(wirt.querySelector("[data-testid='files-auditlog-grenze']")?.textContent).toContain(
      "1000",
    );
  });

  it("nennt den Leerzustand des Protokolls", async () => {
    expect((await dom()).querySelector("[data-testid='files-auditlog-leer']")).not.toBeNull();
  });
});

/** Die Zeilen der PROTOKOLL-Tabelle: sie traegt Zahlen als `data-row-key`. */
function logZeilen(wirt: HTMLElement): number {
  return wirt.querySelectorAll("[data-testid='files-auditlog'] tbody tr[data-row-key]").length;
}

// ---------------------------------------------------------------------------
// Punkt 5 — „Downloads aufstocken" nur bei gesetztem Limit
// ---------------------------------------------------------------------------

describe("Punkt 5 — „Downloads aufstocken“ nur bei gesetztem Limit", () => {
  it("zeigt den Knopf bei gesetztem Limit", async () => {
    await legeShare({ maxDownloads: 10, downloadCount: 3 });
    await legeDatei({ id: DATEI_A });
    const wirt = await dom();
    expect(wirt.querySelector("[data-testid='files-detail-aufstocken']")).not.toBeNull();
    expect(wirt.textContent).toContain("3 / 10");
  });

  /**
   * `0` IST EIN GESETZTES LIMIT — ein erschoepfter Share, kein unbegrenzter
   * (§4.2). Ein `&&` oder `!!` auf `maxDownloads` blendete den Knopf genau dort
   * aus, wo der Betreiber ihn am dringendsten braucht.
   */
  it("zeigt den Knopf AUCH bei `max_downloads = 0`", async () => {
    await legeShare({ maxDownloads: 0, downloadCount: 0 });
    await legeDatei({ id: DATEI_A });
    const wirt = await dom();
    expect(wirt.querySelector("[data-testid='files-detail-aufstocken']")).not.toBeNull();
    expect(wirt.textContent).toContain("0 / 0");
  });

  it("zeigt ihn NICHT bei unbegrenztem Share", async () => {
    await legeShare({ maxDownloads: null, downloadCount: 7 });
    await legeDatei({ id: DATEI_A });
    const wirt = await dom();
    expect(wirt.querySelector("[data-testid='files-detail-aufstocken']")).toBeNull();
    expect(wirt.textContent).toContain("7 / ∞");
  });
});

// ---------------------------------------------------------------------------
// Punkt 6 — der Weg zurueck
// ---------------------------------------------------------------------------

describe("Punkt 6 — kein Sackgassen-Detail", () => {
  it("fuehrt zurueck auf die Freigabenliste", async () => {
    await legeShare();
    const zurueck = (await dom()).querySelector("[data-testid='files-detail-zurueck']");
    expect(zurueck, "kein Zurueck-Weg").not.toBeNull();
    expect(zurueck?.getAttribute("href")).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Punkt 7 — die Aktionen der Detailseite
// ---------------------------------------------------------------------------

describe("Punkt 7 — Bearbeiten, Löschen, Aufstocken, QR", () => {
  beforeEach(async () => {
    await legeShare({ maxDownloads: 10, downloadCount: 3, passwordHash: HASH });
    await legeDatei({ id: DATEI_A, groesse: 250_000_000 });
    await legeDatei({ id: DATEI_B, groesse: 250_000_000 });
    // DIE DRITTE ZEILE IST UNVOLLSTAENDIG, und sie ist der Grund, dass die
    // Bestaetigung unten ueberhaupt etwas beweist: bei zwei vollstaendigen
    // Zeilen allein sind „Zeilen zaehlen" und „vollstaendige Zeilen zaehlen"
    // dieselbe Zahl, und die Bestaetigung waere bei beiden Rechenwegen gruen.
    await legeDatei({ id: DATEI_C, groesse: 0, vollstaendig: false });
  });

  it("verlinkt „Bearbeiten“ auf `/shares/<id>/bearbeiten`", async () => {
    const bearbeiten = (await dom()).querySelector("[data-testid='files-detail-bearbeiten']");
    expect(bearbeiten?.getAttribute("href")).toBe(`/shares/${SHARE}/bearbeiten`);
  });

  /**
   * Der oeffentliche Link traegt den Host der ROLLE `verwaltung` (§3.2) und
   * NIE einen relativen Pfad: er wird kopiert und weitergegeben. Die Vorrichtung
   * setzt `x-forwarded-host` auf einen anderen Wert als `host` — die Adresse muss
   * trotzdem aus der ROLLE kommen, nicht aus dem Request. Den Port-Rueckfall
   * (Dev auf 3000, E2E auf 3100) besitzt `_lib/hostRolle.test.ts`.
   */
  it("zeigt den oeffentlichen Link vollstaendig, mit Protokoll und Rollen-Host", async () => {
    const adresse = (await dom()).querySelector("[data-testid='files-detail-adresse']");
    expect(adresse?.textContent).toBe(`https://files.example.test/s/${SHARE}`);
    // Die Gegenprobe: der Request-Host taucht nicht auf.
    expect(adresse?.textContent).not.toContain("10.0.3.14");
  });

  it("nennt in der Löschen-Bestätigung Dateizahl UND Größe", async () => {
    await mount(await baum());
    await click("[data-testid='files-detail-loeschen']");
    const text = (document.body.querySelector(".ant-popconfirm")?.textContent ?? "").replace(
      /\s+/g,
      " ",
    );
    // §7.3 verlangt BEIDES — „2 Dateien" allein sagt nicht, was verloren geht.
    // Und die Zahl ist die der VOLLSTAENDIGEN Zeilen: die Vorrichtung legt drei
    // Zeilen an, von denen eine unvollstaendig ist. „3 Dateien" benennte eine
    // Menge, die es nicht gibt.
    expect(text).toContain("2 Dateien");
    expect(text).not.toContain("3 Dateien");
    expect(text).toContain("476,8 MiB");
    expect(text).toContain("Übung Nord");
  });

  it("erreicht `shareLoeschenAction` erst NACH der Bestätigung", async () => {
    await mount(await baum());
    const loeschen = abschickenFuer(loeschenMock);

    await click("[data-testid='files-detail-loeschen']");
    expect(loeschen).not.toHaveBeenCalled();

    const bestaetigen = Array.from(
      document.body.querySelectorAll<HTMLElement>(".ant-popconfirm .ant-btn"),
    ).find((knopf) => knopf.textContent === "Löschen");
    expect(bestaetigen, "kein Bestaetigungsknopf im Popconfirm").toBeDefined();
    await clickElement(bestaetigen!);

    expect(loeschen).toHaveBeenCalled();
    expect(abschickenFuer(aufstockenMock)).not.toHaveBeenCalled();
  });

  it("schickt „Downloads aufstocken“ an `downloadsAufstockenAction`", async () => {
    await mount(await baum());
    const formular = query<HTMLFormElement>("[data-testid='files-detail-aufstocken']");
    // Die ID reist mit — die Action liest sie aus der `FormData` (§7.5).
    expect(formular.querySelector<HTMLInputElement>("input[name='id']")?.value).toBe(SHARE);
    expect(formular.querySelector("input[name='zusatzDownloads']")).not.toBeNull();
    expect(formular.getAttribute("action")).not.toBeNull();
  });

  it("öffnet über „QR“ den Dialog mit PNG-Download", async () => {
    await mount(await baum());
    expect(document.body.querySelector("[data-testid='files-share-qr-dialog']")).toBeNull();

    await click("[data-testid='files-detail-qr']");
    expect(document.body.querySelector("[data-testid='files-share-qr-dialog']")).not.toBeNull();
    expect(
      document.body
        .querySelector<HTMLImageElement>("[data-testid='files-share-qr-bild']")
        ?.getAttribute("src"),
    ).toContain(`/api/s/${SHARE}/qr.png`);
    // §7.9: `drop` hatte den PNG-Download, und er darf beim Port nicht
    // unbemerkt wegfallen.
    expect(document.body.querySelector("[data-testid='files-share-qr-png']")).not.toBeNull();
  });

  it("bietet einen Kopierknopf für den öffentlichen Link", async () => {
    await mount(await baum());
    expect(query("[data-testid='files-detail-kopieren']")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Punkt 8 — der Leerzustand
// ---------------------------------------------------------------------------

describe("Punkt 8 — keine Datei vollständig übertragen", () => {
  it("nennt den Zustand und BEIDE Wege — Löschen und erneut hochladen", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, vollstaendig: false, groesse: 0 });

    const wirt = await dom();
    const leer = wirt.querySelector("[data-testid='files-detail-leer']");
    expect(leer, "kein Leerzustand").not.toBeNull();
    expect(leer?.textContent).toContain("Keine Datei vollständig übertragen");
    // Weg 1: erneut hochladen. `/shares/neu` ist das einzige nicht-404-Ziel —
    // einen Wiederaufnahme-Weg fuer eine bestehende Freigabe gibt es nicht.
    expect(leer?.querySelector("a[href='/shares/neu']")).not.toBeNull();
    // Weg 2: loeschen — der Knopf der Insel steht auf derselben Seite.
    expect(wirt.querySelector("[data-testid='files-detail-loeschen']")).not.toBeNull();
    // Und die unvollstaendige Zeile bleibt SICHTBAR (§4.4).
    expect(zeilentext(wirt, DATEI_A)).toContain("nicht vollständig übertragen");
  });

  it("zeigt den Leerzustand NICHT, sobald eine Datei vollständig ist", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });
    expect((await dom()).querySelector("[data-testid='files-detail-leer']")).toBeNull();
  });
});
