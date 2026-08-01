import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

/*
 * Gegen eine echte, migrierte Datei-DB und eine echte Ablage — nicht gegen ein
 * Mock. Die Prüfkette liest Sekunden-Zeitstempel (`mode: "timestamp"`) und
 * probiert Blobs auf dem Dateisystem; beides ist gegen ein Mock grün, ohne zu
 * gelten.
 *
 * Muster übernommen aus `qr/_lib/presets.test.ts`: DATA_DIR setzen, migrieren,
 * `globalThis.__suiteDb` verwerfen (`getModuleDb` hält die Verbindung global
 * fest und zeigte sonst auf die gelöschte Datei weiter), und den Code unter Test
 * je Test DYNAMISCH importieren, damit er diese DATA_DIR sieht.
 */
const DIR = "./.data/files-queries-test";

/** `istCookieGueltig` signiert mit `AUTH_SECRET` und WIRFT ohne — ein Test mit
 *  gültigem Cookie flöge sonst, statt eine Prüfstufe zu liefern. */
const GEHEIMNIS = "queries-test-geheimnis-lang-genug";

const SEK = 1000;
const TAG = 24 * 60 * 60 * SEK;

/** Feste Uhr: die Spalten führen SEKUNDEN, eine laufende Uhr wäre ein Flackerwerk. */
const JETZT = new Date(1_800_000_000 * SEK);

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  process.env.AUTH_SECRET = GEHEIMNIS;
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

// ---------------------------------------------------------------------------
// Vorrichtungen. Geschrieben wird über Drizzle, NICHT über rohes SQL mit
// `Date.now()`: `mode: "timestamp"` schreibt Sekunden, ein Millisekundenwert
// sähe in der Ablaufstufe richtig aus und wäre um den Faktor 1000 daneben —
// laut `schema.ts:4-13` der wahrscheinlichste Fehler dieses Moduls.
// ---------------------------------------------------------------------------

type ShareVorgabe = {
  id: string;
  titel?: string;
  beschreibung?: string | null;
  ablaufAt?: Date;
  maxDownloads?: number | null;
  downloadCount?: number;
  passwordHash?: string | null;
  totalSize?: number;
  erstelltVon?: string;
};

async function legeShare(vorgabe: ShareVorgabe) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shares } = await import("@/app/m/files/_db/schema");
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
      passwordHash: vorgabe.passwordHash ?? null,
      totalSize: vorgabe.totalSize ?? 0,
      createdAt: JETZT,
      createdBy: vorgabe.erstelltVon ?? "sub-1",
    })
    .run();
}

type DateiVorgabe = {
  id: string;
  shareId: string;
  dateiname?: string;
  mimeType?: string;
  groesse?: number;
  avStatus?: "scanning" | "clean" | "infected" | "error" | "unscanned";
  vollstaendig?: boolean;
  /** false = Zeile ohne Bytes auf dem Dateisystem (Waise in die andere Richtung). */
  mitBlob?: boolean;
};

async function legeDatei(vorgabe: DateiVorgabe) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shareFiles } = await import("@/app/m/files/_db/schema");
  const vollstaendig = vorgabe.vollstaendig ?? true;
  const inhalt = Buffer.from("x".repeat(vorgabe.groesse ?? 7), "utf8");

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
    await schreibeStrom(ziel, quelle(), { maxBytes: 1024 });
    await abschliesse(ziel);
  }
}

async function legeLogzeile(shareId: string, dateiId: string | null, verschiebungMs: number) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { downloadLogs } = await import("@/app/m/files/_db/schema");
  getDb()
    .insert(downloadLogs)
    .values({
      shareId,
      fileId: dateiId,
      clientIpUnbestaetigt: "203.0.113.0",
      userAgent: "curl/8",
      downloadedAt: new Date(JETZT.getTime() + verschiebungMs),
    })
    .run();
}

/** Ein Cookie-LESER, nicht ein Cookie-Wert: die Ladefunktion bildet den Namen
 *  erst nach der Existenzstufe (sonst wirft `cookieName` bei Unrat in der URL). */
