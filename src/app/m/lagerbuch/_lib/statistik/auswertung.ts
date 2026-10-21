/**
 * IDA-261 — DIE AUSWERTUNG AUF DEM GERAET. Reine Funktionen, kein "use client",
 * kein Datenbankzugriff.
 *
 * WARUM IM CLIENT: der Server verdichtet einmal je Zeitraum
 * (`lesepfade/statistik.ts`), und jeder Filter (Kategorie, Artikel) ist danach
 * nur eine andere Summe ueber dieselben Zeilen. Eine Navigation je Klick waere
 * die teurere Form fuer dasselbe Ergebnis.
 *
 * Die Funktionen liegen hier und nicht in der Insel, damit ein Test sie ohne
 * DOM rechnen kann.
 */
import type {
  BestandsDelta, StatistikArtikel, StatistikDaten, StatistikEinheit, VerfallsMenge,
} from "../lesepfade/statistik";

/** Tage je Monat im Mittel (365,25 / 12) — Nenner fuer „je Monat". */
export const TAGE_JE_MONAT = 30.4375;

export type Filter = {
  /** `kategorieSchluessel`; `null` = alle, `""` = ohne Kategorie. */
  kategorie: string | null;
  artikelId: string | null;
};

export const KEIN_FILTER: Filter = { kategorie: null, artikelId: null };

/** Die Artikel, die der Filter zulaesst. */
export function gefilterteArtikel(artikel: readonly StatistikArtikel[], f: Filter): StatistikArtikel[] {
  return artikel.filter((a) => {
    if (f.artikelId !== null) return a.id === f.artikelId;
    if (f.kategorie === null) return true;
    return (a.kategorieSchluessel ?? "") === f.kategorie;
  });
}

function zulaessig<T extends { a: string }>(zeilen: readonly T[], ids: ReadonlySet<string>): T[] {
  return zeilen.filter((z) => ids.has(z.a));
}

export type Kennzahlen = { verbrauch: number; zugang: number; aussonderung: number; inventur: number };

export type VerbrauchsMonat = { label: string; regal: number; einheit: number };
export type MengenMonat = { label: string; menge: number };
export type TopArtikel = {
  id: string; name: string; einheit: string;
  verbrauch: number; jeMonat: number; handlager: number;
  /** Monate, die der Handlager-Bestand beim bisherigen Verbrauch reicht; `null` ohne Verbrauch. */
  reichweite: number | null;
};
export type EinheitZeile = { id: string; label: string; nachschub: number; fehlmenge: number };
export type VerlaufsMonat = { label: string; handlager: number; einheiten: number };

export type Auswertung = {
  kennzahlen: Kennzahlen;
  verbrauchJeMonat: VerbrauchsMonat[];
  top: TopArtikel[];
  jeEinheit: EinheitZeile[];
  aussonderungJeMonat: MengenMonat[];
  verfallVorschau: MengenMonat[];
  /** Mengen verschiedener Zaehleinheiten (Stk., Pkg., Fl.) stehen in derselben Summe. */
  gemischteEinheiten: boolean;
};

export const TOP_ANZAHL = 10;

