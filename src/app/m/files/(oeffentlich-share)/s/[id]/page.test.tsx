import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

/**
 * DIE OEFFENTLICHE FREIGABE-ANSICHT `/s/<id>` — die Zustandsmatrix aus §10.1
 * und das serverseitige Passwort-Gate (Spec §7.4, §7.7; Plan T40).
 *
 * ═══ WAS DIESE DATEI BESITZT — UND WAS SIE STRUKTURELL NICHT KANN ════════════
 *
 * Sie besitzt die **Zustandsmatrix**: welcher Datenbankstand welchen benannten
 * Text, welche Zeilenzustaende und welche Einstiegspunkte ergibt — und die
 * Zusage „`<meta http-equiv="refresh">` steht GENAU DANN im Markup, wenn
 * mindestens eine Datei `scanning` ist".
 *
 * Sie kann die Zusage „vor dem Entsperren steht im ROHEN HTTP-BODY kein
 * Dateiname" NICHT besitzen: unter Vitest ist `"use client"` ein wirkungsloser
 * String, es entsteht kein RSC-Payload, und ein Baum, den die echte Seite als
 * Client-Referenz uebertruege, rendert hier einfach mit. Was hier geprueft wird,
 * ist die STRUKTUR (die Seite ruft die Dateiliste im Passwortfall gar nicht
 * erst ab, also steht sie in keinem Markup); die WIRKUNG im echten Payload
 * gehoert `e2e/files-fileshare.spec.ts` (Analyse Falle 12, §11.5).
 *
 * Ebenso wenig besitzt sie die WIRKUNG des `<meta refresh>` — dass React ihn in
 * den `<head>` hebt und der Browser tatsaechlich nachlaedt, sieht nur ein
 * echter Abruf. Hier steht die ANWESENHEIT im gerenderten Markup.
 *
 * ═══ DER PRUEFSTAND ══════════════════════════════════════════════════════════
 *
 * Echte, migrierte Datei-Datenbank und echte Ablage (Muster aus
 * `_db/queries.test.ts`): die Pruefkette liest SEKUNDEN-Zeitstempel
 * (`mode: "timestamp"`) und probiert Blobs auf dem Dateisystem. Gegen ein Mock
 * waere beides gruen, ohne zu gelten.
 *
 * `notFound()` WIRFT hier mit sprechender Meldung — bliebe der nackte 404
 * stehen, soll der Test das sagen und nicht schweigen.
 */

const DIR = "./.data/files-s-seite-test";

/** `istCookieGueltig` signiert mit `AUTH_SECRET` und WIRFT ohne. */
const GEHEIMNIS = "s-seite-test-geheimnis-lang-genug";

const SEK = 1000;
const TAG = 24 * 60 * 60 * SEK;

/** Feste Uhr: die Spalten fuehren SEKUNDEN, eine laufende Uhr waere ein
 *  Flackerwerk — und ein Faktor-1000-Fehler faellt gegen eine feste Uhr auf. */
const JETZT = new Date(1_800_000_000 * SEK);

/** Die Vorschau-Grenze dieses Pruefstands: klein genug, dass eine Vorrichtung
 *  sie ueberschreiten kann, ohne Megabytes zu schreiben. */
const VORSCHAU_MAX_BYTES = 64;

const { notFoundMock, cookieGetMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("notFound(): nackter 404 statt eines benannten Zustands");
  }),
  cookieGetMock: vi.fn<(name: string) => { value: string } | undefined>(() => undefined),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: cookieGetMock }),
}));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  process.env.AUTH_SECRET = GEHEIMNIS;
  // Die drei Pflichtzahlen aus §9.3; ohne sie wirft `grenzen()` und die Seite
  // scheiterte aus dem falschen Grund.
  process.env.FILES_MAX_DATEI_BYTES = "12582912";
  process.env.FILES_AV_MAX_BYTES = "12582912";
  process.env.FILES_MAX_ABLAUF_TAGE = "7";
  process.env.FILES_VORSCHAU_MAX_BYTES = String(VORSCHAU_MAX_BYTES);
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  cookieGetMock.mockReset();
  cookieGetMock.mockReturnValue(undefined);
  notFoundMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
});

