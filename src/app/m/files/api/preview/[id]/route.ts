/**
 * `GET /api/preview/<shareId>?file=<fileId>` — die Inline-Vorschau (Spec §7.7,
 * Plan T51).
 *
 * DIE ZUSAGE: Die Vorschau läuft durch **dieselbe** Prüfkette wie der Download,
 * zählt **nicht** und loggt **nicht**; `image/svg+xml` ist **nicht**
 * inline-fähig; oberhalb von `FILES_VORSCHAU_MAX_BYTES` wird **abgelehnt**,
 * nicht halb geliefert.
 *
 * DIE PRÜFKETTE WIRD HIER NICHT NACHGEBAUT. Sie ist `ladeShare` aus
 * `_db/queries.ts` — genau EINE Stelle (§7.4). Diese Datei bildet nur die
 * Zustandsnamen auf Statuscodes ab; die Reihenfolge (Existenz → Ablauf →
 * Passwort → Datei/AV/Blob → Limit) gehört der Ladefunktion. Die Alt-App hatte
 * fünf Eintrittspunkte mit fünf verschiedenen Ketten, und die drei
 * byteliefernden lasen `password_hash` nirgends.
 *
 * WAS HIER AUSDRÜCKLICH NICHT STEHT: keine der beiden Funktionen aus
 * `_db/zaehler.ts` — weder das Hochzählen von `download_count` noch die Zeile im
 * Audit-Log. (Die Namen stehen bewusst nicht ausgeschrieben: `route.test.ts`
 * hält sie als Quelltext-Zusicherung aus dieser Datei heraus, damit ein späterer
 * Umbau sie nicht „der Vollständigkeit halber" ergänzt.) Ein Mitzählen würde einen Share mit
 * `max_downloads = 1` durch das **Öffnen** der Vorschau verbrauchen — eine
 * Verhaltensänderung für bereits verteilte Links. Der Preis ist benannt: solange
 * ein Download frei ist, ist eine vorschaufähige Datei beliebig oft vollständig
 * lesbar; begrenzt wird das durch die Typ-Allowlist und die Bytekappe, nicht
 * durch den Zähler.
 *
 * KEIN `"use client"`, und keine Client-Datei darf hier importieren: `getDb()`
 * und die Ablage stehen dahinter.
 */
import { Readable } from "node:stream";

import { rolleOderNull } from "../../../_lib/hostRolle";
import { grenzen } from "../../../_lib/grenzen";
import type { ErlaubterMimeTyp } from "../../../_lib/mime";
import { BlobFehlt, lieseStrom, type BlobZiel } from "../../../_lib/storage";
import { ladeShare, type ShareDatei } from "../../../_db/queries";

/**
 * Die Typen, die dieses Modul **inline** ausliefert.
 *
 * Der Typ ist `ErlaubterMimeTyp` und nicht `string`, und das ist der Riegel:
 * `image/svg+xml` steht in keiner Allowlist dieses Moduls, also lässt sich diese
 * Liste um SVG gar nicht erst erweitern, ohne dass `pnpm typecheck` es meldet.
 * Ein SVG ist ein ausführbares Dokument im Origin der Fileshare-Domain; heute
 * steht es in `PREVIEWABLE_TYPES` der Alt-App und wird `inline` ausgeliefert,
 * ohne `nosniff` und ohne CSP. Der **Download** bleibt möglich.
 *
 * HEIC UND HEIF STEHEN BEIDE DA. Es sind zwei Zeichenketten (`_lib/mime.ts`),
 * und wer nur eine listet, verliert die Hälfte der iPhone-Fotos — also gerade
 * das Format, das die Handys der Melderinnen erzeugen. Dass nicht jeder Browser
 * sie darstellt, ist Sache des Browsers und keine Sicherheitsfrage.
 *
 * NICHT DABEI sind DOCX, XLSX und PPTX: kein Browser rendert sie inline, eine
 * „Vorschau" wäre dort ein Download unter falschem Namen.
 */
export const VORSCHAU_TYPEN: readonly ErlaubterMimeTyp[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
];

/**
 * Was als **Text** gilt und deshalb gekappt statt abgelehnt wird. Heute ist das
 * genau ein Typ; die Menge steht trotzdem hier, damit die Fallunterscheidung
 * einen Namen hat und nicht als `=== "text/plain"` durch den Handler wandert.
 */
const TEXT_TYPEN: readonly ErlaubterMimeTyp[] = ["text/plain"];

