import writeXlsxFile from "write-excel-file/node";
import { mappe, type FertigesBlatt } from "./spalten";
import { XLSX_MIME } from "./dateiname";

/**
 * DER SERVERSEITIGE AUSGABEWEG — eine `.xlsx` als Antwort eines Route Handlers
 * (DRK-186).
 *
 * ⛔ `write-excel-file/node`, NICHT `/browser`. Das Paket hat zwei
 * Einstiegspunkte mit derselben Aufrufform und verschiedenen Rückgaben: `/node`
 * kann `toBuffer()`, `/browser` kann `toBlob()`/`toFile()`. Der falsche Griff
 * ist hier typkorrekt und fällt erst zur Laufzeit auf.
 *
 * ⚠️ DIESE DATEI GEHÖRT IN KEIN CLIENT-BUNDLE, und der Dateiname ist der ganze
 * Riegel — dieselbe Hausform wie `core/audit/server.ts`. `server-only` steht
 * nicht im `package.json`, und eine neue Abhängigkeit ist eine Entscheidung,
 * keine Nebenwirkung. Wer diese Datei aus einer Client-Insel importiert, zieht
 * `node:stream` und `node:zlib` ins Bundle; die Client-Hälfte heißt `client.ts`
 * und steht direkt daneben.
 *
 * ⚠️ WARUM EIN ROUTE HANDLER UND KEINE SERVER ACTION: eine Server Action kann
 * keinen `Content-Disposition` setzen (`files/api/inbox/zip/route.ts:30` hält
 * denselben Befund). Die Datei braucht den Header — ohne ihn öffnet der Browser
 * die Bytes, statt sie abzulegen.
 */

/** Zeichen, die den ANGEFÜHRTEN Teil eines `Content-Disposition` zerlegen:
 *  Anführungszeichen, Gegenschrägstrich und jedes Steuerzeichen. */
const HEADER_FEINDLICH = new RegExp('["\\\\\\u0000-\\u001f\\u007f]', "g");

function headerSicher(name: string): string {
  return name.replace(HEADER_FEINDLICH, "_");
}

/**
 * Baut die Mappe und verpackt sie als Download-Antwort.
 *
 * `blaetter` ist absichtlich eine LISTE: das erste Blatt trägt die Daten, ein
 * zweites die Kopfdaten (`freiesBlatt`). Ein Vorspann über der Kopfzeile wäre
 * die naheliegende Übersetzung des CSV-Wegs und in einer Kalkulation der eine
 * Fehler — Sortieren und Filtern gehen von Zeile 1 aus (siehe `spalten.ts`).
 */
export async function xlsxAntwort(
  dateiname: string,
  blaetter: readonly FertigesBlatt[],
): Promise<Response> {
  const puffer = await writeXlsxFile(mappe(blaetter)).toBuffer();
  /*
   * `new Uint8Array(puffer)` und nicht der `Buffer` selbst: `BodyInit` nimmt
   * eine `Uint8Array`, und Node-`Buffer` ist zwar eine, trägt aber einen
   * gemeinsam genutzten Speicherbereich (`ArrayBufferLike`) — TypeScript weist
   * ihn in neueren Fassungen zurück, und ein `as` darüber verschwiege, dass der
   * Bereich weiterlebt.
   */
  return new Response(new Uint8Array(puffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${headerSicher(dateiname)}"`,
    },
  });
}