export function werteAus(d: StatistikDaten, f: Filter): Auswertung {
  const artikel = gefilterteArtikel(d.artikel, f);
  const ids = new Set(artikel.map((a) => a.id));
  const bewegungen = zulaessig(d.bewegungen, ids);

  const kennzahlen: Kennzahlen = { verbrauch: 0, zugang: 0, aussonderung: 0, inventur: 0 };
  const verbrauchJeMonat = d.monate.map((m) => ({ label: m.label, regal: 0, einheit: 0 }));
  const aussonderungJeMonat = d.monate.map((m) => ({ label: m.label, menge: 0 }));
  const verbrauchJeArtikel = new Map<string, number>();
  const jeEinheit = new Map<string, { nachschub: number; fehlmenge: number }>();
  const verbraucht = new Set<string>();

  for (const b of bewegungen) {
    switch (b.art) {
      case "regal":
      case "einheit":
        kennzahlen.verbrauch += b.n;
        verbrauchJeMonat[b.m][b.art] += b.n;
        verbrauchJeArtikel.set(b.a, (verbrauchJeArtikel.get(b.a) ?? 0) + b.n);
        verbraucht.add(b.a);
        if (b.art === "einheit" && b.o) einheitPlus(jeEinheit, b.o, "fehlmenge", b.n);
        break;
      case "nachschub":
        if (b.o) einheitPlus(jeEinheit, b.o, "nachschub", b.n);
        break;
      case "aussondern":
        kennzahlen.aussonderung += b.n;
        aussonderungJeMonat[b.m].menge += b.n;
        break;
      case "zugang":
        kennzahlen.zugang += b.n;
        break;
      case "inventur":
        kennzahlen.inventur += b.n;
        break;
    }
  }

  const monateImZeitraum = d.tage / TAGE_JE_MONAT;
  const nachId = new Map(artikel.map((a) => [a.id, a]));
  const top: TopArtikel[] = [...verbrauchJeArtikel]
    .filter(([, n]) => n > 0)
    .map(([id, verbrauch]) => {
      const a = nachId.get(id)!;
      const jeMonat = verbrauch / monateImZeitraum;
      return {
        id, name: a.name, einheit: a.einheit, verbrauch, handlager: a.handlager,
        jeMonat: runde(jeMonat), reichweite: reichweite(a.handlager, jeMonat),
      };
    })
    .sort((x, y) => y.verbrauch - x.verbrauch || x.name.localeCompare(y.name, "de"))
    .slice(0, TOP_ANZAHL);

  const verfallVorschau = d.vorschauMonate.map((m) => ({ label: m.label, menge: 0 }));
  let abgelaufen = 0;
  for (const v of zulaessig<VerfallsMenge>(d.verfall, ids)) {
    if (v.m < 0) abgelaufen += v.n;
    else verfallVorschau[v.m].menge += v.n;
  }

  // Die Zaehleinheit vergleicht der Mensch, nicht der Computer: „Stk." und
  // „Stk" sind dieselbe — getrimmt, ohne Punkt, klein.
  const einheitenArten = new Set(
    artikel.filter((a) => verbraucht.has(a.id)).map((a) => a.einheit.trim().replace(/\.$/, "").toLowerCase()),
  );

  return {
    kennzahlen,
    verbrauchJeMonat,
    top,
    jeEinheit: einheitenZeilen(d.einheiten, jeEinheit),
    aussonderungJeMonat,
    verfallVorschau: [{ label: "abgelaufen", menge: abgelaufen }, ...verfallVorschau],
    gemischteEinheiten: einheitenArten.size > 1,
  };
}

function einheitPlus(
  m: Map<string, { nachschub: number; fehlmenge: number }>, id: string,
  feld: "nachschub" | "fehlmenge", n: number,
) {
  const z = m.get(id) ?? { nachschub: 0, fehlmenge: 0 };
  z[feld] += n;
  m.set(id, z);
}

function einheitenZeilen(
  einheiten: readonly StatistikEinheit[], werte: Map<string, { nachschub: number; fehlmenge: number }>,
): EinheitZeile[] {
  const label = new Map(einheiten.map((e) => [e.id, e.label]));
  return [...werte]
    .map(([id, w]) => ({ id, label: label.get(id) ?? id, ...w }))
    .filter((z) => z.nachschub > 0 || z.fehlmenge > 0)
    .sort((x, y) => y.nachschub + y.fehlmenge - (x.nachschub + x.fehlmenge) || x.label.localeCompare(y.label, "de"));
}

/** Eine Nachkommastelle — mehr Genauigkeit behauptet ein Monatsmittel nicht. */
export function runde(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Reichweite in Monaten: Bestand / Verbrauch je Monat. Ohne Verbrauch keine Aussage. */
export function reichweite(bestand: number, jeMonat: number): number | null {
  if (jeMonat <= 0) return null;
  return runde(Math.max(0, bestand) / jeMonat);
}

/**
 * Der Bestand EINES Artikels am Ende jedes Monats, getrennt nach Handlager und
 * Einheiten: Startbestand vor dem Zeitraum plus die Monatsaenderungen.
 *
 * ⚠️ AUS ALLEN BUCHUNGSTYPEN, nicht nur aus den Bewegungen oben — eine
 * Umlagerung verschiebt Bestand zwischen den beiden Linien, eine Handkorrektur
 * aendert ihn, obwohl beide kein Verbrauch sind.
 */
export function bestandsverlauf(
  d: Pick<StatistikDaten, "monate" | "artikel" | "bestandsDeltas">, artikelId: string,
): VerlaufsMonat[] {
  const a = d.artikel.find((x) => x.id === artikelId);
  if (!a) return [];
  const delta = d.monate.map(() => ({ handlager: 0, einheiten: 0 }));
  for (const x of d.bestandsDeltas as readonly BestandsDelta[]) {
    if (x.a === artikelId) delta[x.m][x.b] += x.n;
  }
  let handlager = a.startHandlager;
  let einheiten = a.startEinheiten;
  return d.monate.map((m, i) => {
    handlager += delta[i].handlager;
    einheiten += delta[i].einheiten;
    return { label: m.label, handlager, einheiten };
  });
}
