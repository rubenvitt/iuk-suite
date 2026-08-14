/**
 * `GET /a/<id>/nachweis/<nachweisId>` — DIE AUSLIEFERUNG DES BILDNACHWEISES (Aufgabe 19, Spec §5.3,
 * §6, §7). **DER SICHERHEITSKRITISCHSTE PFAD DES GANZEN MODULS.**
 *
 * ZWEI BEDINGUNGEN, BEIDE UNVERZICHTBAR:
 *
 * 1. **`scanStatus === "sauber"`.** Nicht „nicht befund", nicht „nicht fehler" — GENAU `sauber`.
 *    `offen` ist die Vorbelegung und gibt ausdruecklich nicht frei; `fehler` heisst „der Scan lief
 *    schief" und ist deshalb von `befund` getrennt. Dieselbe fail-closed-Linie wie `istFreigegeben`
 *    im Modul `files`. Geprueft ueber `istFreigegeben` (`_lib/scan.ts`) — DIESELBE Funktion, die
 *    `_db/queries.ts`s `mitDatei` (Anzeige) und `actions.ts`s `fertigMeldenAction`
 *    (Pflichtpruefung) verwenden. Keine zweite Fassung dieser Bedingung.
 * 2. **`darfNachweisSehen(person, aufgabe)`.** „Leistungsnachweise sind kein Aushang" (Spec §2).
 *
 * DER RIEGEL STEHT IN DER ROUTE SELBST, NICHT IN EINEM LAYOUT (`CLAUDE.md`, Falle 55): Route Handler
 * haben KEIN Layout ueber sich, und ein Vitest-Test sieht ein fehlendes Layout-Gate strukturell
 * nicht — deshalb ruft diese Datei weder `personFuerSeite` noch `notFound()` (beide fuer Seiten
 * gebaut), sondern loest die Sitzung UND das Sichtrecht hier, direkt, auf und antwortet selbst mit
 * einem Statuscode.
 *
 * DIE ZUGEHOERIGKEIT KOMMT AUS DER DATENBANK, NIE AUS DER URL: `nachweisId` UND `id` werden BEIDE
 * aufgeloest, und es wird geprueft, dass der Nachweis WIRKLICH zu DIESER Aufgabe gehoert — sonst ist
 * `/a/17/nachweis/99` ein IDOR UEBER ZWEI ECKEN (ein Nachweis, der zu einer ANDEREN, fuer dieselbe
 * Person zufaellig ebenfalls sichtbaren Aufgabe gehoert, waere sonst trotzdem abrufbar).
 *
 * KEIN `Content-Disposition: inline` FUER UNBEKANNTE TYPEN: nur ein `mime`-Wert aus
 * `_lib/ablage.ts`s Allowlist (`istErlaubterBildTyp`) wird ausgeliefert. Ein Bild, das als HTML
 * ausgeliefert wird, ist ein XSS-Vektor auf der eigenen Domain — eine `dateien`-Zeile mit einem
 * fremden `mime`-Wert (Handkorrektur, ein spaeterer Import) bekommt deshalb TROTZ `sauber` keine
 * Auslieferung. Der `Content-Disposition`-Dateiname kommt NICHT aus `dateiname` (dem hochgeladenen
 * Namen): derselbe Vorbehalt wie beim Ablagepfad, nur fuer einen HTTP-Kopf statt einen
 * Dateisystempfad — `ENDUNG_FUER[datei.mime]` (`_lib/ablage.ts`) liefert eine sichere, feste
 * Endung, `nachweis-<id>` den Rest.
 *
 * `auth()`, NICHT `personFuerSeite()`: DIE LETZTERE WIRFT `notFound()` OHNE SITZUNG — fuer eine
 * Seite die richtige Antwort (Next faengt den Wurf und rendert die 404-Seite), fuer einen Route
 * Handler die FALSCHE (der Wurf liesse einen 500 durchschlagen, wo diese Datei einen sauberen
 * 404-`Response` bauen soll). Dieselbe Ueberlegung wie `files/api/download/[id]/route.ts`s
 * `zustand()`-Helfer.
 */
