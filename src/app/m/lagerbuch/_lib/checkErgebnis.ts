/**
 * EIN Parser fuer die zwei inkompatiblen JSON-Formate in `checks.ergebnis`
 * (§4.10). Kein "use client", kein Datenbankzugriff.
 *
 * WARUM ES DIESE DATEI GIBT. Die Alt-Anwendung parst dasselbe Feld an ZWEI
 * Stellen dupliziert, jeweils mit einem nackten `catch { }` (`queries.ts:382`,
 * `:435 ff.`). Das funktioniert und muss zweimal gepflegt werden — und genau
 * daraus entsteht die Doppelrechnung aus §5.8.3, bei der Uebersicht und Detail
 * fuer DASSELBE JSON verschiedene Summen liefern koennen.
 *
 * ⚠️ FELDNAMEN IM V2-FORMAT SIND NICHT UMBENENNBAR. Sie stehen in
 * Produktionsdaten; wird einer geaendert, wird jede historische Auswertung STUMM
 * 0 — kein Fehler, keine Meldung, nur Nullen (§4.10, 1:1-Pflicht 2).
 *
 * ⚠️ DER V1-ZWEIG WANDERT MIT. Das Altformat ist im Produktionsbestand und NICHT
 * konvertierbar (es traegt die Information schlicht nicht). Faellt der Zweig weg,
 * zeigen alte Checks leere Detaillisten statt der Zusammenfassung — und das ist
 * die einzige Auswertung, die es fuer sie je gab.
 */

/** V2: eine gezaehlte Position. `sollPositionId` zeigt auf `soll_positionen.id`
 *  und kann auf eine geloeschte Zeile zeigen — `ergebnis` ist freies JSON OHNE
 *  Fremdschluessel. Der Leser ueberbrueckt das tolerant (T49). */
export type CheckPositionRoh = {
  sollPositionId?: string;
  artikelId: string;
  soll?: number;
  ist?: number;
};

/** V2: die Aggregation JE ARTIKEL — nicht je Position. Der Fahrzeugbestand ist
 *  pro (Artikel, Lagerort); liegt derselbe Artikel in zwei Faechern, teilen sich
 *  die Positionen EINEN Bestand (§5.7.1). */
export type CheckArtikelRoh = {
  artikelId: string;
  positionen?: number;
  sollSumme?: number;
  istSumme?: number;
  recordedVorher?: number;
  korrektur?: number;
  nachfuellGewuenscht?: number;
  nachfuellGebucht?: number;
};

/** V2: die Geraete-Quittierung. ⚠️ `zustand` ist ein FREIER String, weil ein
 *  Altcheck theoretisch einen fremden Wert tragen kann. Beim SCHREIBEN ist er ab
 *  Teil 4 ein Zod-Enum, beim ANZEIGEN bleibt er tolerant (§5.8.2). */
export type CheckGeraetRoh = {
  geraetId: string;
  vorhanden?: boolean;
  zustand?: string | null;
  bemerkung?: string | null;
};

/**
 * V2: die Sauerstoff-Messung.
 *
 * ⚠️ `nennfuelldruckBar` ist `number | null | undefined`, und alle DREI Zustaende
 * sind verschieden (§5.12):
 *   - eine Zahl  → der Snapshot zum Check-Zeitpunkt, die richtige Bezugsgroesse;
 *   - `undefined`→ der Snapshot FEHLT (jeder Check vor seiner Einfuehrung);
 *   - `null`     → ausdruecklich „unbekannt" (ab jetzt geschrieben).
 * Ein Parser, der `null` auf `undefined` normalisiert oder auf 200 setzt, nimmt
 * dem Leser die Moeglichkeit, „Nennfuelldruck unbekannt" zu erkennen — und dann
 * ist der `?? 200`-Rueckfall wieder da, nur eine Ebene tiefer.
 */
export type CheckFlascheRoh = {
  flascheId: string;
  druckBar?: number;
  nennfuelldruckBar?: number | null;
};

/** V2: der im Fahrzeug gemeldete Verfall. `ampel`/`abgelaufen` sind der Snapshot
 *  von damals; die Leser rechnen die Ampel NEU gegen heute (§5.6.3). */
export type CheckVerfallRoh = {
  artikelId: string;
  verfall: string;
  ampel?: string;
  abgelaufen?: boolean;
};