// ---------------------------------------------------------------------------
// Vorrichtungen. Geschrieben wird ueber Drizzle, NICHT ueber rohes SQL mit
// `Date.now()`: `mode: "timestamp"` schreibt SEKUNDEN, ein Millisekundenwert
// saehe in der Ablaufstufe richtig aus und waere um den Faktor 1000 daneben.
// ---------------------------------------------------------------------------

type ShareVorgabe = {
  id: string;
  titel?: string;
  beschreibung?: string | null;
  ablaufAt?: Date;
  maxDownloads?: number | null;
  downloadCount?: number;
  passwort?: string | null;
};

async function legeShare(vorgabe: ShareVorgabe) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shares } = await import("@/app/m/files/_db/schema");
  const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
  getDb()
    .insert(shares)
    .values({
      id: vorgabe.id,
      title: vorgabe.titel ?? "Übung Nord",
      description: vorgabe.beschreibung ?? null,
      type: "folder",
      expiresAt: vorgabe.ablaufAt ?? new Date(JETZT.getTime() + 7 * TAG),
      maxDownloads: vorgabe.maxDownloads ?? null,
      downloadCount: vorgabe.downloadCount ?? 0,
      passwordHash: vorgabe.passwort ? bcryptHash(vorgabe.passwort) : null,
      totalSize: 0,
      createdAt: JETZT,
      createdBy: "sub-1",
    })
    .run();
}

type DateiVorgabe = {
  id: string;
  shareId: string;
  dateiname?: string;
  mimeType?: string;
  bytes?: number;
  avStatus?: "scanning" | "clean" | "infected" | "error" | "unscanned";
  vollstaendig?: boolean;
  /** false = Zeile vollstaendig, aber KEIN Blob auf der Platte („nicht
   *  auffindbar"). */
  mitBlob?: boolean;
};

async function legeDatei(vorgabe: DateiVorgabe) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shareFiles } = await import("@/app/m/files/_db/schema");
  const vollstaendig = vorgabe.vollstaendig ?? true;
  const inhalt = Buffer.from("x".repeat(vorgabe.bytes ?? 7), "utf8");

  getDb()
    .insert(shareFiles)
    .values({
      id: vorgabe.id,
      shareId: vorgabe.shareId,
      filename: vorgabe.dateiname ?? "bericht.pdf",
      mimeType: vorgabe.mimeType ?? "application/pdf",
      size: inhalt.byteLength,
      createdAt: JETZT,
      bytesVollstaendigAt: vollstaendig ? JETZT : null,
      avStatus: vorgabe.avStatus ?? "clean",
      avGeprueftAt: vorgabe.avStatus === "scanning" ? null : JETZT,
    })
    .run();

  if (vorgabe.mitBlob ?? vollstaendig) {
    const { schreibeStrom, abschliesse } = await import("@/app/m/files/_lib/storage");
    const ziel = { art: "share", shareId: vorgabe.shareId, fileId: vorgabe.id } as const;
    async function* quelle() {
      yield new Uint8Array(inhalt);
    }
    await schreibeStrom(ziel, quelle(), { maxBytes: 1024 * 1024 });
    await abschliesse(ziel);
  }
}

/** Setzt den Cookie-Leser auf ein GUELTIGES Entsperr-Cookie dieses Shares. */
async function entsperre(shareId: string, ablauf = new Date(JETZT.getTime() + 7 * TAG)) {
  const { erzeugeShareCookie } = await import("@/app/m/files/_lib/passwort");
  const vorlage = erzeugeShareCookie(shareId, ablauf, JETZT);
  if (!vorlage) throw new Error("Vorrichtung: kein Cookie für einen abgelaufenen Share");
  cookieGetMock.mockImplementation((name: string) =>
    name === vorlage.name ? { value: vorlage.value } : undefined,
  );
}

async function markup(shareId: string): Promise<string> {
  const seite = (await import("./page")).default;
  const baum = await seite({ params: Promise.resolve({ id: shareId }) });
  return renderToStaticMarkup(baum);
}

