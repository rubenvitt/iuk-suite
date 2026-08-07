/**
 * Sauerstoffflaschen. Kein "use client", kein Icon-Import.
 *
 * ZWEI REGELN GEHEN 1:1 MIT (§5.12):
 *
 * 1. DER AKTUELLE DRUCK IST IMMER DIE JUENGSTE MESSUNG. Es gibt KEIN
 *    denormalisiertes Feld — damit ist eine falsche Messung DURCH EINE NEUE
 *    korrigierbar, ohne die alte anzufassen. Das ist zugleich der Grund, warum
 *    `o2_messungen` KEINE Append-only-Trigger bekommt (§4.4, Entscheidung 5 c).
 * 2. KEINE MESSUNG → `status: null`, NICHT `0 %`. Die Oberflaeche zeigt „keine
 *    Messung", nicht eine leere rote Ampel. Ein `o2Status(0, nenn)` ergaebe 0 % /
 *    rot und behauptete eine Aussage, die niemand gemacht hat.
 *
 * EINE ERGAENZUNG: `ausCheck` (§5.8.1, verbindliche Auflage). Eine Messung aus dem
 * Fahrzeug-Check traegt `quelleTyp = "token"`, eine manuell erfasste `"oidc"`.
 * DIE ANGABE IST HEUTE SCHON DA; sie wird nur nirgends gezeigt. Damit ist der
 * Falle-8-Befund („durchgeklickt sieht aus wie geprueft") nicht beseitigt, aber
 * LESBAR — und das ist die ehrliche Stufe, solange Variante (c) Backlog ist.
 *
 * ⚠️ `ausCheck` haengt am `quelleTyp`, NICHT am Kommentartext: ein
 * `startsWith("Fahrzeug-Check")` braeche, sobald jemand die Meldung umformuliert.
 *
 * ⚠️ `DB` NIMMT NUR, WER `quelleAufloeser` RUFT (Festlegung H11) — hier ist das
 * GENAU EINE Funktion: `o2FlascheDetail`. Wer sie in eine Transaktion ziehen
 * will, muss `quelleAufloeser` in Teil 1 anfassen; das ist eine Entscheidung,
 * kein Cast.
 *
 * ⚠️ DIE UEBRIGEN DREI NEHMEN `Leser`. `o2FlaschenFuerLagerort` ist der Grund:
 * sie beliefert zusammen mit `geraeteFuerLagerort(db: Leser)` DIESELBE
 * Fahrzeug-Check-Maske, und §5.6.3 zeigt, dass diese Maske innerhalb der
 * Check-Transaktion gelesen wird (Teil 4). Ein `DB` allein durch
 * Dateizugehoerigkeit blockierte dort und liefe auf den Cast hinaus, den H11
 * verbietet.
 *
 * ⚠️ id-TIEBREAKER (§5.14.4): `ts` sind UNIX-Sekunden, und mehrere Messungen
 * einer Sammel-Pruefsitzung fallen realistisch in dieselbe Sekunde. Sowohl die
 * JS-Verdichtung in `letzteJeFlasche` als auch die SQL-Sortierung in
 * `o2FlascheDetail` muessen bei Gleichstand DIESELBE Zeile waehlen — sonst
 * zeigte die Uebersicht eine andere „letzte Messung" als die Detailseite
 * desselben Objekts. Entschieden wie ueberall sonst im Modul: bei gleichem `ts`
 * gewinnt die lexikographisch GROESSERE `id`.
 */
import { desc, eq } from "drizzle-orm";
import { lagerorte, o2Flaschen, o2Messungen } from "../../_db/schema";
import { quelleAufloeser } from "../../_db/quelle";
import { o2Status, type O2Status } from "../domain/o2";
import type { DB } from "../../_db/client";
import type { Leser } from "./bestand";

export type O2FlascheZeile = {
  id: string; name: string; lagerortName: string; aktiv: boolean;
  groesseLiter: number | null; nennfuelldruckBar: number;
  letzterDruck: number | null; letzteMessung: Date | null;
  /** Herkunft DERSELBEN juengsten Messung wie Druck und Zeitpunkt. */
  herkunft: "check" | "manuell" | null;
  /** ⚠️ `null` = KEINE Messung. Nicht 0 %. */
  status: O2Status | null;
};

/** Juengste Messung je Flasche — EINE Abfrage, dann in JS verdichtet.
 *  id-Tiebreaker bei GLEICHEM `ts` (§5.14.4), dieselbe Richtung wie die
 *  SQL-Sortierung in `o2FlascheDetail` (`orderBy(desc(ts), desc(id))`). */