/**
 * Der Hinweis, den eine gekappte Textvorschau mitbringt (§7.7: „gekürzt
 * angezeigt").
 *
 * Er steht im KÖRPER und nicht nur in einem Header, weil die Vorschau ohne
 * JavaScript in einem Rahmen oder einem eigenen Tab landet — einen Header sieht
 * dort niemand. Dass damit der ausgelieferte Text nicht mehr der Datei
 * entspricht, ist genau die Aussage: eine gekappte Datei IST nicht die Datei.
 * Der Header `X-Vorschau-Gekuerzt` steht zusätzlich da, für Aufrufer, die den
 * Zustand maschinell brauchen.
 */
const GEKUERZT_HINWEIS = "\n\n[… gekürzt angezeigt — die Datei ist länger als die Vorschau-Grenze]\n";

/**
 * `nosniff` UND `Content-Security-Policy: sandbox` auf **jeder** Antwort dieses
 * Endpunkts, auch auf jeder Fehlerantwort (§7.7, Analyse E9).
 *
 * Warum auch auf den Fehlern: die Fehlerkörper sind JSON, und ein Client, der
 * einen davon in einem Rahmen darstellt, bekäme ohne `nosniff` denselben
 * Sniffing-Weg zurück, den die 200er-Antwort gerade schließt. Eine Ausnahme wäre
 * eine Zeile, die niemand mehr begründen kann.
 */
const SCHUTZ_KOPFZEILEN = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox",
} as const;

/**
 * Der Zustand, den die Oberfläche an der Stelle des Vorschau-Knopfes zeigt —
 * und den dieser Handler durchsetzt. **Ein** Prädikat für beide Seiten.
 *
 * Die Regel aus §10.2 lautet, dass Oberfläche und Riegel dasselbe Prädikat auf
 * denselben Gegenstand anwenden müssen. T40 rendert „Zu groß für die Vorschau"
 * plus Download-Knopf und braucht dafür GENAU diese Entscheidung; baute sie die
 * Typliste und den Größenvergleich nach, zeigte der Knopf irgendwann etwas
 * anderes an, als die Route tut — und der Einstiegspunkt liefe in einen Fehler.
 * Deshalb ist die Funktion exportiert und der Handler unten ihr erster Aufrufer.
 *
 * Die Größe ist die **gemessene**, wo es eine gibt: ausgeliefert würden die
 * Bytes auf der Platte, nicht die Zahl in der Spalte (§5.4). Der Rückfall auf
 * `groesse` deckt die Zeilen ab, für die keine Messung vorliegt (die Übersicht
 * probt keine Blobs) — dort ist die Spalte die einzige Auskunft.
 */
export function vorschauZustand(
  datei: Pick<ShareDatei, "mimeType" | "groesse" | "gemesseneGroesse">,
  vorschauMaxBytes: number,
): "vorschau" | "typ-nicht-vorschaufaehig" | "zu-gross-fuer-vorschau" {
  const typ = datei.mimeType as ErlaubterMimeTyp;
  if (!VORSCHAU_TYPEN.includes(typ)) return "typ-nicht-vorschaufaehig";
  // Text wird GEKAPPT statt abgelehnt — für ihn gibt es kein „zu groß".
  if (TEXT_TYPEN.includes(typ)) return "vorschau";
  const laenge = datei.gemesseneGroesse ?? datei.groesse;
  return laenge > vorschauMaxBytes ? "zu-gross-fuer-vorschau" : "vorschau";
}

/**
 * Warum keine Vorschau kommt — ein geschlossener Wertebereich, weil jeder Grund
 * einen **anderen** nächsten Schritt in der Oberfläche hat (§10.2, T40).
 */
type AblehnungsGrund =
  | "share-unbekannt"
  | "abgelaufen"
  | "limit-erreicht"
  | "passwort-noetig"
  | "datei-gesperrt"
  | "datei-nicht-gefunden"
  | "datei-nicht-gewaehlt"
  | "typ-nicht-vorschaufaehig"
  | "zu-gross-fuer-vorschau";

function ablehnung(status: number, grund: AblehnungsGrund, meldung: string): Response {
  return Response.json(
    { grund, meldung },
    { status, headers: { ...SCHUTZ_KOPFZEILEN, "Cache-Control": "private, no-store" } },
  );
}

/**
 * Der Cookie-Wert aus dem rohen `Cookie`-Kopf.
 *
 * Bewusst nicht `cookies()` aus `next/headers`: das braucht den Request-Kontext
 * von Next und ist aus einem Handler-Test heraus nicht herstellbar — der Riegel
 * wäre dann nur im Browser prüfbar. Und bewusst **ohne** `decodeURIComponent`:
 * der Wert ist `<id>.<sekunden>.<hmac-base64url>` und enthält damit nur Zeichen,
 * die kein Kodieren brauchen; ein Dekodieren könnte einen Wert verändern, der
 * gleich zeichengenau gegen eine Signatur verglichen wird.
 */
