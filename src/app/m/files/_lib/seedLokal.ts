/**
 * LOKALE Demodaten des Moduls `files` (Shares, Abgabelink, Posteingang).
 *
 * WARUM DIESER SEED NICHT AM BOOT-PFAD HÄNGT — und warum hier trotzdem ein
 * Abgabelink entstehen darf:
 *
 * `core/bootstrap.ts` führt `files` bewusst OHNE Seed, und der Kommentar dort
 * bleibt richtig: `shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV ===
 * "development"`, und `SUITE_SEED=1` ist der **Generalproben**-Schalter. Ein
 * Abgabelink aus `seedAllModules()` wäre damit in einer Generalprobe ein
 * gültiger anonymer SCHREIBZUGANG auf einer echten Domain — ein festes Token in
 * einem Repository ist kein Geheimnis.
 *
 * Diese Datei wird deshalb **ausschliesslich von einem separaten, rein lokalen
 * Skript** gerufen und ist an keiner Stelle in `core/bootstrap.ts` verdrahtet.
 * Genau deshalb darf hier ein Abgabelink mit FESTEM Token entstehen: er kann
 * nie in eine Generalprobe geraten, weil kein Weg von `shouldSeed()` hierher
 * führt. Wer das ändern will, ändert damit auch diese Zusage — dann gehört das
 * Token weg, nicht der Kommentar.
 *
 * WELCHER SPALTENZUSTAND EINE DATEI HERUNTERLADBAR MACHT (`queries.ts`,
 * `zuDatei`: `vollstaendig && freigegeben && !blobFehlt`), also alle drei
 * zusammen:
 *   1. `bytes_vollstaendig_at` gesetzt (§4.4) — sonst zählt die Zeile nicht in
 *      die Grösse, ist nicht im ZIP und ist für jeden Byte-Weg „gibt es nicht";
 *   2. `av_status = 'clean'` — `istFreigegeben()` kennt GENAU EINEN Wert
 *      (`_lib/av.ts`); `unscanned` gibt ausdrücklich nicht frei;
 *   3. ein Blob unter `<DATA_DIR>/files/<shareId>/<fileId>` — die Zeile allein
 *      ergibt „nicht auffindbar" (§10.1), und `size` muss die GEMESSENE Länge
 *      dieses Blobs sein, sonst bricht der Download beim Empfänger ab (§5.4).
 * Der Blob entsteht deshalb ausschliesslich über `_lib/storage.ts` — die eine
 * Stelle des Moduls, an der ein Pfad entsteht.
 *
 * WARUM DER SEED OHNE clamd AUSKOMMT: er schreibt den ENDZUSTAND (`clean` samt
 * `av_geprueft_at`) direkt. Die AV-Warteschlange IST die Datenbank, und ihre
 * Auswahl ist `av_status = 'scanning' AND bytes_vollstaendig_at IS NOT NULL`
 * (`_lib/av.ts`, `auftraege`) — eine `clean`-Zeile kommt dort nie wieder
 * herein, es gibt keinen Rückweg. Daraus folgt die Regel, die dieser Seed
 * einhält und die man leicht übersieht:
 *
 *   **NIE eine VOLLSTÄNDIGE Zeile auf `scanning` seeden.** Das ist genau das
 *   Paar, das die Warteschlange abholt; ohne antwortenden Scanner (lokal
 *   `pnpm dev:av`) fällt sie nach `FILES_AV_VERSUCHE` auf `error` — der
 *   geseedete Zustand verrottete also still, während `pnpm dev` läuft.
 *   `scanning` ist hier nur mit `bytes_vollstaendig_at = NULL` erlaubt (die
 *   abgebrochene Übertragung), und genau so steht es unten.
 *
 * IDEMPOTENZ PRO ENTITÄT, nicht ein gemeinsames Gate (Vorbild
 * `feedback/_lib/seed.ts`): ein abgebrochener Lauf ergänzt sich beim nächsten
 * Mal selbst, statt dauerhaft halb dazustehen. Alle IDs, Tokens und Passwörter
 * sind FEST — lokale Links, Lesezeichen und Notizen bleiben damit über Läufe
 * hinweg gültig.
 *
 * ADDITIV: diese Datei löscht nichts und überschreibt keine fremde Zeile. Was
 * sie an bestehenden Zeilen anfasst, sind ausschliesslich die beiden
 * abgeleiteten Zähler ihrer EIGENEN Zeilen (`shares.total_size` und
 * `zugangslinks.verbraucht_*`) — und die werden NEU BERECHNET, nicht
 * hochgezählt: nur so trägt ein zweiter Lauf nichts doppelt ein.
 *
 * Server-only. Kein `"use client"`: hier stehen `node:zlib`, die Ablage und
 * `bcryptjs`.
 */
