/**
 * DRK-297 — der Begriff „Handlager" an genau EINER Stelle.
 *
 * Kein "use client", kein Icon-Import, kein Datenbankzugriff. Reine Funktion
 * ueber bereits geladene Zeilen — dieselbe Bauart wie `_lib/domain/bestand.ts`.
 *
 * ⚠️ DIE WURZEL IST IMMER TEIL DES ERGEBNISSES, auch wenn es sie gar nicht
 * gibt. Der Grund ist nicht Hoeflichkeit: das Ergebnis geht in `inArray`, und
 * drizzle macht aus einer leeren Liste `WHERE false` — jeder Bestand fiele
 * still auf 0, ohne dass irgendwo etwas wirft.
 */
export type OrtZeile = { id: string; parentId: string | null; sortierung: number };

declare const lagerbereichsMarke: unique symbol;

/**
 * DRK-354 — EIN BEREICH VON LAGERORTEN: eine Wurzel samt allem, was darunter
 * haengt. Der Gegenbegriff ist EIN EINZELNER ORT, und der ist schlicht eine
 * `string`-ID — kein Bereich, auch nicht einelementig.
 *
 * ⚠️ DER UNTERSCHIED WAR FUER DEN COMPILER UNSICHTBAR, und die Verwechslung ist
 * die teuerste dieses Moduls — in BEIDE Richtungen still:
 *
 *   Handlager-Bereich auf ein Fahrzeug angewandt → PHANTOMBESTAND. In einer
 *   frisch migrierten Datenbank unsichtbar, weil dort beide Bestaende
 *   identisch sind.
 *
 *   Ein Handlager-Pfad auf die nackte Wurzel gescopt → die Abbuchung meldet
 *   „0 gebucht" OHNE FEHLER, sobald der Bestand in einem Schrank liegt.
 *   Genau dieser Fall war der Ausloeser von DRK-297.
 *
 * Seit DRK-297 nehmen die Bestandsabfragen und der Abbuchungskern eine
 * ORTSMENGE statt einer einzelnen ID; `handlagerOrte(db)` und `[fahrzeugId]`
 * sahen danach beide wie `readonly string[]` aus. Jede neue Aufrufstelle musste
 * VON HAND eingeordnet werden. Die Marke macht daraus zwei Typen:
 *
 *   `Lagerbereich`  entsteht AUSSCHLIESSLICH hier in `teilbaum` — eine nackte
 *                   Liste wie `[fahrzeugId]` wird dort abgelehnt, wo ein
 *                   Bereich gemeint ist.
 *   `string`        ist der einzelne Ort. Jede Abfrage, die beides koennen
 *                   muss, hat dafuer ZWEI Einstiege (`…ImBereich` / `…AnOrt`);
 *                   der Einzelort-Einstieg nimmt die ID, keine Liste — damit
 *                   wird `handlagerOrte(db)` dort abgelehnt, wo ein einzelner
 *                   Ort gemeint ist.
 *
 * ⚠️ ZWEI TYPEN ALLEIN REICHEN NICHT, und das ist der Grund fuer die zwei
 * Einstiege: eine Abfrage, die eine Vereinigung `Bereich | Einzelort` nimmt,
 * akzeptiert an JEDER Aufrufstelle wieder beides — der Compiler weiss dort
 * nicht, was gemeint war. Erst die Aufteilung der ZIELE traegt die Absicht.
 *
 * ⚠️ DIE MARKE IST EIN TYP, KEIN FELD. Zur Laufzeit ist ein `Lagerbereich`
 * genau das Array, das `teilbaum` gebaut hat; `JSON.stringify`, `inArray` und
 * `new Set(...)` sehen keinen Unterschied. Wer sie per `as` selbst vergibt,
 * hebelt den ganzen Umbau aus — `orte.test.ts` riegelt das mit einem
 * Quelltext-Scan ueber das Modul ab.
 *
 * ⚠️ DIE REINEN FUNKTIONEN IN `domain/bestand.ts` NEHMEN WEITER EINE NACKTE
 * LISTE, und das ist Absicht: sie sind die SPEZIFIKATION, gegen die die
 * SQL-Aggregate in `_db/aggregate.test.ts` differenziell geprueft werden. Ein
 * Prueftext baut seine Ortsliste von Hand; eine Marke zwaenge ihn zu genau dem
 * `as`, das hier verboten ist.
 */
export type Lagerbereich = readonly string[] & { readonly [lagerbereichsMarke]: true };

/**
 * Die Wurzel und ihre direkten Kinder, Wurzel zuerst, Kinder nach
 * `sortierung`, dann `id`.
 *
 * ⚠️ EINE EBENE TIEF, UND DAS IST EINE ENTSCHEIDUNG: Schraenke haben heute
 * keine Kinder, die Faecher darin sind `artikel.fach`. Die Schleife unten
 * steigt trotzdem beliebig tief — nicht aus Vorrat, sondern damit ein spaeter
 * eingehaengter Ort nicht still aus dem Bestand faellt.
 *
 * ⚠️ DIE REIHENFOLGE IST FACHLICH: sie ist der vierte Sortierrang von FEFO
 * (`domain/fefo.ts`). Eine „egale" Reihenfolge schickte jemanden ohne Not zum
 * GF-Schrank.
 *
 * `ohneKinder` liefert die Wurzel ALLEIN — der Bereich „an diesem Ort, weiter
 * unten noch nicht einsortiert" (DRK-337, `zaehlBereich`). Das ist bewusst KEIN
 * zweiter Erzeuger: die Marke soll an genau einer Stelle entstehen (DRK-354),
 * und ein `nurWurzel(id)` daneben waere ein zweites Schlupfloch mit demselben
 * Recht, jede beliebige ID zum Bereich zu erklaeren.
 */
export function teilbaum(
  orte: OrtZeile[], wurzelId: string, opts: { ohneKinder?: boolean } = {},
): Lagerbereich {
  const kinder = new Map<string, OrtZeile[]>();
  for (const o of orte) {
    if (o.parentId === null) continue;
    const gruppe = kinder.get(o.parentId);
    if (gruppe) gruppe.push(o);
    else kinder.set(o.parentId, [o]);
  }

  const ergebnis: string[] = [];
  const gesehen = new Set<string>();
  const absteigen = (id: string): void => {
    // Der Riegel gegen den Zyklus. Ein Schrank ist heute nie Elternteil; wenn
    // es doch einmal so kommt, ist eine Endlosschleife der teuerste Ausgang.
    if (gesehen.has(id)) return;
    gesehen.add(id);
    ergebnis.push(id);
    if (opts.ohneKinder) return;
    const gruppe = kinder.get(id) ?? [];
    for (const kind of [...gruppe].sort((a, b) => a.sortierung - b.sortierung || a.id.localeCompare(b.id))) {
      absteigen(kind.id);
    }
  };
  absteigen(wurzelId);
  // DRK-354 — DIE EINZIGE STELLE DES MODULS, DIE DIE MARKE VERGIBT. Sie steht
  // hier, weil hier die Baumordnung entsteht: erst damit ist die Liste ein
  // Bereich und nicht irgendeine Ortsmenge.
  return ergebnis as unknown as Lagerbereich;
}
