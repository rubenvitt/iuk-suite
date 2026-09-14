/**
 * DRK-293 — DIE GEMEINSAME BEARBEITUNG MEHRERER ARTIKEL, ohne Oberflaeche und
 * ohne Datenbank: welche Felder gemeinsam aenderbar sind, und was eine
 * Aenderung an einer gegebenen Auswahl tatsaechlich anfasst.
 *
 * Kein "use client": die Server Action prueft dieselben Grenzen, die die
 * Client-Insel anzeigt (Falle 6). Ein `WERT` aus einem als Client markierten
 * Modul kaeme in einer Server Component nicht an.
 *
 * DREI FELDER, UND DIE AUSWAHL IST DIE EIGENTLICHE ENTSCHEIDUNG (offene Frage
 * des Tickets). Gemeinsam aenderbar ist, was eine GRUPPE von Artikeln teilen
 * kann:
 *
 *   Kategorie  ein Ordnungsbegriff, den man einer Gruppe gibt — der Anlass des
 *              Tickets, seit es Kategorien gibt (DRK-294)
 *   Fach       der Lagerplatz; wird das Handlager umgeraeumt, zieht ein ganzes
 *              Fach auf einmal um
 *   Status     eine Gruppe stilllegen oder wieder aufnehmen
 *
 * AUSDRUECKLICH NICHT DABEI, und das ist kein Vergessen:
 *
 *   Einheit    gehoert zum einzelnen Artikel und deutet ALLE seine schon
 *              gebuchten Zahlen. „Stk" auf „Pkg" umzustellen aendert kein Feld,
 *              sondern die Bedeutung des Bestands — und zwar still.
 *   Mindest-   eine Zahl je Artikel, die aus seinem Verbrauch kommt. Ein
 *   bestand    gemeinsamer Wert fuer eine Auswahl ist fast immer falsch.
 *   Name       macht aus zwei Artikeln zwei gleich benannte.
 *
 * Ein viertes Feld waere ein Eintrag in `SAMMEL_FELDER`, ein Zweig in
 * `feldAendert` und ein Eingabefeld in `SammelDrawer` — die Liste hier ist die
 * Quelle, nicht die Oberflaeche.
 */
import { kategorieNormalisieren } from "./kategorie";

export type SammelFeld = "kategorie" | "fach" | "aktiv";

/** In dieser Reihenfolge stehen die Felder in Formular und Vorschau. */
export const SAMMEL_FELDER: readonly SammelFeld[] = ["kategorie", "fach", "aktiv"];

export const SAMMEL_FELDNAMEN: Record<SammelFeld, string> = {
  kategorie: "Kategorie",
  fach: "Fach im Handlager",
  aktiv: "Status",
};

/**
 * `undefined` heisst „dieses Feld bleibt, wie es ist". Bei der Kategorie heisst
 * `null` dagegen ausdruecklich „ohne Kategorie" — die beiden sind hier nicht
 * dasselbe und duerfen nie zusammenfallen (dieselbe Unterscheidung wie in
 * `_actions/artikel.ts`).
 */
export type SammelAenderung = {
  kategorie?: string | null;
  fach?: string;
  aktiv?: boolean;
};

/** Was die Vorschau von einem Artikel wissen muss — nicht mehr. */
export type SammelZeile = {
  id: string;
  name: string;
  kategorie: string | null;
  fach: string;
  aktiv: boolean;
};

/**
 * Obergrenze einer Anfrage. Weit ueber jedem echten Handlager; die Zahl deckelt
 * nur, was keine Oberflaeche je schickt.
 */
export const SAMMEL_MAX_ARTIKEL = 2000;

/**
 * Wie viele IDs in EIN `IN (…)` gehen. SQLite vertraegt heute weit mehr
 * (`SQLITE_MAX_VARIABLE_NUMBER`, seit 3.32 bei 32766), aber die Zahl ist eine
 * Uebersetzungs-Einstellung und keine Zusage — und die Schleife kostet nichts.
 */
export const SAMMEL_BLOCK = 400;

/** Das Fach ist ein Kuerzel und steht gross — wie im Stammdatenfeld der Schublade. */
export function fachNormalisieren(roh: string): string {
  return roh.trim().toUpperCase();
}

/** Die Felder, die diese Aenderung ueberhaupt setzt — in Anzeigereihenfolge. */
export function gesetzteFelder(aenderung: SammelAenderung): SammelFeld[] {
  return SAMMEL_FELDER.filter((feld) => aenderung[feld] !== undefined);
}