import { crc32, deflateSync } from "node:zlib";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "@/app/m/files/_db/schema";
import {
  downloadLogs,
  inboxFiles,
  shareFiles,
  shares,
  zugangslinks,
} from "@/app/m/files/_db/schema";
import type { AvStatus } from "@/app/m/files/_lib/av";
import type { ErlaubterMimeTyp } from "@/app/m/files/_lib/mime";
import { bcryptHash } from "@/app/m/files/_lib/passwort";
import {
  BlobFehlt,
  abschliesse,
  groesse,
  loesche,
  schreibeStrom,
  type BlobZiel,
} from "@/app/m/files/_lib/storage";
import { tokenHash } from "@/app/m/files/_lib/token";
import { zeitpunktBerlin } from "@/app/m/files/_lib/zeit";

type FilesDb = BetterSQLite3Database<typeof schema>;

// ---------------------------------------------------------------------------
// Die festen Werte. Sie stehen alle hier oben, weil sie in den Protokollzeilen
// wieder auftauchen — ein Entwickler soll die Datei einmal lesen und alle Links
// kennen.
// ---------------------------------------------------------------------------

/**
 * Das Passwort des geschützten Shares. Fest und im Protokoll ausgegeben; es
 * schützt nichts als Demodaten auf dem eigenen Rechner.
 */
const SEED_PASSWORT = "Uebung-2026";

/**
 * Der Rohtoken des Abgabelinks in kanonischer Form `dz-xxxx-xxxx-xxxx`
 * (`_lib/token.ts`). Nur Zeichen aus dem 32er-Alphabet — `0`, `1`, `l` und `o`
 * kommen darin nicht vor.
 *
 * Im ECHTEN Weg wird der Rohtoken nie gespeichert (§4.7); gespeichert sind
 * `token_start` und `token_hash`. Das gilt hier genauso — der Klartext steht in
 * dieser Datei und im Protokoll, nicht in der Datenbank.
 */
const SEED_TOKEN = "dz-seed-2345-6789";

/** Wie im echten Anlegeweg: `dz-` plus vier Geheimzeichen, also SIEBEN Zeichen. */
const TOKEN_START_LAENGE = 7;

/**
 * Der Port, den `pnpm dev` benutzt. Er kann hier nicht ermittelt werden — ein
 * Seed hat keinen Request, und `SUITE_HOST_*` trägt nie einen Port
 * (`core/hosts.ts` weist `:` ab). E2E läuft auf 3100; wer dort seedet, ersetzt
 * die Zahl in den Links selbst.
 */
const DEV_PORT = 3000;

/**
 * Obergrenze für einen Seed-Blob — eine Wache auf einem bekannten Wert, keine
 * fachliche Grenze. BEWUSST NICHT `grenzen().maxDateiBytes`: das wäre eine
 * Kopplung an eine gültige `.env` (drei Pflichtzahlen, sonst wirft `grenzen()`),
 * und dieser Seed erzeugt seine paar Kilobyte selbst.
 */
const SEED_BLOB_MAX_BYTES = 1024 * 1024;

const SEKUNDE = 1000;
const STUNDE = 60 * 60 * SEKUNDE;
const TAG = 24 * STUNDE;

// ---------------------------------------------------------------------------
// Die Blob-Inhalte. Echte Dateien, keine Platzhalterbytes: die Vorschau-Route
// liefert sie mit `Content-Disposition: inline` aus, und ein Browser soll dort
// etwas sehen. Jeder Inhalt ist deterministisch — derselbe Lauf ergibt dieselben
// Bytes, sonst wäre „ein zweiter Lauf ändert nichts" nicht prüfbar.
// ---------------------------------------------------------------------------

/**
 * Ein PNG-Chunk: Länge, Typ, Daten, CRC-32 über Typ UND Daten.
 *
 * `zlib.crc32` ist die Implementierung der Plattform (seit Node 22.2; CI fährt
 * 22, das Image 26) — dieselbe Überlegung wie bei `TextDecoder` in
 * `_lib/mime.ts`: eine eigene Tabelle wäre eine zweite Zustandsmaschine ohne
 * Gewinn. Eine falsche Prüfsumme ergäbe eine Datei mit RICHTIGER Signatur, die
 * kein Browser zeichnet — und `pruefeInhaltstyp` sähe den Unterschied nicht.
 */
function pngChunk(typ: string, daten: Uint8Array): Uint8Array {
  const kopf = Buffer.from(typ, "ascii");
  const koerper = Buffer.concat([kopf, Buffer.from(daten)]);
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length, 0);
  const pruefsumme = Buffer.alloc(4);
  pruefsumme.writeUInt32BE(crc32(koerper), 0);
  return Buffer.concat([laenge, koerper, pruefsumme]);
}

/**
 * Ein einfarbiges PNG mit Rahmen (Truecolor, 8 Bit). Gross genug, dass die
 * Vorschau nicht wie ein Fehler aussieht, und klein genug, dass die Datei ein
 * paar hundert Byte hat.
 */