async function gueltigerLeser(shareId: string, ablauf: Date) {
  const { erzeugeShareCookie } = await import("@/app/m/files/_lib/passwort");
  const vorlage = erzeugeShareCookie(shareId, ablauf, JETZT);
  if (!vorlage) throw new Error("Vorrichtung: kein Cookie für einen abgelaufenen Share");
  return (name: string) => (name === vorlage.name ? vorlage.value : undefined);
}

async function hashe(passwort: string) {
  const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
  return bcryptHash(passwort);
}

async function lade(anfrage: {
  shareId: string;
  dateiId?: string | null;
  cookieLeser?: (name: string) => string | undefined;
  jetzt?: Date;
}) {
  const { ladeShare } = await import("@/app/m/files/_db/queries");
  return ladeShare({ jetzt: JETZT, ...anfrage });
}

async function downloadZaehler(shareId: string): Promise<number> {
  const sqlite = new Database(`${DIR}/files.db`, { readonly: true });
  const zeile = sqlite.prepare("SELECT download_count AS n FROM shares WHERE id = ?").get(shareId) as
    | { n: number }
    | undefined;
  sqlite.close();
  return zeile?.n ?? -1;
}

/** Läuft REKURSIV über alle Werte einer Projektion. Ein `$2b$`-Hash in einem
 *  verschachtelten Objekt (Dateiliste!) wäre einer flachen Prüfung entgangen. */
function werteTief(wert: unknown, gefunden: string[] = []): string[] {
  if (typeof wert === "string") gefunden.push(wert);
  else if (Array.isArray(wert)) for (const w of wert) werteTief(w, gefunden);
  else if (wert && typeof wert === "object" && !(wert instanceof Date))
    for (const w of Object.values(wert)) werteTief(w, gefunden);
  return gefunden;
}

// ---------------------------------------------------------------------------

describe("ladeShare — die EINE Prüfkette, in EINER Reihenfolge (§7.4)", () => {
  it("Stufe 1 Existenz: unbekannte ID → unbekannt", async () => {
    expect(await lade({ shareId: "sh00000001" })).toEqual({ zustand: "unbekannt" });
  });

  it("Stufe 1 Existenz: Unrat als ID wirft nicht, sondern ist unbekannt", async () => {
    // `cookieName()` WIRFT bei einer ID, die kein Cookie-Name wäre
    // (`passwort.ts:77-84`). Bildete die Kette den Namen VOR der Existenzstufe,
    // wäre `/s/<unrat>` HTTP 500 statt der 404-Seite der Suite.
    const ergebnis = await lade({ shareId: "../../etc/passwd; drop" });
    expect(ergebnis).toEqual({ zustand: "unbekannt" });
  });

  it("Stufe 2 Ablauf: abgelaufener Share → abgelaufen, mit Titel und ohne Inhalt", async () => {
    await legeShare({
      id: "sh00000001",
      titel: "Lagebericht",
      beschreibung: "Nur für den Zugführer",
      ablaufAt: new Date(JETZT.getTime() - SEK),
    });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", dateiname: "lage.pdf" });
    const ergebnis = await lade({ shareId: "sh00000001" });
    // Der Titel macht die Zustandsseite nicht namenlos; alles andere bleibt
    // draußen — auch aus dem RSC-Payload.
    expect(ergebnis).toEqual({ zustand: "abgelaufen", titel: "Lagebericht" });
    expect(werteTief(ergebnis)).not.toContain("lage.pdf");
  });

  it("Ablauf: Gleichstand auf die Sekunde gilt als abgelaufen", async () => {
    // `expires_at` bezeichnet das Ende der Laufzeit, nicht den letzten gültigen
    // Augenblick — und die Spalte führt SEKUNDEN, der Gleichstand ist also ein
    // realer Fall, nicht ein Millisekunden-Zufall.
    await legeShare({ id: "sh00000001", ablaufAt: JETZT });
    expect((await lade({ shareId: "sh00000001" })).zustand).toBe("abgelaufen");
  });

  it("Stufe 3 Passwort: gesetzter Hash ohne Cookie → passwortNoetig, MIT Titel und OHNE Beschreibung", async () => {
    await legeShare({
      id: "sh00000001",
      titel: "Lagebericht",
      beschreibung: "Nur für den Zugführer",
      passwordHash: await hashe("geheim"),
    });
    const ergebnis = await lade({ shareId: "sh00000001" });
    expect(ergebnis).toEqual({ zustand: "passwortNoetig", titel: "Lagebericht" });
    // §7.4: die Maske zeigt Titel, Hinweis, Feld, Knopf — KEINE Beschreibung.
    expect(werteTief(ergebnis)).not.toContain("Nur für den Zugführer");
  });

  it("Stufe 3 Passwort: gültiges Cookie lässt durch", async () => {
    const ablauf = new Date(JETZT.getTime() + 7 * TAG);
    await legeShare({ id: "sh00000001", ablaufAt: ablauf, passwordHash: await hashe("geheim") });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    const ergebnis = await lade({
      shareId: "sh00000001",
      cookieLeser: await gueltigerLeser("sh00000001", ablauf),
    });
    expect(ergebnis.zustand).toBe("offen");
  });

  it("Stufe 4 AV: gewählte Datei nicht clean → gesperrt, mit dem Status", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: "infected" });
    expect(await lade({ shareId: "sh00000001", dateiId: "fi00000001" })).toEqual({
      zustand: "gesperrt",
      avStatus: "infected",
    });
  });

  it("Stufe 5 Limit: download_count >= max_downloads → limitErreicht, mit Titel und ohne Inhalt", async () => {
    await legeShare({
      id: "sh00000001",
      titel: "Lagebericht",
      maxDownloads: 2,
      downloadCount: 2,
    });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", dateiname: "lage.pdf" });
    const ergebnis = await lade({ shareId: "sh00000001" });
    expect(ergebnis).toEqual({ zustand: "limitErreicht", titel: "Lagebericht" });
    expect(werteTief(ergebnis)).not.toContain("lage.pdf");
  });

  it("Stufe 5 Limit: max_downloads = 0 ist ERSCHÖPFT, nicht unbegrenzt", async () => {
    // Alt: `maxDownloads || null` machte aus „0 Downloads" still einen
    // unbegrenzten Share (`init/route.ts:59`). Auf der LESESEITE ist der Fehler
    // `maxDownloads || Infinity` — dieselbe Klasse, dieselbe Wirkung.
    await legeShare({ id: "sh00000001", maxDownloads: 0, downloadCount: 0 });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    expect((await lade({ shareId: "sh00000001" })).zustand).toBe("limitErreicht");
  });

  it("kein Limit gesetzt (NULL) ist unbegrenzt", async () => {
    await legeShare({ id: "sh00000001", maxDownloads: null, downloadCount: 99 });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    expect((await lade({ shareId: "sh00000001" })).zustand).toBe("offen");
  });
});

