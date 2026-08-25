// src/app/m/radio/_lib/csv/kopfzeilen.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`): `IMPORTIERBARE_FELDER` ist
// ein WERT, den sowohl Server Components als auch die Client-Insel des Import-Assistenten
// (V18, Insel 4) lesen. Der Scan darueber steht in `src/app/m/radio/riegel.test.ts:1064-1117`.
//
// ⛔ DIESE DATEI HAT KEINEN IMPORT. Sie liegt im selben Ordner wie `_lib/csv/einlesen.ts`,
// das Node-Bausteine benutzt; ein Wertimport ueber jene Datei zoege sie ins Browser-Bundle.

/**
 * Die neunzehn Geraetefelder, die eine CSV-Spalte ansprechen darf.
 *
 * ⛔ 1:1 AUS `radio-admin/shared/src/import/auto-map-headers.ts:2-22` (`IMPORTABLE_FIELDS`).
 * Der Alt-Kommentar (`:1`) nennt die Grenze: „Device columns a CSV may target (no
 * system/identity-internal fields)." ⛔ `id`, `createdAt`, `updatedAt`, `createdBy`,
 * `updatedBy` und `updateNote` stehen deshalb NICHT hier — `updateNote` ist append-only und
 * hat einen eigenen Schreibpfad (`_db/schema.ts:56-58`, `_lib/notiz.ts`).
 *
 * ⚠️ DIE REIHENFOLGE IST DIE DER QUELLE und deckt sich mit `EXPORT_SPALTEN`
 * (`_lib/csv/spalten.ts`). Das ist kein Zufall, sondern der Rundlauf-Vertrag.
 */
export const IMPORTIERBARE_FELDER = [
  "issi",
  "tei",
  "rufname",
  "serialNumber",
  "deviceType",
  "status",
  "location",
  "assignedTo",
  "softwareVersion",
  "lastUpdatedAt",
  "notes",
  "hiorgId",
  "opta",
  "funktion",
  "hersteller",
  "bedieneinheit",
  "deviceModes",
  "alamosIntegrated",
  "loanable",
] as const;

/** Der geschlossene Satz der importierbaren Felder als Typ. */
export type ImportierbaresFeld = (typeof IMPORTIERBARE_FELDER)[number];

/**
 * Normalisiert eine Kopfzeile: NFD, Diakritika entfernen, klein, ⛔ nur `[a-z0-9]` behalten.
 *
 * ⛔ 1:1 AUS `auto-map-headers.ts:26-33`, Schrittfolge inklusive. Das Aufraeumen erst NACH
 * dem Kleinschreiben zu tun waere dasselbe Ergebnis; die Zerlegung VOR dem Entfernen der
 * Diakritika ist es nicht — ohne NFD ist „ä" ein einzelnes Zeichen und faellt als
 * Nicht-`[a-z0-9]` ersatzlos weg.
 *
 * ⚠️ DIE FOLGE, DIE MAN KENNEN MUSS: „ä" zerfaellt zu „a", NICHT zu „ae". „Gerät" wird also
 * `gerat` und nicht `geraet`, und die Synonymtabelle fuehrt beide Schreibungen
 * (`auto-map-headers.ts:49-52`).
 */
