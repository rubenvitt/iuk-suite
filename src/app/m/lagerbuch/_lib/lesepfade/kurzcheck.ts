/**
 * Was der Kurzcheck einer Einheit heute zaehlt (IDA-222).
 *
 * Sammelt je Soll-Position, wann sie zuletzt WIRKLICH gezaehlt wurde, ob seit
 * dem entnommen wurde und ob ihr Verfall naht — und laesst
 * `waehleStichprobe` daraus ziehen. Positionen in einem Fach, dessen Plombe
 * steht, sind keine Kandidaten: die Plombe bezeugt sie.
 */
import { and, desc, eq, isNotNull, max } from "drizzle-orm";
import { buchungen, checks } from "../../_db/schema";
import { parseCheckErgebnis } from "../checkErgebnis";
import {
  STICHPROBE_GARANTIE_TAGE, waehleStichprobe, type StichprobenGrund,
} from "../domain/stichprobe";
import { heuteIso } from "../zeit";
import type { Leser } from "./bestand";
import { verfallFuerLagerort } from "./verfall";
import { plombeDecktAb } from "../plombe";
import type { PlombeZeile } from "./plomben";

const TAG_MS = 86_400_000;

/**
 * Wie viele Checks zurueck gelesen wird. Bei zwei Checks pro Woche ist das
 * gut ein Jahr — wer laenger nicht gezaehlt wurde, ist ohnehin ueberfaellig,
 * und „noch nie" zieht genauso zuerst.
 */
const CHECKS_ZURUECK = 120;

/**
 * Die letzte echte Zaehlung je Soll-Position.
 *
 * ⚠️ AUS DEM CHECK-NACHWEIS, NICHT AUS DEN BUCHUNGEN. Eine Korrekturbuchung
 * entsteht nur bei einer Abweichung; ein gezaehlter Artikel, der stimmte,
 * hinterlaesst im Journal nichts. Was gezaehlt wurde, steht nur in
 * `ergebnis.positionen` — seit DRK-304 sendet der Check ausschliesslich
 * gezaehlte Positionen, im Kurzcheck eben nur die gezogenen.
 */
export function letzteZaehlungJePosition(db: Leser, fahrzeugId: string): Map<string, Date> {
  const zeilen = db.select({ completedAt: checks.completedAt, ergebnis: checks.ergebnis })
    .from(checks)
    .where(and(eq(checks.fahrzeugId, fahrzeugId), isNotNull(checks.completedAt)))
    .orderBy(desc(checks.completedAt), desc(checks.id))
    .limit(CHECKS_ZURUECK)
    .all();
  const stand = new Map<string, Date>();
  for (const z of zeilen) {
    const e = parseCheckErgebnis(z.ergebnis);
    if (e.version !== 2 || !z.completedAt) continue;
    for (const p of e.positionen) {
      if (p.sollPositionId && !stand.has(p.sollPositionId)) stand.set(p.sollPositionId, z.completedAt);
    }
  }
  return stand;
}

/** Die juengste Entnahme je Artikel AUS DIESER Einheit. */
export function letzteEntnahmeJeArtikel(db: Leser, fahrzeugId: string): Map<string, Date> {
  const zeilen = db.select({ artikelId: buchungen.artikelId, ts: max(buchungen.ts) })
    .from(buchungen)
    .where(and(eq(buchungen.lagerortId, fahrzeugId), eq(buchungen.typ, "entnahme")))
    .groupBy(buchungen.artikelId)
    .all();
  return new Map(zeilen.filter((z) => z.ts).map((z) => [z.artikelId, z.ts as Date]));
}

export type KurzcheckPosition = {
  id: string; artikelId: string; fachLabel: string;
  /** IDA-223: jedes Mal dran, solange keine Plombe das Fach bezeugt. */
  immerZaehlen?: boolean;
};

export type KurzcheckVorlage = {
  /** Die heute gezogenen Positionen mit ihrem Grund. */
  auswahl: { id: string; grund: StichprobenGrund; tage: number | null }[];
  /** Je stehender Plombe die Positionen, die sie bezeugt. */
  versiegelt: Record<string, string[]>;
  /** Positionen, die innerhalb der Garantiefrist gezaehlt oder versiegelt sind. */
  abgedeckt: number;
  gesamt: number;
};

