/**
 * DIE VORGANGSART — der Buchungstyp, verfeinert um das Referenz-Praefix
 * (DRK-344).
 *
 * KEIN "use client" und KEIN `@ant-design/icons`-Import. Diese Datei wird von
 * DREI Ebenen gelesen: dem Lesepfad (Server), der Journalseite (Server
 * Component) und der Filterinsel (Client). Ein `"use client"` hier liesse die
 * Server Component eine Client-REFERENZ statt des Wertes bekommen — HTTP 500
 * fuer die ganze Seite, das `build` nicht sieht und Vitest strukturell nicht
 * sehen KANN (Falle 6, `CLAUDE.md`).
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 *
 * `buchungen.typ` kennt vier Werte, und zwei davon sind fachlich MEHRDEUTIG:
 * unter `korrektur` liegen die Aussonderung abgelaufenen Materials, die
 * Inventurdifferenz, der Fahrzeug-Check-Abgleich und die freihaendige
 * Korrektur. Unterschieden hat sie bisher nur das Feld `referenz` — und das
 * las auf dem Schirm niemand: die Journaltabelle baute ihren Vorgangstext aus
 * Typ und Kommentar. In der Spalte „Vorgang" stand „Korrektur", und WAS
 * passiert ist, stand allenfalls im freien Kommentar daneben.
 *
 * Das trifft ausgerechnet den Vorgang, den man im Nachhinein belegen koennen
 * muss: die Entsorgung abgelaufenen Sanitaetsmaterials.
 *
 * ⚠️ KEIN NEUER WERT IM TYP-ENUM, und das ist eine Festlegung, keine
 * Bequemlichkeit (DRK-344, Abgrenzung). Die historischen Zeilen tragen die
 * Unterscheidung BEREITS in der Referenz; ein fuenfter Enum-Wert zwaenge jeden
 * Leser, der auf `typ` verzweigt, zur Anpassung — und liesse die Altzeilen
 * trotzdem falsch stehen. Die Verfeinerung ist deshalb ABGELEITET, nicht
 * gespeichert.
 *
 * ── WELCHES PRAEFIX EINEN EIGENEN VORGANGSTEXT BEKOMMT ────────────────────
 *
 * Fuenf Praefixe stehen in den Daten. Die Probe ist NICHT „gibt es ein
 * Praefix?", sondern: *steht auf dem Schirm schon, was passiert ist?*
 *
 * | Praefix            | Typ                | eigener Text? | warum |
 * | ------------------ | ------------------ | ------------- | ----- |
 * | `aussondern:`      | korrektur          | **ja**        | Kommentar ist FREITEXT — der Grund, den jemand eingetippt hat. Ohne eigenen Text ist die Entsorgung von einer Zaehlkorrektur nicht zu unterscheiden. |
 * | `inventur:`        | korrektur          | **ja**        | dieselbe Lage: `InventurSchema` verlangt einen Kommentar, aber einen FREIEN. Eine Inventurdifferenz sah aus wie eine Handkorrektur. |
 * | `check:`           | korrektur, umlagerung | nein       | der Kommentar ist im Quelltext FESTGENAGELT („Fahrzeug-Check Abgleich" / „Fahrzeug-Check Nachfuellung") und steht damit bereits in der Spalte. Ein zweites Etikett ergaebe „Fahrzeug-Check · Fahrzeug-Check Abgleich". Die Freitextsuche findet die Zeilen ueber genau diesen Kommentar. |
 * | `entnahme-ziel:`   | umlagerung         | nein          | „Umlagerung" ist bereits wahr und vollstaendig: Bestand wandert vom Handlager an ein Fahrzeug. Das Praefix nennt das ZIEL, nicht eine andere Art von Vorgang — und das Ziel gehoert in eine Spalte, nicht in ein Etikett. |
 * | `umlagerung:`      | umlagerung         | nein          | DRK-338, das Handumlagern zwischen zwei Orten des Handlagers. Dieselbe Antwort und derselbe Grund wie eine Zeile hoeher: das Praefix nennt das ZIEL. Seit DRK-338 fuehrt das Journal dafuer eine Spalte „Ort" — die Quelle steht in der Zeile mit dem Minus, das Ziel in der mit dem Plus. |
 *
 * Wer hier ein Praefix ERGAENZT, beantwortet dieselbe Frage neu — und traegt
 * es in `VORGANG_ARTEN` ein, sonst faellt es still unter seinen Buchungstyp.
 *
 * ── WAS DIE ABLEITUNG NICHT KANN ──────────────────────────────────────────
 *
 * ⚠️ ZEILEN OHNE PRAEFIX BLEIBEN „KORREKTUR". Ausgesondert wurde vor DRK-344
 * mit `referenz: null`; diese Buchungen sind nicht nachtraeglich
 * unterscheidbar. Das Journal ist append-only — sie zu kennzeichnen hiesse,
 * es umzuschreiben.
 */