function cookieLeserAus(kopfzeilen: Headers): (name: string) => string | undefined {
  const roh = kopfzeilen.get("cookie") ?? "";
  const werte = new Map<string, string>();
  for (const paar of roh.split(";")) {
    const trenner = paar.indexOf("=");
    if (trenner <= 0) continue;
    const name = paar.slice(0, trenner).trim();
    if (name !== "" && !werte.has(name)) werte.set(name, paar.slice(trenner + 1).trim());
  }
  return (name) => werte.get(name);
}

/**
 * Die angekündigte Länge einer UTF-8-Sequenz anhand ihres **Führungsbytes** —
 * `0`, wenn das Byte ein Folgebyte (`10xxxxxx`) ist, die Sequenz also weiter
 * vorn beginnt.
 */
function sequenzLaenge(byte: number): number {
  if (byte < 0x80) return 1;
  if (byte < 0xc0) return 0;
  if (byte < 0xe0) return 2;
  if (byte < 0xf0) return 3;
  return 4;
}

/**
 * Schneidet einen Bytepuffer so zurück, dass am Ende keine **angeschnittene**
 * UTF-8-Sequenz steht.
 *
 * Ohne diesen Schritt endet jede gekappte Textvorschau, deren Grenze mitten in
 * ein `ö` fällt, mit einem U+FFFD — ein sichtbarer Defekt an einer Stelle, an
 * der gerade „gekürzt angezeigt" steht und niemand mehr genau hinsieht.
 *
 * ENTSCHIEDEN WIRD LOKAL, an den letzten höchstens vier Bytes, und nicht über
 * einen Dekodierversuch des ganzen Kopfes. Dafür gibt es zwei Gründe, und der
 * zweite ist der wichtigere:
 *
 *  - Ein Lauf mit `fatal: true` dekodiert den GANZEN Puffer; bei der
 *    Produktionsgrenze von 5 MiB wären das je Vorschau bis zu vier Vollpässe,
 *    nur um über die letzten drei Bytes zu entscheiden.
 *  - `text/plain` sagt nichts über die Kodierung — `MIME_ALLOWLIST` kennt den
 *    Typ, nicht den Zeichensatz, und eine Latin-1- oder CP1252-Zeile ist im
 *    Modul zulässig. Für sie scheitert JEDER Dekodierversuch, und eine
 *    Prüfung-über-alles gäbe den Puffer unverändert zurück: der Anschnitt
 *    bliebe stehen, ausgerechnet in dem Fall, für den die Funktion da ist, und
 *    ohne dass irgendwo etwas sichtbar würde.
 *
 * DIE ZUSAGE IST ENTSPRECHEND ENG: am Ende steht keine angeschnittene Sequenz.
 * Dass der ganze Rest sauber dekodiert, verspricht diese Funktion **nicht** —
 * das kann sie nicht, wenn es schon die Datei nicht tut.
 */
function aufUtf8GrenzeZurueck(bytes: Uint8Array): Uint8Array {
  // Eine UTF-8-Sequenz ist höchstens 4 Bytes lang, ihr Führungsbyte steht also
  // in den letzten vier. `weg` ist die Zahl der Bytes vom betrachteten Byte bis
  // zum Ende — und damit genau der Platz, den eine dort beginnende Sequenz noch
  // hat.
  for (let weg = 1; weg <= 4 && weg <= bytes.length; weg++) {
    const laenge = sequenzLaenge(bytes[bytes.length - weg]);
    if (laenge === 0) continue; // Folgebyte — die Sequenz beginnt weiter vorn.
    // Passt die angekündigte Sequenz noch ganz in den Puffer, ist nichts
    // angeschnitten; sonst fällt sie ab ihrem Führungsbyte weg.
    return laenge <= weg ? bytes : bytes.subarray(0, bytes.length - weg);
  }
  // Vier Folgebytes am Stück gibt es in UTF-8 nicht (oder der Puffer ist leer):
  // hier gibt es kein Ende, das ein Zuschnitt besser machte.
  return bytes;
}

/**
 * Liest höchstens `maxBytes` Bytes vom Anfang des Blobs und schließt den Strom
 * in **jedem** Ausgang — sonst leckt ein File-Descriptor je abgebrochener
 * Vorschau.
 */
