// src/app/m/radio/admin/(arbeit)/import/hochladen/route.ts
import { radioHostOderNull } from "../../../../_lib/host";
import { istRadioAdmin, viewerOderNull } from "../../../../_lib/zugang";
import { LESE_FEHLER, lesEinCsv } from "../../../../_lib/csv/einlesen";

/**
 * DER DATEISCHRITT DES ZWEIPHASIGEN CSV-IMPORTS — aeusserer Pfad `/admin/import/hochladen`
 * (Routenkarte `_lib/routen.ts`), Entscheidung **E-V16**
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:994-1045`), Aufgabe V18.
 *
 * ⛔ ER WAR IN DER SPEC EINE SERVER ACTION UND IST HIER EIN ROUTE HANDLER — eine BENANNTE
 * Abweichung von `Spec:4657` (`importVorschauAction(datei: FormData)`), und sie ist
 * bauformbedingt, nicht fachlich: eine Server Action, die eine hochgeladene Datei
 * entgegennimmt, laeuft gegen `experimental.serverActions.bodySizeLimit` — Vorgabe **1 MB**,
 * und `next.config.ts` hebt sie nicht an (die Datei fuehrt nur `reactCompiler`, `output`,
 * `allowedDevOrigins`). Eine Anhebung fuer diese eine Route haette sie fuer JEDE Server
 * Action JEDES Suite-Moduls angehoben. Das Haus hat den Fall zweimal so entschieden und die
 * Begruendung ausgeschrieben: `src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.ts:2-9`
 * und `src/app/m/files/api/u/[token]/upload/route.ts`.
 *
 * ⛔ ER SCHREIBT NICHTS. Er liest die Bytes, erkennt Kodierung und Trennzeichen (V9,
 * `_lib/csv/einlesen.ts`) und gibt Spaltennamen und ROHZEILEN als JSON zurueck. Die
 * Zuordnung faellt in der Insel, das Schreiben in `importSchreibenAction`
 * (`admin/actions.ts`) — ⛔ zweiphasig, und das bleibt so (`Spec:4695-4702`: „Eine einphasige
 * Suite-Fassung (‚Datei hoch, fertig') ist kein Port, sondern ein anderes Produkt").
 * Der Waechter dagegen ist der Fall „er schreibt KEINE Zeile in die Datenbank" in
 * `route.test.ts`.
 *
 * ⛔ DIE NICHT-WERFENDE RIEGELFORM, DREI HAELFTEN (B10/B11/B17, `Spec:100`/`:99`/`:117`,
 * ausgeschrieben `Spec:4379`; `riegel.test.ts` Klausel (c) prueft sie einzeln):
 *
 *   `radioHostOderNull(request.headers)`  ja  — die nicht-werfende Form (`_lib/host.ts:71`)
 *   `requireRadioHost(`                   nein — sie wirft `notFound()`, und das ist im
 *                                              Antwortweg eines Route Handlers keine
 *                                              brauchbare Antwort (`_lib/host.ts:69-70`)
 *   werfender Personen-Riegel             nein — `requireRadioAdmin` endet in
 *                                              `redirect('/login?…')`; woertlich umgesetzt
 *                                              landete ein anonymer POST im LOGIN-UMWEG
 *
 * ⛔ **404, NIE 403** (B10, `Spec:99`): ein 403 machte den Bestand an Verwaltungspfaden
 * aufzaehlbar, waehrend die Seiten daneben schweigen. Ein Route Handler hat KEIN Layout ueber
 * sich; beide Riegel stehen deshalb hier, in dieser Reihenfolge — erst der Host, dann die
 * Person, damit ein anonymer Aufruf auf einem fremden Host die Verwaltungsroute nicht ueber
 * einen vorgeschalteten Login-Umweg verraet (`Spec:429-437`).
 *
 * ⛔ `istRadioAdmin`, NICHT DIE VERWALTUNGSSTUFE. Rechtetafel `Spec:4444-4454`, Zeile
 * „CSV-Import": Admin ja, Updater **nein** (`Spec:4451`). ⚠️ DAS IST SCHAERFER ALS DER
 * BESTAND, der den Dateischritt jeder angemeldeten Rolle oeffnet
 * (`radio-admin/server/src/routes/import.ts:15-16`, woertlich „any authenticated role may
 * parse a file") und die Rechte erst im Klassifikator zieht
 * (`radio-admin/client/../classify-import-row.ts:43-49`). Die Verschaerfung ist die
 * Betreiberentscheidung ⬜ **V-L5** vom 2026-08-24
 * (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „V-L5": „Nur Admin, nicht Updater").
 *
 * ⛔ LEERE ODER UNLESBARE DATEI ⇒ EINE MELDUNG IM JSON, KEIN WURF UND KEIN 500. Der Bestand
 * wirft in `decodeCsv` und faengt eine Ebene hoeher, um mit „Leere oder ungültige Datei" zu
 * antworten (`radio-admin/server/src/routes/import.ts:24-30`, Text `:28`); die Suite reicht
 * denselben Text als `{ ok: false, fehler }` durch — dieselbe Form wie jeder andere
 * Schreib- und Lesepfad des Moduls (`_lib/csv/einlesen.ts:58-67`, `admin/actions.ts:86`).
 * ⚠️ Der Text wird GELESEN (`LESE_FEHLER`), nicht abgeschrieben.
 */
