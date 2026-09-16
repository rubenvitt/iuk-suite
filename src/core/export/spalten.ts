/**
 * DER GEMEINSAME EXCEL-BAUSTEIN DER SUITE — die reine Hälfte (DRK-186).
 *
 * Hier entstehen aus Spaltenbeschreibungen und Zeilen die fertigen Blattdaten
 * für `write-excel-file`. Die Bibliothek selbst kommt hier NICHT vor: sie hat
 * zwei Einstiegspunkte (`/node` und `/browser`), und welcher gilt, entscheidet
 * die Seite der Grenze — `server.ts` bzw. `client.ts`. Was beide teilen, ist
 * diese Rechnung, und sie ist damit ohne Bibliothek, ohne DOM und ohne Route
 * prüfbar (`spalten.test.ts`).
 *
 * ⚠️ KEIN "use client" (Falle 6). Eine Spaltenliste ist ein WERT, und die
 * Spaltenlisten der Module werden von Route Handlern UND von Client-Inseln
 * gelesen. Trüge diese Datei die Direktive, käme `blatt()` in einem Route
 * Handler als Client-Referenz an — HTTP 500, den weder `pnpm build` noch
 * Vitest sieht.
 *
 * ⛔ WARUM ÜBERHAUPT EIN BAUSTEIN IN `core`: die Suite-Regel lautet „nur was ein
 * zweites, heute belegbares Modul braucht". Belegt sind heute VIER:
 * `feedback` (zwei Ausgaben), `uav` (zwei), `lagerbuch` (zwei). Der fünfte
 * Ausgabeweg, `radio`s Geräteliste, bleibt bewusst CSV — er ist kein Report,
 * sondern das Wiedereinlesformat des Import-Assistenten (`_lib/csv/
 * rundlauf.test.ts` hält den Vertrag). Ein Report wird GELESEN, ein
 * Austauschformat wird ZURÜCKGELESEN; nur das erste gehört hierher.
 */

/**
 * Was in einer Zelle stehen darf. Bewusst schmal: Text, Zahl, leer.
 *
 * ⛔ KEIN `Date`, UND DAS IST EINE ENTSCHEIDUNG. `write-excel-file` schriebe ein
 * `Date` als echte Datumszelle — mit einem Format, das die Zelle in der Zone des
 * ÖFFNENDEN Rechners darstellt. Ein Dienstabend am 1. März stünde in einer
 * Kalkulation westlich von uns als 28. Februar. Die Module formatieren ihre
 * Tage deshalb weiter selbst (jedes hat seine Zonenrechnung) und liefern die
 * fertige Zeichenkette; `dateiname.ts` hält dieselbe Regel für den Dateinamen.
 */
export type ExportZelle = string | number | null;

export type ExportSpalte<T> = {
  /** Der Spaltenkopf, wörtlich. Er steht fett in Zeile 1 und wird eingefroren. */
  kopf: string;
  /** Spaltenbreite in Zeichen. Ohne Angabe entscheidet die Kalkulation. */
  breite?: number;
  wert: (zeile: T) => ExportZelle;
};

/**
 * Eine Zelle in der Form, die `write-excel-file` erwartet.
 *
 * `type` ist NICHT schmückend: ohne ihn rät die Bibliothek aus dem Laufzeitwert,
 * und eine Artikelnummer „0815" käme als Zahl 815 an. Mit `type: String` legt
 * sie jede Textzelle als Textzelle an — und genau daran hängt die zweite Hälfte
 * von DRK-186: **eine Textzelle kann keine Formel sein.** Die
 * Formel-Neutralisierung, die jeder CSV-Weg der Suite einzeln nachbaute (ein
 * führendes `=`/`+`/`-`/`@` wird beim Öffnen als Formelbeginn gelesen), ist auf
 * diesem Weg gegenstandslos — nicht abgeschaltet, sondern nicht mehr anwendbar.
 */
export type MappenZelle = {
  value: string | number;
  type: StringConstructor | NumberConstructor;
  fontWeight?: "bold";
};

/**
 * Eine Zeile. ⚠️ EINE LEERE ZELLE IST `null`, NICHT `{ value: null }` — das
 * lehnt `write-excel-file` im Typ ab (`CellObject.value?: Value`, und `Value`
 * kennt kein `null`; `Cell` dagegen ist `CellObject | Value | null | undefined`).
 * Zur Laufzeit ginge beides; der Typ ist hier der strengere und der bessere.
 */
export type MappenZeile = (MappenZelle | null)[];

