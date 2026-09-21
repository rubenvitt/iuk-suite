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
 * Acht Praefixe stehen in den Daten. Die Probe ist NICHT „gibt es ein
 * Praefix?", sondern: *steht auf dem Schirm schon, was passiert ist?*
 *
 * | Praefix            | Typ                | eigener Text? | warum |
 * | ------------------ | ------------------ | ------------- | ----- |
 * | `aussondern:`      | korrektur          | **ja**        | Kommentar ist FREITEXT — der Grund, den jemand eingetippt hat. Ohne eigenen Text ist die Entsorgung von einer Zaehlkorrektur nicht zu unterscheiden. |
 * | `inventur:`        | korrektur          | **ja**        | dieselbe Lage: `InventurSchema` verlangt einen Kommentar, aber einen FREIEN. Eine Inventurdifferenz sah aus wie eine Handkorrektur. |
 * | `check:`           | korrektur, umlagerung | nein       | der Kommentar ist im Quelltext FESTGENAGELT („Check Abgleich" / „Check Nachfuellung", `CHECK_ABGLEICH`/`CHECK_NACHFUELLUNG` in `konstanten.ts`) und steht damit bereits in der Spalte. Ein zweites Etikett ergaebe „Check · Check Abgleich". Die Freitextsuche findet die Zeilen ueber genau diesen Kommentar. |
 * | `entnahme-ziel:`   | umlagerung         | nein          | „Umlagerung" ist bereits wahr und vollstaendig: Bestand wandert vom Handlager an ein Fahrzeug. Das Praefix nennt das ZIEL, nicht eine andere Art von Vorgang — und das Ziel gehoert in eine Spalte, nicht in ein Etikett. |
 * | `umlagerung:`      | umlagerung         | nein          | DRK-338, das Handumlagern zwischen zwei Orten des Handlagers. Dieselbe Antwort und derselbe Grund wie eine Zeile hoeher: das Praefix nennt das ZIEL. Seit DRK-338 fuehrt das Journal dafuer eine Spalte „Ort" — die Quelle steht in der Zeile mit dem Minus, das Ziel in der mit dem Plus. |
 * | `entnahmebox:`     | umlagerung         | nein          | DRK-314, das Ablegen in der Kiste in der Halle. Dieselbe Antwort und derselbe Grund wie die zwei Zeilen darueber: „Umlagerung" ist bereits wahr und vollstaendig, und WOHIN steht in der Spalte „Ort" — dort liest sich die Zeile mit dem Plus als „Entnahmebox". Der Kommentar ist zusaetzlich im Quelltext festgenagelt (`ENTNAHMEBOX_KOMMENTAR`, `konstanten.ts`) und steht damit wie bei `check:` bereits in der Spalte daneben. |
 * | `einraeumen:`      | umlagerung         | nein          | DRK-381, der Weg ZURUECK: aus der Kiste in einen Schrank des Handlagers. Dieselbe Antwort und derselbe Grund wie die vier Zeilen darueber — „Umlagerung" ist bereits wahr und vollstaendig, und wohin steht in der Spalte „Ort". Auch hier ist der Kommentar festgenagelt (`ENTNAHMEBOX_EINRAEUMEN_KOMMENTAR`, `konstanten.ts`). |
 * | `ruecklauf:`       | umlagerung         | nein          | DRK-366, vom Fahrzeug oder aus der Tasche direkt in einen Schrank des Handlagers. Dieselbe Antwort wie bei `entnahme-ziel:`, nur in der Gegenrichtung: „Umlagerung" ist wahr, die beiden Orte stehen in der Spalte „Ort", und der Kommentar ist festgenagelt (`RUECKLAUF_KOMMENTAR`, `konstanten.ts`). Dass die Handlager-Summe dabei steigt, unterscheidet ihn vom Umraeumen, aber nicht von `entnahme-ziel:` — und das traegt auch kein eigenes Etikett. |
 *
 * ⚠️ `entnahmebox:` NENNT ALS ERSTES DIESER PRAEFIXE DIE QUELLE, NICHT DAS ZIEL,
 * und das ist kein Versehen: das Ziel ist hier eine KONSTANTE (es gibt genau
 * eine Box), ein `entnahmebox:entnahmebox` traege also null Bit. Informativ ist
 * die Einheit, aus der das Material kam — dieselbe Lesart wie bei
 * `aussondern:<lagerortId>`, das ebenfalls den ORT DES VORGANGS nennt. Die
 * tragende Eigenschaft bleibt in beiden Lesarten dieselbe: BEIDE Legs einer
 * Buchung teilen den Wert, und nur das macht sie im Journal als Paar lesbar.
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
 *
 * ⚠️ UND ZEILEN AUS DER ZEIT VOR DRK-309 TRAGEN „Fahrzeug-Check …", nicht
 * „Check …". Dieselbe Begruendung, dieselbe Folge: sie bleiben, wie sie sind.
 * Der Grund fuer die Umstellung steht bei `CHECK_ABGLEICH` in
 * `konstanten.ts` — kurz: die Art einer Einheit ist korrigierbar, das Journal
 * nicht, und ein gespeicherter Text darf nichts behaupten, was eine spaetere
 * Korrektur falsch macht. Die Freitextsuche ueberlebt den Schnitt ohne Zutun,
 * weil sie auf Teilzeichenketten arbeitet: „Check Abgleich" steckt auch im
 * alten „Fahrzeug-Check Abgleich".
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
 * DRK-314 — die Umlagerung aus einer Einheit in die Entnahmebox.
 *
 * ⚠️ SIE STEHT HIER, OBWOHL SIE KEINEN EIGENEN VORGANGSTEXT BEKOMMT (Tabelle
 * oben) — und genau deshalb: die Regel dieser Datei ist „die Praefixe haben
 * GENAU EINE Quelle", nicht „nur die mit Etikett stehen hier". Gebraucht wird
 * der Wert an ZWEI Stellen, und das reicht fuer die Regel: beim SCHREIBEN
 * (`_actions/entnahmebox.ts`) und beim LESEN der Herkunft eines Postens
 * (`_lib/lesepfade/entnahmebox.ts` loest daraus die Einheit auf, aus der das
 * Material kam). Zwei Literale liefen still auseinander: die Buchung entstuende
 * mit einem Praefix, das der Leser nicht kennt, und die Herkunftsspalte bliebe
 * dauerhaft leer, ohne dass ein Tor rot wird.
 *
 * ⚠️ NICHT IN `VORGANG_ARTEN`, und das ist die Kehrseite derselben Tabelle: ein
 * Eintrag dort erzeugt einen Filterwert und ein Etikett „Entnahmebox" neben dem
 * Wort „Umlagerung". Die Buchung IST eine Umlagerung; ein zweites Etikett
 * beschriebe denselben Vorgang zweimal.
 */
