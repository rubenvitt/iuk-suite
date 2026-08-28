// src/app/m/radio/admin/(druck)/layout.tsx
import { headers } from "next/headers";
import { requireRadioHost } from "../../_lib/host";
import { requireRadioAdmin } from "../../_lib/zugang";

/**
 * HUELLE 2 — der Druckzweig (Spec:438-441). Darunter liegt genau ein Pfad, und seit
 * Aufgabe V21 steht er: `/admin/zugaenge/blatt`, das Blatt mit den Zugangscodes.
 *
 * EIGENE ROUTE-GROUP OHNE SHELL: laege das Blatt unter `(arbeit)`, druckte die Shell
 * Kopfzeile und App-Umschalter mit, und ihr `minHeight: 100vh` erzeugte leere
 * Folgeseiten hinter dem Bogen (`lagerbuch/verwaltung/(druck)/layout.tsx:10-12`).
 *
 * ⛔ DER PREIS UND SEINE BEZAHLUNG — und das ist die sicherheitsrelevante Zeile dieser
 * Datei: mit dem `(arbeit)`-Layout faellt auch dessen Zugriffsriegel weg, und die Seite
 * darunter zeigt die ZUGANGSCODES IM KLARTEXT. Deshalb ruft dieses Layout DIESELBEN zwei
 * Riegel in DERSELBEN Reihenfolge — dieselben Funktionen, nicht zwei Abschriften. Die
 * beiden ANWEISUNGEN unten stehen in DERSELBEN Reihenfolge wie in `(arbeit)/layout.tsx`.
 * ⚠️ ZEICHENGLEICH SIND SIE SEIT AUFGABE V3 NICHT MEHR: dort heisst der Personen-Riegel
 * `requireRadioVerwaltung()` (Spec:4367) und liefert seit V4 die Stufe an die Navigation
 * (`(arbeit)/layout.tsx:61`). DIESER Zweig bleibt bei `requireRadioAdmin()` (Spec:4368) —
 * darunter liegt das Blatt mit den Zugangscodes im Klartext.
 *
 * DER PRAEZEDENZFALL STEHT IM REPO UND WAR EIN ECHTER AUSFALL: „Der Praezedenzfall
 * `feedback` hat sie als eigene Route mit eigenem Layout — und genau dort fiel sie aus
 * dem Zugriffsriegel heraus, weil der Riegel im anderen Layout hing"
 * (zitiert in `lagerbuch/verwaltung/(druck)/layout.tsx:30-34`).
 *
 * ⚠️ DER RIEGEL IST HIER NICHT WENIGER STRENG, SONDERN GLEICH STRENG; nur die Huelle
 * fehlt, weil das Blatt in den Drucker geht und nicht in ein Browserfenster.
 * Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (Spec:569-571).
 *
 * ✅ ZWEI LINIEN SIND PFLICHT, UND DIE ZWEITE STEHT SEIT V21: der Riegel in diesem Layout
 * UND derselbe Riegel in `zugaenge/blatt/page.tsx`. Die Auflage ist damit eingeloest, nicht
 * mehr geschuldet. `riegel.test.ts` Klausel (e) haelt die Anwesenheit fest, Klausel (g) die
 * Stellung als ERSTE Anweisung; `ADMIN_SEITEN_ANZAHL` steht auf 10, und diese Spur des
 * Anhebe-Fahrplans ist abgearbeitet (`riegel.test.ts:113-121`).
 *
 * KEIN Stylesheet-Import: `lagerbuch` zieht hier `./druck.css`. Das Druckbild von `radio`
 * gehoert zu Planteil 4, MIT dem Blatt.
 */
export default async function RadioDruckLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kopf = await headers();
  requireRadioHost(kopf);
  await requireRadioAdmin();

  return <>{children}</>;
}