/** Ein fertig gerechnetes Blatt — undurchsichtig für den Aufrufer, damit
 *  mehrere Blätter mit VERSCHIEDENEN Zeilentypen in einer Mappe liegen können. */
export type FertigesBlatt = {
  name: string;
  daten: MappenZeile[];
  breiten: { width?: number }[];
  /** Trägt Zeile 1 Spaltenköpfe? Entscheidet, ob `mappe()` sie einfriert.
   *  ⚠️ AUSDRÜCKLICH UND NICHT AM FETTDRUCK ABGELESEN: „die erste Zelle ist
   *  fett" wäre dieselbe Auskunft nur indirekt, und sie kippte still, sobald
   *  jemand eine Kopfzeile anders auszeichnet oder ein Kopfdatenblatt fettet. */
  kopfzeile: boolean;
};

/** Blattnamen dürfen in Excel weder länger als 31 Zeichen sein noch
 *  `: \ / ? * [ ]` enthalten — eine Mappe mit einem solchen Namen öffnet gar
 *  nicht. Der Fehler wäre still: die Datei entsteht, die Kalkulation lehnt sie ab. */
export function blattname(roh: string): string {
  return roh.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Blatt1";
}

function zelle(wert: ExportZelle): MappenZelle | null {
  if (wert === null || wert === "") return null;
  if (typeof wert === "number") {
    // NaN/Infinity wären in der Mappe eine kaputte Zahlenzelle. Leer ist
    // ehrlicher als eine Zahl, die keine ist.
    return Number.isFinite(wert) ? { value: wert, type: Number } : null;
  }
  return { value: wert, type: String };
}

/**
 * Spalten + Zeilen → ein fertiges Blatt. Zeile 1 sind die fetten Köpfe.
 *
 * ⛔ DIE KÖPFE STEHEN IN ZEILE 1, IMMER. Der CSV-Weg konnte darüber noch
 * Kopfdaten legen („Gruppe", „Datum", eine Leerzeile) — eine Textdatei hat nur
 * eine Fläche. In einer Kalkulation ist das aktiv schädlich: Sortieren, Filtern
 * und „als Tabelle formatieren" gehen von einer Kopfzeile in Zeile 1 aus, und
 * ein Vorspann verschiebt sie. Kopfdaten bekommen deshalb ein EIGENES Blatt —
 * das ist die eine Sache, die eine Mappe kann und eine CSV nicht.
 */
export function blatt<T>(
  name: string,
  spalten: readonly ExportSpalte<T>[],
  zeilen: readonly T[],
): FertigesBlatt {
  return {
    name: blattname(name),
    daten: [
      spalten.map((s) => ({ value: s.kopf, type: String, fontWeight: "bold" as const })),
      ...zeilen.map((z) => spalten.map((s) => zelle(s.wert(z)))),
    ],
    breiten: spalten.map((s) => (s.breite === undefined ? {} : { width: s.breite })),
    kopfzeile: true,
  };
}

/**
 * Ein Blatt aus freien Zeilen — für Kopfdaten (Name/Wert), die keine Spalten
 * haben. Ohne Kopfzeile und ohne Fettung: hier gibt es nichts zu sortieren.
 */
export function freiesBlatt(
  name: string,
  zeilen: readonly (readonly ExportZelle[])[],
  breiten: readonly number[] = [],
): FertigesBlatt {
  return {
    name: blattname(name),
    daten: zeilen.map((z) => z.map(zelle)),
    breiten: breiten.map((b) => ({ width: b })),
    kopfzeile: false,
  };
}

/**
 * Die Mappe in der Form, die beide Einstiegspunkte von `write-excel-file`
 * nehmen. `stickyRowsCount: 1` friert die Kopfzeile ein — bei 800 Artikeln ist
 * das der Unterschied zwischen lesbar und nicht.
 *
 * ⚠️ NUR AUF BLÄTTERN MIT KOPFZEILE. Ein Kopfdatenblatt hat keine, und eine
 * eingefrorene erste Zeile verbärge dort den ersten Wert.
 */
export function mappe(blaetter: readonly FertigesBlatt[]): {
  sheet: string;
  data: MappenZeile[];
  columns: { width?: number }[];
  stickyRowsCount?: number;
}[] {
  if (blaetter.length === 0) throw new Error("[export] eine Mappe ohne Blatt gibt es nicht");
  return blaetter.map((b) => ({
    sheet: b.name,
    data: b.daten,
    columns: b.breiten,
    ...(b.kopfzeile ? { stickyRowsCount: 1 } : {}),
  }));
}
