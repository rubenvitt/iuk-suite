/**
 * Die Ablage des Moduls `files` — die EINZIGE Stelle, an der ein Dateipfad entsteht
 * (Spec §5.1–§5.4).
 *
 * Warum das eine Datei ist und nicht ein Helfer unter vielen: ein Pfad entsteht hier
 * ausschliesslich aus DB-IDs, und **kein Dateiname steckt im Pfad**. Damit verschwindet
 * die Traversal-Klasse strukturell statt per Guard — auf S3 sind `..` und `/` gewoehnliche
 * Key-Bytes, `path.join` verlaesst bei `..`-Segmenten die Wurzel, und kein statisches
 * Werkzeug kennt diesen Unterschied (Analyse Falle 27). Wer hier eine zweite Pfadquelle
 * eroeffnet, hebt die Zusage fuer das ganze Modul auf.
 *
 * Erbe fuer Spec 2: dieses Pfadschema ist das Ziel des Blob-Umzugs. Der Quellpfad
 * existiert im Ziel nicht mehr — der Paritaets-Schluessel ist deshalb der Inhalts-Hash,
 * nicht `relPath`.
 */
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";

export type BlobZiel =
  | { art: "share"; shareId: string; fileId: string }
  | { art: "inbox"; inboxFileId: string };

/** Das nanoid-`urlAlphabet` in genau zehn Zeichen — die Naht zwischen „Daten" und „Pfad". */
const ID_MUSTER = /^[A-Za-z0-9_-]{10}$/;

/**
 * Der Suffix der Zwischendatei, **deterministisch und ohne Zufallsanteil**. Vier Zusagen
 * haengen daran: der Fortschritt des chunked Uploads ist ihre Laenge, das Abbrechen und
 * das Aufraeumen finden sie, und `--exclude='*.part'` in `scripts/backup.sh` trifft sie.
 * Mit einem Zufallsanteil im Namen fielen alle vier (§5.3).
 */
const TEIL_SUFFIX = ".part";

/**
 * Datei- und Verzeichnismodus sind **explizit** (§6.5), und zwar hier und nicht in
 * `_lib/grenzen.ts`: ein Dateimodus ist keine Grenze, sondern eine Ablage-Eigenschaft.
 *
 * Ohne die Angabe gilt `0o666 & ~umask`, und der Fall „clamd darf nicht lesen" faellt
 * erst am Zielhost auf — als `error` auf JEDER Datei, also fail-closed in Produktion.
 * clamd laeuft im Image als uid 100/gid 101, der Suite-Prozess als uid 1001/gid 1001.
 *
 * Die Spec laesst genau ZWEI Varianten zu, und nur diese eine gilt: `0o640` **plus
 * gemeinsame gid**. Die andere waere ein `user:` am clamav-Service. Welche am laufenden
 * Host traegt, ist **§13.3 Frage 16** (`zSCAN` im Sidecar auf eine frisch geschriebene
 * Datei) — die zweite Variante gehoert also nicht ZUSAETZLICH eingebaut.
 */
const BLOB_MODUS = 0o640;
const ABLAGE_MODUS = 0o750;

/** Inhalt der Boot-Probe; er wird zurueckgelesen, damit die Probe mehr als „open ging" belegt. */
const PROBE_INHALT = "iuk-files-ablage-probe";

/** Eine DB-Zeile trug eine ID, die keine nanoid(10) ist — ein Datenfehler, kein Nutzerfehler. */
export class UngueltigeId extends Error {
  constructor(botschaft: string) {
    super(botschaft);
    this.name = "UngueltigeId";
  }
}

/** Der Blob fehlt. Der Aufrufer antwortet **404** mit benanntem Zustand, nicht 500 (§5.4). */
export class BlobFehlt extends Error {
  constructor(botschaft: string) {
    super(botschaft);
    this.name = "BlobFehlt";
  }
}

/** Beim **Zaehlen** ueberschritten — nie aus einer gemeldeten Groesse. Der Aufrufer antwortet 413. */
export class GroesseUeberschritten extends Error {
  readonly maxBytes: number;
  constructor(maxBytes: number) {
    super(`Groesse ueberschritten: mehr als ${maxBytes} Bytes`);
    this.name = "GroesseUeberschritten";
    this.maxBytes = maxBytes;
  }
}