/** Der `<meta http-equiv="refresh">` — die Schreibweise, die React ausgibt. */
function hatRefresh(html: string): boolean {
  return /http-equiv="refresh"/i.test(html);
}

// ---------------------------------------------------------------------------

describe("Zustandsmatrix §10.1 — die Wege, die kein Inhalt sind", () => {
  it("unbekannte ID → notFound(), kein 200 mit leerer Seite", async () => {
    await expect(markup("sh00000000")).rejects.toThrow(/notFound/);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("abgelaufen → HTTP 200 mit benanntem Zustand, NICHT notFound()", async () => {
    await legeShare({
      id: "shAblauf01",
      titel: "Lagebericht Nord",
      ablaufAt: new Date(JETZT.getTime() - SEK),
    });
    await legeDatei({ id: "fi00000001", shareId: "shAblauf01", dateiname: "geheim-nord.pdf" });

    const html = await markup("shAblauf01");
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(html).toContain("abgelaufen");
    // Der Titel darf, die Dateiliste nicht — sonst waere die Zustandsseite ein
    // Inhaltsverzeichnis fuer einen Link, der nicht mehr gilt.
    expect(html).toContain("Lagebericht Nord");
    expect(html).not.toContain("geheim-nord.pdf");
    expect(hatRefresh(html)).toBe(false);
  });

  it("Limit erreicht → HTTP 200 mit benanntem Zustand, ohne Dateiliste", async () => {
    await legeShare({
      id: "shLimit001",
      titel: "Fotos Einsatz",
      maxDownloads: 3,
      downloadCount: 3,
    });
    await legeDatei({ id: "fi00000002", shareId: "shLimit001", dateiname: "geheim-limit.pdf" });

    const html = await markup("shLimit001");
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(html).toContain("Die zulässige Zahl an Downloads ist erreicht");
    expect(html).not.toContain("geheim-limit.pdf");
  });

  it("`max_downloads = 0` ist erschöpft, nicht unbegrenzt", async () => {
    await legeShare({ id: "shNull0001", maxDownloads: 0, downloadCount: 0 });
    await legeDatei({ id: "fi00000003", shareId: "shNull0001", dateiname: "geheim-null.pdf" });

    const html = await markup("shNull0001");
    expect(html).toContain("Die zulässige Zahl an Downloads ist erreicht");
    expect(html).not.toContain("geheim-null.pdf");
  });
});

describe("Das serverseitige Passwort-Gate (§7.4)", () => {
  const ID = "shPasswort";

  beforeEach(async () => {
    await legeShare({
      id: ID,
      titel: "Vertrauliche Übergabe",
      beschreibung: "Bitte nur intern weitergeben",
      passwort: "geheimes-passwort",
    });
    await legeDatei({
      id: "fiGeheim01",
      shareId: ID,
      dateiname: "einsatzprotokoll-2026.pdf",
      bytes: 12,
    });
  });

  it("ohne Cookie: NUR die Maske — kein Dateiname, keine Datei-ID, keine Größe, keine Beschreibung", async () => {
    const html = await markup(ID);

    // Titel, Hinweis, Feld, Knopf — und sonst nichts (§7.4).
    expect(html).toContain("Vertrauliche Übergabe");
    expect(html).toContain('type="password"');

    expect(html).not.toContain("einsatzprotokoll-2026.pdf");
    expect(html).not.toContain("fiGeheim01");
    expect(html).not.toContain("Bitte nur intern weitergeben");
    // Auch die GROESSE nicht (§7.4 nennt sie ausdruecklich): sie verraet, wie
    // viel hinter der Maske liegt, und ist die Angabe, die beim Weglassen der
    // Dateiliste am ehesten als „harmlos" stehen bliebe.
    expect(html).not.toContain("12 Byte");
    // Weder Download- noch Vorschau- noch ZIP-Weg im Markup.
    expect(html).not.toContain("/api/download/");
    expect(html).not.toContain("/api/preview/");
    // Und kein bcrypt-Hash: `password_hash` ueberquert die Grenze nicht.
    expect(html).not.toContain("$2b$");
  });

  it("mit gültigem Cookie: derselbe Aufruf zeigt Liste, Beschreibung und Download-Weg", async () => {
    await entsperre(ID);
    const html = await markup(ID);

    expect(html).toContain("einsatzprotokoll-2026.pdf");
    expect(html).toContain("Bitte nur intern weitergeben");
    expect(html).toContain(`/api/download/${ID}?file=fiGeheim01`);
    expect(html).not.toContain('type="password"');
  });

  it("ein Cookie eines ANDEREN Shares entsperrt nicht", async () => {
    await legeShare({ id: "shFremd001", passwort: "anderes-passwort" });
    // Der Wert ist echt — nur fuer den falschen Share signiert. Der Cookie-NAME
    // ist der erwartete: den waehlt der Client, nicht der Server.
    const { erzeugeShareCookie, cookieName } = await import("@/app/m/files/_lib/passwort");
    const fremd = erzeugeShareCookie("shFremd001", new Date(JETZT.getTime() + 7 * TAG), JETZT)!;
    cookieGetMock.mockImplementation((name: string) =>
      name === cookieName(ID) ? { value: fremd.value } : undefined,
    );

    const html = await markup(ID);
    expect(html).toContain('type="password"');
    expect(html).not.toContain("einsatzprotokoll-2026.pdf");
  });
});

describe("Zeilenzustände statt Seitenzustand (§7.4)", () => {
  it("alle Dateien unvollständig → benannter Leerzustand, kein Refresh", async () => {
    await legeShare({ id: "shLeer0001" });
    await legeDatei({ id: "fi00000010", shareId: "shLeer0001", vollstaendig: false });

    const html = await markup("shLeer0001");
    expect(html).toContain("Diese Freigabe enthält noch keine übertragene Datei");
    // Eine Zeile OHNE Bytes ist beim Scanner nie angekommen — sie darf keine
    // Selbstaktualisierung ausloesen (sonst laedt die Seite fuer immer nach).
    expect(hatRefresh(html)).toBe(false);
  });

  it("Share ganz ohne Zeilen → derselbe Leerzustand", async () => {
    await legeShare({ id: "shOhne0001" });
    const html = await markup("shOhne0001");
    expect(html).toContain("Diese Freigabe enthält noch keine übertragene Datei");
  });

  it("Blob fehlt → die Zeile trägt „nicht auffindbar\" STATT einer Größe und keinen Download-Weg", async () => {
    await legeShare({ id: "shBlob0001" });
    await legeDatei({
      id: "fiOhneBlob",
      shareId: "shBlob0001",
      dateiname: "verschwunden.pdf",
      bytes: 4096,
      mitBlob: false,
    });

    const html = await markup("shBlob0001");
    expect(html).toContain("verschwunden.pdf");
    expect(html).toContain("nicht auffindbar");
    // Weder die Zeilengroesse noch ein Downloadweg: die Zahl waere eine
    // Zusicherung ueber Bytes, die es nicht gibt.
    expect(html).not.toContain("4,0 KiB");
    expect(html).not.toContain("/api/download/shBlob0001?file=fiOhneBlob");
  });

  it("gemischt: eine freigegebene und eine geprüfte Zeile — beide sichtbar, freigegebene sofort ladbar", async () => {
    await legeShare({ id: "shGemisch1" });
    await legeDatei({ id: "fiFrei0001", shareId: "shGemisch1", dateiname: "fertig.pdf" });
    await legeDatei({
      id: "fiWartet01",
      shareId: "shGemisch1",
      dateiname: "wartet.pdf",
      avStatus: "scanning",
    });

    const html = await markup("shGemisch1");
    expect(html).toContain("fertig.pdf");
    expect(html).toContain("wartet.pdf");
    expect(html).toContain("/api/download/shGemisch1?file=fiFrei0001");
    expect(html).not.toContain("/api/download/shGemisch1?file=fiWartet01");
    expect(html).toContain("wird geprüft");
    expect(hatRefresh(html)).toBe(true);
  });

  it("`infected` trägt einen benannten Zustand — und keinen roten Tag, kein Download-Weg", async () => {
    await legeShare({ id: "shInfiz001" });
    await legeDatei({
      id: "fiInfiz001",
      shareId: "shInfiz001",
      dateiname: "makro.docx",
      avStatus: "infected",
    });

    const html = await markup("shInfiz001");
    expect(html).toContain("makro.docx");
    expect(html).toContain("gesperrt");
    expect(html).toContain("Bitte wenden Sie sich an die Person, die Ihnen den Link gegeben hat");
    expect(html).not.toContain("/api/download/shInfiz001?file=fiInfiz001");
  });
});

describe("`<meta http-equiv=\"refresh\">` — GENAU DANN, wenn mindestens eine Datei `scanning` ist", () => {
  const faelle: { name: string; avStatus: DateiVorgabe["avStatus"]; erwartet: boolean }[] = [
    { name: "scanning", avStatus: "scanning", erwartet: true },
    { name: "clean", avStatus: "clean", erwartet: false },
    // Die beiden Endzustaende: ohne diese Festlegung laedt eine Seite mit einer
    // dauerhaft fehlgeschlagenen Datei alle 5 s nach — fuer immer, auf einem
    // fremden Handy.
    { name: "error", avStatus: "error", erwartet: false },
    { name: "infected", avStatus: "infected", erwartet: false },
    { name: "unscanned", avStatus: "unscanned", erwartet: false },
  ];

  for (const fall of faelle) {
    it(`${fall.name} → Refresh ${fall.erwartet ? "steht im Markup" : "steht NICHT im Markup"}`, async () => {
      const id = `shRef${fall.name.slice(0, 5).padEnd(5, "0")}`;
      await legeShare({ id });
      await legeDatei({ id: "fi00000020", shareId: id, avStatus: fall.avStatus });

      expect(hatRefresh(await markup(id))).toBe(fall.erwartet);
    });
  }

  it("`error` NEBEN `scanning` hebt den Refresh nicht auf — die Wartende zählt", async () => {
    await legeShare({ id: "shRefMix01" });
    await legeDatei({ id: "fi00000021", shareId: "shRefMix01", avStatus: "error" });
    await legeDatei({ id: "fi00000022", shareId: "shRefMix01", avStatus: "scanning" });

    expect(hatRefresh(await markup("shRefMix01"))).toBe(true);
  });

  it("hinter der Passwortmaske steht KEIN Refresh, auch wenn eine Datei `scanning` ist", async () => {
    await legeShare({ id: "shRefPass1", passwort: "geheimes-passwort" });
    await legeDatei({ id: "fi00000023", shareId: "shRefPass1", avStatus: "scanning" });

    // Der Refresh wuerde sonst verraten, dass hinter der Maske etwas geprueft
    // wird — und die Maske alle 5 s neu laden, waehrend jemand tippt.
    expect(hatRefresh(await markup("shRefPass1"))).toBe(false);
  });
});

describe("Der ganzseitige Wartezustand — genau ein Fall", () => {
  it("keine Datei freigegeben und eine `scanning` → ganzseitiges Warten", async () => {
    await legeShare({ id: "shWarten01" });
    await legeDatei({
      id: "fiWarten01",
      shareId: "shWarten01",
      dateiname: "unterwegs.pdf",
      avStatus: "scanning",
    });

    const html = await markup("shWarten01");
    expect(html).toContain("Die Dateien werden gerade geprüft");
    expect(hatRefresh(html)).toBe(true);
    // Kein Dateiname: es gibt nichts zu zeigen ausser dem Warten.
    expect(html).not.toContain("unterwegs.pdf");
  });

  it("eine freigegebene Zeile ohne Blob NEBEN einer `scanning` → Zeilenliste, KEIN ganzseitiges Warten", async () => {
    /*
     * DER FALL, DER DIE BEIDEN PRAEDIKATE TRENNT. Eine `clean`-Zeile ohne Blob
     * ist `freigegeben`, aber nicht `ladbar` — sie hat etwas zu sagen („nicht
     * auffindbar"). Waere das Praedikat `anzahlLadbar === 0`, verschwaende diese
     * Auskunft hinter einer ganzseitigen Wartemeldung, und der Empfaenger
     * wartete auf etwas, das nie kommt.
     */
    await legeShare({ id: "shTrenn001" });
    await legeDatei({
      id: "fiOhneBlo2",
      shareId: "shTrenn001",
      dateiname: "verschwunden.pdf",
      mitBlob: false,
    });
    await legeDatei({
      id: "fiWarten02",
      shareId: "shTrenn001",
      dateiname: "unterwegs.pdf",
      avStatus: "scanning",
    });

    const html = await markup("shTrenn001");
    expect(html).not.toContain("Die Dateien werden gerade geprüft");
    expect(html).toContain("verschwunden.pdf");
    expect(html).toContain("nicht auffindbar");
    expect(html).toContain("unterwegs.pdf");
    expect(hatRefresh(html)).toBe(true);
  });

  it("nur Endzustände, nichts freigegeben → KEIN ganzseitiges Warten (es wird nichts mehr geprüft)", async () => {
    await legeShare({ id: "shEnde0001" });
    await legeDatei({
      id: "fiFehler01",
      shareId: "shEnde0001",
      dateiname: "kaputt.pdf",
      avStatus: "error",
    });

    const html = await markup("shEnde0001");
    expect(html).not.toContain("Die Dateien werden gerade geprüft");
    expect(html).toContain("kaputt.pdf");
    expect(html).toContain("Prüfung nicht möglich");
    expect(hatRefresh(html)).toBe(false);
  });
});

describe("Vorschau, ZIP und die Einstiegspunkte (§7.7, §10.2)", () => {
  it("vorschaufähig und klein → Vorschau-Weg UND Download-Weg", async () => {
    await legeShare({ id: "shVorsch01" });
    await legeDatei({
      id: "fiBild0001",
      shareId: "shVorsch01",
      dateiname: "lage.png",
      mimeType: "image/png",
      bytes: VORSCHAU_MAX_BYTES - 1,
    });

    const html = await markup("shVorsch01");
    expect(html).toContain(`/api/preview/shVorsch01?file=fiBild0001`);
    expect(html).toContain(`/api/download/shVorsch01?file=fiBild0001`);
    expect(html).not.toContain("Zu groß für die Vorschau");
  });

  it("vorschaufähig, aber über `FILES_VORSCHAU_MAX_BYTES` → benannter Zustand PLUS Download-Knopf", async () => {
    /*
     * DIE OBERFLAECHEN-HAELFTE VON §7.7. T51 setzt die Grenze im Handler durch;
     * ohne diese Haelfte ist der Zustand nirgends sichtbar, und der
     * Vorschau-Knopf liefe in eine Fehlerantwort (§10.2: Oberflaeche und Riegel
     * wenden DASSELBE Praedikat an — hier woertlich dieselbe Funktion).
     */
    await legeShare({ id: "shVorsch02" });
    await legeDatei({
      id: "fiBild0002",
      shareId: "shVorsch02",
      dateiname: "grossaufnahme.png",
      mimeType: "image/png",
      bytes: VORSCHAU_MAX_BYTES + 1,
    });

    const html = await markup("shVorsch02");
    expect(html).toContain("Zu groß für die Vorschau");
    expect(html).not.toContain("/api/preview/shVorsch02?file=fiBild0002");
    expect(html).toContain("/api/download/shVorsch02?file=fiBild0002");
  });

  it("Text bleibt vorschaufähig, auch über der Grenze — er wird gekappt, nicht abgelehnt", async () => {
    await legeShare({ id: "shVorsch03" });
    await legeDatei({
      id: "fiText0001",
      shareId: "shVorsch03",
      dateiname: "notiz.txt",
      mimeType: "text/plain",
      bytes: VORSCHAU_MAX_BYTES + 100,
    });

    const html = await markup("shVorsch03");
    expect(html).toContain("/api/preview/shVorsch03?file=fiText0001");
    expect(html).not.toContain("Zu groß für die Vorschau");
  });

  it("nicht vorschaufähiger Typ → nur der Download-Weg, kein Vorschau-Weg und kein „zu groß\"", async () => {
    await legeShare({ id: "shVorsch04" });
    await legeDatei({
      id: "fiDocx0001",
      shareId: "shVorsch04",
      dateiname: "bericht.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const html = await markup("shVorsch04");
    expect(html).not.toContain("/api/preview/shVorsch04");
    expect(html).not.toContain("Zu groß für die Vorschau");
    expect(html).toContain("/api/download/shVorsch04?file=fiDocx0001");
  });

  it("mindestens eine ladbare Datei → der ZIP-Weg steht da", async () => {
    await legeShare({ id: "shZip00001" });
    await legeDatei({ id: "fiZip00001", shareId: "shZip00001", dateiname: "a.pdf" });
    await legeDatei({ id: "fiZip00002", shareId: "shZip00001", dateiname: "b.pdf" });

    expect(await markup("shZip00001")).toContain("/api/download/shZip00001/zip");
  });

  it("keine ladbare Datei → KEIN ZIP-Weg (ein Einstiegspunkt in eine Fehlerantwort wäre eine Sackgasse)", async () => {
    await legeShare({ id: "shZip00002" });
    await legeDatei({
      id: "fiZip00003",
      shareId: "shZip00002",
      dateiname: "gesperrt.pdf",
      avStatus: "infected",
    });

    expect(await markup("shZip00002")).not.toContain("/api/download/shZip00002/zip");
  });
});

describe("Die öffentliche Ansicht ist eine Sackgasse (§7.4, letzter Punkt)", () => {
  it("verlinkt nirgends in die Verwaltung und trägt kein „Zurück\"", async () => {
    await legeShare({ id: "shSack0001" });
    await legeDatei({ id: "fiSack0001", shareId: "shSack0001" });

    const html = await markup("shSack0001");
    for (const verboten of ['href="/"', 'href="/shares', 'href="/zugangslinks', "Zurück"]) {
      expect(html, `Die oeffentliche Ansicht darf ${verboten} nicht tragen`).not.toContain(verboten);
    }
  });
});

describe("Quelltext-Zusicherungen der Seite", () => {
  /**
   * Der Quelltext OHNE Kommentare. Diese Datei verbietet unten Schreibweisen,
   * die in einer BEGRUENDUNG genau richtig stehen („warum hier NICHT
   * `cookieName(...)`") — ein Scan ueber den rohen Text bestrafte das
   * Aufschreiben des Grundes und triebe ihn aus der Datei heraus.
   *
   * Bewusst schlicht: das Modul fuehrt keine Zeichenkette, die `//` oder `/*`
   * enthaelt, also braucht es hier keinen Parser.
   */
  async function quelltextOhneKommentare(): Promise<string> {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const roh = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
    return roh.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  }

  it("importiert `vorschauZustand` aus dem Vorschau-Handler statt die Regel nachzubauen", async () => {
    const quelle = await quelltextOhneKommentare();

    expect(quelle).toMatch(/vorschauZustand/);
    // Eine eigene Typliste oder ein eigener Groessenvergleich waere die Drift,
    // die §10.2 verbietet.
    expect(quelle).not.toMatch(/image\/(jpeg|png|webp)/);
    expect(quelle).not.toMatch(/vorschauMaxBytes\s*[<>]/);
  });

  it("baut den Cookie-Namen nicht selbst — `cookieName` würde bei Unrat in der URL werfen (HTTP 500 statt 404)", async () => {
    expect(await quelltextOhneKommentare()).not.toMatch(/\bcookieName\s*\(/);
  });

  it("zählt nichts hoch — kein `UPDATE`, kein Zähler, kein Log auf dem Renderweg (§7.5)", async () => {
    const quelle = await quelltextOhneKommentare();

    // Das verbrauchende `UPDATE` laeuft ausschliesslich in `download` und
    // `zip`. Beim Rendern waere ein Share mit `max_downloads = 3` nach drei
    // fremden Seitenaufrufen tot — das serverseitige Gate still ausgehebelt.
    for (const verboten of ["zaehler", "update(", "protokolliere"]) {
      expect(quelle, `\`${verboten}\` gehoert nicht auf den Renderweg`).not.toContain(verboten);
    }
  });
});
