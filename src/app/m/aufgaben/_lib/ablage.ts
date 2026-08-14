/**
 * Die Ablage der Bildnachweise (Aufgabe 18, Spec §5.3, §6 `datei`, §7).
 *
 * Vorbild ist `files/_lib/storage.ts`: ein Pfad entsteht AUSSCHLIESSLICH aus
 * der `id` der `dateien`-Zeile, nie aus dem hochgeladenen Dateinamen. **Der
 * Dateiname aus dem Upload ist Eingabe, kein Pfad** — er ist Anzeigetext fuer
 * die Spalte `dateiname` und wird von dieser Datei nirgends gelesen, um einen
 * Pfad zu bilden. Ein Name mit `../` oder ein absoluter Pfad ist damit
 * STRUKTURELL ausgeschlossen, nicht nur durch einen Guard abgefangen: die
 * Funktion, die den Pfad baut (`pfadFuer`), nimmt den Dateinamen gar nicht
 * entgegen.
 *
 * Warum trotzdem eine ID-Pruefung (`pruefeId`/`ID_MUSTER`) VOR jeder
 * Pfadaufloesung steht, obwohl `id` normalerweise aus `nanoid()` kommt (kein
 * Nutzereingriff): dieselbe Vorsicht wie in `files/_lib/storage.ts` — eine
 * DB-Zeile, die durch einen spaeteren Import oder eine Handkorrektur einen
 * verdorbenen Wert traegt (z. B. `id = "../../etc/passwd"`), darf keinen Pfad
 * ausserhalb der Ablagewurzel erzeugen. Die Pruefung ist die zweite Linie
 * hinter der strukturellen Ausschliessung oben, nicht ihr Ersatz.
 *
 * ENTSCHEIDUNG (Aufgabe 18, vertagt seit Aufgabe 2): `datei.pfad` aus Spec §6
 * ist KEINE Spalte in `_db/schema.ts` — der Pfad wird hier abgeleitet, nicht
 * gespeichert. Begruendung steht im Kopfkommentar von `_db/schema.ts` bei der
 * Tabelle `dateien`.
 *
 * MIME-PRUEFUNG: nur Bildformate (Spec §5.3 nennt ausschliesslich `bild` als
 * Dateinachweis), gepruft ueber MAGIC BYTES — nicht ueber die Dateiendung und
 * nicht ueber den vom Client gemeldeten Typ, beide sind frei waehlbar. Die
 * Signaturtabelle ist eine verkleinerte Kopie von `files/_lib/mime.ts`
 * (dieselbe Quelle, dieselbe Faelle-27-Begruendung), auf die Bildformate
 * gekuerzt: `aufgaben` liefert keine Office-Dokumente und keinen Text aus.
 *
 * GROESSENPRUEFUNG: eine konfigurierbare Obergrenze, die an EINER Stelle
 * lebt (`NACHWEIS_MAX_BYTES` unten) — Server-Action und Formular (Aufgabe 19)
 * importieren denselben Wert, statt ihn zweimal zu benennen.
 *
 * FAIL-CLOSED: `legeNachweisAb` schreibt ERST, nachdem MIME- und
 * Groessenpruefung bestanden sind. Es gibt deshalb keine Zwischendatei und
 * keinen Aufraeumpfad wie bei `files` (chunked Upload) — bei „ein paar
 * Bildern pro Woche" ist das ganze Bild im Speicher zu halten unproblematisch,
 * und eine abgelehnte Datei hinterlaesst dadurch STRUKTURELL keinen Rest: es
 * gibt keinen Schreibvorgang, den man rueckgaengig machen muesste.
 *
 * KEIN `"use client"`, KEIN `@ant-design/icons` (Fallen 6 und 7).
 */
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** Das nanoid-Alphabet in genau 21 Zeichen — die Vorgabelaenge von `newId()` in `_db/schema.ts`. */
const ID_MUSTER = /^[A-Za-z0-9_-]{21}$/;

const ABLAGE_MODUS = 0o750;
const BLOB_MODUS = 0o640;

/** Eine DB-Zeile trug eine ID, die keine nanoid(21) ist — ein Datenfehler, kein Nutzerfehler. */
export class UngueltigeId extends Error {
  constructor(botschaft: string) {
    super(botschaft);
    this.name = "UngueltigeId";
  }
}

