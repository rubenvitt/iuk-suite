/**
 * Geraetefaelligkeit aus einem TAGESgenauen Datum ("YYYY-MM-DD").
 * Kein "use client", kein Datenbankzugriff.
 */
import type { Ampel } from "./verfall";
import { startDesTages, ausZivilzeit } from "../zeit";
import { TAG_REGEX, istEchterKalendertag } from "../konstanten";

/**
 * Warnfenster (Tage vor Faelligkeit → gelb). KONSTANTEN, keine Env (§10.3): sie
 * waren es nie, und sie jetzt konfigurierbar zu machen waere eine Neuerung, die
 * niemand beauftragt hat. Die Einheit steht im Namen.
 */
export const MTK_WARN_TAGE = 30;
export const OBJEKT_ABLAUF_WARN_TAGE = 30;

export type GeraetTyp = "medizin" | "objekt";

export type DatumFaelligkeit = {
  /** Geparste Faelligkeit auf Mitternacht in ZEITZONE; null bei kein/ungueltigem Datum. */
  faelligAm: Date | null;
  /** Kalendertage bis zur Faelligkeit: heute = 0, gestern = −1. */
  tageBisFaellig: number | null;
  /** ⚠️ Nur aussagekraeftig, wenn `keinDatum === false`. */
  ampel: Ampel;
  ueberfaellig: boolean;
  /** kein oder UNGUELTIGES Datum gepflegt */
  keinDatum: boolean;
};

/**
 * Parst "YYYY-MM-DD" auf Mitternacht in ZEITZONE. Leer, falsches Format oder ein
 * UEBERROLLENDER Kalendertag ("2026-02-31") ergeben null.
 *
 * ⚠️ Die Ueberroll-Pruefung ist der Punkt: `new Date(2026, 1, 31)` waere der
 * 3. Maerz, und ein Tippfehler im MTK-Datum machte das Geraet still zwei Tage
 * spaeter faellig als gedacht. `istEchterKalendertag` liegt seit Teil 1 in
 * `_lib/konstanten.ts` — diese Datei baut die Pruefung NICHT neu.
 */
function parseTag(datum: string | null): Date | null {
  if (!datum) return null;
  if (!TAG_REGEX.test(datum)) return null;
  if (!istEchterKalendertag(datum)) return null;
  const [y, m, d] = datum.split("-").map(Number);
  return ausZivilzeit(y, m, d);
}

/**
 * Faelligkeit aus einem Tagesdatum: rot ab ueberfaellig, gelb im Warnfenster
 * (INKLUSIVE heute), sonst gruen.
 *
 * ⚠️ Kein/ungueltiges Datum → `keinDatum: true`, Ampel GRUEN und
 * `ueberfaellig: false` — die Kombination, die eine Anzeige leicht falsch liest.
 * Die Oberflaeche zeigt das GRAU (§5.10), damit ein frisch angelegtes Geraet ohne
 * gepflegtes Datum keinen Fehlalarm ausloest. Der Ton kommt aus
 * `_lib/format.ts#geraetFaelligChip`, nicht von hier — diese Datei liefert keine
 * Farbe und kein Icon.
 *
 * ⚠️ DER TAGESANFANG KOMMT AUS `_lib/zeit.ts#startDesTages`, nicht aus
 * `new Date(now.getFullYear(), now.getMonth(), now.getDate())` (`geraet.ts:37`):
 * lokale Komponenten haengen an der Prozess-TZ, und das Modul haengt bewusst nicht
 * daran (Entscheidung 26 b, §5.16).
 */
export function datumFaelligkeit(
  datum: string | null,
  now: Date,
  warnTage: number,
): DatumFaelligkeit {
  const faelligAm = parseTag(datum);
  if (faelligAm === null) {
    return {
      faelligAm: null, tageBisFaellig: null, ampel: "gruen",
      ueberfaellig: false, keinDatum: true,
    };
  }
  const startHeute = startDesTages(now);
  // Math.round, nicht floor: ein Zeitumstellungstag hat 23 bzw. 25 Stunden, und
  // eine reine Division ergaebe dort 0,958 statt 1.
  const tageBisFaellig = Math.round((faelligAm.getTime() - startHeute.getTime()) / 86_400_000);
  const ueberfaellig = tageBisFaellig < 0;
  let ampel: Ampel;
  if (ueberfaellig) ampel = "rot";
  else if (tageBisFaellig <= warnTage) ampel = "gelb";
  else ampel = "gruen";
  return { faelligAm, tageBisFaellig, ampel, ueberfaellig, keinDatum: false };
}

export const mtkFaelligkeit = (datum: string | null, now: Date): DatumFaelligkeit =>
  datumFaelligkeit(datum, now, MTK_WARN_TAGE);

export const objektAblauf = (datum: string | null, now: Date): DatumFaelligkeit =>
  datumFaelligkeit(datum, now, OBJEKT_ABLAUF_WARN_TAGE);

/**
 * Waehlt die fuer den Geraetetyp relevante Faelligkeit: medizin → MTK,
 * objekt → Ablaufdatum. Das FREMDE Feld wird nie gelesen, auch wenn ein
 * Altdatensatz beides traegt.
 */
export function geraetFaelligkeit(
  g: { typ: GeraetTyp; mtkFaellig: string | null; ablaufdatum: string | null },
  now: Date,
): DatumFaelligkeit {
  return g.typ === "medizin" ? mtkFaelligkeit(g.mtkFaellig, now) : objektAblauf(g.ablaufdatum, now);
}