export const dynamic = "force-dynamic";

/**
 * Die Antwort dieses Handlers.
 *
 * ⛔ NUR SPALTEN UND ROHZEILEN. Der Bestand gibt zusaetzlich `detected: { delimiter,
 * encoding }` heraus (`import.ts:31-35`) — ⚠️ und sein eigener Aufrufer liest es nie
 * (`ImportWizard.tsx:97-99` nimmt ausschliesslich `data.columns` und `data.rows`). Ein
 * Feld ohne Verbraucher waere hier die Stelle, an der eine spaetere Aenderung an
 * `EingeleseneCsv` still ueber die Netzgrenze leckt; ⛔ es ist deshalb bewusst nicht
 * mitgereicht und das ist eine benannte Auslassung, keine Vergesslichkeit.
 */
export type HochladenAntwort =
  | { ok: true; spalten: string[]; zeilen: string[][] }
  | { ok: false; fehler: string };

/** Das Feld, unter dem die Insel die Datei anhaengt — Hausform (`aufgaben`: `datei`). */
const DATEIFELD = "datei";

export async function POST(request: Request) {
  /*
   * ERSTE ZEILE: der Host. Falle 61 (`_lib/host.ts:10-20`) — `decideRoute` gatet einen
   * internen Pfad `/m/<key>/...` nach dem Modulsegment, ohne jeden Hostbezug
   * (`src/core/routing.ts:68-76`); JEDER Host, der auf den Suite-Container terminiert,
   * antwortet damit auf `/m/radio/*`.
   */
  if (radioHostOderNull(request.headers) === null) {
    return new Response(null, { status: 404 });
  }

  /*
   * DANN DIE PERSON — als PRAEDIKAT, nicht als Riegel: die 404 baut dieser Handler selbst
   * (Bauform-Zulaessigkeitstafel Nr. 9, `.superpowers/sdd/planteil4/briefs/KOPF.md:329`).
   */
  if (!istRadioAdmin(await viewerOderNull())) {
    return new Response(null, { status: 404 });
  }

  /*
   * ⛔ `catch(() => null)` UM `formData()`: ein Rumpf, den undici nicht als Multipart lesen
   * kann, wirft — und ein unbehandelter Wurf waere hier ein 500 auf eine Eingabe, die eine
   * Meldung verdient. Dieselbe Wahl wie in
   * `src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.ts`.
   */
  const felder = await request.formData().catch(() => null);
  const datei = felder?.get(DATEIFELD);
  if (!(datei instanceof File)) {
    return antwort({ ok: false, fehler: LESE_FEHLER });
  }

  const gelesen = lesEinCsv(new Uint8Array(await datei.arrayBuffer()));
  if (!gelesen.ok) {
    return antwort({ ok: false, fehler: gelesen.fehler });
  }

  return antwort({
    ok: true,
    spalten: gelesen.daten.spalten,
    zeilen: gelesen.daten.zeilen,
  });
}

/**
 * ⛔ EIN EINZIGER AUSGANG FUER DEN JSON-RUMPF, und er ist getypt. Ohne ihn stuenden vier
 * `Response.json(...)`-Aufrufe nebeneinander, von denen jeder ein anderes Feld schreiben
 * koennte — typkorrekt, weil `Response.json` `unknown` nimmt.
 */
function antwort(rumpf: HochladenAntwort): Response {
  return Response.json(rumpf);
}
