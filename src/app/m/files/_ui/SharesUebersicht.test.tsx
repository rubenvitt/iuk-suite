// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * DIE FREIGABEN-UEBERSICHT (Spec §7.3, §10.1; Plan T36, Punkte 1, 4, 5, 6, 9).
 *
 * DREI RENDERWEGE, drei verschiedene Aussagen — und die Aufteilung ist keine
 * Bequemlichkeit:
 *
 *  - `zuZeile` DIREKT: die Projektion an der RSC-Grenze. Sie ist die Naht, um
 *    die es in den Punkten 1 und 6 geht, und ein Markup-Test kann „ist
 *    serialisierbar" nicht beantworten — ein `Date` als PROP rendert klaglos
 *    mit.
 *  - `renderToStaticMarkup`: der WARTEZUSTAND. Der synchrone Renderer kann eine
 *    asynchrone Komponente nicht aufloesen und gibt den `Suspense`-Ersatz aus —
 *    genau das, was der Browser vor dem Eintreffen der Zeilen sieht.
 *  - `renderToReadableStream` bis `allReady`: das fertige Bild samt echter,
 *    migrierter Datenbank. Nur hier faellt auf, wenn ein Hash den Weg ins Markup
 *    findet.
 *
 * WAS DIESE DATEI NICHT BESITZT: das Verhalten der Tabelle (Zeilenaktionen,
 * Kartenliste, `table-layout`) — das besitzt `SharesTabelle.test.tsx`.
 */

// ---------------------------------------------------------------------------
// Mocks — vor jedem Import des Codes unter Test
// ---------------------------------------------------------------------------

const { fehlerSchalter, loeschenMock, bearbeitenMock } = vi.hoisted(() => ({
  fehlerSchalter: { an: false },
  loeschenMock: vi.fn(),
  bearbeitenMock: vi.fn(),
}));

/* Die Server Actions werden hier nur GERENDERT, nie gerufen — der echte Modul
   zoege `next/cache` und `bcryptjs` in den Renderlauf. */
vi.mock("../(verwaltung)/actions", () => ({
  shareLoeschenAction: loeschenMock,
  bearbeitenAction: bearbeitenMock,
}));

/**
 * Die ECHTE Ladefunktion, mit einem Schalter davor. Ein vollstaendiger Mock
 * haette den Fehlerzustand billiger gemacht und dafuer den einzigen Testweg
 * aufgegeben, auf dem eine echte Datenbank durch die Projektion laeuft.
 */
vi.mock("../_db/queries", async (echt) => {
  const modul = await echt<typeof import("../_db/queries")>();
  return {
    ...modul,
    ladeUebersicht: async () => {
      if (fehlerSchalter.an) throw new Error("Vorrichtung: die Datenbank antwortet nicht");
      return modul.ladeUebersicht();
    },
  };
});

import { SharesUebersicht, zuZeile } from "./SharesUebersicht";
import type { UebersichtZeile } from "../_db/queries";

const DIR = "./.data/files-uebersicht-test";

/*
 * `mode: "timestamp"` fuehrt SEKUNDEN, nicht Millisekunden wie im Modul `qr` —
 * geschrieben wird deshalb ueber Drizzle mit `Date`-Objekten, damit nirgends ein
 * Faktor 1000 von Hand entsteht. Ein solcher Fehler waere still: 24 Stunden
 * saehen als 24 Sekunden immer noch nach einer plausiblen Zahl aus.
 */
/*
 * ABSOLUTE ZEITPUNKTE (`…Z`), NICHT `new Date(2026, 6, 31, 14, 0, 0)`.
 *
 * Der lokale Konstruktor liest die Zone des PROZESSES. Solange auch der
 * Formatierer sie las, hoben sich beide auf und die Zusage darunter war
 * zufaellig zonenunabhaengig — sie mass nur nichts. Seit `ablaufText` ueber
 * `_lib/zeit.ts` fest auf `Europe/Berlin` formatiert, ist die Symmetrie weg:
 * unter `TZ=UTC` ergaebe der lokale Konstruktor 14:00 UTC und die Anzeige
 * „16:00" (gemessen).
 *
 * Die Erwartungen unten bleiben deshalb WORTGLEICH, und der Zeitpunkt wandert:
 * 12:00 UTC sind im Juli 14:00 Berliner Wanduhr. Damit gilt die Zusage unter
 * JEDER Prozess-Zeitzone — auch der des Containers.
 */
