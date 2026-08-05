/**
 * ZWEI GETRENNTE VERFALLSQUELLEN, und sie bleiben getrennt (§5.6.2).
 *
 * CHARGEN-VERFALL (`verfallListe`) rechnet den Rest je Charge NUR IM HANDLAGER.
 * Die Begruendung steht im Alt-Quelltext (`queries.ts:192-194`): eine komplett
 * aufs Fahrzeug umgelagerte abgelaufene Charge erschiene sonst hier, und der
 * Aussondern-Knopf — der ausschliesslich den Handlager-Rest bucht — wuerde
 * REPRODUZIERBAR FEHLSCHLAGEN. Dieselbe Bindung gilt fuer die KPIs (T44).
 *
 * LAGERORT-VERFALL (`lagerortVerfallListe`, `verfallFuerLagerort`) traegt je
 * (Lagerort, Artikel) genau EINEN Wert: DAS FRUEHESTE DATUM, DAS IM FAHRZEUG AUF
 * EINER PACKUNG STEHT — nicht die Charge. Er ist die Kompensation dafuer, dass
 * `korrekturAufLagerort` die Charge RAET (§5.3.3, §4.11). Wer das Verfall-Feld im
 * Zaehlschritt als redundant streicht („die Charge hat doch einen Verfall"),
 * zerstoert diese Kompensation lautlos.
 *
 * BEIDE nehmen `Leser`, nicht `DB` (Festlegung H11): sie rufen `quelleAufloeser`
 * nicht und laufen ausschliesslich ueber `select()` — `checkAbschluss` (Teil 4)
 * ruft `verfallFuerLagerort` NACH dem Schreiben in derselben Transaktion (§5.6.3).
 *
 * Kein "use client", kein Icon-Import.
 */
import { eq } from "drizzle-orm";
import { artikel, chargen, lagerorte, lagerortVerfall } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { verfallStatus, verfallSchwellen, type Ampel } from "../domain/verfall";
import { chargeText } from "../format";
import { restJeCharge, type Leser } from "./bestand";

export type VerfallEintrag = {
  chargeId: string; chargenNr: string; verfall: string; rest: number;
  ampel: Ampel; abgelaufen: boolean; text: string;
  artikelId: string; artikelName: string; einheit: string; fach: string;
};

/**
 * Chargen mit HANDLAGER-Rest > 0, deren Ampel nicht gruen ist.
 * DREI Raenge: abgelaufen (0), rot (1), gelb (2); Zweitkriterium `verfall`.
 *
 * ⚠️ Benutzt `restJeCharge(db, HANDLAGER_ID)` aus T44 — KEINE eigene Summierung.
 * Eine zweite Aufsummierung derselben Zahl liefe auseinander und beide Wege
 * saehen fuer sich plausibel aus.
 */
export function verfallListe(db: Leser, now: Date = new Date()): VerfallEintrag[] {
  const schwellen = verfallSchwellen();
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const rest = restJeCharge(db, HANDLAGER_ID);
  const eintraege: VerfallEintrag[] = [];
  for (const c of db.select().from(chargen).all()) {
    const r = rest.get(c.id) ?? 0;
    if (r <= 0) continue;                       // aufgebraucht oder nur im Fahrzeug
    const s = verfallStatus(c.verfall, schwellen, now);
    if (s.ampel === "gruen") continue;          // schliesst die Pseudo-Charge mit ein
    const a = arts.get(c.artikelId);
    if (!a) continue;
    eintraege.push({
      chargeId: c.id, chargenNr: c.chargenNr, verfall: c.verfall, rest: r,
      ampel: s.ampel, abgelaufen: s.abgelaufen, text: chargeText(s, c.verfall),
      artikelId: a.id, artikelName: a.name, einheit: a.einheit, fach: a.fach,
    });
  }
  const rang = (e: VerfallEintrag) => (e.abgelaufen ? 0 : e.ampel === "rot" ? 1 : 2);
  return eintraege.sort((x, y) => rang(x) - rang(y) || x.verfall.localeCompare(y.verfall));
}

