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
import { verfallStatus, verfallSchwellen, type Ampel } from "../domain/verfall";
import type { Einheitenart } from "../konstanten";
import { chargeText } from "../format";
import { eindeutigeLabels, zaehlOrtLabel } from "../inventurOrt";
import { restJeChargeJeOrtImBereich, type Leser } from "./bestand";
import { handlagerOrte, ortStamm } from "./orte";

/**
 * DRK-339 — EIN LIEGEPLATZ DER CHARGE IM HANDLAGER, fertig beschriftet.
 *
 * ⚠️ `name` IST DIE BESCHRIFTUNG, NICHT DER STAMMNAME. Die Wurzel heisst in
 * den Stammdaten „Handlager" — auf dieser Karte, die „Chargen im Handlager"
 * ueberschrieben ist, saegte ein Chip „Handlager: 5" neben „Schrank 1: 3"
 * genau die Frage ab, die er beantworten soll: er klaenge nach dem ganzen
 * Bereich statt nach „in keinem Schrank". DRK-337 hat fuer diesen Ort bereits
 * ein Wort entschieden, und es ist dasselbe Wort wie in der Zaehlauswahl —
 * `zaehlOrtLabel`, nicht eine zweite Schreibweise daneben.
 *
 * ⚠️ UND SIE IST EINDEUTIG, weil an ihr eine BUCHUNG haengt (Codex-Befund zu
 * PR #173). Zwei Schraenke duerfen heute gleich heissen, und ein Schrank
 * namens „Nicht zugeordnet" kollidiert mit der Wurzel — in der Ortswahl
 * stuenden dann zwei optisch identische Zeilen „nur Nicht zugeordnet (4
 * Stk.)", und wer danebengreift, bucht den falschen Ort leer. Dieselbe
 * Verwechslung und dieselbe Abhilfe wie in der Zaehlauswahl: `eindeutigeLabels`
 * haengt die Kennung an, aber nur dort, wo ein Name doppelt vorkommt.
 */
export type VerfallOrt = {
  id: string; name: string; menge: number; zugangshinweis: string | null;
};

export type VerfallEintrag = {
  chargeId: string; chargenNr: string; verfall: string; rest: number;
  ampel: Ampel; abgelaufen: boolean; text: string;
  artikelId: string; artikelName: string; einheit: string; fach: string;
  /**
   * DRK-339 — WO im Handlager die Charge liegt, in der fachlichen Reihenfolge
   * von `handlagerOrte` (Wurzel zuerst, dann `sortierung`). Nie leer: ein
   * Eintrag ohne positiven Liegeplatz steht gar nicht in der Liste.
   */
  orte: VerfallOrt[];
};

/**
 * Chargen mit HANDLAGER-Rest > 0, deren Ampel nicht gruen ist.
 * DREI Raenge: abgelaufen (0), rot (1), gelb (2); Zweitkriterium `verfall`.
 *
 * ⚠️ Benutzt `restJeChargeJeOrtImBereich(db, handlagerOrte(db))` aus DRK-339 — KEINE
 * eigene Summierung. Eine zweite Aufsummierung derselben Zahl liefe auseinander
 * und beide Wege saehen fuer sich plausibel aus.
 *
 * ⚠️ `rest` IST DIE SUMME DER LIEGEPLAETZE, nicht eine zweite Abfrage daneben
 * (DRK-339). Der Knopf in der Zeile bucht Ort fuer Ort und laesst einen Ort
 * mit Saldo <= 0 aus; stuende ueber ihm eine Zahl aus einer Abfrage, die
 * anders zaehlt, wiche die Ankuendigung von der Wirkung ab — still, und nur in
 * genau dem Datenzustand, den niemand herstellt, um ihn anzusehen.
 */
export function verfallListe(db: Leser, now: Date = new Date()): VerfallEintrag[] {
  const schwellen = verfallSchwellen();
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const bereich = handlagerOrte(db);
  const rest = restJeChargeJeOrtImBereich(db, bereich);
  const stamm = ortStamm(db);
  /**
   * ⚠️ EINMAL UEBER DEN GANZEN BEREICH, nicht je Charge ueber ihre Orte. Die
   * Mehrdeutigkeit ist eine Eigenschaft der ORTSMENGE; berechnete man sie je
   * Zeile neu, truege derselbe Schrank mal seine Kennung und mal nicht — je
   * nachdem, wo sonst noch etwas liegt. Dass eine Kennung auch dann erscheint,
   * wenn der kollidierende Schrank von DIESER Charge nichts traegt, ist der
   * Preis dafuer und die sichere Richtung.
   */
  const beschriftung = new Map(
    eindeutigeLabels(
      // `schluessel` ist hier die rohe Kennung und NICHT der Auswahlwert der
      // Inventur (DRK-371): diese Beschriftungen stehen neben dem Verlauf, der
      // ebenfalls die rohe Kennung zeigt. Ein `ort:`-Praefix waere hier eine
      // zweite Schreibweise derselben Sache.
      bereich.map((id) => ({ id, schluessel: id, label: zaehlOrtLabel(id, stamm.get(id)?.name) })),
    ).map((o) => [o.id, o.label]),
  );
  const eintraege: VerfallEintrag[] = [];
  for (const c of db.select().from(chargen).all()) {
    const jeOrt = rest.get(c.id);
    // aufgebraucht, nur im Fahrzeug — oder nirgends mit positivem Saldo
    if (!jeOrt || jeOrt.size === 0) continue;
    const s = verfallStatus(c.verfall, schwellen, now);
    if (s.ampel === "gruen") continue;          // schliesst die Pseudo-Charge mit ein
    const a = arts.get(c.artikelId);
    if (!a) continue;
    // `bereich` ist bereits die fachliche Reihenfolge (`domain/orte.ts`) —
    // diese Schleife uebernimmt sie, statt eine zweite zu erfinden.
    const orte: VerfallOrt[] = [];
    for (const ortId of bereich) {
      const menge = jeOrt.get(ortId);
      if (menge === undefined) continue;
      const o = stamm.get(ortId);
      orte.push({
        id: ortId,
        name: beschriftung.get(ortId) ?? ortId,
        menge,
        zugangshinweis: o?.zugangshinweis ?? null,
      });
    }
    eintraege.push({
      chargeId: c.id, chargenNr: c.chargenNr, verfall: c.verfall,
      rest: orte.reduce((summe, o) => summe + o.menge, 0),
      ampel: s.ampel, abgelaufen: s.abgelaufen, text: chargeText(s, c.verfall),
      artikelId: a.id, artikelName: a.name, einheit: a.einheit, fach: a.fach,
      orte,
    });
  }
  const rang = (e: VerfallEintrag) => (e.abgelaufen ? 0 : e.ampel === "rot" ? 1 : 2);
  return eintraege.sort((x, y) => rang(x) - rang(y) || x.verfall.localeCompare(y.verfall));
}

export type LagerortVerfallZeile = {
  lagerortId: string; lagerortName: string; lagerortKennung: string | null;
  /**
   * DRK-309 — Fahrzeug oder Tasche, `null` heisst „noch nicht zugeordnet".
   *
   * ⚠️ EINE TASCHE TRAEGT KEINE KENNUNG, und `lagerortKennung` ist in dieser
   * Liste die einzige Angabe neben dem Namen. Ohne die Art stand fuer sie in
   * der Verfallsuebersicht also nur ein Name — zwischen zwei aehnlich
   * benannten Einheiten nicht zu unterscheiden, und ueber „tasche" nicht zu
   * finden.
   */
  lagerortEinheitenart: Einheitenart | null;
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
      lagerortEinheitenart: ort.einheitenart,
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
