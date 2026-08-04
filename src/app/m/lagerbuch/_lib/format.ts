/**
 * Aufbereitung fuer die Anzeige — TEXT und TONNAMEN, nie JSX und nie Icons.
 *
 * KEIN "use client" (Falle 6) und KEIN `@ant-design/icons`-Import (Falle 7). Der
 * Icon-Fehler entsteht SCHON BEIM IMPORT und risse jede Datei mit, die von hier
 * liest; ein `"use client"` daraufgesetzt verwandelte Falle 7 in Falle 6 und
 * machte den Fehler STILL. Jede Ampel-DARSTELLUNG ist deshalb eine Client-Insel
 * oder ein Inline-SVG (Teil 4/5); die ENTSCHEIDUNG, welche Farbe gilt, faellt hier
 * serverseitig als reiner Wert.
 *
 * KEIN HEXWERT. `ampelTon` liefert Tonnamen; die Zuordnung Ton → Farbe liegt in
 * `_lib/ampel.ts` (Teil 5, §6.6.2 — und sie entscheidet AMPEL-Rot #8c0d16, nicht
 * Suite-Rot #c8000f). Ein hier festgenagelter Hexwert entschiede das versehentlich
 * mit (§12.1, Punkt 4).
 *
 * ⚠️ `fmtTs` und `tagesGrenzen` liegen in `_lib/zeit.ts` (§4.5) und werden hier
 * NICHT nachgebaut.
 */
import type { Ampel } from "./domain/verfall";
import type { DatumFaelligkeit, GeraetTyp } from "./domain/geraet";
import { tagesGrenzen } from "./zeit";
import { TAG_REGEX, istEchterKalendertag } from "./konstanten";

/** Die vier Toenungen. `"ok"` statt `"gruen"` ist die Namensfalle aus §5.17;
 *  `"grau"` ist KEIN Ampelwert und darf nie als gruen dargestellt werden. */
export type AmpelTon = "rot" | "gelb" | "ok" | "grau";

/** "2026-03" → "03/26" */
export function fmtVerfall(v: string): string {
  const [y, m] = v.split("-");
  return `${m}/${y.slice(2)}`;
}

/**
 * DER CHIP-TEXT IST VERTRAG, NICHT DEKORATION (§5.6.1). Vier Zustaende, und
 * `abgelaufen` schlaegt jede Ampel — eine abgelaufene Charge ist immer rot, eine
 * rote nicht immer abgelaufen.
 */
export function chargeText(
  status: { ampel: Ampel; abgelaufen: boolean },
  verfall: string,
): string {
  if (status.abgelaufen) return "abgelaufen";
  if (status.ampel === "rot") return `läuft ${fmtVerfall(verfall)} ab`;
  if (status.ampel === "gelb") return `fällig ${fmtVerfall(verfall)}`;
  return `bis ${fmtVerfall(verfall)}`;
}

/**
 * Ampel → Tonname.
 *
 * ⚠️ `"gruen"` wird auf `"ok"` abgebildet, und das ist keine Kosmetik: die
 * Alt-CSS-Klassen heissen `chip-rot`/`chip-gelb`/`chip-ok`, und ein direkt
 * interpoliertes `chip-${ampel}` ergaebe ein undefiniertes `chip-gruen` — mit
 * Padding und Radius, aber OHNE Farbe. Die Namensfalle geht mit; die Funktion
 * heisst aber `ampelTon` und nicht `chipTone`, weil sie im Zielmodul keine
 * CSS-Klasse mehr benennt.
 *
 * `null` → `"grau"`: der vierte Zustand fuer „kein Datum gepflegt" (§5.10) und
 * „keine Messung" (§5.12).
 */
export function ampelTon(a: Ampel | null): AmpelTon {
  if (a === null) return "grau";
  return a === "gruen" ? "ok" : a;
}

export type FaelligChip = { ton: AmpelTon; text: string };

/**
 * Faelligkeits-Chip fuer ein Geraet. In Liste und Detail identisch verwendet.
 *
 * ⚠️ BEI `objekt` OHNE Datum gibt es KEINEN Chip (`format.ts:61`) — das
 * Ablaufdatum ist dort optional, und ein grauer Chip an jedem Spineboard waere
 * Grundrauschen. Bei `medizin` gibt es IMMER einen, auch ohne Datum.
 *
 * „heute faellig" ist ein EIGENER Text, weil „in 0 T" sich falsch liest.
 */