function baueDemoPng(breite: number, hoehe: number, farbe: readonly [number, number, number]): Uint8Array {
  const roh = Buffer.alloc(hoehe * (1 + breite * 3));
  for (let y = 0; y < hoehe; y++) {
    const zeilenAnfang = y * (1 + breite * 3);
    roh[zeilenAnfang] = 0; // Filtertyp „None" — der Seed braucht keine Kompressionskunst.
    for (let x = 0; x < breite; x++) {
      const rand = x < 2 || y < 2 || x >= breite - 2 || y >= hoehe - 2;
      const p = zeilenAnfang + 1 + x * 3;
      roh[p] = rand ? 0x20 : farbe[0];
      roh[p + 1] = rand ? 0x20 : farbe[1];
      roh[p + 2] = rand ? 0x20 : farbe[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // Farbtyp 2 = Truecolor
  ihdr[10] = 0; // Kompression
  ihdr[11] = 0; // Filtermethode
  ihdr[12] = 0; // kein Interlace

  return Buffer.concat([
    // Genau die Signatur, auf die `_lib/mime.ts` an Offset 0 prüft.
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(pngChunk("IHDR", ihdr)),
    Buffer.from(pngChunk("IDAT", deflateSync(roh))),
    Buffer.from(pngChunk("IEND", Buffer.alloc(0))),
  ]);
}

/** Klammern und Rückstrich sind in einem PDF-Literal Steuerzeichen. */
function pdfText(roh: string): string {
  return roh.replace(/([\\()])/g, "\\$1");
}

/**
 * Ein vollständiges PDF mit **berechneter** xref-Tabelle.
 *
 * Ohne xref öffnen viele Betrachter die Datei nur über ihren Reparaturweg; die
 * Vorschau sähe dann je nach Browser kaputt aus. Der Text bleibt reines ASCII —
 * ein Umlaut bräuchte eine Kodierungsangabe an der Schrift, und das ist mehr
 * Aufwand, als eine Demodatei wert ist.
 */
function baueDemoPdf(zeilen: readonly string[]): Uint8Array {
  const inhalt =
    "BT /F1 16 Tf 40 150 Td 22 TL\n" +
    zeilen.map((z) => `(${pdfText(z)}) Tj T*`).join("\n") +
    "\nET\n";

  const objekte = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(inhalt, "latin1")} >>\nstream\n${inhalt}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let text = "%PDF-1.4\n";
  const versaetze: number[] = [];
  objekte.forEach((koerper, i) => {
    versaetze.push(Buffer.byteLength(text, "latin1"));
    text += `${i + 1} 0 obj\n${koerper}\nendobj\n`;
  });

  const xrefAnfang = Buffer.byteLength(text, "latin1");
  // Jeder Eintrag ist EXAKT 20 Byte lang (10 + 1 + 5 + 1 + 1 + 2) — ein Byte
  // daneben, und die Tabelle ist unbrauchbar.
  text += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (const versatz of versaetze) {
    text += `${String(versatz).padStart(10, "0")} 00000 n \n`;
  }
  text +=
    `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefAnfang}\n%%EOF\n`;

  return Buffer.from(text, "latin1");
}

function baueDemoText(zeilen: readonly string[]): Uint8Array {
  // UTF-8 ohne NUL-Byte — genau die beiden Bedingungen aus `_lib/mime.ts`,
  // damit die Datei den echten Prüfweg ebenso besteht wie den Seed.
  return Buffer.from(`${zeilen.join("\n")}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// Die Beschreibung der Daten. Alles, was der Seed anlegt, steht als Datenwerk
// hier — die Funktionen darunter führen nur aus.
// ---------------------------------------------------------------------------

interface DateiBauplan {
  /** nanoid(10)-Form: `/^[A-Za-z0-9_-]{10}$/`, sonst wirft die Ablage. */
  readonly id: string;
  readonly dateiname: string;
  readonly mimeType: ErlaubterMimeTyp;
  readonly avStatus: AvStatus;
  /** `null` = Übertragung abgebrochen: keine Bytes, kein Blob, nicht ladbar. */
  readonly inhalt: Uint8Array | null;
}

interface ShareBauplan {
  readonly id: string;
  readonly titel: string;
  readonly beschreibung: string | null;
  /** Versatz zu „jetzt" in Millisekunden; negativ = bereits abgelaufen. */
  readonly ablaufVersatzMs: number;
  readonly maxDownloads: number | null;
  readonly downloadCount: number;
  readonly passwort: string | null;
  readonly dateien: readonly DateiBauplan[];
  /** Was in der Protokollzeile über diesen Share stehen soll. */
  readonly zweck: string;
}

interface InboxBauplan {
  readonly id: string;
  readonly dateiname: string;
  readonly kategorie: string | null;
  readonly hinweis: string | null;
  readonly mimeType: ErlaubterMimeTyp;
  readonly avStatus: AvStatus;
  readonly inhalt: Uint8Array;
  readonly empfangenVersatzMs: number;
}

/** Der Ersteller im Audit-Feld. Kein FK, reine Anzeige (§4.1). */
const SEED_ERSTELLER = "seed:lokal";

function shareBauplaene(): readonly ShareBauplan[] {
  return [
    {
      id: "seedOffen1",
      titel: "Uebungsbilder Ausbildungsabend",
      beschreibung: "Vier vollstaendige, freigegebene Dateien — der Normalfall.",
      ablaufVersatzMs: 6 * TAG,
      maxDownloads: null,
      downloadCount: 1,
      passwort: null,
      zweck: "offen, ohne Passwort, ohne Download-Limit",
      dateien: [
        {
          id: "seedBild01",
          dateiname: "geraetehaus.png",
          mimeType: "image/png",
          avStatus: "clean",
          inhalt: baueDemoPng(160, 120, [0xc8, 0x00, 0x0f]),
        },
        {
          id: "seedBild02",
          dateiname: "fahrzeug.png",
          mimeType: "image/png",
          avStatus: "clean",
          inhalt: baueDemoPng(160, 120, [0x1f, 0x4e, 0x79]),
        },
        {
          id: "seedPlan01",
          dateiname: "einsatzplan.pdf",
          mimeType: "application/pdf",
          avStatus: "clean",
          inhalt: baueDemoPdf([
            "Einsatzplan (Demodaten)",
            "Lokaler Seed des Moduls files.",
            "Kein echter Einsatz, keine echten Daten.",
          ]),
        },
        {
          id: "seedList01",
          dateiname: "packliste.txt",
          mimeType: "text/plain",
          avStatus: "clean",
          inhalt: baueDemoText([
            "Packliste (Demodaten aus dem lokalen Seed)",
            "",
            "- 2 Kisten Verbandmaterial",
            "- 1 Satz Funkgeräte inkl. Ersatzakkus",
            "- Absperrmaterial für die Übungsstelle",
          ]),
        },
      ],
    },
    {
      id: "seedGeheim",
      titel: "Einsatzdokumentation (passwortgeschuetzt)",
      beschreibung:
        "Traegt absichtlich die vier interessanten Dateizustaende: freigegeben, " +
        "gesperrt, Pruefung fehlgeschlagen, unvollstaendig.",
      ablaufVersatzMs: 3 * TAG,
      maxDownloads: 5,
      downloadCount: 2,
      passwort: SEED_PASSWORT,
      zweck: "passwortgeschuetzt, Download-Limit 5, davon 2 verbraucht",
      dateien: [
        {
          id: "seedDoku01",
          dateiname: "bericht.pdf",
          mimeType: "application/pdf",
          avStatus: "clean",
          inhalt: baueDemoPdf([
            "Einsatzbericht (Demodaten)",
            "Diese Datei ist freigegeben und ladbar.",
          ]),
        },
        {
          id: "seedVirus1",
          dateiname: "verdaechtig.txt",
          mimeType: "text/plain",
          avStatus: "infected",
          // HARMLOSER Inhalt mit gesetztem Status — ausdrücklich KEIN
          // EICAR-Muster: eine Testsignatur auf der Platte lockt jeden echten
          // Virenschutz des Entwicklerrechners an, und dann verschwindet die
          // Datei unter dem laufenden Seed.
          inhalt: baueDemoText([
            "Harmlose Demodatei. Der Status 'infected' steht in der Spalte,",
            "nicht im Inhalt — der Seed schreibt den Endzustand direkt.",
          ]),
        },
        {
          id: "seedFehl01",
          dateiname: "scan-fehlgeschlagen.txt",
          mimeType: "text/plain",
          avStatus: "error",
          inhalt: baueDemoText([
            "Diese Zeile steht auf 'error': die Pruefung war nicht moeglich.",
            "In der Verwaltung fuehrt sie den Knopf 'Pruefung wiederholen' vor.",
          ]),
        },
        {
          id: "seedTeil01",
          dateiname: "wird-noch-uebertragen.pdf",
          mimeType: "application/pdf",
          // `scanning` ist NUR hier erlaubt, und nur weil `inhalt: null` gilt:
          // ohne `bytes_vollstaendig_at` holt die AV-Warteschlange die Zeile
          // nicht ab (`_lib/av.ts`, `auftraege`).
          avStatus: "scanning",
          inhalt: null,
        },
      ],
    },
    {
      id: "seedAlt001",
      titel: "Abgelaufen: Materialliste Vorjahr",
      beschreibung: "Zeigt die Zustandsseite 'abgelaufen' unter /s/<id>.",
      ablaufVersatzMs: -2 * STUNDE,
      maxDownloads: null,
      downloadCount: 0,
      passwort: null,
      zweck: "bereits abgelaufen (vor zwei Stunden)",
      dateien: [
        {
          id: "seedAlt101",
          dateiname: "materialliste.txt",
          mimeType: "text/plain",
          avStatus: "clean",
          inhalt: baueDemoText(["Materialliste des Vorjahres (Demodaten)."]),
        },
      ],
    },
  ];
}

function inboxBauplaene(): readonly InboxBauplan[] {
  return [
    {
      id: "seedIn0001",
      dateiname: "unfallstelle.png",
      kategorie: "bilder",
      hinweis: "Aufnahme von der Uebungsstelle, Blickrichtung Nord.",
      mimeType: "image/png",
      avStatus: "clean",
      inhalt: baueDemoPng(200, 140, [0x2e, 0x7d, 0x32]),
      empfangenVersatzMs: -3 * STUNDE,
    },
    {
      id: "seedIn0002",
      dateiname: "meldung.pdf",
      kategorie: "dokumente",
      hinweis: null,
      mimeType: "application/pdf",
      avStatus: "clean",
      inhalt: baueDemoPdf(["Meldung aus der anonymen Abgabe (Demodaten)."]),
      empfangenVersatzMs: -90 * 60 * SEKUNDE,
    },
    {
      id: "seedIn0003",
      dateiname: "notiz.txt",
      kategorie: "sonstiges",
      hinweis: "Nachtrag zur Meldung von heute Mittag.",
      mimeType: "text/plain",
      // Der zweite AV-Endzustand im Posteingang, damit die Zeilenaktion
      // „Pruefung wiederholen" auch dort etwas zu tun hat.
      avStatus: "error",
      inhalt: baueDemoText(["Nachtrag (Demodaten aus dem lokalen Seed)."]),
      empfangenVersatzMs: -30 * 60 * SEKUNDE,
    },
  ];
}

// ---------------------------------------------------------------------------
// Ablage
// ---------------------------------------------------------------------------

async function* einStueck(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  // `schreibeStrom` nimmt ein `AsyncIterable<Uint8Array>`; ein Array wäre es
  // nicht.
  yield bytes;
}

async function groesseOderNull(ziel: BlobZiel): Promise<number | null> {
  try {
    return await groesse(ziel);
  } catch (fehler) {
    if (fehler instanceof BlobFehlt) return null;
    throw fehler;
  }
}

/**
 * Legt den Blob ab, falls er fehlt, und liefert seine GEMESSENE Länge — genau
 * die Zahl, die in `size` gehört (§5.4: ein falsches `Content-Length` bricht
 * beim Empfänger ab).
 *
 * Der `loesche`-Aufruf davor ist kein Aufräumen auf Verdacht: liegt aus einem
 * abgebrochenen Lauf noch eine `<pfad>.part`, öffnet `schreibeStrom` mit `wx`
 * und bekäme `EEXIST`. `loesche` ist idempotent und nimmt Blob und
 * Zwischendatei mit; erreicht wird die Zeile nur, wenn der endgültige Blob
 * ohnehin fehlt.
 */
async function stelleBlobSicher(ziel: BlobZiel, inhalt: Uint8Array): Promise<number> {
  const vorhanden = await groesseOderNull(ziel);
  if (vorhanden !== null) return vorhanden;

  await loesche(ziel);
  await schreibeStrom(ziel, einStueck(inhalt), { maxBytes: SEED_BLOB_MAX_BYTES });
  const { bytes } = await abschliesse(ziel);
  return bytes;
}

// ---------------------------------------------------------------------------
// Die Schreibwege — je Entität ein eigenes Gate.
// ---------------------------------------------------------------------------

function shareFehlt(db: FilesDb, id: string): boolean {
  return db.select({ id: shares.id }).from(shares).where(eq(shares.id, id)).get() === undefined;
}

function dateiFehlt(db: FilesDb, id: string): boolean {
  return (
    db.select({ id: shareFiles.id }).from(shareFiles).where(eq(shareFiles.id, id)).get() === undefined
  );
}

/**
 * `total_size` NEU BERECHNET statt hochgezählt — dieselbe Summe und dieselbe
 * Bedingung wie im echten Upload-Abschluss (`api/upload/[fileId]/route.ts`):
 * über die Zeilen mit `bytes_vollstaendig_at IS NOT NULL`. Ein zweiter Lauf
 * kommt damit auf denselben Wert; ein Hochzählen käme auf den doppelten.
 */
function rechneTotalSizeNeu(db: FilesDb, shareId: string): void {
  db.update(shares)
    .set({
      totalSize: sql`(SELECT COALESCE(SUM(${shareFiles.size}), 0) FROM ${shareFiles}
        WHERE ${shareFiles.shareId} = ${shareId} AND ${shareFiles.bytesVollstaendigAt} IS NOT NULL)`,
    })
    .where(eq(shares.id, shareId))
    .run();
}

async function legeShareAn(
  db: FilesDb,
  bauplan: ShareBauplan,
  jetzt: Date,
): Promise<{ neu: boolean; bytes: number; ladbar: number; ablaufAt: Date }> {
  const neu = shareFehlt(db, bauplan.id);
  if (neu) {
    db.insert(shares)
      .values({
        id: bauplan.id,
        title: bauplan.titel,
        description: bauplan.beschreibung,
        // Wie der echte Anlegeweg: eine Datei = `file`, mehrere = `folder`.
        type: bauplan.dateien.length === 1 ? "file" : "folder",
        expiresAt: new Date(jetzt.getTime() + bauplan.ablaufVersatzMs),
        maxDownloads: bauplan.maxDownloads,
        downloadCount: bauplan.downloadCount,
        // bcryptjs, cost 12, Präfix `$2b$12$` — dieselbe Familie wie im Bestand.
        passwordHash: bauplan.passwort === null ? null : bcryptHash(bauplan.passwort),
        totalSize: 0,
        createdAt: jetzt,
        createdBy: SEED_ERSTELLER,
      })
      .run();
  }

  let bytes = 0;
  let ladbar = 0;
  for (const datei of bauplan.dateien) {
    const ziel: BlobZiel = { art: "share", shareId: bauplan.id, fileId: datei.id };
    // Erst die Bytes, dann die Zeile: eine Zeile, die Vollständigkeit behauptet,
    // ohne dass ein Blob liegt, ist „nicht auffindbar" (§10.1) — schlimmer als
    // gar keine Zeile. Die Reihenfolge repariert nebenbei einen fehlenden Blob
    // unter einer bereits vorhandenen Zeile.
    const groesseBytes = datei.inhalt === null ? 0 : await stelleBlobSicher(ziel, datei.inhalt);
    if (datei.inhalt !== null) bytes += groesseBytes;
    if (datei.avStatus === "clean" && datei.inhalt !== null) ladbar += 1;

    if (!dateiFehlt(db, datei.id)) continue;
    db.insert(shareFiles)
      .values({
        id: datei.id,
        shareId: bauplan.id,
        filename: datei.dateiname,
        mimeType: datei.mimeType,
        size: groesseBytes,
        createdAt: jetzt,
        bytesVollstaendigAt: datei.inhalt === null ? null : jetzt,
        avStatus: datei.avStatus,
        // Ein Endzustand ohne Prüfzeitpunkt wäre widersprüchlich. Zwei Werte
        // sind KEIN Endzustand und bekommen deshalb keinen: `scanning` (die
        // Prüfung steht noch aus) und `unscanned` — das ist der Altbestand aus
        // dem Import, also gerade der Fall, den noch niemand geprüft hat
        // (`_lib/av.ts`, `istFreigegeben`). Der Seed legt heute keine
        // `unscanned`-Zeile an; der Zweig steht hier, damit die nächste
        // Bauplan-Zeile nicht still eine widersprüchliche Zeile erzeugt.
        avGeprueftAt:
          datei.avStatus === "scanning" || datei.avStatus === "unscanned" ? null : jetzt,
      })
      .run();
  }

  rechneTotalSizeNeu(db, bauplan.id);

  // Der Ablauf kommt aus der ZEILE, nicht aus dem Bauplan: bei einem zweiten
  // Lauf steht in der Spalte weiterhin der Wert des ERSTEN Laufs, und eine
  // Protokollzeile, die stattdessen „jetzt + Versatz" rechnet, nennt ein Datum,
  // das so nirgends gespeichert ist.
  const zeile = db
    .select({ ablaufAt: shares.expiresAt })
    .from(shares)
    .where(eq(shares.id, bauplan.id))
    .get();

  return {
    neu,
    bytes,
    ladbar,
    ablaufAt: zeile?.ablaufAt ?? new Date(jetzt.getTime() + bauplan.ablaufVersatzMs),
  };
}

/**
 * Zwei Protokollzeilen für die Statistik der Detailseite — eine für eine
 * einzelne Datei, eine für den ZIP-Download (`file_id = NULL` ist der
 * 1:1-pflichtige Magic Value, §4.5).
 *
 * Gate ist „gibt es zu diesem Share schon eine Logzeile": die Tabelle hat einen
 * Autoincrement-Schlüssel, also keine feste ID, an der man eine einzelne Zeile
 * wiedererkennen könnte.
 */
function legeLogzeilenAn(db: FilesDb, shareId: string, dateiId: string, jetzt: Date): boolean {
  const vorhanden = db
    .select({ id: downloadLogs.id })
    .from(downloadLogs)
    .where(eq(downloadLogs.shareId, shareId))
    .get();
  if (vorhanden !== undefined) return false;

  db.insert(downloadLogs)
    .values([
      {
        shareId,
        fileId: dateiId,
        // Gekürzt wie `ipKuerzen` es täte — die Spalte trägt nie eine volle
        // Adresse (§4.5).
        clientIpUnbestaetigt: "192.168.178.0",
        userAgent: "Mozilla/5.0 (Seed) Demodaten",
        downloadedAt: new Date(jetzt.getTime() - 2 * STUNDE),
      },
      {
        shareId,
        fileId: null,
        clientIpUnbestaetigt: "10.0.0.0",
        userAgent: "Mozilla/5.0 (Seed) Demodaten",
        downloadedAt: new Date(jetzt.getTime() - 45 * 60 * SEKUNDE),
      },
    ])
    .run();
  return true;
}

/**
 * `verbraucht_*` NEU BERECHNET aus den abgeschlossenen Inbox-Zeilen dieses
 * Links — nicht hochgezählt. `verbucheAbgabe` (`_db/zaehler.ts`) zählt beim
 * echten Upload je Datei einmal hoch; ein Seed, der dasselbe täte, käme bei
 * jedem Lauf höher, obwohl keine Datei dazugekommen ist.
 */
function rechneVerbrauchNeu(db: FilesDb, tokenId: string): void {
  const summe = db
    .select({
      anzahl: sql<number>`COUNT(*)`,
      bytes: sql<number>`COALESCE(SUM(${inboxFiles.size}), 0)`,
    })
    .from(inboxFiles)
    .where(and(eq(inboxFiles.tokenId, tokenId), isNotNull(inboxFiles.bytesVollstaendigAt)))
    .get();

  db.update(zugangslinks)
    .set({
      verbrauchtDateien: summe?.anzahl ?? 0,
      verbrauchtBytes: summe?.bytes ?? 0,
    })
    .where(eq(zugangslinks.id, tokenId))
    .run();
}

// ---------------------------------------------------------------------------

/** Die ID des Abgabelinks — fest, damit der Posteingang-Filter stabil bleibt. */
const LINK_ID = "seedLink01";

/**
 * Legt lokale Demodaten an. Idempotent: ein zweiter Lauf ergänzt nur Fehlendes.
 * Gibt Protokollzeilen zurück.
 */
export async function seedLokalFiles(
  db: BetterSQLite3Database<typeof schema>,
): Promise<string[]> {
  const jetzt = new Date();
  const protokoll: string[] = [];
  const { verwaltung, inbox } = await hostRollen();

  const verwaltungsUrl = (pfad: string) => url(verwaltung, pfad);
  const inboxUrl = (pfad: string) => url(inbox, pfad);

  // --- Freigaben ----------------------------------------------------------
  for (const bauplan of shareBauplaene()) {
    const { neu, bytes, ladbar, ablaufAt } = await legeShareAn(db, bauplan, jetzt);
    protokoll.push(
      `Share ${bauplan.id} „${bauplan.titel}" — ${neu ? "angelegt" : "war schon da"}: ` +
        `${bauplan.zweck}, ${bauplan.dateien.length} Datei(en), davon ${ladbar} ladbar, ` +
        `${bytes} Bytes auf der Platte, laeuft ${zeitpunktBerlin(ablaufAt)} ab.`,
    );
    protokoll.push(`    oeffentlich: ${verwaltungsUrl(`/s/${bauplan.id}`)}`);
    protokoll.push(`    Verwaltung:  ${verwaltungsUrl(`/shares/${bauplan.id}`)}`);
    if (bauplan.passwort !== null) {
      protokoll.push(`    Passwort:    ${bauplan.passwort}`);
    }
    if (ablaufAt.getTime() <= jetzt.getTime()) {
      protokoll.push(
        `    ACHTUNG: bereits abgelaufen — /s/${bauplan.id} zeigt die Zustandsseite. ` +
          `Der Aufraeumlauf holt den Share ab, sobald FILES_LOESCH_KARENZ_STUNDEN ` +
          `verstrichen ist (lokal oft 0); ein zweiter Seed-Lauf legt ihn dann neu an.`,
      );
    }
  }

  // Das Audit-Log des geschützten Shares — sonst ist die Statistik leer.
  if (legeLogzeilenAn(db, "seedGeheim", "seedDoku01", jetzt)) {
    protokoll.push(
      `Download-Log fuer seedGeheim angelegt: 2 Zeilen (eine Einzeldatei, ein ZIP).`,
    );
  } else {
    protokoll.push(`Download-Log fuer seedGeheim war schon da.`);
  }

  // --- Abgabelink und Posteingang -----------------------------------------
  const linkNeu =
    db.select({ id: zugangslinks.id }).from(zugangslinks).where(eq(zugangslinks.id, LINK_ID)).get() ===
    undefined;
  if (linkNeu) {
    db.insert(zugangslinks)
      .values({
        id: LINK_ID,
        name: "Uebung Nord (lokaler Seed)",
        tokenStart: SEED_TOKEN.slice(0, TOKEN_START_LAENGE),
        // Der ROHTOKEN wird nicht gespeichert — nur sein Hash (§4.7).
        tokenHash: tokenHash(SEED_TOKEN),
        createdAt: jetzt,
        createdBy: SEED_ERSTELLER,
        // 48 von höchstens 72 Stunden: lang genug für zwei Arbeitstage, kurz
        // genug, dass der Ablaufzustand lokal ohne Warten zu erzeugen ist.
        expiresAt: new Date(jetzt.getTime() + 48 * STUNDE),
        budgetDateien: 100,
        budgetBytes: 2 * 1024 * 1024 * 1024,
      })
      .run();
  }

  let inboxBytes = 0;
  let inboxNeu = 0;
  for (const bauplan of inboxBauplaene()) {
    const ziel: BlobZiel = { art: "inbox", inboxFileId: bauplan.id };
    const groesseBytes = await stelleBlobSicher(ziel, bauplan.inhalt);
    inboxBytes += groesseBytes;

    const vorhanden = db
      .select({ id: inboxFiles.id })
      .from(inboxFiles)
      .where(eq(inboxFiles.id, bauplan.id))
      .get();
    if (vorhanden !== undefined) continue;

    const empfangen = new Date(jetzt.getTime() + bauplan.empfangenVersatzMs);
    db.insert(inboxFiles)
      .values({
        id: bauplan.id,
        tokenId: LINK_ID,
        dateiname: bauplan.dateiname,
        kategorie: bauplan.kategorie,
        hinweis: bauplan.hinweis,
        mimeType: bauplan.mimeType,
        size: groesseBytes,
        clientIpUnbestaetigt: "192.168.178.0",
        empfangenAt: empfangen,
        bytesVollstaendigAt: empfangen,
        avStatus: bauplan.avStatus,
        // Dieselbe Regel wie bei den Share-Dateien: nur ein Endzustand trägt
        // einen Prüfzeitpunkt.
        avGeprueftAt:
          bauplan.avStatus === "scanning" || bauplan.avStatus === "unscanned" ? null : empfangen,
      })
      .run();
    inboxNeu += 1;
  }

  rechneVerbrauchNeu(db, LINK_ID);

  // Auch hier der Wert AUS DER ZEILE: die Laufzeit wird nur beim Anlegen
  // gesetzt, ein zweiter Lauf verlaengert den Link ausdruecklich nicht.
  const linkZeile = db
    .select({ ablaufAt: zugangslinks.expiresAt })
    .from(zugangslinks)
    .where(eq(zugangslinks.id, LINK_ID))
    .get();
  protokoll.push(
    `Zugangslink ${LINK_ID} „Uebung Nord (lokaler Seed)" — ${linkNeu ? "angelegt" : "war schon da"}, ` +
      `laeuft ${linkZeile === undefined ? "?" : zeitpunktBerlin(linkZeile.ablaufAt)} ab ` +
      `(die Laufzeit wird nur beim Anlegen gesetzt; ein abgelaufener Link wird nicht verlaengert).`,
  );
  if (linkZeile !== undefined && linkZeile.ablaufAt.getTime() <= jetzt.getTime()) {
    protokoll.push(
      `    ACHTUNG: der Abgabelink ist abgelaufen; /u/<token> nimmt nichts mehr an. ` +
        `Dieser Seed verlaengert ihn NICHT (er ueberschreibt nichts) — fuer einen frischen Link ` +
        `die Zeile ${LINK_ID} in zugangslinks loeschen und erneut seeden.`,
    );
  }
  protokoll.push(`    Abgabe:      ${inboxUrl(`/u/${SEED_TOKEN}`)}`);
  protokoll.push(`    Token:       ${SEED_TOKEN}  (Anzeige in der Liste: ${SEED_TOKEN.slice(0, TOKEN_START_LAENGE)})`);
  protokoll.push(`    Verwaltung:  ${verwaltungsUrl("/zugangslinks")}`);
  protokoll.push(
    `Posteingang: ${inboxNeu} von ${inboxBauplaene().length} Zeile(n) neu, ${inboxBytes} Bytes auf der Platte ` +
      `(Kategorien bilder/dokumente/sonstiges, eine davon mit AV-Status 'error').`,
  );
  protokoll.push(`    Posteingang: ${verwaltungsUrl("/posteingang")}`);

  // --- Hinweise, die man sonst erst beim Suchen findet ---------------------
  protokoll.push(
    `Hinweis: der Seed schreibt den AV-ENDZUSTAND direkt ('clean'/'infected'/'error') — ` +
      `er braucht deshalb KEINEN laufenden Scanner. Fuer eigene Uploads bleibt ` +
      `'pnpm dev:av' noetig, sonst steht jede hochgeladene Datei auf „wird geprueft".`,
  );
  if (verwaltung === null || inbox === null) {
    protokoll.push(
      `Hinweis: SUITE_HOST_FILES ist in dieser Umgebung nicht (vollstaendig) gesetzt — ` +
        `die Links oben tragen deshalb nur den Pfad. Lokal gilt ` +
        `SUITE_HOST_FILES=files.localtest.me,drop.localtest.me (Index 0 = Verwaltung, 1 = Inbox).`,
    );
  }

  return protokoll;
}

/**
 * Die beiden Hosts aus `SUITE_HOST_FILES`, über die EINE Stelle, die die
 * Rollenreihenfolge kennt (`_lib/hostRolle.ts`, Index 0 = Verwaltung,
 * Index 1 = Inbox). Ein eigenes `process.env.SUITE_HOST_FILES.split(",")` wäre
 * eine zweite Auflösung und liefe irgendwann anders herum.
 *
 * DYNAMISCH IMPORTIERT UND ABGESICHERT: `hostRolle.ts` zieht `next/navigation`
 * herein (`notFound()`), und dieser Seed läuft aus einem nackten
 * tsx-Skript ohne Next-Laufzeit. Ein Ladefehler dort darf den Seed nicht
 * kosten — ohne Host bleiben die Protokollzeilen eben pfadrelativ, und der
 * Hinweis dazu steht am Ende der Ausgabe.
 */
async function hostRollen(): Promise<{ verwaltung: string | null; inbox: string | null }> {
  try {
    const { hostFuerRolle } = await import("@/app/m/files/_lib/hostRolle");
    return { verwaltung: hostFuerRolle("verwaltung"), inbox: hostFuerRolle("inbox") };
  } catch {
    return { verwaltung: null, inbox: null };
  }
}

function url(host: string | null, pfad: string): string {
  return host === null ? pfad : `http://${host}:${DEV_PORT}${pfad}`;
}