/*
 * Fünf Vorrichtungen, die je EINE Bedingung reißen, belegen die REIHENFOLGE
 * nicht: jede Permutation der Kette wäre damit grün. Die Aussage gehört den
 * Fällen, die ZWEI Bedingungen reißen — hier steht je Paar, welche gewinnt.
 */
describe("ladeShare — die Reihenfolge selbst, über konkurrierende Zustände", () => {
  it("abgelaufen UND passwortgeschützt → abgelaufen (Ablauf vor Passwort)", async () => {
    await legeShare({
      id: "sh00000001",
      ablaufAt: new Date(JETZT.getTime() - SEK),
      passwordHash: await hashe("geheim"),
    });
    expect((await lade({ shareId: "sh00000001" })).zustand).toBe("abgelaufen");
  });

  it("passwortgeschützt UND Limit erreicht → passwortNoetig (Passwort vor Limit)", async () => {
    // Die Richtung ist die Zusage: läge das Limit VOR dem Passwort und wäre es
    // verbrauchend, wäre ein Share mit max_downloads = 3 mit drei fremden GETs
    // tot und das serverseitige Gate still ausgehebelt (§7.4).
    await legeShare({
      id: "sh00000001",
      maxDownloads: 1,
      downloadCount: 1,
      passwordHash: await hashe("geheim"),
    });
    expect((await lade({ shareId: "sh00000001" })).zustand).toBe("passwortNoetig");
  });

  it("passwortgeschützt UND Datei scanning → passwortNoetig (Passwort vor AV)", async () => {
    await legeShare({ id: "sh00000001", passwordHash: await hashe("geheim") });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: "scanning" });
    expect((await lade({ shareId: "sh00000001", dateiId: "fi00000001" })).zustand).toBe(
      "passwortNoetig",
    );
  });

  it("Cookie gültig, Datei scanning UND Limit erreicht → gesperrt (AV vor Limit)", async () => {
    const ablauf = new Date(JETZT.getTime() + 7 * TAG);
    await legeShare({
      id: "sh00000001",
      ablaufAt: ablauf,
      maxDownloads: 1,
      downloadCount: 1,
      passwordHash: await hashe("geheim"),
    });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: "scanning" });
    const ergebnis = await lade({
      shareId: "sh00000001",
      dateiId: "fi00000001",
      cookieLeser: await gueltigerLeser("sh00000001", ablauf),
    });
    expect(ergebnis.zustand).toBe("gesperrt");
  });

  it("fremde fileId auf einem geschützten Share ohne Cookie → passwortNoetig, NICHT dateiNichtGefunden", async () => {
    // Das geschlossene Orakel auf den Byte-Wegen: käme die Dateiauflösung vor
    // dem Passwort, verriete der Statuscode (404 gegen 401), ob eine geratene
    // fileId zu diesem Share gehört — ohne das Passwort zu kennen.
    await legeShare({ id: "sh00000001", passwordHash: await hashe("geheim") });
    await legeShare({ id: "sh00000002" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000002" });
    expect((await lade({ shareId: "sh00000001", dateiId: "fi00000002" })).zustand).toBe(
      "passwortNoetig",
    );
  });
});