async function lieseKopf(ziel: BlobZiel, maxBytes: number): Promise<Uint8Array> {
  const { strom } = await lieseStrom(ziel);
  const stuecke: Buffer[] = [];
  let gelesen = 0;
  try {
    for await (const stueck of strom) {
      const puffer = stueck as Buffer;
      stuecke.push(puffer);
      gelesen += puffer.byteLength;
      if (gelesen >= maxBytes) break;
    }
  } finally {
    strom.destroy();
  }
  return Buffer.concat(stuecke).subarray(0, maxBytes);
}

/**
 * Die Datei, um die es geht — und der Parametervertrag dahinter.
 *
 * `[id]` ist die **shareId**, `?file=` wählt die Datei. Fehlt `?file=` bei mehr
 * als einer Datei, ist die Antwort ein benannter Fehler und ausdrücklich
 * **nicht** „die erste": bei einem Share mit fünf Dateien wäre „die erste" eine
 * stille Entscheidung darüber, was jemand zu sehen bekommt.
 *
 * Gezählt werden ALLE Zeilen, auch die unvollständigen. Eine unvollständige
 * Zeile ist eine Datei, die es gibt — sie einfach zu überspringen hieße, den
 * Vertrag von der Übertragungsgeschwindigkeit abhängig zu machen.
 */