export function geraetFaelligChip(typ: GeraetTyp, f: DatumFaelligkeit): FaelligChip | null {
  const tage = Math.abs(f.tageBisFaellig ?? 0);
  if (typ === "medizin") {
    if (f.keinDatum) return { ton: "grau", text: "kein MTK-Datum" };
    if (f.ueberfaellig) return { ton: "rot", text: `MTK überfällig (${tage} T)` };
    if (f.tageBisFaellig === 0) return { ton: "gelb", text: "MTK heute fällig" };
    return { ton: ampelTon(f.ampel), text: `MTK in ${f.tageBisFaellig} T` };
  }
  if (f.keinDatum) return null;
  if (f.ueberfaellig) return { ton: "rot", text: `abgelaufen (${tage} T)` };
  if (f.tageBisFaellig === 0) return { ton: "gelb", text: "läuft heute ab" };
  return { ton: ampelTon(f.ampel), text: `läuft in ${f.tageBisFaellig} T ab` };
}

const TYP_LABEL: Record<string, string> = {
  zugang: "Wareneingang",
  entnahme: "Entnahme",
  korrektur: "Korrektur",
  umlagerung: "Umlagerung",
};

/** Deutsche Beschriftung eines Buchungstyps. Unbekanntes faellt auf den Rohwert
 *  zurueck — ein historischer Wert soll lesbar bleiben, nicht verschwinden. */
export function typLabel(typ: string): string {
  return TYP_LABEL[typ] ?? typ;
}

/**
 * Ein geprueftes Zeitfenster aus zwei rohen `searchParams`-Werten.
 *
 * ⚠️ WARUM ES DIESE FUNKTION GIBT (§5.14.2). Heute gehen `von`/`bis` UNGEPRUEFT
 * durch: `parseDatumGrenze` liefert bei Unsinn `undefined`, die Abfrage ignoriert
 * die Grenze — aber die ROHE Zeichenkette wandert als Prop zurueck in den Client
 * und dort in `value=` eines Datumsfelds. Das Fehlverhalten ist das gefaehrliche,
 * nicht das laute: ein gespeicherter Link mit defektem `von` liefert die Seite
 * OHNE Fehlermeldung und UNGEFILTERT. Die Adresszeile zeigt einen Zeitraum, das
 * Datumsfeld steht leer, und die Liste zeigt die neuesten 100 Buchungen aus der
 * GANZEN Historie. Wer den Link fuer einen gespeicherten Zeitraumbericht haelt,
 * liest die falsche Menge.
 *
 * Die HINWEISE erscheinen als Text AN DER FILTERLEISTE, nicht als Fehlerseite
 * (Auflage an Teil 5). Die roh zurueckgereichte Zeichenkette wird durch den
 * normalisierten Wert ersetzt, damit Adresszeile und Eingabefeld dasselbe sagen.
 *
 * Die Zonenrechnung selbst kommt aus `_lib/zeit.ts#tagesGrenzen` — inklusiv, also
 * Tagesanfang fuer `von` und Tagesende fuer `bis`.
 */
export type Zeitraum = { von?: Date; bis?: Date; hinweise: string[] };

const HINWEIS_UNGUELTIG = "Das Datum in der Adresse ist ungültig und wurde ignoriert.";
const HINWEIS_LEER = "Der Zeitraum ist leer: „von“ liegt nach „bis“.";

function grenze(roh: string | undefined, ende: boolean): Date | undefined {
  const s = roh?.trim();
  if (!s) return undefined;
  // Dieselbe Strenge wie bei Geraetedaten: Format UND echter Kalendertag.
  // "2026-02-31" waere sonst der 3. Maerz und der Filter zeigte still zu viel.
  if (!TAG_REGEX.test(s) || !istEchterKalendertag(s)) return undefined;
  const g = tagesGrenzen(s);
  return ende ? g.bis : g.von;
}

export function zeitraumAus(vonRoh?: string, bisRoh?: string): Zeitraum {
  const hinweise: string[] = [];
  const von = grenze(vonRoh, false);
  const bis = grenze(bisRoh, true);
  // Ein Hinweis JE defekter Grenze — zwei defekte Werte sind zwei Meldungen.
  if (vonRoh?.trim() && von === undefined) hinweise.push(HINWEIS_UNGUELTIG);
  if (bisRoh?.trim() && bis === undefined) hinweise.push(HINWEIS_UNGUELTIG);
  // BEIDE Grenzen bleiben stehen, damit Adresszeile und Eingabefeld dasselbe
  // sagen — der Nutzer soll sehen, WAS er gesetzt hat.
  if (von && bis && von.getTime() > bis.getTime()) hinweise.push(HINWEIS_LEER);
  return { von, bis, hinweise };
}