function normalisiere(kopf: string): string {
  return kopf
    .normalize("NFD")
    // U+0300..U+036F — die kombinierenden Diakritika, die NFD abgespalten hat. ⛔ ALS
    // ESCAPE UND NICHT ALS LITERAL: die Quelle schreibt den Bereich woertlich
    // (`auto-map-headers.ts:30`), und dort stehen zwei unsichtbare Zeichen im Regexliteral —
    // eine Form, die jeder Editor und jeder Quelltext-Scan anders behandelt.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Normalisiertes Synonym -> Zielfeld.
 *
 * ⛔ 1:1 AUS `auto-map-headers.ts:36-89`, Reihenfolge inklusive: der Alt-Kommentar (`:35`)
 * sagt „Order matters for 'first wins'". Wer die Tabelle umsortiert, aendert bei einem
 * doppelt registrierten Schluessel das Ziel — und der Fehler ist still.
 *
 * ⛔ `tei` IST KEIN ISSI-ALIAS. Der Alt-Kommentar (`:38-40`) haelt fest, warum: „TEI is the
 * hardware identity and has its own column — it is NOT an issi alias (it mapped to issi only
 * while no tei field existed)." Wer ihn zurueckdreht, schreibt Hardware-Kennungen in die
 * umprogrammierbare Funkkennung.
 */
const SYNONYME: Record<string, ImportierbaresFeld> = {
  issi: "issi",
  tei: "tei",
  kennung: "issi",
  funkrufnameissi: "issi",
  rufname: "rufname",
  funkrufname: "rufname",
  seriennummer: "serialNumber",
  seriennr: "serialNumber",
  inventarnummer: "serialNumber",
  serial: "serialNumber",
  geraetetyp: "deviceType",
  geraet: "deviceType",
  gerat: "deviceType",
  typ: "deviceType",
  modell: "deviceType",
  status: "status",
  zustand: "status",
  standort: "location",
  lagerort: "location",
  ort: "location",
  location: "location",
  hiorgid: "hiorgId",
  opta: "opta",
  funktion: "funktion",
  hersteller: "hersteller",
  bedieneinheit: "bedieneinheit",
  alamos: "alamosIntegrated",
  alamosintegriert: "alamosIntegrated",
  alamosintegration: "alamosIntegrated",
  ausleihbar: "loanable",
  ausleihe: "loanable",
  leihbar: "loanable",
  zuordnung: "assignedTo",
  zugeordnet: "assignedTo",
  zustaendig: "assignedTo",
  assignedto: "assignedTo",
  softwareversion: "softwareVersion",
  swversion: "softwareVersion",
  firmware: "softwareVersion",
  fwversion: "softwareVersion",
  version: "softwareVersion",
  letztesupdate: "softwareVersion",
  zuletztaktualisiert: "lastUpdatedAt",
  updatedatum: "lastUpdatedAt",
  aktualisiertam: "lastUpdatedAt",
  notizen: "notes",
  notiz: "notes",
  bemerkung: "notes",
  notes: "notes",
};

/**
 * Ordnet rohe CSV-Kopfzeilen ueber ihre normalisierte Form den Geraetefeldern zu.
 *
 * ⛔ 1:1 AUS `auto-map-headers.ts:100-114`. Drei Eigenschaften, jede mit ihrer Begruendung
 * im Alt-Quelltext:
 *
 * 1. ⛔ DER SCHLUESSEL IST DIE ORIGINALE KOPFZEILE (`:101`, `:110`), nicht die normalisierte.
 *    Die Oberflaeche zeigt der bedienenden Person, was in ihrer Datei steht.
 * 2. ⛔ `Gerätefunktionen…` PER PRAEFIX, nicht exakt (`:104-107`). Der Alt-Kommentar nennt den
 *    Grund: der Kundenkopf `Gerätefunktionen-TMO/DMO/REP/GAT` normalisiert zu einem langen
 *    Token, weil Schraegstriche und Bindestriche wegfallen. Beide Umlautzerlegungen sind
 *    abgedeckt (`gerate…` UND `geraete…`), weil „ä" unter NFD zu „a" wird.
 * 3. ⛔ KEIN DEDUP (`:95-98`, woertlich): „This does NOT dedup by target field: distinct
 *    headers that share a synonym (e.g. 'Typ' and 'Gerätetyp' -> deviceType) all map to that
 *    field. Resolving such collisions to a single source column is the caller's
 *    responsibility." Wer hier deduplizierte, entschiede an der falschen Stelle und
 *    unsichtbar.
 * 4. ⛔ EIN UNBEKANNTER KOPF BEKOMMT KEINEN EINTRAG (`:93-95`, `:109-111`) — er bleibt fuer
 *    die Handzuordnung. Ein Rueckfall auf „irgendein Feld" waere ein stiller Fehlimport.
 */
export function automatischeSpaltenzuordnung(
  koepfe: readonly string[],
): Record<string, ImportierbaresFeld> {
  const ergebnis: Record<string, ImportierbaresFeld> = {};
  for (const roh of koepfe) {
    const n = normalisiere(roh);
    const istGeraetefunktionen = n.startsWith("geratefunktionen") || n.startsWith("geraetefunktionen");
    const feld = istGeraetefunktionen ? "deviceModes" : SYNONYME[n];
    if (feld !== undefined) {
      ergebnis[roh] = feld;
    }
  }
  return ergebnis;
}