/**
 * `DATA_DIR` wird bei JEDEM Aufruf gelesen, nicht beim Import — dieselbe Form
 * wie `core/db/index.ts` und `files/_lib/storage.ts`. Eigenes Unterverzeichnis
 * `aufgaben/`, sibling zu `files/`: clamd soll die Modul-DATENBANKEN nicht
 * sehen (die liegen direkt unter `DATA_DIR`), nur die Blobs der Module, die es
 * scannen muss.
 */
function ablageWurzel(): string {
  // `resolve` macht das relative Dev-Vorgabeverzeichnis absolut: clamd bekommt
  // den Pfad per `zSCAN` und hat ein anderes Arbeitsverzeichnis als der
  // Node-Prozess der Suite.
  return resolve(process.env.DATA_DIR ?? "./.data", "aufgaben");
}

function pruefeId(id: string): string {
  if (!ID_MUSTER.test(id)) {
    throw new UngueltigeId(`[aufgaben][ablage] id "${id}" ist keine nanoid(21) und kann kein Pfad werden`);
  }
  return id;
}

/**
 * Die Pfadfunktion ist PRIVAT und nimmt ausschliesslich die `id` entgegen —
 * kein Dateiname, kein Client-Wert. Sie prueft die ID, BEVOR irgendetwas
 * aufgeloest wird; das Aufloesen selbst ist kein Guard.
 */
function pfadFuer(id: string): string {
  return join(ablageWurzel(), pruefeId(id));
}

/**
 * Der einzige Weg, auf dem ein Pfad dieses Modul verlaesst: `_lib/scan.ts`
 * braucht ihn fuer `zSCAN <pfad>` — clamd liest die Datei selbst. Absolut, aus
 * demselben Grund wie `files/_lib/storage.ts:scanPfad`.
 *
 * Kein anderer Aufrufer soll ihn direkt benutzen; wer einen Pfad braucht,
 * braucht in Wahrheit eine der Operationen dieser Datei.
 */
export function nachweisPfad(id: string): string {
  return pfadFuer(id);
}