describe("ladeShare — Zusammengehörigkeit zweier IDs, EINMAL (§4.3)", () => {
  it("eine fileId aus einem FREMDEN Share wird abgewiesen", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    await legeShare({ id: "sh00000002" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000002" });
    expect((await lade({ shareId: "sh00000001", dateiId: "fi00000002" })).zustand).toBe(
      "dateiNichtGefunden",
    );
  });

  it("eine unbekannte fileId wird abgewiesen", async () => {
    await legeShare({ id: "sh00000001" });
    expect((await lade({ shareId: "sh00000001", dateiId: "fi00009999" })).zustand).toBe(
      "dateiNichtGefunden",
    );
  });

  it("die Prüfung steht EINMAL — keine Route prüft sie selbst nach", async () => {
    // Die Alt-App verglich `file.shareId` mit der ID aus der URL dreimal in
    // drei Routen (`download/[id]/route.ts:64`, `preview/route.ts:83`). Der
    // Scan hält fest, dass die Naht im Modul genau eine Stelle hat. Der
    // Vergleichsoperator steht hier bewusst NICHT ausgeschrieben — der Scan
    // liest Kommentare mit und diese Datei wäre sonst ihr eigener Treffer.
    //
    // Geprüft wird die ANWESENHEIT in dieser einen Datei, NICHT die Abwesenheit
    // im Rest des Moduls: `src/app/m/files/**` bekommt in elf weiteren Wellen
    // neue Dateien, und genau diese Zeile ist die wahrscheinlichste Erklärung
    // im Kommentar eines Route Handlers („warum ich hier nicht nachprüfe").
    // Eine exklusive Singleton-Zusicherung wäre dort ein rotes Tor in einer
    // Datei, die dem Autor nicht gehört. Die Aussage „sie steht nur hier"
    // besitzt der Verhaltenstest darüber, nicht ein Textfund.
    const datei = quelldateien().find((d) => d.pfad === "src/app/m/files/_db/queries.ts");
    expect(datei!.inhalt).toMatch(/\bshareId\s*!==/);
  });
});

describe("ladeShare — die Ladefunktion zählt NICHTS hoch (§7.4, §7.5)", () => {
  it("nach fünf Aufrufen ist download_count unverändert", async () => {
    await legeShare({ id: "sh00000001", maxDownloads: 3, downloadCount: 1 });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    for (let i = 0; i < 5; i++) {
      await lade({ shareId: "sh00000001", dateiId: "fi00000001" });
    }
    expect(await downloadZaehler("sh00000001")).toBe(1);
  });

  it("ein ausgeschöpfter Share bleibt WIEDERHOLT limitErreicht und wandert nicht weiter", async () => {
    await legeShare({ id: "sh00000001", maxDownloads: 1, downloadCount: 1 });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    for (let i = 0; i < 3; i++) {
      expect((await lade({ shareId: "sh00000001" })).zustand).toBe("limitErreicht");
    }
    expect(await downloadZaehler("sh00000001")).toBe(1);
  });

  it("die Datei ist kein UPDATE-Ziel: kein Schreibbefehl im Modul-Quelltext dieser Datei", async () => {
    const datei = quelldateien().find((d) => d.pfad === "src/app/m/files/_db/queries.ts");
    expect(datei).toBeDefined();
    // `update(`, `insert(` und `delete(` gehören nach `_db/zaehler.ts` (T16) und
    // in die Actions — nie in die Ladefunktion. Ein Inkrement hier wäre der
    // Defekt, den §7.4 ausdrücklich benennt.
    expect(datei!.inhalt).not.toMatch(/\.(update|insert|delete)\s*\(/);
  });
});

describe("ladeShare — der gemischte AV-Zustand ist ein ZEILEN-Zustand (§7.4)", () => {
  it("clean + scanning: je Zeile ihr Zustand, mindestensEineWirdGeprueft, nicht alleUnvollstaendig", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: "clean" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000001", avStatus: "scanning" });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);

    const nach = (id: string) => ergebnis.inhalt.dateien.find((d) => d.id === id)!;
    expect(nach("fi00000001").avStatus).toBe("clean");
    expect(nach("fi00000001").freigegeben).toBe(true);
    expect(nach("fi00000001").ladbar).toBe(true);
    expect(nach("fi00000002").avStatus).toBe("scanning");
    expect(nach("fi00000002").freigegeben).toBe(false);
    expect(nach("fi00000002").ladbar).toBe(false);

    expect(ergebnis.inhalt.mindestensEineWirdGeprueft).toBe(true);
    expect(ergebnis.inhalt.alleUnvollstaendig).toBe(false);
    expect(ergebnis.inhalt.anzahlLadbar).toBe(1);
  });

  it("error und infected sind ENDzustände: mindestensEineWirdGeprueft bleibt falsch", async () => {
    // Ohne diese Zusage trägt `/s/<id>` den `<meta refresh>` dauerhaft und die
    // Seite lädt für immer alle 5 Sekunden nach — auf einem fremden Handy.
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: "error" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000001", avStatus: "infected" });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.inhalt.mindestensEineWirdGeprueft).toBe(false);
    expect(ergebnis.inhalt.anzahlLadbar).toBe(0);
  });

  it("eine UNVOLLSTÄNDIGE scanning-Zeile wird nicht geprüft und löst keinen Refresh aus", async () => {
    // Eine Zeile ohne Bytes ist beim Scanner nie angekommen. Zählte sie mit,
    // liefe ein abgebrochener Upload stundenlang als Wartezustand mit
    // Selbstaktualisierung — bis der Aufräum-Lauf ihn abholt.
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: "clean" });
    await legeDatei({
      id: "fi00000002",
      shareId: "sh00000001",
      avStatus: "scanning",
      vollstaendig: false,
    });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.inhalt.mindestensEineWirdGeprueft).toBe(false);
  });
});