export const ENTNAHMEBOX_PRAEFIX = "entnahmebox:";

/**
 * DRK-381 — der Weg ZURUECK: aus der Entnahmebox in einen Schrank des
 * Handlagers.
 *
 * ⚠️ EIN EIGENES PRAEFIX UND NICHT `ENTNAHMEBOX_PRAEFIX`, obwohl beide Vorgaenge
 * dieselbe Kiste betreffen. Der Grund steht in `lesepfade/entnahmebox.ts`:
 * `letzteBoxZugaenge` liest „was ist zuletzt IN die Box gekommen?" ueber genau
 * dieses Praefix (`like("entnahmebox:%")`). Ein geteiltes Praefix machte die
 * beiden Richtungen dort ununterscheidbar — heute faengt der Mengenfilter
 * (`menge > 0`) das noch mit ab, aber nur zufaellig: die positive Zeile des
 * Einraeumens liegt am SCHRANK und faellt schon durch den Ortsfilter. Zwei
 * Filter, von denen einer die Bedeutung traegt und der andere sie versehentlich
 * mittraegt, sind genau die Sorte Zufall, die der naechste Umbau aufloest.
 *
 * ⚠️ ES NENNT DAS ZIEL, NICHT DIE QUELLE — umgekehrt zu `entnahmebox:` und aus
 * demselben Grund, aus dem das dort die Quelle nennt: die jeweils andere Seite
 * ist eine KONSTANTE. Beim Ablegen ist das Ziel immer die Box, beim Einraeumen
 * ist die Quelle immer die Box; ein `einraeumen:entnahmebox` traege null Bit.
 * Informativ ist der Schrank. Die tragende Eigenschaft bleibt in beiden
 * Lesarten dieselbe: BEIDE Legs teilen den Wert.
 *
 * ⚠️ NICHT IN `VORGANG_ARTEN`, dieselbe Kehrseite wie bei `entnahmebox:`: die
 * Buchung IST eine Umlagerung, ein zweites Etikett beschriebe denselben Vorgang
 * zweimal.
 */
export const EINRAEUMEN_PRAEFIX = "einraeumen:";

/**
 * DRK-366 — der direkte Weg vom Fahrzeug (oder aus der Tasche) in einen
 * Schrank des Handlagers, ohne den Umweg ueber die Entnahmebox.
 *
 * ⚠️ ES NENNT DIE QUELLE, NICHT DAS ZIEL — wie `entnahmebox:` und
 * `aussondern:`: der Vorgang gehoert zur Einheit, er wird auf ihrem Blatt
 * ausgeloest, und der Schrank steht ohnehin in der Ortsspalte der Plus-Zeile.
 * Die tragende Eigenschaft bleibt dieselbe: BEIDE Legs teilen den Wert.
 *
 * ⚠️ NICHT IN `VORGANG_ARTEN`, dieselbe Kehrseite wie bei den Praefixen
 * darueber: die Buchung IST eine Umlagerung (Tabelle oben).
 */
export const RUECKLAUF_PRAEFIX = "ruecklauf:";

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
