import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";

import * as schema from "@/app/m/files/_db/schema";
import { inboxFiles, shareFiles, shares, zugangslinks, downloadLogs } from "@/app/m/files/_db/schema";
import { MIME_PRAEFIX_BYTES, pruefeInhaltstyp } from "@/app/m/files/_lib/mime";
import { bcryptVerify } from "@/app/m/files/_lib/passwort";
import { normalisiereToken, tokenHash } from "@/app/m/files/_lib/token";
import { seedLokalFiles } from "@/app/m/files/_lib/seedLokal";

/*
 * Gegen eine ECHTE migrierte Datei-DB und eine ECHTE Ablage — dasselbe Muster
 * wie `_db/queries.test.ts`. Ein Mock waere hier wertlos: die halbe Zusage
 * dieses Seeds ist „die Bytes liegen wirklich auf der Platte, und `size` ist
 * ihre gemessene Laenge".
 */
/*
 * JE TEST EIN EIGENES VERZEICHNIS, und jede Verbindung wird danach geschlossen.
 * Beides ist noetig und beides ist gemessen: eine offene better-sqlite3-
 * Verbindung auf eine geloeschte WAL-Datenbank legt beim naechsten Test ihre
 * `-wal`/`-shm` neben die frisch angelegte Datei — die Folge sind „attempt to
 * write a readonly database" und „no such table: shares" in einem Test, der mit
 * der Ursache nichts zu tun hat. Ein gemeinsames Verzeichnis waere also grün,
 * solange die Reihenfolge zufaellig passt.
 */
let DIR = "";
let ABLAGE = "";

/** Die ID-Form, an der `_lib/storage.ts` einen Pfad festmacht. */
const ID_MUSTER = /^[A-Za-z0-9_-]{10}$/;

let verbindungen: Database.Database[] = [];

/**
 * Die Umgebungsvariablen, die dieser Test setzt — und wieder abraeumt. Vitest
 * gibt Worker-PROZESSE zwischen Dateien weiter: die Modulregistrierung ist
 * frisch, `process.env` nicht. Ein stehen gelassenes `SUITE_HOST_FILES` oeffnet
 * in `boot.test.ts` das Gate vor `pruefeAblage()`, und ein stehendes `DATA_DIR`
 * zeigt auf ein Verzeichnis, das hier gerade geloescht wurde.
 */
const GESETZTE_VARIABLEN = ["DATA_DIR", "SUITE_HOST_FILES", "AUTH_SECRET"] as const;
let vorher: Partial<Record<(typeof GESETZTE_VARIABLEN)[number], string | undefined>> = {};

function oeffne(): ReturnType<typeof drizzle<typeof schema>> {
  const sqlite = new Database(`${DIR}/files.db`);
  sqlite.pragma("foreign_keys = ON");
  verbindungen.push(sqlite);
  return drizzle(sqlite, { schema });
}

afterEach(() => {
  for (const verbindung of verbindungen) verbindung.close();
  verbindungen = [];
  // `getModuleDb` (hinter `ladeShare`) haelt seine Verbindung auf `globalThis`
  // fest — verwerfen genuegt nicht, sie muss auch zu sein.
  const zwischenspeicher = (globalThis as { __suiteDb?: Record<string, unknown> }).__suiteDb;
  for (const eintrag of Object.values(zwischenspeicher ?? {})) {
    const klient = (eintrag as { $client?: { close?: () => void } }).$client;
    klient?.close?.();
  }
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  rmSync(DIR, { recursive: true, force: true });
  for (const name of GESETZTE_VARIABLEN) {
    const alt = vorher[name];
    if (alt === undefined) delete process.env[name];
    else process.env[name] = alt;
  }
});