describe("ladeShare — bytes_vollstaendig_at IS NULL (§4.4)", () => {
  it("zählt NICHT in die Größensumme", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", groesse: 100 });
    await legeDatei({
      id: "fi00000002",
      shareId: "sh00000001",
      groesse: 900,
      vollstaendig: false,
    });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.inhalt.gesamtGroesse).toBe(100);
    expect(ergebnis.inhalt.dateien).toHaveLength(2); // sichtbar, nur nicht gezählt
    expect(ergebnis.inhalt.dateien.find((d) => d.id === "fi00000002")!.vollstaendig).toBe(false);
  });

  it("ist NICHT ladbar", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", vollstaendig: false });
    expect((await lade({ shareId: "sh00000001", dateiId: "fi00000001" })).zustand).toBe(
      "dateiNichtGefunden",
    );
  });

  it("alle Dateien unvollständig → alleUnvollstaendig", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", vollstaendig: false });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.inhalt.alleUnvollstaendig).toBe(true);
  });

  it("ein Share OHNE jede Zeile ist ebenfalls alleUnvollstaendig", async () => {
    // §10.1 und T41 Punkt 8 formulieren beide „keine Datei vollständig
    // übertragen". Ohne diese Festlegung rät jede der beiden Ansichten selbst.
    await legeShare({ id: "sh00000001" });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.inhalt.dateien).toEqual([]);
    expect(ergebnis.inhalt.alleUnvollstaendig).toBe(true);
    expect(ergebnis.inhalt.gesamtGroesse).toBe(0);
  });
});