function letzteJeFlasche(db: Leser): Map<string, {
  ts: Date; druckBar: number; id: string; quelleTyp: string;
}> {
  const m = new Map<string, {
    ts: Date; druckBar: number; id: string; quelleTyp: string;
  }>();
  for (const x of db.select().from(o2Messungen).all()) {
    const prev = m.get(x.flascheId);
    const istSpaeter = !prev
      || x.ts.getTime() > prev.ts.getTime()
      || (x.ts.getTime() === prev.ts.getTime() && x.id > prev.id);
    if (istSpaeter) {
      m.set(x.flascheId, {
        ts: x.ts, druckBar: x.druckBar, id: x.id, quelleTyp: x.quelleTyp,
      });
    }
  }
  return m;
}

export function o2FlaschenUebersicht(db: Leser): O2FlascheZeile[] {
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const letzte = letzteJeFlasche(db);
  return db.select().from(o2Flaschen).all()
    .map((f) => {
      const l = letzte.get(f.id) ?? null;
      const letzterDruck = l ? l.druckBar : null;
      const herkunft: O2FlascheZeile["herkunft"] = l === null
        ? null
        : l.quelleTyp === "token" ? "check" : "manuell";
      return {
        id: f.id, name: f.name, lagerortName: namen.get(f.lagerortId) ?? "–",
        aktiv: f.aktiv, groesseLiter: f.groesseLiter,
        nennfuelldruckBar: f.nennfuelldruckBar,
        letzterDruck, letzteMessung: l ? l.ts : null,
        // Token = Fahrzeug-Check; jeder andere vorhandene Quelltyp ist manuell.
        // Ohne Messung gibt es keine Herkunft, die geraten werden duerfte.
        herkunft,
        // GUARD: ohne Messung KEIN o2Status-Aufruf (§5.12, Eigenschaft 4).
        status: letzterDruck !== null ? o2Status(letzterDruck, f.nennfuelldruckBar) : null,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type O2MessungZeile = {
  id: string; ts: Date; druckBar: number; wer: string; kommentar: string | null;
  /** Stammt aus einem Fahrzeug-Check (`quelleTyp === "token"`) — §5.8.1. */
  ausCheck: boolean;
};

export type O2FlascheDetail = {
  flasche: typeof o2Flaschen.$inferSelect;
  lagerortName: string;
  status: O2Status | null;
  /** chronologisch ABSTEIGEND */
  verlauf: O2MessungZeile[];
};

export function o2FlascheDetail(db: DB, id: string): O2FlascheDetail | null {
  const f = db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get();
  if (!f) return null;
  const lo = db.select().from(lagerorte).where(eq(lagerorte.id, f.lagerortId)).get();
  const rows = db.select().from(o2Messungen)
    .where(eq(o2Messungen.flascheId, id))
    // id-Tiebreaker: `ts` sind UNIX-Sekunden, und ein Check schreibt alle
    // Messungen in derselben Sekunde (§5.14.4).
    .orderBy(desc(o2Messungen.ts), desc(o2Messungen.id))
    .all();
  const wer = quelleAufloeser(db);
  const verlauf: O2MessungZeile[] = rows.map((m) => ({
    id: m.id, ts: m.ts, druckBar: m.druckBar,
    wer: wer(m.quelleTyp, m.quelleId), kommentar: m.kommentar,
    ausCheck: m.quelleTyp === "token",
  }));
  const letzterDruck = verlauf.length > 0 ? verlauf[0].druckBar : null;
  return {
    flasche: f, lagerortName: lo?.name ?? "–",
    status: letzterDruck !== null ? o2Status(letzterDruck, f.nennfuelldruckBar) : null,
    verlauf,
  };
}

export type O2FlascheCheckZeile = {
  id: string; name: string; nennfuelldruckBar: number; letzterDruck: number | null;
};

/** Aktive Flaschen an einem Standort — fuer den Fahrzeug-Check und die
 *  Fahrzeug-Detailseite. `letzterDruck` ist der Vorschlagswert; die VORBELEGUNG
 *  im Zaehlschritt ist dagegen der NENNFUELLDRUCK (§5.15, Punkt 6). */
export function o2FlaschenFuerLagerort(db: Leser, lagerortId: string): O2FlascheCheckZeile[] {
  const letzte = letzteJeFlasche(db);
  return db.select().from(o2Flaschen)
    .where(eq(o2Flaschen.lagerortId, lagerortId)).all()
    .filter((f) => f.aktiv)
    .map((f) => ({
      id: f.id, name: f.name, nennfuelldruckBar: f.nennfuelldruckBar,
      letzterDruck: letzte.get(f.id)?.druckBar ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function lagerorteFuerFlaschen(db: Leser): { id: string; name: string }[] {
  return db.select().from(lagerorte).where(eq(lagerorte.aktiv, true)).all()
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