export type LagerortVerfallZeile = {
  lagerortId: string; lagerortName: string; lagerortKennung: string | null;
  artikelId: string; artikelName: string; einheit: string;
  verfall: string; erfasstAt: Date; ampel: Ampel; abgelaufen: boolean; text: string;
};

/**
 * Die im Fahrzeug gemeldeten Verfaelle.
 *
 * ⚠️ VIER Raenge (inkl. gruen) und ein DRITTES Kriterium `lagerortName` — anders
 * als `verfallListe`, und das ist Absicht: dieselbe Ampel taucht hier ueber
 * mehrere Fahrzeuge verteilt auf.
 */
export function lagerortVerfallListe(
  db: Leser,
  opts: { nurWarnend?: boolean; lagerortId?: string } = {},
  now: Date = new Date(),
): LagerortVerfallZeile[] {
  const schwellen = verfallSchwellen();
  const orte = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l]));
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const rows = opts.lagerortId
    ? db.select().from(lagerortVerfall)
        .where(eq(lagerortVerfall.lagerortId, opts.lagerortId)).all()
    : db.select().from(lagerortVerfall).all();

  const zeilen: LagerortVerfallZeile[] = [];
  for (const r of rows) {
    const s = verfallStatus(r.verfall, schwellen, now);
    if (opts.nurWarnend && s.ampel === "gruen") continue;
    const ort = orte.get(r.lagerortId);
    const a = arts.get(r.artikelId);
    if (!ort || !a) continue;
    zeilen.push({
      lagerortId: ort.id, lagerortName: ort.name, lagerortKennung: ort.kennung,
      artikelId: a.id, artikelName: a.name, einheit: a.einheit,
      verfall: r.verfall, erfasstAt: r.erfasstAt,
      ampel: s.ampel, abgelaufen: s.abgelaufen, text: chargeText(s, r.verfall),
    });
  }
  const rang = (z: LagerortVerfallZeile) =>
    z.abgelaufen ? 0 : z.ampel === "rot" ? 1 : z.ampel === "gelb" ? 2 : 3;
  return zeilen.sort(
    (x, y) =>
      rang(x) - rang(y) ||
      x.verfall.localeCompare(y.verfall) ||
      x.lagerortName.localeCompare(y.lagerortName),
  );
}

export type VerfallAmLagerort = {
  artikelId: string; verfall: string; erfasstAt: Date;
  ampel: Ampel; abgelaufen: boolean; text: string;
};

/**
 * Die gemeldeten Verfaelle EINES Lagerorts, je Artikel HOECHSTENS einer
 * (Unique-Index `idx_lagerort_verfall_ort_artikel`). Leer = nichts gepflegt.
 *
 * ⚠️ Diese Funktion liegt hier und nicht bei den Schreibpfaden, obwohl die
 * Alt-Anwendung sie in `db/lagerort-verfall.ts` fuehrt (Festlegung H4): sie LIEST.
 * `_lib/schreibpfade/lagerortVerfall.ts` behaelt `setzeVerfall`,
 * `loescheVerfallEintrag` und `loescheVerfallFuer`.
 */
export function verfallFuerLagerort(
  db: Leser, lagerortId: string, now: Date = new Date(),
): Map<string, VerfallAmLagerort> {
  const schwellen = verfallSchwellen();
  const rows = db.select().from(lagerortVerfall)
    .where(eq(lagerortVerfall.lagerortId, lagerortId)).all();
  return new Map(rows.map((r) => {
    const s = verfallStatus(r.verfall, schwellen, now);
    return [r.artikelId, {
      artikelId: r.artikelId, verfall: r.verfall, erfasstAt: r.erfasstAt,
      ampel: s.ampel, abgelaufen: s.abgelaufen, text: chargeText(s, r.verfall),
    }];
  }));
}