describe("ladeShare — der Blob-Abgleich (§5.4)", () => {
  it("fehlender Blob bei clean+vollständig: Zeile trägt blobFehlt, keine gemessene Größe", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", mitBlob: false });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    const zeile = ergebnis.inhalt.dateien[0];
    expect(zeile.blobFehlt).toBe(true);
    expect(zeile.gemesseneGroesse).toBe(null);
    expect(zeile.ladbar).toBe(false);
    expect(ergebnis.inhalt.anzahlLadbar).toBe(0);
  });

  it("die Auswahl einer Datei ohne Blob ist blobFehlt (404), nicht 500", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", mitBlob: false });
    expect((await lade({ shareId: "sh00000001", dateiId: "fi00000001" })).zustand).toBe("blobFehlt");
  });

  it("AV gewinnt über den Blob: eine gesperrte Datei ohne Blob ist gesperrt (403), nicht 404", async () => {
    // Die Reihenfolge verrät sonst über den Statuscode, ob zu einer gesperrten
    // Datei überhaupt Bytes liegen.
    await legeShare({ id: "sh00000001" });
    await legeDatei({
      id: "fi00000001",
      shareId: "sh00000001",
      avStatus: "infected",
      mitBlob: false,
    });
    expect((await lade({ shareId: "sh00000001", dateiId: "fi00000001" })).zustand).toBe("gesperrt");
  });

  it("vorhandener Blob: gemesseneGroesse ist die WIRKLICHE Länge, auch wenn size lügt", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", groesse: 12 });
    const { getDb } = await import("@/app/m/files/_db/client");
    const { shareFiles } = await import("@/app/m/files/_db/schema");
    const { eq } = await import("drizzle-orm");
    getDb().update(shareFiles).set({ size: 999 }).where(eq(shareFiles.id, "fi00000001")).run();

    const ergebnis = await lade({ shareId: "sh00000001", dateiId: "fi00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.datei!.groesse).toBe(999);
    expect(ergebnis.datei!.gemesseneGroesse).toBe(12);
  });

  it("eine ID, die keine nanoid(10) ist, wird als blobFehlt gemeldet und wirft nicht", async () => {
    // `storage.pfadFuer` wirft `UngueltigeId` bei einer verdorbenen Zeile
    // (Import!). Unbehandelt wäre das HTTP 500 auf einer öffentlichen Seite;
    // „nicht auffindbar" ist die ehrliche und die harmlose Antwort.
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi000000011", shareId: "sh00000001", mitBlob: false });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.inhalt.dateien[0].blobFehlt).toBe(true);
  });
});

describe("die Auswahl der Datei", () => {
  it("ohne dateiId ist datei null, und anzahlLadbar sagt, ob eine Auswahl nötig ist", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000001" });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.datei).toBe(null);
    expect(ergebnis.inhalt.anzahlLadbar).toBe(2);
  });

  it("mit dateiId liefert offen die gewählte Zeile mit", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", dateiname: "lage.pdf" });
    const ergebnis = await lade({ shareId: "sh00000001", dateiId: "fi00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.datei?.dateiname).toBe("lage.pdf");
  });
});

