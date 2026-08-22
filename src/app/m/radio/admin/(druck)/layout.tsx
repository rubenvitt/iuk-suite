// src/app/m/radio/admin/(druck)/layout.tsx
import { headers } from "next/headers";
import { requireRadioHost } from "../../_lib/host";
import { requireRadioAdmin } from "../../_lib/zugang";

/**
 * HUELLE 2 — der Druckzweig (Spec:438-441). Heute liegt darunter genau ein kuenftiger
 * Pfad: `/admin/zugaenge/blatt`, das Blatt mit den Zugangscodes (Planteil 4).
 *
 * EIGENE ROUTE-GROUP OHNE SHELL: laege das Blatt unter `(arbeit)`, druckte die Shell
 * Kopfzeile und App-Umschalter mit, und ihr `minHeight: 100vh` erzeugte leere
 * Folgeseiten hinter dem Bogen (`lagerbuch/verwaltung/(druck)/layout.tsx:10-12`).
 *
 * ⛔ DER PREIS UND SEINE BEZAHLUNG — und das ist die sicherheitsrelevante Zeile dieser
 * Datei: mit dem `(arbeit)`-Layout faellt auch dessen Zugriffsriegel weg, und die Seite
 * darunter zeigt die ZUGANGSCODES IM KLARTEXT. Deshalb ruft dieses Layout DIESELBEN zwei
 * Riegel in DERSELBEN Reihenfolge — dieselben Funktionen, nicht zwei Abschriften. Die
 * beiden ANWEISUNGEN unten sind zeichengleich zu denen in `(arbeit)/layout.tsx`; die
 * ZEILEN sind es nicht (dort haengt am Personen-Riegel ein ⬜-Kommentar,
 * `(arbeit)/layout.tsx:54`), und ab Planteil 4 wechselt dort ausserdem der Name auf
 * `requireRadioVerwaltung()` (Spec:4367) — DIESER Zweig bleibt bei `requireRadioAdmin()`
 * (Spec:4368).
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
 * ⚠️ ZWEI LINIEN SIND PFLICHT, sobald die Seite steht: der Riegel in diesem Layout UND
 * derselbe Riegel in der Seite. Die zweite Linie ist Sache von PLANTEIL 4 — sie steht
 * hier als Auflage, nicht als erledigt. ⚠️ `riegel.test.ts` Klausel (e) haelt sie ab
 * dann mechanisch fest; heute ist sie ueber null Seiten leer-gruen und laeuft im
 * Anhebe-Fahrplan (`ADMIN_SEITEN_ANZAHL`) mit.
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
