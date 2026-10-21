/**
 * IDA-261 — DIE ZAHLEN DER STATISTIKSEITE. Kein "use client", kein Icon-Import.
 *
 * WAS „VERBRAUCH" HEISST, und das ist die eine Festlegung dieser Datei:
 *
 *   regal    `typ = "entnahme"` — am Regal herausgenommen, ohne Ziel-Einheit.
 *            Mit Ziel-Einheit ist es eine Umlagerung und KEIN Verbrauch: das
 *            Material liegt danach im Fahrzeug (`_actions/buchung.ts`).
 *   einheit  `typ = "korrektur"`, Referenz `check:`, negativ, an einer Einheit
 *            — die Fehlmenge, die der Check-Abgleich an einem Fahrzeug oder
 *            einer Tasche bucht. Dort sinkt der Bestand erst beim naechsten
 *            Check, und genau dort taucht der Verbrauch im Einsatz auf.
 *
 * ⚠️ NIE ALS VERBRAUCH: `umlagerung` (zwei Legs, Netto-Null — der Grund, warum
 * der Typ ueberhaupt existiert, `_db/schema.ts` an `buchungen.typ`),
 * Aussonderung (`aussondern:`, Verlust durch Verfall, eigene Reihe) und die
 * Inventurdifferenz (`inventur:`, eigene Reihe). Ein POSITIVER Check-Abgleich
 * wird nicht gegengerechnet: er heisst „mehr da als gebucht" und meist, dass
 * ein Auffuellen nicht gebucht wurde — kein negativer Verbrauch.
 *
 * ⚠️ AGGREGIERT IN SQL, NICHT IN JS. `better-sqlite3` ist synchron; die ganze
 * Historie zu laden blockierte die Suite (`_lib/grenzen.ts`). Die Monatsgrenzen
 * gehen deshalb als `CASE` in die Abfrage, und zurueck kommt eine Zeile je
 * (Monat, Artikel, Ort, Typ, Referenzklasse, Vorzeichen).
 *
 * ⚠️ KEINE KOPPLUNG AN DIE FAHRZEUG-STAMMDATEN. „Einheit" ist hier allein
 * `lagerorte.typ = "fahrzeug"`, angezeigt ueber `ortZeile`. Was das Modul
 * `fahrzeuge` ueber ein Fahrzeug weiss, braucht diese Seite nicht.
 */
import { and, gte, inArray, lt, sql } from "drizzle-orm";
import { artikel as artikelTabelle, buchungen, chargen } from "../../_db/schema";
import { kategorieNormalisieren, kategorieOptionen, kategorieSchluessel, type KategorieOption } from "../kategorie";
import { istOhneVerfall, ortZeile } from "../konstanten";
import { monatsraster, type Monat, type Zeitraum } from "../statistik/zeitraum";
import { AUSSONDERN_PRAEFIX, INVENTUR_PRAEFIX } from "../vorgang";
import { bestandJeArtikelUndLagerort, restJeChargeImBereich, type Leser } from "./bestand";
import { handlagerOrte, ortStamm } from "./orte";
import { lagerortVerfallListe } from "./verfall";

const CHECK_PRAEFIX = "check:";

/** Wie weit die Verfallsvorschau nach vorn schaut, in Monaten (laufender eingeschlossen). */
export const VORSCHAU_MONATE = 12;

export type BewegungsArt = "regal" | "einheit" | "nachschub" | "aussondern" | "zugang" | "inventur";

/**
 * Eine verdichtete Bewegung. Kurze Feldnamen, weil die Liste ueber die
 * RSC-Grenze geht und je Monat, Artikel und Ort eine Zeile hat.
 */
export type Bewegung = {
  /** Index in `monate`. */
  m: number;
  /** Artikel-ID. */
  a: string;
  /** Einheit (Lagerort-ID) bei `einheit` und `nachschub`, sonst `null`. */
  o: string | null;
  art: BewegungsArt;
  /** Immer positiv, ausser bei `inventur` (Differenz mit Vorzeichen). */
  n: number;
};

