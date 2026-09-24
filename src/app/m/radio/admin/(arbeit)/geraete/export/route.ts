import { auditDenied } from "@/core/audit/server";
import { auditDelivery, auditActor } from "@/core/audit/server";
// src/app/m/radio/admin/(arbeit)/geraete/export/route.ts
import { getDb } from "../../../../_db/client";
import { radioHostOderNull } from "../../../../_lib/host";
import { istRadioAdmin, viewerOderNull } from "../../../../_lib/zugang";
import { xlsxAntwort } from "@/core/export/server";
import { EXPORT_DATEINAME, baueExportBlatt } from "../../../../_lib/csv/mappe";
import { geraeteFuerExport } from "../../../../_lib/lesepfade/geraete";

/**
 * DER EXCEL-EXPORT DER GERAETELISTE — aeusserer Pfad `/admin/geraete/export`
 * (Routenkarte `_lib/routen.ts:66`), Aufgabe V22. Er ersetzt `export.ts:69-78`.
 *
 * ⛔ EIN ROUTE HANDLER UND KEINE SEITE, und das ist bauformbedingt: die Antwort ist eine
 * DATEI. `notFound()` oder `redirect()` waeren im Antwortweg keine brauchbare Antwort auf
 * einen Dateiabruf — es waere eine HTML-Fehlerseite mit `Content-Type: text/html`
 * (`Spec:4723-4729`, Bauform-Zulaessigkeitstafel Nr. 10).
 *
 * ⛔ DIE NICHT-WERFENDE RIEGELFORM, DREI HAELFTEN (B10/B11/B17, `Spec:99`/`:100`/`:117`,
 * ausgeschrieben `Spec:4379`; `riegel.test.ts` Klausel (c) prueft sie einzeln, gemessen
 * `riegel.test.ts:406-465`):
 *
 *   `radioHostOderNull(request.headers)`  ja  — die nicht-werfende Form (`_lib/host.ts:71`)
 *   `requireRadioHost(`                   nein — sie wirft `notFound()` (`_lib/host.ts:65-66`)
 *   werfender Personen-Riegel             nein — `requireRadioAdmin` endet in
 *                                              `redirect('/login?…')` bzw. `notFound()`;
 *                                              woertlich umgesetzt landete ein anonymer GET
 *                                              auf `/admin/geraete/export` in einem
 *                                              LOGIN-UMWEG — typkorrekt, lint-sauber
 *
 * ⛔ **404, NIE 403** (B10, `Spec:99`, bestaetigt B17 `Spec:117`): „Der Preis der Abweichung
 * waere, dass dieser Abruf den Bestand an Verwaltungspfaden aufzaehlbar macht, waehrend die
 * Seiten daneben schweigen; kein Tor sieht es, beide Zweige sind gueltiges HTTP."
 * ⚠️ `Spec:4728` sagt woertlich noch „baut seine 403 selbst" — das ist die von B17
 * ausdruecklich als veraltet benannte Formulierung und wird als 404 gelesen.
 *
 * Ein Route Handler hat KEIN Layout ueber sich; beide Riegel stehen deshalb hier — erst der Host,
 * dann die Person. ⚠️ HAUSFORM OHNE WIRKUNG: beide Zweige geben dieselbe leere 404, kein Umweg ist
 * zu verraten (`REVIEW-V22.md` F8: getauscht → `35 passed`, 0 rot). Geerbt aus der WERFENDEN Form
 * `admin/(arbeit)/layout.tsx` (`Spec:429-437`), wo der vorgeschaltete Login-Umweg echt ist.
 *
 * ⛔ `istRadioAdmin`, NICHT DIE VERWALTUNGSSTUFE. Rechtetafel `Spec:4444-4454`, Zeile
 * „CSV-Export": Admin ja, Updater **nein** (`Spec:4452`); Alt-Beleg `export.ts:71`
 * (`requireRole('admin')`). ⚠️ UND DER FALSCHE GRIFF IST DER NAHELIEGENDE: diese Datei liegt
 * unter `admin/(arbeit)/`, wo `Spec:4367`/`:4369-4375` alles andere auf
 * `requireRadioVerwaltung` setzt. ⛔ Der Waechter dagegen ist NICHT der Quelltext-Scan — ein
 * nicht-werfendes Verwaltungs-Praedikat traegt keinen der beiden werfenden Namen —, sondern
 * der Verhaltensfall „als Updater antwortet der Handler 404" in `route.test.ts`.
 *
 * ⛔ ALLE GERAETE, `desc(createdAt)`, KEIN `loanable`-FILTER (`deviceRepo.ts:62-65`,
 * „All devices, newest-first. Backs the full CSV export"). Der Filter waere hier der Fehler
 * und ist der Gegenfall zu `geraeteMitLeihstand` (`deviceRepo.ts:53-59`), wo sein Fehlen der
 * Fehler waere. Die Begruendung steht ausgeschrieben in `_lib/lesepfade/geraete.ts:805-818`.
 *
 * ⛔ DER RUMPF WIRD NICHT HIER GEBAUT: `baueExportBlatt` in `_lib/csv/mappe.ts` (seit DRK-389
 * eine Mappe statt CSV) ist dieselbe Funktion, die `_lib/csv/rundlauf.test.ts` gegen den
 * Re-Import haelt — eine zweite Zusammensetzung hier waere ein zweiter Vertrag ohne Waechter.
 */

/**
 * ⛔ PFLICHT, OBWOHL DIE VOREINSTELLUNG HEUTE SCHON TRAEGT — dieselbe Form wie
 * `admin/(arbeit)/import/hochladen/route.ts:62`. `node_modules/next/dist/docs/01-app/
 * 01-getting-started/15-route-handlers.md:51` sagt „Route Handlers are not cached by
 * default", und `next.config.ts` schaltet Cache Components nicht ein. Die Zeile ist der
 * Riegel gegen den Tag, an dem eine dieser beiden Bedingungen umschlaegt: eine
 * vorgerenderte CSV lieferte die Geraeteliste des Bauzeitpunkts — still, typkorrekt,
 * lint-sauber.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
   * (Bauform-Zulaessigkeitstafel Nr. 9).
   */
  const viewer = await viewerOderNull();
  if (!istRadioAdmin(viewer)) {
    auditDenied("radio", auditActor(viewer));
    return new Response(null, { status: 404 });
  }
  return auditDelivery("radio", "export", "device_collection", auditActor(viewer), async (target) => {
    target("devices");

    /*
     * ⛔ DER DATEINAME KOMMT NUR AUS DIESER ANTWORT — der Ausloeser in Insel 1 ist ein Anker mit
     * `download` OHNE Wert (1:1 `DeviceList.tsx:104-111`, `anchor.download = ''`). Medientyp
     * und `Content-Disposition` setzt `xlsxAntwort`, wie bei jedem Excel-Ausgang der Suite.
     */
    return xlsxAntwort(EXPORT_DATEINAME, [baueExportBlatt(geraeteFuerExport(getDb()))]);
  });
}