describe("die Projektionen lassen password_hash NICHT über die Grenze (§7.3)", () => {
  it("ladeShare: hatPasswort ist ein Wahrheitswert, und kein Wert beginnt mit $2b$", async () => {
    const ablauf = new Date(JETZT.getTime() + 7 * TAG);
    const hash = await hashe("geheim");
    expect(hash.startsWith("$2b$12$")).toBe(true); // die Vorrichtung trägt wirklich einen Hash
    await legeShare({ id: "sh00000001", ablaufAt: ablauf, passwordHash: hash });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });

    const ergebnis = await lade({
      shareId: "sh00000001",
      cookieLeser: await gueltigerLeser("sh00000001", ablauf),
    });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.share.hatPasswort).toBe(true);
    expect(werteTief(ergebnis).filter((w) => w.startsWith("$2b$"))).toEqual([]);
  });

  it("hatPasswort ist false, wenn die Spalte NULL ist", async () => {
    await legeShare({ id: "sh00000001", passwordHash: null });
    const ergebnis = await lade({ shareId: "sh00000001" });
    if (ergebnis.zustand !== "offen") throw new Error(`erwartet offen, war ${ergebnis.zustand}`);
    expect(ergebnis.share.hatPasswort).toBe(false);
  });

  it("ladeUebersicht und ladeShareDetail tragen ebenfalls keinen Hash", async () => {
    await legeShare({ id: "sh00000001", passwordHash: await hashe("geheim") });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    const { ladeUebersicht, ladeShareDetail } = await import("@/app/m/files/_db/queries");
    const uebersicht = await ladeUebersicht();
    const detail = await ladeShareDetail("sh00000001");
    expect(uebersicht[0].hatPasswort).toBe(true);
    expect(detail!.hatPasswort).toBe(true);
    expect(werteTief(uebersicht).filter((w) => w.startsWith("$2b$"))).toEqual([]);
    expect(werteTief(detail).filter((w) => w.startsWith("$2b$"))).toEqual([]);
  });

  it("Quelltext-Zusicherung: kein select() ohne Argument in src/app/m/files/**", async () => {
    // Das Muster wird ZUSAMMENGESETZT, damit diese Datei selbst kein Treffer
    // ist — sonst müsste der Scan sich ausnehmen, und ein echter Treffer in
    // einer Testdatei käme durch.
    const muster = new RegExp("\\." + "select" + "\\s*\\(\\s*\\)");
    const treffer = quelldateien()
      .filter((d) => muster.test(d.inhalt))
      .map((d) => d.pfad);
    expect(treffer).toEqual([]);
  });
});

describe("ladeUebersicht — die Größe kommt AUS DEN ZEILEN, nicht aus total_size", () => {
  it("eine falsche total_size ändert die angezeigte Größe nicht", async () => {
    // Heute zeigen Dashboard und Detailseite dieselbe Größe aus ZWEI Quellen
    // und können verschiedene Zahlen zeigen (Analyse 2.1, Befund 2).
    await legeShare({ id: "sh00000001", totalSize: 123_456 });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", groesse: 100 });
    await legeDatei({ id: "fi00000002", shareId: "sh00000001", groesse: 50 });

    const { ladeUebersicht, ladeShareDetail } = await import("@/app/m/files/_db/queries");
    const zeile = (await ladeUebersicht())[0];
    const detail = await ladeShareDetail("sh00000001");
    expect(zeile.gesamtGroesse).toBe(150);
    expect(detail!.gesamtGroesse).toBe(150);
    // Und beide sagen dasselbe — das ist die eigentliche Zusage.
    expect(zeile.gesamtGroesse).toBe(detail!.gesamtGroesse);
  });

  it("die Projektionen lesen total_size gar nicht", async () => {
    // Zwei Quellen für dieselbe Zahl waren der Alt-Defekt. Die Ladefunktion
    // darf die Spalte deshalb nicht einmal auswählen — sonst kehrt die zweite
    // Quelle über einen späteren „ist doch schon da"-Griff zurück.
    const datei = quelldateien().find((d) => d.pfad === "src/app/m/files/_db/queries.ts");
    expect(datei!.inhalt).not.toMatch(/\btotalSize\b/);
  });

  it("der AV-Sammelwert trägt einen benannten Wert je Vorrang", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: "clean" });
    await legeShare({ id: "sh00000002" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000002", avStatus: "scanning" });
    await legeShare({ id: "sh00000003" });
    await legeDatei({ id: "fi00000003", shareId: "sh00000003", avStatus: "infected" });
    await legeShare({ id: "sh00000004" });

    const { ladeUebersicht } = await import("@/app/m/files/_db/queries");
    const nach = Object.fromEntries((await ladeUebersicht()).map((z) => [z.id, z.avSammelwert]));
    expect(nach["sh00000001"]).toBe("freigegeben");
    expect(nach["sh00000002"]).toBe("wirdGeprueft");
    expect(nach["sh00000003"]).toBe("gesperrt");
    expect(nach["sh00000004"]).toBe("leer");
  });

  it("ein gesperrter Zustand gewinnt über einen laufenden", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: "scanning" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000001", avStatus: "infected" });
    const { ladeUebersicht } = await import("@/app/m/files/_db/queries");
    expect((await ladeUebersicht())[0].avSammelwert).toBe("gesperrt");
  });

  it("ladeShareDetail auf eine unbekannte ID liefert null (der Aufrufer ruft notFound)", async () => {
    const { ladeShareDetail } = await import("@/app/m/files/_db/queries");
    expect(await ladeShareDetail("sh00009999")).toBe(null);
  });
});