export type Bereich = "handlager" | "einheiten";

/** Bestandsaenderung je Monat und Bereich — Grundlage des Bestandsverlaufs. */
export type BestandsDelta = { m: number; a: string; b: Bereich; n: number };

export type StatistikArtikel = {
  id: string;
  name: string;
  einheit: string;
  kategorie: string | null;
  /** `kategorieSchluessel` — Filterwert, damit „Verband" und „verband " eins sind. */
  kategorieSchluessel: string | null;
  aktiv: boolean;
  /** Bestand JETZT im Handlager samt Schraenken. */
  handlager: number;
  /** Bestand JETZT auf allen Einheiten zusammen. */
  einheiten: number;
  /** Bestand VOR dem ersten Monat des Zeitraums. */
  startHandlager: number;
  startEinheiten: number;
};

export type StatistikEinheit = { id: string; label: string; aktiv: boolean };

/** Handlager-Rest, der im Monat `m` der Vorschau ablaeuft; `m = -1` ist bereits abgelaufen. */
export type VerfallsMenge = { m: number; a: string; n: number };

export type StatistikDaten = {
  monate: Monat[];
  /** Tage vom Beginn des Zeitraums bis jetzt — Nenner des Monatsdurchschnitts. */
  tage: number;
  artikel: StatistikArtikel[];
  kategorien: KategorieOption[];
  einheiten: StatistikEinheit[];
  bewegungen: Bewegung[];
  bestandsDeltas: BestandsDelta[];
  vorschauMonate: Monat[];
  verfall: VerfallsMenge[];
  /** Gemeldete Verfaelle an Einheiten, die abgelaufen oder bald faellig sind. */
  einheitenVerfallWarnend: number;
};

type Klasse = "check" | "aussondern" | "inventur" | "";

export type RohGruppe = {
  monat: number;
  artikelId: string;
  lagerortId: string;
  typ: string;
  klasse: Klasse;
  summe: number;
};

/**
 * Ordnet EINE verdichtete Gruppe einer Bewegungsart zu — die Festlegung aus dem
 * Kopf dieser Datei als reine Funktion, damit ein Test sie Fall fuer Fall
 * festhaelt. `null` heisst „zaehlt in keiner Reihe" (Handkorrektur, Import,
 * Rueckweg einer Umlagerung).
 */
export function bewegungsArt(
  g: Pick<RohGruppe, "typ" | "klasse" | "summe">, anEinheit: boolean,
): { art: BewegungsArt; n: number } | null {
  if (g.typ === "entnahme") return { art: "regal", n: -g.summe };
  if (g.typ === "zugang") return { art: "zugang", n: g.summe };
  if (g.typ === "umlagerung") return anEinheit && g.summe > 0 ? { art: "nachschub", n: g.summe } : null;
  if (g.typ === "korrektur") {
    if (g.klasse === "aussondern") return { art: "aussondern", n: -g.summe };
    if (g.klasse === "inventur") return { art: "inventur", n: g.summe };
    if (g.klasse === "check" && anEinheit && g.summe < 0) return { art: "einheit", n: -g.summe };
  }
  return null;
}