/** ENOSPC: das Volume ist voll. Der Aufrufer antwortet **507**; die Zwischendatei ist weg (§5.4). */
export class KeinPlatz extends Error {
  constructor(botschaft: string, ursache?: unknown) {
    super(botschaft, { cause: ursache });
    this.name = "KeinPlatz";
  }
}

/** EACCES/EPERM/EROFS: Konfigurationsfehler. Der Aufrufer antwortet **500**, und wir loggen laut. */
export class AblageNichtSchreibbar extends Error {
  constructor(botschaft: string, ursache?: unknown) {
    super(botschaft, { cause: ursache });
    this.name = "AblageNichtSchreibbar";
  }
}

/**
 * `DATA_DIR` wird bei **jedem** Aufruf gelesen, nicht beim Import — dieselbe Form wie
 * `core/db/index.ts`. Ein modulweit festgehaltener Wert waere in Tests und beim Boot
 * eine stille Falle.
 */
function ablageWurzel(): string {
  // `resolve` macht das relative Dev-Vorgabeverzeichnis absolut: clamd bekommt den Pfad
  // per `zSCAN` und hat ein anderes Arbeitsverzeichnis als der Node-Prozess.
  return resolve(process.env.DATA_DIR ?? "./.data", "files");
}

function pruefeId(id: string, feld: string): string {
  if (!ID_MUSTER.test(id)) {
    throw new UngueltigeId(`[files] ${feld} ist keine nanoid(10) und kann kein Pfad werden`);
  }
  return id;
}

/**
 * Die Pfadfunktion ist **privat**. Sie prueft jede ID, **bevor** irgendetwas aufgeloest
 * wird — das Aufloesen ist kein Guard. Damit ist ein Ausbruch auch dann unmoeglich, wenn
 * eine DB-Zeile durch einen Import verdorben wurde.
 */
function pfadFuer(ziel: BlobZiel): string {
  const teile =
    ziel.art === "share"
      ? [pruefeId(ziel.shareId, "shareId"), pruefeId(ziel.fileId, "fileId")]
      : ["inbox", pruefeId(ziel.inboxFileId, "inboxFileId")];
  return join(ablageWurzel(), ...teile);
}

/** Fuer Logzeilen und Fehlermeldungen: die IDs, nie der Pfad. */
function benenne(ziel: BlobZiel): string {
  return ziel.art === "share" ? `share ${ziel.shareId}/${ziel.fileId}` : `inbox ${ziel.inboxFileId}`;
}