const JETZT = new Date("2026-07-25T10:00:00Z"); // 12:00 Berliner Wanduhr
const IN_SECHS_TAGEN = new Date("2026-07-31T12:00:00Z"); // 14:00 Berliner Wanduhr
const VOR_EINEM_TAG = new Date("2026-07-24T10:00:00Z"); // 12:00 Berliner Wanduhr

/** Ein echter bcrypt-Hash in Form und Laenge — der Wert, der die RSC-Grenze
 *  NICHT ueberqueren darf (§7.3, Analyse Falle 11). */
const HASH = "$2b$12$abcdefghijklmnopqrstuuOaBcDeFgHiJkLmNoPqRsTuVwXyZ012345";

const PLATZHALTER = "import:easy-filesharing";

beforeEach(() => {
  fehlerSchalter.an = false;
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  vi.stubEnv("DATA_DIR", DIR);
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

afterEach(() => {
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
  typ?: string;
  ablaufAt?: Date;
  maxDownloads?: number | null;
  downloadCount?: number;
  passwordHash?: string | null;
  erstelltVon?: string;
  angelegtAt?: Date;
}) {
  const { getDb } = await import("../_db/client");
  const { shares } = await import("../_db/schema");
  getDb()
    .insert(shares)
    .values({
      id: vorgabe.id,
      title: vorgabe.titel ?? "Übung Nord",
      description: null,
      type: vorgabe.typ ?? "folder",
      expiresAt: vorgabe.ablaufAt ?? IN_SECHS_TAGEN,
      maxDownloads: vorgabe.maxDownloads ?? null,
      downloadCount: vorgabe.downloadCount ?? 0,
      passwordHash: vorgabe.passwordHash ?? null,
      totalSize: 0,
      createdAt: vorgabe.angelegtAt ?? JETZT,
      createdBy: vorgabe.erstelltVon ?? "sub-1",
    })
    .run();
}

async function legeDatei(vorgabe: {
  id: string;
  shareId: string;
  groesse: number;
  avStatus?: "scanning" | "clean" | "infected" | "error" | "unscanned";
  vollstaendig?: boolean;
}) {
  const { getDb } = await import("../_db/client");
  const { shareFiles } = await import("../_db/schema");
  getDb()
    .insert(shareFiles)
    .values({
      id: vorgabe.id,
      shareId: vorgabe.shareId,
      filename: "bericht.pdf",
      mimeType: "application/pdf",
      size: vorgabe.groesse,
      createdAt: JETZT,
      bytesVollstaendigAt: (vorgabe.vollstaendig ?? true) ? JETZT : null,
      avStatus: vorgabe.avStatus ?? "clean",
      avGeprueftAt: JETZT,
    })
    .run();
}

/** Der fertige Baum — das Markup NACH dem Eintreffen der Zeilen. */
async function markup(): Promise<string> {
  const baum = (await SharesUebersicht({ rolle: "verwaltung" })) as ReactElement;
  const strom = await renderToReadableStream(baum);
  await strom.allReady;
  return await new Response(strom).text();
}

/** Das Markup VOR dem Eintreffen der Zeilen: der synchrone Renderer gibt den
 *  `Suspense`-Ersatz aus, weil die Ladekomponente nicht aufloest. */
async function wartemarkup(): Promise<string> {
  return renderToStaticMarkup((await SharesUebersicht({ rolle: "verwaltung" })) as ReactElement);
}

/** Der Markup-Ausschnitt EINER Zeile — `rowKey="id"` landet als `data-row-key`
 *  am `<tr>`. Ohne den Schnitt traefe jede Zusicherung irgendeine Zeile. */
function zeileAusMarkup(quelle: string, id: string): string {
  const start = quelle.indexOf(`data-row-key="${id}"`);
  expect(start, `keine Tabellenzeile mit der id ${id}`).toBeGreaterThan(-1);
  return quelle.slice(start, quelle.indexOf("</tr>", start));
}

function rohzeile(ueberschreibung: Partial<UebersichtZeile> = {}): UebersichtZeile {
  return {
    id: "sh-aaaaaaaa",
    titel: "Übung Nord",
    beschreibung: null,
    typ: "folder",
    hatPasswort: true,
    ablaufAt: IN_SECHS_TAGEN,
    maxDownloads: 10,
    downloadCount: 3,
    anzahlDateien: 2,
    anzahlUnvollstaendig: 0,
    gesamtGroesse: 500_000_000,
    avSammelwert: "freigegeben",
    erstelltVon: "sub-1",
    erstelltAt: JETZT,
    ...ueberschreibung,
  };
}

// ---------------------------------------------------------------------------
// Punkt 1 und 6 — die Projektion an der RSC-Grenze
// ---------------------------------------------------------------------------

describe("Punkte 1 und 6 — was die Client-Insel bekommt", () => {
  it("liefert `hatPasswort` als Wahrheitswert und kein Feld mit einem Hash", () => {
    const zeile = zuZeile(rohzeile(), JETZT);
    expect(zeile.hatPasswort).toBe(true);
    for (const [name, wert] of Object.entries(zeile)) {
      expect(String(wert), `Feld ${name}`).not.toContain("$2b$");
    }
    expect(zuZeile(rohzeile({ hatPasswort: false }), JETZT).hatPasswort).toBe(false);
  });

  /**
   * SERIALISIERBAR heisst hier: nur Zeichenketten, Zahlen und Wahrheitswerte.
   * Ein `Date` als Prop rendert klaglos mit und faellt in keinem Markup-Test auf
   * — es ist die Art Fehler, die erst in der Produktion an einer Zeitzone
   * auffaellt.
   */
  it("uebergibt ausschliesslich serialisierbare Werte — keine `Date`, keine Funktionen", () => {
    const zeile = zuZeile(rohzeile(), JETZT);
    for (const [name, wert] of Object.entries(zeile)) {
      expect(["string", "number", "boolean"], `Feld ${name} ist ${typeof wert}`).toContain(
        typeof wert,
      );
      expect(wert, `Feld ${name}`).not.toBeInstanceOf(Date);
    }
    // Und der Gegenbeweis in einem Stueck: was den JSON-Rundlauf unveraendert
    // ueberlebt, ueberquert auch die RSC-Grenze.
    expect(JSON.parse(JSON.stringify(zeile))).toEqual(zeile);
  });
});

// ---------------------------------------------------------------------------
// Punkt 4 — Zustand, Menge und Datum entstehen SERVERSEITIG
// ---------------------------------------------------------------------------

describe("Punkt 4 — die Zeile traegt Zustand, Menge und Datum", () => {
  it("schreibt Downloads als `n / m` und ein fehlendes Limit als `n / ∞`", () => {
    expect(zuZeile(rohzeile({ downloadCount: 3, maxDownloads: 10 }), JETZT).downloadsText).toBe(
      "3 / 10",
    );
    /* `null` = UNBEGRENZT (nicht 0, nicht −1). Die Alt-Zeile `maxDownloads ||
       null` machte aus „0 Downloads" still einen unbegrenzten Share. */
    expect(zuZeile(rohzeile({ downloadCount: 7, maxDownloads: null }), JETZT).downloadsText).toBe(
      "7 / ∞",
    );
    expect(zuZeile(rohzeile({ downloadCount: 0, maxDownloads: 0 }), JETZT).downloadsText).toBe(
      "0 / 0",
    );
  });

  /**
   * DIE EINHEIT IST DIE AUSSAGE. 500.000.000 Byte sind 476,8 MiB und 500,0 MB —
   * dieselbe Zahl unter zwei Namen, Faktor 1,048576. Genau dieses Paar ist im
   * Modul `files` schon einmal teuer geworden (§9.1). Ein Teiler 1000 ergaebe
   * hier „500,0 MiB", ein vertauschtes Einheitenwort „476,8 MB".
   */
  it("formatiert die Groesze binaer und benennt die Einheit binaer", () => {
    expect(zuZeile(rohzeile({ gesamtGroesse: 500_000_000 }), JETZT).groesseText).toBe("476,8 MiB");
    expect(zuZeile(rohzeile({ gesamtGroesse: 0 }), JETZT).groesseText).toBe("0 Byte");
    expect(zuZeile(rohzeile({ gesamtGroesse: 2 * 1024 ** 3 }), JETZT).groesseText).toBe("2,0 GiB");
  });

  it("uebersetzt den Altbestands-Platzhalter — und nur ihn", () => {
    expect(zuZeile(rohzeile({ erstelltVon: PLATZHALTER }), JETZT).erstelltVonText).toBe(
      "Altbestand — nicht zuordenbar",
    );
    // Die Gegenprobe: ohne sie waere auch eine bedingungslose Ersetzung gruen.
    expect(zuZeile(rohzeile({ erstelltVon: "sub-1" }), JETZT).erstelltVonText).toBe("sub-1");
  });

  /**
   * DAS DATUM ist die dritte Haelfte der Zusage „Zustand, Menge und Datum" — und
   * die einzige, die `SharesTabelle.test.tsx` NICHT besitzen kann: dort steht
   * „31.07.2026, 14:00" als VORRICHTUNGSWERT im Prop, nicht als Ergebnis dieser
   * Projektion. Ein `toISOString()`, eine vertauschte Spalte oder ein leerer
   * String kaeme dort nie an.
   *
   * Zwei Zeitpunkte und nicht einer: ein fest verdrahtetes Datum waere sonst
   * gruen. Und die Locale steckt in der Aussage — `de-DE` mit `dateStyle:
   * "medium"` ergibt „31.07.2026", `en-US` ergaebe „Jul 31, 2026".
   */
  it("schreibt den Ablauf als deutschen Zeitpunkt, nicht als Rohwert", () => {
    expect(zuZeile(rohzeile({ ablaufAt: IN_SECHS_TAGEN }), JETZT).ablaufText).toBe(
      "31.07.2026, 14:00",
    );
    expect(zuZeile(rohzeile({ ablaufAt: VOR_EINEM_TAG }), JETZT).ablaufText).toBe(
      "24.07.2026, 12:00",
    );
  });

  it("entscheidet „abgelaufen“ mit der Uhr DES SERVERS — Gleichstand zaehlt als abgelaufen", () => {
    expect(zuZeile(rohzeile({ ablaufAt: VOR_EINEM_TAG }), JETZT).abgelaufen).toBe(true);
    expect(zuZeile(rohzeile({ ablaufAt: IN_SECHS_TAGEN }), JETZT).abgelaufen).toBe(false);
    /*
     * DER GLEICHSTAND, und er ist keine willkuerliche Festlegung dieses Tests:
     * `_db/queries.ts` haelt fuer dieselbe Entscheidung fest „Gleichstand ist
     * abgelaufen: `expires_at` bezeichnet das Ende der Laufzeit, nicht den
     * letzten gueltigen Augenblick." `zuZeile` schreibt diesen Vergleich ein
     * ZWEITES Mal hin. Laufen die beiden auseinander, steht die Zeile auf
     * „gueltig", waehrend `ladeShare` und damit jeder Download 410 antwortet —
     * genau das Szenario, das der Kopfkommentar von `zuZeile` als Daseinsgrund
     * des Feldes nennt.
     */
    expect(zuZeile(rohzeile({ ablaufAt: JETZT }), JETZT).abgelaufen).toBe(true);
  });

  it("macht aus `file`/`folder` einen Anzeigetext", () => {
    expect(zuZeile(rohzeile({ typ: "folder" }), JETZT).typText).toBe("Ordner");
    expect(zuZeile(rohzeile({ typ: "file" }), JETZT).typText).toBe("Datei");
  });

  /** `<entschaerfter-titel>-qr.png`, Entschaerfung 1:1 aus `_lib/zip.ts` —
   *  „Übung Nord" wird `_bung_Nord`, weil `Ü` kein `[a-zA-Z0-9_-]` ist. */
  it("bildet den QR-Dateinamen mit der Entschaerfung aus `_lib/zip.ts`", () => {
    expect(zuZeile(rohzeile({ titel: "Übung Nord" }), JETZT).qrDateiname).toBe(
      "_bung_Nord-qr.png",
    );
  });
});

// ---------------------------------------------------------------------------
// Punkt 5 — der Leerzustand
// ---------------------------------------------------------------------------

/*
 * EIGENER TIMEOUT FUER DIESE SUITE — sie enthaelt den langsamsten Fall der Datei,
 * und seine Zeit ist weder verschwendet noch zu klammern: `markup()` rendert die
 * antd-Tabelle einmal vollstaendig in jsdom, und der ERSTE Durchlauf einer Datei
 * traegt die Aufwaermkosten der Umgebung mit. Es gibt hier keine Datenbank und
 * keinen Commit, den man zusammenfassen koennte.
 *
 * GEMESSEN (27.08.2026, lokal, macOS/APFS):
 *   – dieser Fall unter VOLLER Suitenlast: 119 ms; einzeln 74 ms
 *   – zweiter Fall derselben Suite: 42 ms — der Rest der Datei liegt unter 30 ms
 *   – Faktor dieser Datei CI/lokal: 20 (PR #80, Lauf 33090214227)
 *   – Projektion: 119 ms × 20 = 2380 ms. Das reisst die 5 s heute NICHT, aber der
 *     Abstand ist nur 2,1-fach, und dieselbe Projektion lag bei PR #80 schon
 *     einmal zu niedrig (2462 ms projiziert, real ueber 5000 ms).
 *
 * ⛔ Die Zahl gilt NUR fuer diese Suite. Der globale `testTimeout` bleibt bei 5 s.
 */
describe("Punkt 5 — Leerzustand mit Ausweg", { timeout: 15_000 }, () => {
  it("nennt den Zustand und bietet den Knopf, der ihn beendet", async () => {
    const quelle = await markup();
    expect(quelle).toContain("Noch keine Freigabe angelegt");
    // Ohne Knopf waere die leere Seite eine Sackgasse, und `anlegenAction`
    // haette ausschliesslich auf `/shares/neu` einen Einstieg (§10.2).
    expect(quelle).toContain('href="/shares/neu"');
    expect(quelle).not.toContain("ant-table");
  });

  it("bietet den Knopf AUCH, wenn schon Freigaben da sind", async () => {
    await legeShare({ id: "sh-aaaaaaaa" });
    const quelle = await markup();
    expect(quelle).not.toContain("Noch keine Freigabe angelegt");
    // Sonst gaebe es ab der ersten Freigabe keinen Weg mehr zu einer zweiten:
    // die Modulnavigation kennt „Freigabe anlegen" nicht (`_lib/nav.ts`).
    expect(quelle).toContain('href="/shares/neu"');
  });
});

// ---------------------------------------------------------------------------
// Punkt 1, zweite Haelfte — gegen eine echte Datenbank
// ---------------------------------------------------------------------------

describe("die Uebersicht gegen eine echte, migrierte Datenbank", () => {
  beforeEach(async () => {
    await legeShare({
      id: "sh-alt00001",
      titel: "Übung Nord",
      passwordHash: HASH,
      maxDownloads: 10,
      downloadCount: 3,
      erstelltVon: PLATZHALTER,
      angelegtAt: JETZT,
    });
    await legeDatei({ id: "fi-alt00001", shareId: "sh-alt00001", groesse: 250_000_000 });
    await legeDatei({ id: "fi-alt00002", shareId: "sh-alt00001", groesse: 250_000_000 });

    await legeShare({
      id: "sh-neu00001",
      titel: "Lagekarte",
      typ: "file",
      passwordHash: null,
      maxDownloads: null,
      downloadCount: 7,
      erstelltVon: "sub-1",
      angelegtAt: VOR_EINEM_TAG,
    });
  });

  it("zeigt Passwortschutz als Ja/Nein und den Hash NIRGENDS", async () => {
    const quelle = await markup();
    /*
     * DIE ZUSICHERUNG DIESES TASKS, in einer Zeile: die Alt-App selektierte alle
     * Spalten, spreadete sie und uebergab sie an die Client-Komponente (Analyse
     * Falle 11). Ein `hatPasswort === true` allein waere hier wertlos — es gaebe
     * nichts zu lecken, weil `ladeUebersicht` den Hash nie holt. DIESE
     * Zusicherung faellt, sobald ihn irgendein Weg ins Markup traegt.
     */
    expect(quelle).not.toContain("$2b$");
    expect(quelle).not.toContain(HASH);
    expect(zeileAusMarkup(quelle, "sh-alt00001")).toContain("Ja");
    expect(zeileAusMarkup(quelle, "sh-neu00001")).toContain("Nein");
  });

  it("rechnet Menge, Groesze und Downloads aus den ZEILEN", async () => {
    const quelle = await markup();
    const alt = zeileAusMarkup(quelle, "sh-alt00001");
    // 2 × 250.000.000 Byte = 476,8 MiB — aus `share_files.size`, nicht aus
    // `shares.total_size` (das hier auf 0 steht und eine andere Zahl ergaebe).
    expect(alt).toContain("476,8 MiB");
    expect(alt).toContain("3 / 10");
    expect(zeileAusMarkup(quelle, "sh-neu00001")).toContain("7 / ∞");
  });

  /**
   * DER WEG Datenbank → Projektion → Markup, einmal geschlossen. Die Spalte
   * fuehrt SEKUNDEN (`mode: "timestamp"`), nicht Millisekunden wie im Modul
   * `qr` — ein Faktor 1000 an irgendeiner Stelle ergaebe hier kein leeres Feld,
   * sondern ein plausibel aussehendes Datum in einem falschen Jahr.
   *
   * NUR das Datum, ohne die Ergaenzung „— abgelaufen": React setzt im Serverbild
   * ein `<!-- -->` zwischen die beiden Textstuecke, ein zusammenhaengender
   * Vergleich ueber beide traefe nie.
   */
  it("traegt den Ablauf als deutschen Zeitpunkt bis ins Markup", async () => {
    const quelle = await markup();
    expect(zeileAusMarkup(quelle, "sh-alt00001")).toContain("31.07.2026, 14:00");
  });

  it("nennt den Altbestand beim Namen und den Rest bei seinem `sub`", async () => {
    const quelle = await markup();
    expect(zeileAusMarkup(quelle, "sh-alt00001")).toContain("Altbestand — nicht zuordenbar");
    expect(zeileAusMarkup(quelle, "sh-neu00001")).toContain("sub-1");
  });

  it("traegt den QR-Dateinamen aus dem entschaerften Titel", async () => {
    // Der Dialog ist erst nach einem Klick im Markup; der Name entsteht aber
    // schon hier — geprueft wird die Projektion aus derselben Datenbankzeile.
    const { ladeUebersicht } = await import("../_db/queries");
    const zeilen = await ladeUebersicht();
    const alt = zeilen.find((z) => z.id === "sh-alt00001");
    expect(zuZeile(alt!, JETZT).qrDateiname).toBe("_bung_Nord-qr.png");
  });
});

// ---------------------------------------------------------------------------
// Punkt 9 — Warten und Fehler
// ---------------------------------------------------------------------------

describe("Punkt 9 — Warte- und Fehlerzustand der Uebersicht", () => {
  /**
   * DER WARTEZUSTAND IST ERREICHBAR, nicht nur vorhanden: die Ueberschrift und
   * der Anlegen-Knopf stehen AUSSERHALB der `Suspense`-Grenze und sind sofort da,
   * die Zeilen kommen nach. Waere `SharesUebersicht` selbst die ladende
   * Komponente, waere das Skelett toter Kode — die Seite haette dann gar nichts
   * auszugeben, bis die Datenbank antwortet.
   */
  it("zeigt vor dem Eintreffen der Zeilen das Tabellen-Skelett", async () => {
    await legeShare({ id: "sh-aaaaaaaa" });
    const quelle = await wartemarkup();
    expect(quelle).toContain("files-uebersicht-skelett");
    expect(quelle).toContain("ant-skeleton");
    // Die Ueberschrift ist schon da — sonst waere die Wartezeit eine leere Seite.
    expect(quelle).toContain("Freigaben");
    expect(quelle).toContain('href="/shares/neu"');
    // Und die Zeilen sind es noch nicht.
    expect(quelle).not.toContain("data-row-key");
  });

  it("meldet einen Ladefehler als `type=\"warning\"` mit Wiederholen — nie als `error`", async () => {
    fehlerSchalter.an = true;
    const quelle = await markup();
    expect(quelle).toContain("ant-alert-warning");
    /*
     * `colorError === colorPrimary === #c8000f`: ein `type="error"` saehe auf
     * dieser Datenflaeche aus wie eine Primaeraktion
     * (`docs/design/README.md`, Falle 3).
     */
    expect(quelle).not.toContain("ant-alert-error");
    expect(quelle).toContain("Erneut versuchen");
    // Und der Fehler frisst die Seite nicht: die Ueberschrift bleibt stehen.
    expect(quelle).toContain("Freigaben");
  });
});

// ---------------------------------------------------------------------------
// Der Riegel am Ort der Daten
// ---------------------------------------------------------------------------

describe("die Rolle ist die zweite Linie", () => {
  it("laesst die Uebersicht auf der Inbox-Rolle nicht entstehen", async () => {
    /*
     * Diese Ansicht zeigt die Freigaben ALLER Mitglieder. Auf der Inbox-Domain
     * ist jede Anfrage anonym — `notFound()` und kein Wurf, weil das Modul die
     * Existenz einer Ansicht nirgends verraet (§3.5).
     */
    await expect(SharesUebersicht({ rolle: "inbox" })).rejects.toThrow();
  });
});
