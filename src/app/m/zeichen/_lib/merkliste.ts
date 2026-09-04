import { findeZeichen, type ZeichenId } from "./katalog";

/**
 * Der Satz fuer eine Merkzeile, deren Zeichen der Katalog nicht mehr fuehrt
 * (Spec §4.6 Stufe 2). EINE Quelle fuer Oberflaeche und Test — stuende er in
 * beiden, aenderte jemand eines Tages nur eine der zwei Stellen, und der Test
 * bewiese danach die alte Fassung.
 *
 * ECHTE UMLAUTE, weil der Satz auf einem Bildschirm landet; die ASCII-Umschrift
 * bleibt die Konvention der Kommentare.
 */
export const VERWAIST_TEXT = "Dieses Zeichen führt der Katalog nicht mehr.";

/** So kommt eine Zeile aus der Tabelle `merkliste` — mehr braucht die Anzeige nicht. */
export interface MerkZeile {
  zeichenId: string;
  titelSchnappschuss: string;
}

/** Die fertig aufgeloeste Zeile. Ausschliesslich serialisierbare Felder (Falle 9). */
export interface MerkAnzeige {
  zeichenId: ZeichenId;
  titel: string;
  bedeutung: string | null;
  svg: string | null;
  verwaist: boolean;
}

/**
 * DIE EINE AUFLOESUNGSSTELLE DER MERKLISTE.
 *
 * ⛔ DIE ANZEIGEQUELLE IST IMMER DAS GENERAT, DER SCHNAPPSCHUSS IST DER RUECKFALL
 * (Spec §4.2). Loest `findeZeichen(id)` auf, gewinnt der heutige Titel; sonst der
 * Schnappschuss. Umgekehrt herum — Schnappschuss zuerst — zeigte die Merkliste
 * dauerhaft den Stand vom Tag des Merkens, waehrend die Detailseite dasselbe
 * Zeichen anders benennt. Zwei Wahrheiten ueber eine Sache, und keine davon
 * erkennbar falsch.
 *
 * ⛔ HIER WIRD NICHTS GELOESCHT. Eine nicht aufloesbare Zeile bekommt
 * `verwaist: true` und behaelt ihren Schnappschuss. Es gibt keine dokumentierte
 * ID-Stabilitaetszusage des Pakets, und der Katalog kann eine ID auch
 * ZURUECKBRINGEN — ein automatisches Aufraeumen waere eine Vermutung ueber fremde
 * Absicht mit unumkehrbarer Folge (Spec §4.6 Stufe 3).
 *
 * KEINE CLIENT-DIREKTIVE (Falle 6): `(shell)/merkliste/page.tsx` ist eine Server
 * Component und liest sowohl diese Funktion als auch `VERWAIST_TEXT`. Aus einem
 * als Client markierten Modul kaeme dort eine Client-Referenz statt des Wertes
 * an — HTTP 500 fuer die ganze Seite, unsichtbar fuer `typecheck`, `build` und
 * Vitest. `merkliste.test.ts` bewacht den Dateianfang.
 */
export function merkAnzeige(zeilen: readonly MerkZeile[]): MerkAnzeige[] {
  return zeilen.map((zeile) => {
    const zeichen = findeZeichen(zeile.zeichenId);
    if (zeichen === null) {
      return {
        zeichenId: zeile.zeichenId,
        titel: zeile.titelSchnappschuss,
        bedeutung: null,
        svg: null,
        verwaist: true,
      };
    }
    return {
      zeichenId: zeichen.id,
      titel: zeichen.titel,
      bedeutung: zeichen.bedeutung,
      svg: zeichen.svg,
      verwaist: false,
    };
  });
}