function errnoCode(fehler: unknown): string | undefined {
  if (typeof fehler === "object" && fehler !== null && "code" in fehler) {
    const code = (fehler as NodeJS.ErrnoException).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Die zwei Betriebsfehler aus §5.4 bekommen **eigene** Typen, statt als
 * `NodeJS.ErrnoException` durchzureichen: nur so kann ein Route Handler sie ohne
 * String-Vergleich auf 507 bzw. 500 abbilden. Alles andere fliegt unveraendert weiter —
 * insbesondere `EEXIST`, das der zweite Starter auf dasselbe Ziel sehen soll.
 */
function uebersetze(fehler: unknown, was: string): unknown {
  const code = errnoCode(fehler);
  if (code === "ENOSPC") {
    return new KeinPlatz(`[files] kein Platz in der Ablage (${was})`, fehler);
  }
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    // Laut, weil es ein Konfigurationsfehler ist und kein Nutzerfehler: ohne diese Zeile
    // sieht der Betreiber nur 500 ohne Grund.
    console.error(`[files] Ablage nicht schreibbar (${code}) bei ${was}`, fehler);
    return new AblageNichtSchreibbar(`[files] Ablage nicht schreibbar (${code}) bei ${was}`, fehler);
  }
  return fehler;
}

async function entferneStill(pfad: string): Promise<void> {
  try {
    await unlink(pfad);
  } catch (fehler) {
    if (errnoCode(fehler) === "ENOENT") return;
    throw uebersetze(fehler, pfad);
  }
}

async function laengeOderNull(pfad: string): Promise<number | null> {
  try {
    return (await stat(pfad)).size;
  } catch (fehler) {
    if (errnoCode(fehler) === "ENOENT") return null;
    throw uebersetze(fehler, pfad);
  }
}

/**
 * Schreibt in die Zwischendatei `<pfad>.part` und fsynct sie. **Benennt nicht um** — das
 * tut `abschliesse`.
 *
 * Warum getrennt, obwohl §5.2 beides in einem Kommentar nennt: `anhaengen: false` deckt
 * laut §5.3 den einmaligen Schreibvorgang **und** den ersten Chunk ab, kann also nicht
 * zugleich „das war der letzte" bedeuten. Und beim letzten Chunk liegt die
 * Magic-Byte-Pruefung **zwischen** dem Schreiben und dem Umbenennen (§7.1, §8.5): sie
 * liest Bytes, die in einer frueheren Anfrage angekommen sind, und ihr Fehlschlag darf
 * das Ziel nie entstehen lassen. Ein `ende`-Schalter an dieser Funktion koennte diese
 * Reihenfolge nicht herstellen.
 *
 * `opts.maxBytes` wird **beim Zaehlen** durchgesetzt, nie aus einer gemeldeten Groesse —
 * und beim Anhaengen zaehlen die bereits liegenden Bytes mit, sonst unterlaufen viele
 * kleine Chunks die Grenze.
 *
 * **Fuer den Aufrufer verbindlich (§5.3):** der ERSTE Chunk eines Uploads ruft
 * `anhaengen: false` und bekommt damit `wx` — nur so sieht ein zweiter Starter auf dasselbe
 * Ziel `EEXIST` statt verschraenkter Bytes (der Gegenfall ist in `drop` gemessen: vier
 * gleichzeitige Uploads gleichen Namens → vier 200, ZWEI Dateien). `anhaengen: true` ist
 * ausschliesslich der FOLGEchunk; es oeffnet mit `a` und legte eine fehlende Zwischendatei
 * auch neu an, kann die Exklusivitaet also nicht tragen. Die Wache dagegen liegt beim
 * Aufrufer: `ab` gegen die aktuelle Laenge (`fortschritt`) pruefen und sonst 409 (§7.1).
 *
 * Liefert die **gemessene** Gesamtzahl der Bytes in der Zwischendatei; sie ist die Quelle
 * fuer `size`.
 */
export async function schreibeStrom(
  ziel: BlobZiel,
  quelle: AsyncIterable<Uint8Array>,
  opts: { maxBytes: number; anhaengen?: boolean },
): Promise<{ bytes: number }> {
  const pfad = pfadFuer(ziel);
  const teil = `${pfad}${TEIL_SUFFIX}`;
  const eltern = dirname(pfad);

  try {
    // In `core` legt der einzige `mkdirSync` das Verzeichnis einer DB-Datei an
    // (`core/db/index.ts:14-15`); `<DATA_DIR>/files/` legt nichts an.
    // Der Modus gilt fuer alle neu entstandenen Ebenen; umask 022/027 laesst 0o750 stehen.
    await mkdir(eltern, { recursive: true, mode: ABLAGE_MODUS });
  } catch (fehler) {
    throw uebersetze(fehler, eltern);
  }

  let bytes = opts.anhaengen ? ((await laengeOderNull(teil)) ?? 0) : 0;

  // `wx` fuer den Starter: ein zweiter Starter auf dasselbe Ziel bekommt EEXIST und damit
  // einen GEMELDETEN Konflikt statt verschraenkter Bytes. `a` fuer jeden Folgechunk.
  const griff = await open(teil, opts.anhaengen ? "a" : "wx", BLOB_MODUS).catch((fehler: unknown) => {
    throw uebersetze(fehler, teil);
  });

  try {
    for await (const stueck of quelle) {
      if (bytes + stueck.byteLength > opts.maxBytes) {
        throw new GroesseUeberschritten(opts.maxBytes);
      }
      await griff.write(stueck);
      bytes += stueck.byteLength;
    }
    // fsync vor dem Verlassen: ohne ihn haette ein Stromausfall eine Zwischendatei mit
    // Metadaten, aber ohne Daten — und `abschliesse` benennt sie ahnungslos um.
    await griff.sync();
  } catch (rohFehler) {
    const fehler = uebersetze(rohFehler, teil);
    // Aufgeraeumt wird bei den ZWEI benannten Faellen: Grenze (§5.4, 413) und ENOSPC
    // (§5.4, 507 „Zwischendatei geloescht"). Bei allen anderen bleibt sie liegen — beim
    // chunked Weg ist sie der Fortschritt, und ein Verbindungsabbruch darf ihn nicht
    // kosten; ein wirklich verwaister Rest ist Sache des Aufraeum-Laufs (§7.6).
    if (fehler instanceof GroesseUeberschritten || fehler instanceof KeinPlatz) {
      await griff.close().catch(() => {});
      // Bewusst `unlink` und NICHT `entferneStill` — dieselbe Linie wie im `finally` von
      // `pruefeAblage`: dessen `uebersetze` wuerfe auf einer nur lesbar eingehaengten Ablage
      // ein zweites Mal und ERSETZTE damit den Fehler, den dieser Zweig bewahren soll. Aus
      // 413 bzw. 507 wuerde still 500 samt lauter Logzeile fuer einen reinen Nutzerfehler.
      // Der fliegende Fehler hat Vorrang; ein misslungenes Aufraeumen ist Sache des
      // Aufraeum-Laufs (§7.6).
      await unlink(teil).catch(() => {});
      throw fehler;
    }
    throw fehler;
  } finally {
    // In jedem Ausgang, sonst leckt der File-Descriptor (§5.3). Ein zweites `close` nach
    // dem Aufraeumpfad ist harmlos und billiger als zwei Ausgaenge.
    await griff.close().catch(() => {});
  }

  return { bytes };
}

/**
 * Benennt die Zwischendatei atomar auf das Ziel um — der EINE Moment, in dem der Blob
 * entsteht. `rename` ist nur innerhalb eines Dateisystems atomar, deshalb liegt die
 * Zwischendatei im selben Verzeichnis.
 *
 * Ohne Zwischendatei: `BlobFehlt` — es gibt nichts abzuschliessen.
 */
export async function abschliesse(ziel: BlobZiel): Promise<{ bytes: number }> {
  const pfad = pfadFuer(ziel);
  const teil = `${pfad}${TEIL_SUFFIX}`;

  const bytes = await laengeOderNull(teil);
  if (bytes === null) throw new BlobFehlt(`[files] keine Zwischendatei fuer ${benenne(ziel)}`);

  try {
    await rename(teil, pfad);
  } catch (fehler) {
    throw uebersetze(fehler, teil);
  }
  return { bytes };
}

/** Fehlende Datei → `BlobFehlt` (der Aufrufer antwortet 404, nicht 500). */
export async function lieseStrom(ziel: BlobZiel): Promise<{ strom: Readable; bytes: number }> {
  const pfad = pfadFuer(ziel);
  const bytes = await laengeOderNull(pfad);
  if (bytes === null) throw new BlobFehlt(`[files] Blob fehlt: ${benenne(ziel)}`);
  return { strom: createReadStream(pfad), bytes };
}

/** Fehlende Datei → `BlobFehlt`. */
export async function groesse(ziel: BlobZiel): Promise<number> {
  const bytes = await laengeOderNull(pfadFuer(ziel));
  if (bytes === null) throw new BlobFehlt(`[files] Blob fehlt: ${benenne(ziel)}`);
  return bytes;
}

/**
 * Idempotent: eine fehlende Datei ist KEIN Fehler. Loescht auch eine liegen gebliebene
 * Zwischendatei desselben Ziels — sonst bleibt nach einem Abbruch halber Muell liegen,
 * den nur noch ein Verzeichnislisting findet.
 */
export async function loesche(ziel: BlobZiel): Promise<void> {
  const pfad = pfadFuer(ziel);
  await entferneStill(pfad);
  await entferneStill(`${pfad}${TEIL_SUFFIX}`);
}

/**
 * Der Fortschritt eines chunked Uploads ist die **Laenge der Zwischendatei** — kein
 * zweiter Mechanismus, kein zweiter Zustand, der auseinanderlaufen kann (§7.1 Schritt 3).
 * Nichts angekommen (oder schon abgeschlossen) → 0, also genau der naechste `ab`-Wert.
 */
export async function fortschritt(ziel: BlobZiel): Promise<number> {
  return (await laengeOderNull(`${pfadFuer(ziel)}${TEIL_SUFFIX}`)) ?? 0;
}

/**
 * Der Kopf der **Zwischendatei**, fuer die Magic-Byte-Pruefung des letzten Chunks (§8.5).
 * Bewusst die Zwischendatei und nicht das Ziel: die Pruefung entscheidet, ob das Ziel
 * ueberhaupt entstehen darf.
 */
export async function kopfBytes(ziel: BlobZiel, anzahl: number): Promise<Uint8Array> {
  const teil = `${pfadFuer(ziel)}${TEIL_SUFFIX}`;

  let griff;
  try {
    griff = await open(teil, "r");
  } catch (fehler) {
    if (errnoCode(fehler) === "ENOENT") {
      throw new BlobFehlt(`[files] keine Zwischendatei fuer ${benenne(ziel)}`);
    }
    throw uebersetze(fehler, teil);
  }

  try {
    const puffer = Buffer.alloc(anzahl);
    const { bytesRead } = await griff.read(puffer, 0, anzahl, 0);
    return puffer.subarray(0, bytesRead);
  } finally {
    await griff.close().catch(() => {});
  }
}

/**
 * Die Boot-Probe (§5.6): `<DATA_DIR>/files` anlegen, eine Probedatei schreiben, lesen,
 * loeschen. Scheitert das, bricht der Start ab — fail fast, statt beim ersten Upload
 * eines Melders aufzufallen.
 *
 * Die Ablage kann NICHT in `/api/health/files` mitgeprueft werden: `/api/health` ist
 * PASSTHROUGH (`routing.ts:12`), eine Modul-Route darunter waere tot, und `core/health`
 * fuer einen einzigen Nutzniesser zu erweitern verstiesse gegen die `core`-Regel.
 */
export async function pruefeAblage(): Promise<void> {
  const wurzel = ablageWurzel();
  const probe = join(wurzel, ".ablage-probe");

  try {
    await mkdir(wurzel, { recursive: true, mode: ABLAGE_MODUS });

    const griff = await open(probe, "w", BLOB_MODUS);
    try {
      await griff.write(Buffer.from(PROBE_INHALT, "utf8"));
      await griff.sync();
    } finally {
      await griff.close().catch(() => {});
    }

    // Zurueckgelesen, weil „open ging" auf einem vollen oder nur scheinbar
    // eingehaengten Volume noch nichts belegt.
    if ((await readFile(probe, "utf8")) !== PROBE_INHALT) {
      throw new Error("Probedatei liest sich anders zurueck als geschrieben");
    }
  } catch (rohFehler) {
    const uebersetzt = uebersetze(rohFehler, wurzel);
    if (uebersetzt instanceof AblageNichtSchreibbar) throw uebersetzt;
    // Jeder andere Grund fuehrt zur selben Aussage — der Start bricht ab, und der Grund
    // steht in der Logzeile.
    console.error(`[files] Ablage-Probe fehlgeschlagen in ${wurzel}`, rohFehler);
    throw new AblageNichtSchreibbar(`[files] Ablage-Probe fehlgeschlagen in ${wurzel}`, rohFehler);
  } finally {
    // Auch im Fehlerfall: eine liegen gebliebene Probedatei zaehlt die Ablage-Kachel
    // sonst als Rest mit.
    //
    // Bewusst `unlink` und NICHT `entferneStill`: dessen `uebersetze` wuerfe bei einer
    // nur lesbar eingehaengten Ablage ein zweites Mal — und ein Wurf aus einem `finally`
    // ERSETZT die Ausnahme, die gerade fliegt. Genau der Fall (read-only Volume) ist der
    // Zweck dieser Funktion; die Aufraeumzeile darf ihre Aussage nicht ueberschreiben.
    // Zusaetzlich bliebe sonst eine irrefuehrende zweite `[files]`-Logzeile stehen.
    await unlink(probe).catch(() => {});
  }
}

/**
 * Der einzige Weg, auf dem ein Pfad dieses Modul verlaesst: `_lib/av.ts` braucht ihn fuer
 * `zSCAN <pfad>` (§6.4) — clamd liest die Datei selbst, statt die Bytes ein zweites Mal
 * ueber einen Socket zu schicken. Absolut, weil der Sidecar ein anderes
 * Arbeitsverzeichnis hat; er sieht `files_data` unter demselben Pfad `/data/files` (§6.5).
 *
 * **Kein anderer Aufrufer darf ihn benutzen.** Wer einen Pfad braucht, braucht in
 * Wahrheit eine der Operationen darueber.
 */
export function scanPfad(ziel: BlobZiel): string {
  return pfadFuer(ziel);
}