/**
 * Aendert dieses Feld DIESEN Artikel wirklich?
 *
 * Die Kategorie wird ZEICHENGENAU verglichen, nicht ueber `kategorieSchluessel`:
 * wer „Verbandmaterial" auf eine Auswahl legt, in der „verbandmaterial" steht,
 * hat sich fuer eine Schreibweise entschieden — das ist eine Aenderung, und die
 * Vorschau zeigt sie als eine.
 */
function feldAendert(zeile: SammelZeile, feld: SammelFeld, aenderung: SammelAenderung): boolean {
  switch (feld) {
    case "kategorie":
      return aenderung.kategorie !== undefined && aenderung.kategorie !== zeile.kategorie;
    case "fach":
      return aenderung.fach !== undefined && aenderung.fach !== zeile.fach;
    case "aktiv":
      return aenderung.aktiv !== undefined && aenderung.aktiv !== zeile.aktiv;
  }
}

export type SammelVorschauZeile = {
  id: string;
  name: string;
  /** Leer heisst: dieser Artikel traegt die Werte schon und bleibt unberuehrt. */
  felder: SammelFeld[];
};

export type SammelVorschau = {
  /** Alle ausgewaehlten Artikel, in der uebergebenen Reihenfolge. */
  zeilen: SammelVorschauZeile[];
  /** Wie viele davon sich wirklich aendern. */
  betroffen: number;
  /** Wie viele die Werte schon tragen. */
  unveraendert: number;
  /** Die gesetzten Felder der Aenderung, unabhaengig von der Auswahl. */
  felder: SammelFeld[];
};

/**
 * DIE VORSCHAU IST DAS AKZEPTANZKRITERIUM, nicht ein Komfort: „vor dem Speichern
 * ist erkennbar, welche Artikel und Felder geaendert werden".
 *
 * Sie zaehlt deshalb je Artikel und nicht pauschal. „15 Artikel ausgewaehlt"
 * waere eine Zahl ueber die AUSWAHL; erkennbar sein soll die WIRKUNG, und die
 * ist bei einem Artikel, der die Kategorie schon traegt, keine.
 */
export function sammelVorschau(
  zeilen: readonly SammelZeile[],
  aenderung: SammelAenderung,
): SammelVorschau {
  const felder = gesetzteFelder(aenderung);
  const vorschauZeilen = zeilen.map((zeile) => ({
    id: zeile.id,
    name: zeile.name,
    felder: felder.filter((feld) => feldAendert(zeile, feld, aenderung)),
  }));
  const betroffen = vorschauZeilen.filter((zeile) => zeile.felder.length > 0).length;
  return {
    zeilen: vorschauZeilen,
    betroffen,
    unveraendert: vorschauZeilen.length - betroffen,
    felder,
  };
}

/** Der Zielwert eines Feldes als Satzstueck fuer die Zusammenfassung. */
export function sammelWertText(feld: SammelFeld, aenderung: SammelAenderung): string {
  switch (feld) {
    case "kategorie":
      return aenderung.kategorie ?? "ohne Kategorie";
    case "fach":
      return aenderung.fach ?? "";
    case "aktiv":
      return aenderung.aktiv ? "aktiv" : "inaktiv";
  }
}

/**
 * Baut die Aenderung aus dem, was im Formular angehakt ist. Ein nicht
 * angehaktes Feld fehlt im Ergebnis — es steht nicht mit `undefined` darin,
 * sonst zaehlte `Object.keys` es mit.
 */
export function sammelAenderungBauen(eingabe: {
  kategorie?: { an: boolean; wert: string };
  fach?: { an: boolean; wert: string };
  aktiv?: { an: boolean; wert: boolean };
}): SammelAenderung {
  const aenderung: SammelAenderung = {};
  if (eingabe.kategorie?.an) aenderung.kategorie = kategorieNormalisieren(eingabe.kategorie.wert);
  if (eingabe.fach?.an) aenderung.fach = fachNormalisieren(eingabe.fach.wert);
  if (eingabe.aktiv?.an) aenderung.aktiv = eingabe.aktiv.wert;
  return aenderung;
}

/** Zerlegt eine ID-Liste in Bloecke fuer `IN (…)`; leere Eingabe ergibt nichts. */
export function idBloecke(ids: readonly string[], groesse = SAMMEL_BLOCK): string[][] {
  const bloecke: string[][] = [];
  for (let start = 0; start < ids.length; start += groesse) {
    bloecke.push(ids.slice(start, start + groesse));
  }
  return bloecke;
}