function errnoCode(fehler: unknown): string | undefined {
  if (typeof fehler === "object" && fehler !== null && "code" in fehler) {
    const code = (fehler as NodeJS.ErrnoException).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// MIME-Pruefung ueber Magic Bytes — nur Bildformate.
// ---------------------------------------------------------------------------

export type ErlaubterBildTyp =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/heic"
  | "image/heif";

function ascii(text: string): number[] {
  return [...text].map((zeichen) => zeichen.charCodeAt(0));
}

/** ISO-BMFF-Marken ab Offset 8 — dieselbe Tabelle wie `files/_lib/mime.ts`. */
const HEIC_MARKEN = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"] as const;
const HEIF_MARKEN = ["mif1", "msf1"] as const;

type Signatur = { typ: ErlaubterBildTyp; teile: readonly { ab: number; bytes: readonly number[] }[] };

const SIGNATUREN: readonly Signatur[] = [
  { typ: "image/jpeg", teile: [{ ab: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { typ: "image/png", teile: [{ ab: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  { typ: "image/gif", teile: [{ ab: 0, bytes: ascii("GIF87a") }] },
  { typ: "image/gif", teile: [{ ab: 0, bytes: ascii("GIF89a") }] },
  {
    typ: "image/webp",
    teile: [
      { ab: 0, bytes: ascii("RIFF") },
      { ab: 8, bytes: ascii("WEBP") },
    ],
  },
  ...HEIC_MARKEN.map<Signatur>((marke) => ({
    typ: "image/heic",
    teile: [
      { ab: 4, bytes: ascii("ftyp") },
      { ab: 8, bytes: ascii(marke) },
    ],
  })),
  ...HEIF_MARKEN.map<Signatur>((marke) => ({
    typ: "image/heif",
    teile: [
      { ab: 4, bytes: ascii("ftyp") },
      { ab: 8, bytes: ascii(marke) },
    ],
  })),
];

/**
 * `null` heisst „keine Signatur getroffen" — keine Vorstufe zu irgendeinem
 * Format, schlicht keine Evidenz. Jede Signatur greift nur an ihrem festen
 * Offset (dieselbe Begruendung wie `files/_lib/mime.ts`: eine
 * laengenunabhaengige Suche liesse ein abgeschnittenes Praefix faelschlich
 * treffen).
 */
function bildTypAus(praefix: Uint8Array): ErlaubterBildTyp | null {
  for (const signatur of SIGNATUREN) {
    const trifft = signatur.teile.every(
      (teil) =>
        teil.ab + teil.bytes.length <= praefix.length &&
        teil.bytes.every((byte, i) => praefix[teil.ab + i] === byte),
    );
    if (trifft) return signatur.typ;
  }
  return null;
}

/**
 * 8 MiB — eine Betreiberzahl mit einer erfundenen Vorbelegung, aber an EINER
 * Stelle. `dateien.groesse` (Spec §6) speichert die GEMESSENE Groesse, diese
 * Konstante ist die Obergrenze dagegen.
 */
export const NACHWEIS_MAX_BYTES = 8 * 1024 * 1024;

export type AblageAblehnungsGrund = "kein-inhalt" | "inhalt-nicht-erlaubt" | "zu-gross";

export type AblageBefund =
  | { readonly ok: true; readonly mime: ErlaubterBildTyp; readonly groesse: number }
  | { readonly ok: false; readonly grund: AblageAblehnungsGrund; readonly meldung: string };

function ablehnung(grund: AblageAblehnungsGrund, meldung: string): AblageBefund {
  return { ok: false, grund, meldung };
}

/**
 * Legt einen Bildnachweis ab — MIME- und Groessenpruefung ZUERST, geschrieben
 * wird nur bei Erfolg (fail-closed, keine halbe Datei).
 *
 * `dateiname` wird ENTGEGENGENOMMEN, weil das eine reale Uploadstrecke
 * (Aufgabe 19) ohnehin mitbringt — und ABSICHTLICH NICHT GELESEN: er ist
 * Anzeigetext fuer die Spalte `dateiname`, niemals Eingabe fuer `pfadFuer`.
 * Der Test dieser Datei belegt das mit einem echten Traversal-Namen, nicht
 * mit einer Behauptung.
 *
 * `id` MUSS vom Aufrufer stammen (z. B. `newId()` aus `_db/schema.ts`, vor dem
 * INSERT der `dateien`-Zeile erzeugt) — dieselbe Entkopplung wie `BlobZiel` in
 * `files`: die DB-Zeile und der Blob teilen sich eine ID, ohne dass die eine
 * auf die andere warten muss.
 */
export async function legeNachweisAb(
  id: string,
  dateiname: string,
  bytes: Uint8Array,
  maxBytes: number = NACHWEIS_MAX_BYTES,
): Promise<AblageBefund> {
  void dateiname; // Anzeigetext — bewusst ungelesen, siehe Kopfkommentar.

  if (bytes.byteLength === 0) {
    return ablehnung("kein-inhalt", "Die Datei enthält keine Bytes.");
  }
  if (bytes.byteLength > maxBytes) {
    return ablehnung(
      "zu-gross",
      `Die Datei ist ${bytes.byteLength} Bytes groß, erlaubt sind höchstens ${maxBytes} Bytes.`,
    );
  }
  const mime = bildTypAus(bytes);
  if (mime === null) {
    return ablehnung(
      "inhalt-nicht-erlaubt",
      "Der Inhalt gehört zu keinem der erlaubten Bildformate (JPEG, PNG, GIF, WebP, HEIC, HEIF).",
    );
  }

  const pfad = pfadFuer(id);
  await mkdir(dirname(pfad), { recursive: true, mode: ABLAGE_MODUS });
  const griff = await open(pfad, "wx", BLOB_MODUS);
  try {
    await griff.write(bytes);
    await griff.sync();
  } finally {
    await griff.close().catch(() => {});
  }

  return { ok: true, mime, groesse: bytes.byteLength };
}

/** Fehlende Datei → `null`, kein Wurf — der Aufrufer entscheidet ueber 404. */
export async function leseNachweis(id: string): Promise<Uint8Array | null> {
  try {
    return await readFile(pfadFuer(id));
  } catch (fehler) {
    if (errnoCode(fehler) === "ENOENT") return null;
    throw fehler;
  }
}

/** Idempotent: eine fehlende Datei ist KEIN Fehler. */
export async function loescheNachweis(id: string): Promise<void> {
  try {
    await unlink(pfadFuer(id));
  } catch (fehler) {
    if (errnoCode(fehler) === "ENOENT") return;
    throw fehler;
  }
}