beforeEach(() => {
  vorher = Object.fromEntries(GESETZTE_VARIABLEN.map((n) => [n, process.env[n]]));
  DIR = mkdtempSync(join(tmpdir(), "files-seedlokal-"));
  ABLAGE = join(DIR, "files");
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  // `hostRollen()` liest `SUITE_HOST_FILES` ueber die Registry; gesetzt, damit
  // die Protokollzeilen ihre echten Links tragen und der Test sie pruefen kann.
  process.env.SUITE_HOST_FILES = "files.localtest.me,drop.localtest.me";
  // `istCookieGueltig` (ueber `ladeShare`) wirft ohne dieses Geheimnis.
  process.env.AUTH_SECRET = "seedlokal-test-geheimnis-lang-genug";
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

function zaehle(db: ReturnType<typeof oeffne>) {
  return {
    shares: db.select({ id: shares.id }).from(shares).all().length,
    dateien: db.select({ id: shareFiles.id }).from(shareFiles).all().length,
    inbox: db.select({ id: inboxFiles.id }).from(inboxFiles).all().length,
    links: db.select({ id: zugangslinks.id }).from(zugangslinks).all().length,
    logs: db.select({ id: downloadLogs.id }).from(downloadLogs).all().length,
  };
}

describe("seedLokalFiles — die Daten entstehen wirklich", () => {
  it("legt Shares, Dateien, Abgabelink und Posteingang an", async () => {
    const db = oeffne();
    const protokoll = await seedLokalFiles(db);

    const stand = zaehle(db);
    expect(stand.shares).toBe(3);
    expect(stand.dateien).toBe(9);
    expect(stand.inbox).toBe(3);
    expect(stand.links).toBe(1);
    expect(stand.logs).toBe(2);

    // Das Protokoll ist Teil des Vertrags: es soll dem Entwickler die Links
    // nennen, nicht nur „fertig" sagen.
    const text = protokoll.join("\n");
    expect(text).toContain("http://files.localtest.me:3000/s/seedOffen1");
    expect(text).toContain("http://drop.localtest.me:3000/u/dz-seed-2345-6789");
    expect(text).toContain("http://files.localtest.me:3000/posteingang");
    expect(text).toContain("Uebung-2026");
  });

  it("schreibt jeden Blob an den Pfad, den die Ablage vorgibt", async () => {
    const db = oeffne();
    await seedLokalFiles(db);

    const dateien = db
      .select({
        id: shareFiles.id,
        shareId: shareFiles.shareId,
        groesse: shareFiles.size,
        vollstaendig: shareFiles.bytesVollstaendigAt,
      })
      .from(shareFiles)
      .all();

    for (const datei of dateien) {
      const pfad = join(ABLAGE, datei.shareId, datei.id);
      if (datei.vollstaendig === null) {
        // Die abgebrochene Uebertragung: KEIN Blob, und das ist ihr Zustand.
        expect(existsSync(pfad), `${datei.id} duerfte keinen Blob haben`).toBe(false);
        expect(datei.groesse).toBe(0);
        continue;
      }
      expect(existsSync(pfad), `Blob fehlt: ${pfad}`).toBe(true);
      // `size` ist die GEMESSENE Laenge — ein falsches Content-Length bricht
      // beim Empfaenger ab (§5.4).
      expect(statSync(pfad).size).toBe(datei.groesse);
      expect(datei.groesse).toBeGreaterThan(0);
    }

    for (const zeile of db.select({ id: inboxFiles.id, groesse: inboxFiles.size }).from(inboxFiles).all()) {
      const pfad = join(ABLAGE, "inbox", zeile.id);
      expect(existsSync(pfad), `Inbox-Blob fehlt: ${pfad}`).toBe(true);
      expect(statSync(pfad).size).toBe(zeile.groesse);
    }

    // Keine Zwischendatei bleibt liegen — sonst zaehlt der Aufraeumlauf sie
    // als Rest und `--exclude='*.part'` im Backup traefe echte Daten.
    const reste = db
      .select({ id: shareFiles.id, shareId: shareFiles.shareId })
      .from(shareFiles)
      .all()
      .filter((d) => existsSync(join(ABLAGE, d.shareId, `${d.id}.part`)));
    expect(reste).toEqual([]);
  });

  it("erzeugt Inhalte, die der ECHTE Upload-Weg als ihren MIME-Typ feststellt", async () => {
    // Die staerkste Aussage des Tests: `pruefeInhaltstyp` ist genau die
    // Pruefung, die der letzte Chunk eines echten Uploads ausfuehrt. Besteht ein
    // Seed-Blob sie mit dem Typ, der in seiner Spalte steht, ist die Zeile von
    // einer hochgeladenen nicht zu unterscheiden. Ein PNG mit falscher
    // CRC-Summe oder ein PDF mit kaputtem xref faellt hier NICHT auf — dagegen
    // steht der Lauf gegen `file(1)`; eine falsche Signatur, eine unpassende
    // Endung oder ein Text, der kein gueltiges UTF-8 ist, sehr wohl.
    const db = oeffne();
    await seedLokalFiles(db);

    const zeilen = [
      ...db
        .select({
          pfad: shareFiles.shareId,
          id: shareFiles.id,
          name: shareFiles.filename,
          typ: shareFiles.mimeType,
          vollstaendig: shareFiles.bytesVollstaendigAt,
        })
        .from(shareFiles)
        .all()
        .filter((z) => z.vollstaendig !== null)
        .map((z) => ({ pfad: join(ABLAGE, z.pfad, z.id), name: z.name, typ: z.typ })),
      ...db
        .select({ id: inboxFiles.id, name: inboxFiles.dateiname, typ: inboxFiles.mimeType })
        .from(inboxFiles)
        .all()
        .map((z) => ({ pfad: join(ABLAGE, "inbox", z.id), name: z.name, typ: z.typ })),
    ];

    expect(zeilen.length).toBe(11);
    for (const zeile of zeilen) {
      const bytes = readFileSync(zeile.pfad);
      const befund = pruefeInhaltstyp({
        praefix: bytes.subarray(0, MIME_PRAEFIX_BYTES),
        gesamtGroesse: bytes.length,
        deklariert: zeile.typ,
        dateiname: zeile.name,
      });
      expect(befund.ok, `${zeile.name}: ${befund.ok ? "" : befund.meldung}`).toBe(true);
      if (!befund.ok) continue;
      expect(befund.typ, `${zeile.name} wird anders festgestellt als gespeichert`).toBe(zeile.typ);
      // Keine Abweichung: Deklaration und Endung passen zur Feststellung.
      expect(befund.abweichungen).toEqual([]);
    }
  });

  it("gibt jeder Zeile eine ID, aus der die Ablage einen Pfad bauen darf", async () => {
    const db = oeffne();
    await seedLokalFiles(db);

    const ids = [
      ...db.select({ id: shares.id }).from(shares).all(),
      ...db.select({ id: shareFiles.id }).from(shareFiles).all(),
      ...db.select({ id: inboxFiles.id }).from(inboxFiles).all(),
    ].map((z) => z.id);

    // `pruefeId` wirft `UngueltigeId` bei jeder Abweichung — ein verzaehltes
    // Zeichen waere kein Tippfehler, sondern ein Wurf im Download-Weg.
    for (const id of ids) expect(id, `${id} ist keine nanoid(10)-Form`).toMatch(ID_MUSTER);
  });
});

describe("seedLokalFiles — AV-Zustaende", () => {
  it("setzt nie eine VOLLSTAENDIGE Zeile auf 'scanning'", async () => {
    // Genau dieses Paar waehlt `auftraege()` in `_lib/av.ts` aus. Ohne
    // antwortenden Scanner faellt so eine Zeile nach `FILES_AV_VERSUCHE` auf
    // 'error' — der geseedete Zustand verrottete still, waehrend `pnpm dev`
    // laeuft.
    const db = oeffne();
    await seedLokalFiles(db);

    const wartend = db
      .select({ id: shareFiles.id, status: shareFiles.avStatus, voll: shareFiles.bytesVollstaendigAt })
      .from(shareFiles)
      .all()
      .filter((z) => z.status === "scanning" && z.voll !== null);
    expect(wartend).toEqual([]);

    const wartendInbox = db
      .select({ id: inboxFiles.id, status: inboxFiles.avStatus, voll: inboxFiles.bytesVollstaendigAt })
      .from(inboxFiles)
      .all()
      .filter((z) => z.status === "scanning" && z.voll !== null);
    expect(wartendInbox).toEqual([]);
  });

  it("stellt neben 'clean' auch die Endzustaende 'infected' und 'error' dar", async () => {
    const db = oeffne();
    await seedLokalFiles(db);
    const zustaende = db
      .select({ id: shareFiles.id, status: shareFiles.avStatus })
      .from(shareFiles)
      .all();
    const nach = Object.fromEntries(zustaende.map((z) => [z.id, z.status]));
    expect(nach["seedDoku01"]).toBe("clean");
    expect(nach["seedVirus1"]).toBe("infected");
    expect(nach["seedFehl01"]).toBe("error");
    expect(nach["seedTeil01"]).toBe("scanning");
  });

  it("gibt jedem Endzustand einen Pruefzeitpunkt — und 'scanning'/'unscanned' keinen", async () => {
    // `unscanned` ist kein Ergebnis, sondern der ungeprüfte Altbestand
    // (`_lib/av.ts`): ein Prüfzeitpunkt darauf wäre eine Falschaussage.
    const db = oeffne();
    await seedLokalFiles(db);
    const offen = ["scanning", "unscanned"];
    for (const z of db
      .select({ id: shareFiles.id, status: shareFiles.avStatus, geprueft: shareFiles.avGeprueftAt })
      .from(shareFiles)
      .all()) {
      if (offen.includes(z.status)) expect(z.geprueft, z.id).toBeNull();
      else expect(z.geprueft, z.id).not.toBeNull();
    }
    for (const z of db
      .select({ id: inboxFiles.id, status: inboxFiles.avStatus, geprueft: inboxFiles.avGeprueftAt })
      .from(inboxFiles)
      .all()) {
      if (offen.includes(z.status)) expect(z.geprueft, z.id).toBeNull();
      else expect(z.geprueft, z.id).not.toBeNull();
    }
  });
});

describe("seedLokalFiles — die Prüfkette sieht dieselben Daten", () => {
  it("liefert für den offenen Share einen ladbaren Zustand", async () => {
    const db = oeffne();
    await seedLokalFiles(db);

    // Nicht die Spalten einzeln pruefen, sondern die EINE Ladefunktion: sie
    // rechnet `vollstaendig && freigegeben && !blobFehlt` und probt den Blob
    // dabei wirklich per `stat`.
    const { ladeShare } = await import("@/app/m/files/_db/queries");
    const ladung = await ladeShare({ shareId: "seedOffen1" });
    expect(ladung.zustand).toBe("offen");
    if (ladung.zustand !== "offen") return;
    expect(ladung.inhalt.anzahlLadbar).toBe(4);
    expect(ladung.inhalt.anzahlUnvollstaendig).toBe(0);
    expect(ladung.inhalt.gesamtGroesse).toBeGreaterThan(0);
    // Kein Wartezustand: sonst laedt die oeffentliche Seite alle 5 Sekunden neu.
    expect(ladung.inhalt.mindestensEineWirdGeprueft).toBe(false);
    for (const datei of ladung.inhalt.dateien) {
      expect(datei.ladbar, datei.dateiname).toBe(true);
      expect(datei.blobFehlt, datei.dateiname).toBe(false);
      expect(datei.gemesseneGroesse).toBe(datei.groesse);
    }
  });

  it("verlangt für den geschützten Share ein Passwort und kennt genau eines", async () => {
    const db = oeffne();
    await seedLokalFiles(db);

    const { ladeShare } = await import("@/app/m/files/_db/queries");
    const ladung = await ladeShare({ shareId: "seedGeheim" });
    expect(ladung.zustand).toBe("passwortNoetig");

    const hash = db
      .select({ hash: shares.passwordHash })
      .from(shares)
      .where(eq(shares.id, "seedGeheim"))
      .get();
    // Dieselbe Hash-Familie wie im Bestand (§4.2) — sonst waere der Seed-Share
    // mit dem echten Verify-Weg nicht zu oeffnen.
    expect(hash?.hash?.startsWith("$2b$12$")).toBe(true);
    expect(hash?.hash).toHaveLength(60);
    expect(bcryptVerify("Uebung-2026", hash!.hash)).toBe(true);
    expect(bcryptVerify("falsch", hash!.hash)).toBe(false);
  });

  it("meldet den abgelaufenen Share als abgelaufen", async () => {
    const db = oeffne();
    await seedLokalFiles(db);
    const { ladeShare } = await import("@/app/m/files/_db/queries");
    const ladung = await ladeShare({ shareId: "seedAlt001" });
    expect(ladung.zustand).toBe("abgelaufen");
  });

  it("hinterlegt den Abgabelink so, dass der ausgegebene Token ihn auflöst", async () => {
    const db = oeffne();
    const protokoll = await seedLokalFiles(db);

    const rohtoken = "dz-seed-2345-6789";
    expect(protokoll.join("\n")).toContain(rohtoken);
    // Der Weg, den `/u/<token>` geht: normalisieren, hashen, in der Spalte
    // suchen. Ein Seed, dessen Token die Zeile nicht findet, ist ein Link, der
    // 404 liefert.
    const kanonisch = normalisiereToken(rohtoken);
    expect(kanonisch).toBe(rohtoken);
    const link = db
      .select({
        id: zugangslinks.id,
        start: zugangslinks.tokenStart,
        budgetDateien: zugangslinks.budgetDateien,
        verbrauchtDateien: zugangslinks.verbrauchtDateien,
        verbrauchtBytes: zugangslinks.verbrauchtBytes,
      })
      .from(zugangslinks)
      .where(eq(zugangslinks.tokenHash, tokenHash(kanonisch!)))
      .get();
    expect(link?.id).toBe("seedLink01");
    // `dz-` plus vier Geheimzeichen, also sieben — nicht acht (§4.7).
    expect(link?.start).toBe("dz-seed");
    expect(link?.start).toHaveLength(7);
    // Der Roh-Token steht NIRGENDS in der Datenbank.
    const roh = db.select({ start: zugangslinks.tokenStart, hash: zugangslinks.tokenHash }).from(zugangslinks).all();
    for (const z of roh) {
      expect(z.start).not.toBe(rohtoken);
      expect(z.hash).not.toBe(rohtoken);
    }

    // Der Verbrauchszaehler entspricht den abgegebenen Dateien.
    const abgaben = db.select({ groesse: inboxFiles.size }).from(inboxFiles).all();
    expect(link?.verbrauchtDateien).toBe(abgaben.length);
    expect(link?.verbrauchtBytes).toBe(abgaben.reduce((s, z) => s + z.groesse, 0));
  });

  it("rechnet total_size aus den vollständigen Zeilen", async () => {
    const db = oeffne();
    await seedLokalFiles(db);
    for (const share of db.select({ id: shares.id, gesamt: shares.totalSize }).from(shares).all()) {
      const erwartet = db
        .select({ groesse: shareFiles.size, voll: shareFiles.bytesVollstaendigAt })
        .from(shareFiles)
        .where(eq(shareFiles.shareId, share.id))
        .all()
        .filter((d) => d.voll !== null)
        .reduce((s, d) => s + d.groesse, 0);
      expect(share.gesamt, share.id).toBe(erwartet);
    }
  });
});

describe("seedLokalFiles — Idempotenz und Bestandsschutz", () => {
  it("legt beim zweiten Lauf weder Zeilen noch Blobs doppelt an", async () => {
    const db = oeffne();
    await seedLokalFiles(db);
    const ersteZaehlung = zaehle(db);
    const ersteGroessen = db
      .select({ id: shareFiles.id, shareId: shareFiles.shareId, groesse: shareFiles.size })
      .from(shareFiles)
      .all();
    const ersterLink = db
      .select({ dateien: zugangslinks.verbrauchtDateien, bytes: zugangslinks.verbrauchtBytes })
      .from(zugangslinks)
      .get();

    await seedLokalFiles(db);

    expect(zaehle(db)).toEqual(ersteZaehlung);
    expect(
      db
        .select({ id: shareFiles.id, shareId: shareFiles.shareId, groesse: shareFiles.size })
        .from(shareFiles)
        .all(),
    ).toEqual(ersteGroessen);
    // Der Verbrauchszaehler wird NEU BERECHNET, nicht hochgezaehlt — beim
    // Hochzaehlen stuende hier der doppelte Wert.
    expect(
      db
        .select({ dateien: zugangslinks.verbrauchtDateien, bytes: zugangslinks.verbrauchtBytes })
        .from(zugangslinks)
        .get(),
    ).toEqual(ersterLink);
    // Und `total_size` bleibt ebenfalls stehen.
    expect(
      db.select({ id: shares.id, gesamt: shares.totalSize }).from(shares).all().every((s) => s.gesamt >= 0),
    ).toBe(true);
  });

  it("ergänzt einen fehlenden Blob beim zweiten Lauf", async () => {
    const db = oeffne();
    await seedLokalFiles(db);
    const pfad = join(ABLAGE, "seedOffen1", "seedBild01");
    const vorher = readFileSync(pfad);
    rmSync(pfad);

    await seedLokalFiles(db);

    expect(existsSync(pfad)).toBe(true);
    expect(readFileSync(pfad)).toEqual(vorher);
    expect(zaehle(db).dateien).toBe(9);
  });

  it("überschreitet eine liegen gebliebene Zwischendatei", async () => {
    // `schreibeStrom` oeffnet mit `wx` und bekaeme sonst EEXIST: der Rest eines
    // abgebrochenen Laufs macht den Seed dauerhaft unbrauchbar.
    const db = oeffne();
    await seedLokalFiles(db);
    const pfad = join(ABLAGE, "seedOffen1", "seedBild01");
    const inhalt = readFileSync(pfad);
    rmSync(pfad);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${pfad}.part`, Buffer.from([0x00, 0x01]));

    await expect(seedLokalFiles(db)).resolves.toBeInstanceOf(Array);
    expect(readFileSync(pfad)).toEqual(inhalt);
    expect(existsSync(`${pfad}.part`)).toBe(false);
  });

  it("lässt fremde Zeilen unangetastet", async () => {
    const db = oeffne();
    const fremdeZeit = new Date(1_800_000_000 * 1000);
    db.insert(shares)
      .values({
        id: "fremd00001",
        title: "Von Hand angelegt",
        description: null,
        type: "file",
        expiresAt: new Date(fremdeZeit.getTime() + 86_400_000),
        maxDownloads: 7,
        downloadCount: 3,
        passwordHash: null,
        totalSize: 4242,
        createdAt: fremdeZeit,
        createdBy: "dev:handarbeit",
      })
      .run();
    db.insert(shareFiles)
      .values({
        id: "fremdfile1",
        shareId: "fremd00001",
        filename: "handarbeit.txt",
        mimeType: "text/plain",
        size: 4242,
        createdAt: fremdeZeit,
        bytesVollstaendigAt: fremdeZeit,
        avStatus: "unscanned",
        avGeprueftAt: null,
      })
      .run();

    // Die Spalten werden AUFGEZAEHLT, nicht per `select()` ohne Argument
    // geholt: das ist im ganzen Modul verboten und wird im Quelltext geprueft
    // (`_db/queries.test.ts`) — auch in Testdateien.
    const fremderShare = () =>
      db
        .select({
          id: shares.id,
          titel: shares.title,
          typ: shares.type,
          ablauf: shares.expiresAt,
          maxDownloads: shares.maxDownloads,
          downloadCount: shares.downloadCount,
          hash: shares.passwordHash,
          gesamt: shares.totalSize,
          erstelltAt: shares.createdAt,
          erstelltVon: shares.createdBy,
        })
        .from(shares)
        .where(eq(shares.id, "fremd00001"))
        .all();
    const fremdeDatei = () =>
      db
        .select({
          id: shareFiles.id,
          shareId: shareFiles.shareId,
          name: shareFiles.filename,
          typ: shareFiles.mimeType,
          groesse: shareFiles.size,
          erstelltAt: shareFiles.createdAt,
          voll: shareFiles.bytesVollstaendigAt,
          status: shareFiles.avStatus,
          geprueft: shareFiles.avGeprueftAt,
        })
        .from(shareFiles)
        .where(eq(shareFiles.id, "fremdfile1"))
        .all();

    const vorher = fremderShare();
    const vorherDatei = fremdeDatei();

    await seedLokalFiles(db);
    await seedLokalFiles(db);

    expect(fremderShare()).toEqual(vorher);
    expect(fremdeDatei()).toEqual(vorherDatei);
    expect(zaehle(db).shares).toBe(4);
  });
});

describe("seedLokalFiles — was die Datei über sich selbst zusagt", () => {
  it("hängt nicht am Boot-Pfad", () => {
    // Der Kommentar in `core/bootstrap.ts` bleibt nur richtig, solange niemand
    // diesen Seed dort einhängt: `shouldSeed()` ist auch der
    // Generalproben-Schalter, und ein Seed-Abgabelink waere dort ein gueltiger
    // anonymer Schreibzugang.
    const bootstrap = readFileSync("src/core/bootstrap.ts", "utf8");
    expect(bootstrap).not.toContain("seedLokal");
    expect(bootstrap).toContain("Seed-Abgabelink");
  });

  it("nennt in ihrem Kopf die Begründung, warum hier ein Abgabelink entstehen darf", () => {
    const quelle = readFileSync("src/app/m/files/_lib/seedLokal.ts", "utf8");
    expect(quelle).toContain("SUITE_SEED");
    expect(quelle).toContain("Generalprobe");
  });
});