describe("ladeVerifikationsdaten — der EINE Weg, auf dem der Hash die DB verlässt", () => {
  it("liefert Hash und Restlaufzeit für einen geschützten Share", async () => {
    const ablauf = new Date(JETZT.getTime() + 2 * TAG);
    const hash = await hashe("geheim");
    await legeShare({ id: "sh00000001", ablaufAt: ablauf, passwordHash: hash });
    const { ladeVerifikationsdaten } = await import("@/app/m/files/_db/queries");
    const daten = await ladeVerifikationsdaten("sh00000001");
    expect(daten?.passwortHash).toBe(hash);
    // Das Cookie wird auf `min(4 h, Restlaufzeit)` begrenzt — ohne diese Zahl
    // überlebte die Entsperrung den Share.
    expect(daten?.ablaufAt.getTime()).toBe(ablauf.getTime());
  });

  it("ein passwortfreier Share liefert null als Hash, kein Freibrief", async () => {
    await legeShare({ id: "sh00000001", passwordHash: null });
    const { ladeVerifikationsdaten } = await import("@/app/m/files/_db/queries");
    expect((await ladeVerifikationsdaten("sh00000001"))?.passwortHash).toBe(null);
  });

  it("eine unbekannte ID liefert null — der Aufrufer antwortet darauf 401, nicht 404", async () => {
    // Das geschlossene Orakel: „existiert nicht", „existiert ohne Passwort" und
    // „falsches Passwort" sind ununterscheidbar (§7.4).
    const { ladeVerifikationsdaten } = await import("@/app/m/files/_db/queries");
    expect(await ladeVerifikationsdaten("sh00009999")).toBe(null);
  });
});

describe("ladeAuditLog", () => {
  it("liefert die jüngsten Zeilen zuerst und sagt, ob es mehr gibt", async () => {
    await legeShare({ id: "sh00000001" });
    await legeLogzeile("sh00000001", "fi00000001", 0);
    await legeLogzeile("sh00000001", null, 60 * SEK);
    await legeLogzeile("sh00000001", "fi00000001", 120 * SEK);

    const { ladeAuditLog } = await import("@/app/m/files/_db/queries");
    const zwei = await ladeAuditLog("sh00000001", 2);
    expect(zwei.zeilen).toHaveLength(2);
    expect(zwei.zeilen[0].zeit.getTime()).toBe(JETZT.getTime() + 120 * SEK);
    expect(zwei.gibtMehr).toBe(true);

    const alle = await ladeAuditLog("sh00000001", 10);
    expect(alle.zeilen).toHaveLength(3);
    expect(alle.gibtMehr).toBe(false);
    // NULL trägt Bedeutung: „ZIP des ganzen Shares" (§4.5).
    expect(alle.zeilen.filter((z) => z.dateiId === null)).toHaveLength(1);
  });

  it("liefert nur die Zeilen DIESES Shares", async () => {
    await legeShare({ id: "sh00000001" });
    await legeShare({ id: "sh00000002" });
    await legeLogzeile("sh00000001", null, 0);
    await legeLogzeile("sh00000002", null, 0);
    const { ladeAuditLog } = await import("@/app/m/files/_db/queries");
    expect((await ladeAuditLog("sh00000001", 10)).zeilen).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

/** Alle TypeScript-Quellen des Moduls, mit repo-relativem Pfad. */
function quelldateien(): { pfad: string; inhalt: string }[] {
  const wurzel = "src/app/m/files";
  const gesammelt: { pfad: string; inhalt: string }[] = [];
  const gehe = (verzeichnis: string) => {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) gehe(pfad);
      else if (/\.tsx?$/.test(eintrag.name))
        gesammelt.push({ pfad: pfad.split("\\").join("/"), inhalt: readFileSync(pfad, "utf8") });
    }
  };
  gehe(wurzel);
  return gesammelt;
}