import { auth } from "@/core/auth";
import { getDb } from "../../../../_db/client";
import { aufgabe, dateiNachId, nachweisNachId, personNachSub } from "../../../../_db/queries";
import { ENDUNG_FUER, istErlaubterBildTyp, leseNachweis } from "../../../../_lib/ablage";
import { istFreigegeben } from "../../../../_lib/scan";
import { darfNachweisSehen } from "../../../../_lib/zugang";

const KEIN_ZWISCHENSPEICHER = "private, no-store";
const NICHT_VERFUEGBAR = "Dieser Nachweis ist nicht verfügbar.";

/** Dieselbe Auskunft fuer „gibt es nicht", „gehoert nicht hierher", „nicht sauber" und „falscher MIME-Typ". */
function zustand(status: number, meldung: string): Response {
  return new Response(`${meldung}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": KEIN_ZWISCHENSPEICHER,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; nachweisId: string }> },
): Promise<Response> {
  void req;
  const session = await auth();
  const sub = session?.user?.id;
  if (!sub) return zustand(404, NICHT_VERFUEGBAR);

  const db = getDb();
  const person = personNachSub(db, sub);
  // KEINE `personen`-ZEILE: dieselbe Lage wie `personFuerSeite`s Kopfkommentar (`_lib/zugang.ts`),
  // aber hier OHNE die dortige Erklaerseiten-Ausnahme — ein Route Handler liefert keine Seite, nur
  // Bytes oder eine Ablehnung, und „nicht verfuegbar" ist fuer beide Faelle (keine Sitzung, keine
  // Personen-Zeile) dieselbe ehrliche Antwort.
  if (!person) return zustand(404, NICHT_VERFUEGBAR);

  const { id, nachweisId } = await params;
  const task = aufgabe(db, id);
  if (!task) return zustand(404, NICHT_VERFUEGBAR);
  // BEDINGUNG 2.
  if (!darfNachweisSehen(person, task)) return zustand(404, NICHT_VERFUEGBAR);

  const nachweis = nachweisNachId(db, nachweisId);
  // DER IDOR-RIEGEL UEBER ZWEI ECKEN (s. Kopfkommentar).
  if (!nachweis || nachweis.aufgabeId !== task.id) return zustand(404, NICHT_VERFUEGBAR);
  if (nachweis.dateiId === null) return zustand(404, NICHT_VERFUEGBAR); // Text-Nachweis, kein Bild

  const datei = dateiNachId(db, nachweis.dateiId);
  if (!datei) return zustand(404, NICHT_VERFUEGBAR); // Datenbankinkonsistenz — kein Byte ohne Zeile

  // BEDINGUNG 1.
  if (!istFreigegeben(datei.scanStatus)) return zustand(404, NICHT_VERFUEGBAR);

  if (!istErlaubterBildTyp(datei.mime)) {
    console.error(
      `[aufgaben][nachweis] Datei ${datei.id} traegt einen nicht zugelassenen MIME-Typ "${datei.mime}" — Auslieferung verweigert.`,
    );
    return zustand(404, NICHT_VERFUEGBAR);
  }

  const bytes = await leseNachweis(datei.id);
  if (bytes === null) {
    console.error(
      `[aufgaben][nachweis] Datei ${datei.id} ist als 'sauber' vermerkt, aber der Blob fehlt.`,
    );
    return zustand(404, NICHT_VERFUEGBAR);
  }

  // `new Uint8Array(bytes)` STATT `bytes` DIREKT: `leseNachweis` liefert ein Node-`Buffer`
  // (Uint8Array<ArrayBufferLike>), und `Response`s `BodyInit`-Typ verlangt `Uint8Array<ArrayBuffer>`
  // — derselbe Umweg wie `files/api/preview/[id]/route.ts`.
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      // AUS DER DB, NIE GERATEN: derselbe gespeicherte, gepruefte MIME-Typ, den `istErlaubterBildTyp`
      // oben bestaetigt hat.
      "content-type": datei.mime,
      "content-disposition": `inline; filename="nachweis-${datei.id}.${ENDUNG_FUER[datei.mime]}"`,
      "content-length": String(bytes.byteLength),
      "x-content-type-options": "nosniff",
      "cache-control": KEIN_ZWISCHENSPEICHER,
    },
  });
}