/** V1 (alt, vor dem Fahrzeugbestand): ein Array ohne Positionsdetails. */
export type CheckErgebnisV1 = {
  version: 1;
  eintraege: { fehlt?: number; gebucht?: number }[];
};

/** V2 (heute): ein Objekt mit fuenf Schluesseln (`check.ts:167`). */
export type CheckErgebnisV2 = {
  version: 2;
  positionen: CheckPositionRoh[];
  artikel: CheckArtikelRoh[];
  geraete: CheckGeraetRoh[];
  flaschen: CheckFlascheRoh[];
  verfall: CheckVerfallRoh[];
};

export type CheckErgebnis = CheckErgebnisV1 | CheckErgebnisV2;

/**
 * Der Wert, in den JEDER Lesefehler ueberfuehrt wird.
 *
 * ⚠️ Er wird NIE direkt zurueckgegeben — `parseCheckErgebnis` baut jedes Mal eine
 * frische Kopie. Sonst teilten sich zwei Aufrufer dieselben Arrays, und ein
 * `.sort()` im Leser (T49 sortiert alle vier Detaillisten) veraenderte die Ausgabe
 * des anderen. Uebersicht und Detail rufen denselben Parser.
 *
 * ⚠️ Review-Fix T37: EINGEFROREN — nicht nur die Konstante selbst, auch jede der
 * fuenf Listen darin. Ein `Object.freeze` allein auf dem Objekt liesse `push` auf
 * `.positionen` weiterhin zu; erst das Einfrieren der Arrays verhindert, dass ein
 * kuenftiger Aufrufer (T40, T49) versehentlich DIREKT auf dieser Konstante statt
 * auf dem Rueckgabewert von `parseCheckErgebnis` mutiert und sie damit fuer den
 * Rest der Prozesslaufzeit verfaelscht — der Typ bleibt dabei unveraendert
 * (mutierbare Arrays), nur der Laufzeitwert ist geschuetzt.
 */
export const LEERES_ERGEBNIS: CheckErgebnisV2 = {
  version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [],
};
Object.freeze(LEERES_ERGEBNIS.positionen);
Object.freeze(LEERES_ERGEBNIS.artikel);
Object.freeze(LEERES_ERGEBNIS.geraete);
Object.freeze(LEERES_ERGEBNIS.flaschen);
Object.freeze(LEERES_ERGEBNIS.verfall);
Object.freeze(LEERES_ERGEBNIS);

/** Frische, leere V2-Struktur — nie die geteilte Konstante. */
function leer(): CheckErgebnisV2 {
  return { version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [] };
}

/** Nimmt eine Liste nur an, wenn sie wirklich ein Array ist. */
function liste<T>(wert: unknown): T[] {
  return Array.isArray(wert) ? (wert as T[]) : [];
}

/**
 * Parst `checks.ergebnis`.
 *
 * DER DISKRIMINATOR IST `version`, nicht `Array.isArray` am Aufrufort. Beide
 * Leser bekommen ein Objekt, dessen Form TypeScript unterscheiden kann; wer
 * weiterhin `Array.isArray(raw)` schreibt, hat den Parser gebaut und nicht
 * benutzt.
 *
 * ⚠️ `"[]"` BLEIBT V1. Es ist der Vorgabewert des Alt-Lesers
 * (`JSON.parse(c.ergebnis ?? "[]")`, `queries.ts:366`); kippte es in den
 * V2-Zweig, waere `altFormat` fuer einen Altcheck ohne Eintraege falsch.
 */
export function parseCheckErgebnis(roh: string | null): CheckErgebnis {
  if (!roh) return leer();
  let daten: unknown;
  try {
    daten = JSON.parse(roh);
  } catch {
    return leer();
  }
  if (Array.isArray(daten)) {
    return { version: 1, eintraege: daten as CheckErgebnisV1["eintraege"] };
  }
  // `typeof null === "object"` — deshalb die Null-Pruefung. Ein Skalar
  // (`5`, `"text"`, `true`) parst erfolgreich und ist trotzdem kein Ergebnis.
  if (daten === null || typeof daten !== "object") return leer();
  const o = daten as Record<string, unknown>;
  return {
    version: 2,
    positionen: liste<CheckPositionRoh>(o.positionen),
    artikel: liste<CheckArtikelRoh>(o.artikel),
    geraete: liste<CheckGeraetRoh>(o.geraete),
    flaschen: liste<CheckFlascheRoh>(o.flaschen),
    verfall: liste<CheckVerfallRoh>(o.verfall),
  };
}