export function kurzcheckVorlage(
  db: Leser,
  args: {
    fahrzeugId: string;
    soll: KurzcheckPosition[];
    plomben: PlombeZeile[];
    /** Ist Teil des Seeds: ein zweiter Kurzcheck am selben Tag zieht neu. */
    letzterCheckId: string | null;
    now?: Date;
  },
): KurzcheckVorlage {
  const now = args.now ?? new Date();
  const gezaehlt = letzteZaehlungJePosition(db, args.fahrzeugId);
  const entnommen = letzteEntnahmeJeArtikel(db, args.fahrzeugId);
  const verfall = verfallFuerLagerort(db, args.fahrzeugId, now);

  const versiegelt: Record<string, string[]> = {};
  const versiegeltIds = new Set<string>();
  for (const pl of args.plomben) {
    if (!plombeDecktAb(pl)) continue;
    const ids = args.soll.filter((p) => p.fachLabel === pl.fachLabel).map((p) => p.id);
    versiegelt[pl.id] = ids;
    for (const id of ids) versiegeltIds.add(id);
  }

  const kandidaten = args.soll
    .filter((p) => !versiegeltIds.has(p.id))
    .map((p) => {
      const am = gezaehlt.get(p.id) ?? null;
      const entnahme = entnommen.get(p.artikelId) ?? null;
      const ampel = verfall.get(p.artikelId)?.ampel;
      return {
        id: p.id,
        artikelId: p.artikelId,
        tageSeitZaehlung: am === null ? null : Math.max(0, Math.floor((now.getTime() - am.getTime()) / TAG_MS)),
        verbraucht: entnahme !== null && (am === null || entnahme > am),
        verfallBald: ampel !== undefined && ampel !== "gruen",
        immerZaehlen: p.immerZaehlen ?? false,
      };
    });

  // ⚠️ Ein Artikel, der in einem versiegelten UND einem offenen Fach liegt, wird
  // im offenen Fach gezogen — dann muss auch das versiegelte mitgezaehlt werden,
  // sonst gleicht der Abschluss den Bestand gegen eine Teilsumme ab
  // (`_lib/domain/stichprobe.ts`, Kopf). Deshalb erweitert diese Zeile die
  // Auswahl um jede Position desselben Artikels.
  const gezogen = waehleStichprobe(kandidaten, {
    seed: `${args.fahrzeugId}|${heuteIso(now)}|${args.letzterCheckId ?? ""}`,
  });
  const gezogeneArtikel = new Set(
    gezogen.map((t) => args.soll.find((p) => p.id === t.id)!.artikelId));
  const auswahl = [...gezogen];
  for (const p of args.soll) {
    if (gezogeneArtikel.has(p.artikelId) && !auswahl.some((t) => t.id === p.id)) {
      const vom = gezogen.find((t) => args.soll.find((q) => q.id === t.id)!.artikelId === p.artikelId)!;
      auswahl.push({ id: p.id, grund: vom.grund, tage: vom.tage });
    }
  }

  const grenze = now.getTime() - STICHPROBE_GARANTIE_TAGE * TAG_MS;
  const abgedeckt = args.soll.filter((p) => {
    if (versiegeltIds.has(p.id)) return true;
    const am = gezaehlt.get(p.id);
    return am !== undefined && am.getTime() >= grenze;
  }).length;

  return { auswahl, versiegelt, abgedeckt, gesamt: args.soll.length };
}

/** Die Id des letzten abgeschlossenen Checks — Teil des Stichproben-Seeds. */
export function letzteCheckId(db: Leser, fahrzeugId: string): string | null {
  return db.select({ id: checks.id }).from(checks)
    .where(and(eq(checks.fahrzeugId, fahrzeugId), isNotNull(checks.completedAt)))
    .orderBy(desc(checks.completedAt), desc(checks.id))
    .limit(1).get()?.id ?? null;
}