/** Die vier Werte des Spalten-Enums `buchungen.typ`. */
export const BUCHUNG_TYPEN = ["zugang", "entnahme", "korrektur", "umlagerung"] as const;

export type BuchungTyp = (typeof BUCHUNG_TYPEN)[number];

/**
 * Die Praefixe, die einen eigenen Vorgangstext tragen — und zugleich die
 * EINZIGE Quelle fuer die Zeichenketten.
 *
 * ⚠️ SIE WERDEN AN DREI STELLEN GEBRAUCHT: beim SCHREIBEN (die Aktionen),
 * beim ABLEITEN (hier) und in der SQL-Bedingung des Lesepfads. Drei Literale
 * liefen still auseinander — ein Tippfehler in der SQL-Haelfte ergaebe eine
 * leere Trefferliste, kein rotes Tor.
 */
export const AUSSONDERN_PRAEFIX = "aussondern:";
export const INVENTUR_PRAEFIX = "inventur:";

/**
 * Die Reihenfolge ist die Reihenfolge im Auswahlfeld: erst die vier
 * Buchungstypen in der Ordnung, die sie dort immer hatten, dann die
 * verfeinerten Arten.
 */
export const VORGANG_ARTEN = [
  ...BUCHUNG_TYPEN,
  "aussondern",
  "inventur",
] as const;

export type Vorgangsart = (typeof VORGANG_ARTEN)[number];

const VORGANG_LABEL: Record<Vorgangsart, string> = {
  zugang: "Wareneingang",
  entnahme: "Entnahme",
  korrektur: "Korrektur",
  umlagerung: "Umlagerung",
  aussondern: "Aussonderung",
  inventur: "Inventur",
};

/**
 * Deutsche Beschriftung einer Vorgangsart.
 *
 * Unbekanntes faellt auf den Rohwert zurueck — ein historischer Wert soll
 * lesbar bleiben, nicht verschwinden.
 */
export function vorgangLabel(art: string): string {
  return VORGANG_LABEL[art as Vorgangsart] ?? art;
}

/**
 * Die Vorgangsart einer Buchung: das Praefix schlaegt den Typ.
 *
 * Gibt eine `Vorgangsart` zurueck — oder den ROHEN Typwert, wenn die Zeile
 * einen Typ traegt, den dieser Stand nicht kennt. Der Rueckgabetyp ist deshalb
 * `string`: ein `Vorgangsart` waere eine Luege ueber Altzeilen.
 */
export function vorgangAus(b: { typ: string; referenz: string | null }): string {
  const referenz = b.referenz ?? "";
  if (referenz.startsWith(AUSSONDERN_PRAEFIX)) return "aussondern";
  if (referenz.startsWith(INVENTUR_PRAEFIX)) return "inventur";
  return b.typ;
}

/** Die Vorgangsart, fertig beschriftet. */
export function vorgangText(b: { typ: string; referenz: string | null }): string {
  return vorgangLabel(vorgangAus(b));
}

/** Traegt diese Art ihre Bedeutung im PRAEFIX statt im Typ? */
export function istPraefixArt(art: string): art is "aussondern" | "inventur" {
  return art === "aussondern" || art === "inventur";
}

/** Das Praefix einer verfeinerten Art. */
export function praefixVon(art: "aussondern" | "inventur"): string {
  return art === "aussondern" ? AUSSONDERN_PRAEFIX : INVENTUR_PRAEFIX;
}