function waehleDatei(dateien: readonly ShareDatei[]): ShareDatei | null {
  return dateien.length === 1 ? dateien[0] : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // ERSTE Anweisung, und sie hat kein Layout hinter sich: jeder Host bedient nur
  // die Pfade seiner Rolle (§3.2). `rolleOderNull` wirft nie — ein `notFound()`
  // aus einem Handler wäre keine brauchbare Antwort auf einen Vorschau-Link.
  if (rolleOderNull(req.headers) !== "verwaltung") {
    return ablehnung(404, "share-unbekannt", "Nicht gefunden.");
  }

  const { id } = await params;
  const gewaehlteDatei = new URL(req.url).searchParams.get("file");
  const cookieLeser = cookieLeserAus(req.headers);

  const erste = await ladeShare({ shareId: id, dateiId: gewaehlteDatei, cookieLeser });

  // Ohne `?file=`: die Kette ist bis zum Limit gelaufen, jetzt entscheidet die
  // ANZAHL. Steht genau eine Zeile da, wird sie ein ZWEITES Mal durch dieselbe
  // Kette geschickt — mit ihrer ID. Das kostet eine Abfrage und spart eine
  // zweite Abbildung von Zeilenzuständen auf Statuscodes; genau daran liefen die
  // fünf Eintrittspunkte der Alt-App auseinander.
  let ladung = erste;
  if (!gewaehlteDatei && erste.zustand === "offen") {
    const datei = waehleDatei(erste.inhalt.dateien);
    if (!datei) {
      if (erste.inhalt.dateien.length === 0) {
        return ablehnung(404, "datei-nicht-gefunden", "Dieser Share enthält keine Datei.");
      }
      return ablehnung(
        400,
        "datei-nicht-gewaehlt",
        "Dieser Share enthält mehrere Dateien. Bitte die gewünschte Datei mit ?file=<id> angeben.",
      );
    }
    ladung = await ladeShare({ shareId: id, dateiId: datei.id, cookieLeser });
  }

  switch (ladung.zustand) {
    case "unbekannt":
      return ablehnung(404, "share-unbekannt", "Nicht gefunden.");
    case "abgelaufen":
      return ablehnung(410, "abgelaufen", "Dieser Link ist abgelaufen.");
    case "limitErreicht":
      return ablehnung(410, "limit-erreicht", "Die Downloads dieses Links sind aufgebraucht.");
    case "passwortNoetig":
      return ablehnung(401, "passwort-noetig", "Dieser Link ist mit einem Passwort geschützt.");
    case "gesperrt":
      return ablehnung(
        403,
        "datei-gesperrt",
        "Diese Datei ist nicht freigegeben (Virenprüfung nicht abgeschlossen oder fehlgeschlagen).",
      );
    case "dateiNichtGefunden":
    case "blobFehlt":
      return ablehnung(404, "datei-nicht-gefunden", "Diese Datei ist nicht auffindbar.");
    case "offen":
      break;
  }

  const datei = ladung.datei;
  // Nur erreichbar, wenn `?file=` fehlte UND die Kette „offen" lieferte, ohne
  // dass oben eine Zeile gewählt wurde — das kann nicht eintreten. Eine
  // benannte 404 ist trotzdem besser als ein `!`, das ein späterer Umbau still
  // zu einem `null`-Zugriff macht.
  if (!datei) return ablehnung(404, "datei-nicht-gefunden", "Diese Datei ist nicht auffindbar.");

  // Geprüft wird der Wert der SPALTE, nicht eine Storage-Angabe und nichts
  // Geratenes — EINE Quelle. Die Alt-Route prüfte den DB-Wert und lieferte den
  // Storage-Wert im Header aus (Analyse 2.1, Befund 6).
  const typ = datei.mimeType as ErlaubterMimeTyp;
  const grenze = grenzen().vorschauMaxBytes;
  const zustand = vorschauZustand(datei, grenze);

  if (zustand === "typ-nicht-vorschaufaehig") {
    // 415 und nicht 404: an dieser Stelle ist die ganze Prüfkette samt
    // Passwort-Gate schon durchlaufen, es gibt also nichts mehr zu verschweigen
    // — und ein 404 machte „Datei gibt es nicht" und „Typ ist nicht
    // vorschaufähig" ununterscheidbar, was die Alt-App tat.
    return ablehnung(
      415,
      "typ-nicht-vorschaufaehig",
      "Für diesen Dateityp gibt es keine Vorschau. Die Datei lässt sich herunterladen.",
    );
  }

  const ziel: BlobZiel = { art: "share", shareId: ladung.share.id, fileId: datei.id };
  // Die Länge stammt aus derselben Messung, die `ladeShare` für „Blob fehlt"
  // gemacht hat. `gemesseneGroesse` ist hier nie `null`: die Kette hat
  // `vollstaendig` bejaht und `blobFehlt` verneint. Der Rückfall steht für den
  // Typ, nicht für den Fall.
  const laenge = datei.gemesseneGroesse ?? datei.groesse;
  const istText = TEXT_TYPEN.includes(typ);

  try {
    if (istText) {
      const roh = await lieseKopf(ziel, Math.min(laenge, grenze));
      if (laenge <= grenze) {
        return new Response(new Uint8Array(roh), {
          headers: {
            ...SCHUTZ_KOPFZEILEN,
            "Content-Type": `${typ}; charset=utf-8`,
            "Content-Disposition": "inline",
            "Content-Length": String(roh.byteLength),
            "Cache-Control": "private, no-store",
          },
        });
      }
      const koerper = Buffer.concat([
        aufUtf8GrenzeZurueck(roh),
        Buffer.from(GEKUERZT_HINWEIS, "utf8"),
      ]);
      return new Response(new Uint8Array(koerper), {
        headers: {
          ...SCHUTZ_KOPFZEILEN,
          "Content-Type": `${typ}; charset=utf-8`,
          "Content-Disposition": "inline",
          "Content-Length": String(koerper.byteLength),
          "X-Vorschau-Gekuerzt": "1",
          "Cache-Control": "private, no-store",
        },
      });
    }

    // Alles andere: oberhalb der Grenze gibt es KEINE Vorschau, und zwar bevor
    // ein Byte gelesen wird. Ein halbes Bild ist keine Vorschau — und eine
    // 400-MB-JPEG-Vorschau wäre ein ungezählter, beliebig oft wiederholbarer
    // Vollabruf, gegen den die Begründung „begrenzt durch Typ-Allowlist und
    // Bytekappe" nicht mehr hielte.
    if (zustand === "zu-gross-fuer-vorschau") {
      return ablehnung(
        413,
        "zu-gross-fuer-vorschau",
        `Diese Datei ist zu groß für die Vorschau (Grenze: ${grenze} Bytes). ` +
          `Sie lässt sich herunterladen.`,
      );
    }

    const { strom, bytes } = await lieseStrom(ziel);
    // Bricht der Abrufer ab, wird der Lesestrom geschlossen — sonst bleibt je
    // abgebrochener Vorschau ein File-Descriptor offen. Derselbe Grund wie beim
    // ZIP-Weg, nur ohne dessen Archiv-Apparat.
    req.signal.addEventListener("abort", () => strom.destroy(), { once: true });
    return new Response(Readable.toWeb(strom) as ReadableStream<Uint8Array>, {
      headers: {
        ...SCHUTZ_KOPFZEILEN,
        "Content-Type": typ,
        "Content-Disposition": "inline",
        "Content-Length": String(bytes),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (fehler) {
    // Zwischen der Messung in der Prüfkette und dem Lesen kann der Aufräum-Lauf
    // den Blob entfernt haben. Das ist ein belegter Regelzustand (§10.1) und
    // wird 404, nicht 500.
    if (fehler instanceof BlobFehlt) {
      return ablehnung(404, "datei-nicht-gefunden", "Diese Datei ist nicht auffindbar.");
    }
    throw fehler;
  }
}