function sekunden(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/** `substr(referenz, 1, n) = praefix` — kein LIKE, damit kein Zeichen der Praefixe zum Muster wird. */
function beginntMit(praefix: string) {
  return sql`substr(${buchungen.referenz}, 1, ${praefix.length}) = ${praefix}`;
}

function rohGruppen(db: Leser, grenzen: Date[]): RohGruppe[] {
  const s = grenzen.map(sekunden);
  const monatAusdruck = sql.join(
    [
      sql`case`,
      ...s.slice(1).map((bis, i) => sql`when ${buchungen.ts} < ${bis} then ${i}`),
      sql`end`,
    ],
    sql` `,
  );
  const klasse = sql<Klasse>`case
    when ${beginntMit(CHECK_PRAEFIX)} then 'check'
    when ${beginntMit(AUSSONDERN_PRAEFIX)} then 'aussondern'
    when ${beginntMit(INVENTUR_PRAEFIX)} then 'inventur'
    else '' end`;
  const negativ = sql<number>`${buchungen.menge} < 0`;
  return db
    .select({
      monat: sql<number>`${monatAusdruck}`,
      artikelId: buchungen.artikelId,
      lagerortId: buchungen.lagerortId,
      typ: buchungen.typ,
      klasse,
      negativ,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .where(and(gte(buchungen.ts, grenzen[0]), lt(buchungen.ts, grenzen[grenzen.length - 1])))
    // Positionsangaben: Monat, Artikel, Ort, Typ, Klasse, Vorzeichen — die ersten sechs Spalten.
    .groupBy(sql`1, 2, 3, 4, 5, 6`)
    .all()
    // `negativ` traegt nur die Gruppierung (Plus- und Minuszeilen getrennt summiert).
    .map((g) => ({
      monat: g.monat, artikelId: g.artikelId, lagerortId: g.lagerortId,
      typ: g.typ, klasse: g.klasse, summe: g.summe,
    }));
}

function startbestand(db: Leser, von: Date): { artikelId: string; lagerortId: string; summe: number }[] {
  return db
    .select({
      artikelId: buchungen.artikelId,
      lagerortId: buchungen.lagerortId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .where(lt(buchungen.ts, von))
    .groupBy(buchungen.artikelId, buchungen.lagerortId)
    .all();
}

export function statistikDaten(db: Leser, monateAnzahl: Zeitraum, jetzt: Date = new Date()): StatistikDaten {
  const { monate, grenzen } = monatsraster(jetzt, monateAnzahl);
  const stamm = ortStamm(db);
  const handlager = new Set<string>(handlagerOrte(db));
  const bereichVon = (ortId: string): Bereich | null =>
    handlager.has(ortId) ? "handlager" : stamm.get(ortId)?.typ === "fahrzeug" ? "einheiten" : null;

  const bewegungen: Bewegung[] = [];
  const deltas = new Map<string, BestandsDelta>();
  for (const g of rohGruppen(db, grenzen)) {
    const bereich = bereichVon(g.lagerortId);
    const zuordnung = bewegungsArt(g, bereich === "einheiten");
    if (zuordnung && zuordnung.n !== 0) {
      const o = zuordnung.art === "einheit" || zuordnung.art === "nachschub" ? g.lagerortId : null;
      bewegungen.push({ m: g.monat, a: g.artikelId, o, art: zuordnung.art, n: zuordnung.n });
    }
    if (bereich) {
      const schluessel = `${g.monat}|${g.artikelId}|${bereich}`;
      const d = deltas.get(schluessel) ?? { m: g.monat, a: g.artikelId, b: bereich, n: 0 };
      d.n += g.summe;
      deltas.set(schluessel, d);
    }
  }
  // Gleiche (Monat, Artikel, Ort, Art) aus verschiedenen Gruppen (Vorzeichen, Klasse) zusammenlegen.
  const gebuendelt = new Map<string, Bewegung>();
  for (const b of bewegungen) {
    const k = `${b.m}|${b.a}|${b.o ?? ""}|${b.art}`;
    const vorhanden = gebuendelt.get(k);
    if (vorhanden) vorhanden.n += b.n;
    else gebuendelt.set(k, { ...b });
  }

  const start = new Map<string, { handlager: number; einheiten: number }>();
  for (const r of startbestand(db, grenzen[0])) {
    const bereich = bereichVon(r.lagerortId);
    if (!bereich) continue;
    const s = start.get(r.artikelId) ?? { handlager: 0, einheiten: 0 };
    s[bereich] += r.summe;
    start.set(r.artikelId, s);
  }

  const jetztBestand = new Map<string, { handlager: number; einheiten: number }>();
  for (const [ortId, jeArtikel] of bestandJeArtikelUndLagerort(db)) {
    const bereich = bereichVon(ortId);
    if (!bereich) continue;
    for (const [artikelId, summe] of jeArtikel) {
      const s = jetztBestand.get(artikelId) ?? { handlager: 0, einheiten: 0 };
      s[bereich] += summe;
      jetztBestand.set(artikelId, s);
    }
  }

  const artikelZeilen = db.select().from(artikelTabelle).all();
  const artikel: StatistikArtikel[] = artikelZeilen
    .map((a) => {
      const kategorie = kategorieNormalisieren(a.kategorie);
      const j = jetztBestand.get(a.id);
      const s = start.get(a.id);
      return {
        id: a.id, name: a.name, einheit: a.einheit, aktiv: a.aktiv,
        kategorie, kategorieSchluessel: kategorie ? kategorieSchluessel(kategorie) : null,
        handlager: j?.handlager ?? 0, einheiten: j?.einheiten ?? 0,
        startHandlager: s?.handlager ?? 0, startEinheiten: s?.einheiten ?? 0,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name, "de") || x.id.localeCompare(y.id));

  const einheiten: StatistikEinheit[] = [...stamm.values()]
    .filter((o) => o.typ === "fahrzeug")
    .map((o) => ({ id: o.id, label: ortZeile(o), aktiv: o.aktiv }))
    .sort((x, y) => x.label.localeCompare(y.label, "de"));

  const vorschau = monatsraster(jetzt, VORSCHAU_MONATE, "vor").monate;
  return {
    monate,
    tage: Math.max(1, (jetzt.getTime() - grenzen[0].getTime()) / 86_400_000),
    artikel,
    kategorien: kategorieOptionen(artikelZeilen.map((a) => a.kategorie)),
    einheiten,
    bewegungen: [...gebuendelt.values()].filter((b) => b.n !== 0),
    bestandsDeltas: [...deltas.values()].filter((d) => d.n !== 0),
    vorschauMonate: vorschau,
    verfall: verfallsVorschau(db, vorschau),
    einheitenVerfallWarnend: lagerortVerfallListe(db, { nurWarnend: true }, jetzt)
      .filter((z) => z.lagerortTyp === "fahrzeug").length,
  };
}

/**
 * Was im HANDLAGER in den naechsten Monaten ablaeuft, in Stueck je Monat.
 *
 * ⚠️ NUR DER HANDLAGER, und das ist keine Abkuerzung: an einer Einheit steht
 * der massgebliche Verfall nicht an der Charge, sondern als gemeldeter Monat
 * in `lagerort_verfall` (`_db/schema.ts`, Kopf von `lagerortVerfall`) — ohne
 * Menge. Eine Stueckzahl daraus waere geraten. Die Einheiten gehen deshalb
 * als Anzahl warnender Meldungen in die Kachel daneben.
 */
function verfallsVorschau(db: Leser, vorschau: Monat[]): VerfallsMenge[] {
  const rest = restJeChargeImBereich(db, handlagerOrte(db));
  const ids = [...rest.keys()];
  if (ids.length === 0) return [];
  const index = new Map(vorschau.map((m, i) => [m.schluessel, i]));
  const erster = vorschau[0].schluessel;
  const summen = new Map<string, VerfallsMenge>();
  for (const c of db
    .select({ id: chargen.id, artikelId: chargen.artikelId, verfall: chargen.verfall })
    .from(chargen).where(inArray(chargen.id, ids)).all()) {
    const n = rest.get(c.id) ?? 0;
    if (n <= 0 || istOhneVerfall(c.verfall)) continue;
    const m = c.verfall < erster ? -1 : index.get(c.verfall);
    if (m === undefined) continue;
    const k = `${m}|${c.artikelId}`;
    const v = summen.get(k) ?? { m, a: c.artikelId, n: 0 };
    v.n += n;
    summen.set(k, v);
  }
  return [...summen.values()];
}
