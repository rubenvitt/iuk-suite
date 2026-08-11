/**
 * Fahrzeug-Check-Historie und -Detail. Kein "use client", kein Icon-Import.
 *
 * ZWEI ENTSCHEIDUNGEN TRAEGT DIESE DATEI:
 *
 * 1. BEIDE LESER RUFEN `summiereCheckErgebnis` (§5.8.3) — dieselbe Funktion,
 *    dieselben Zahlen. Heute rechnet die Historie an `queries.ts:374-380` und das
 *    Detail an `:496-501`, und sie koennen auseinanderlaufen.
 * 2. DER NENNFUELLDRUCK WIRD BENANNT STATT GERATEN (§5.12). Die Kette lautet in
 *    BEIDEN Lesern `e.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null` — die
 *    Historie bekommt damit DIESELBE Stammdaten-Kette wie das Detail, „damit der
 *    haeufigere der beiden Wege ueberhaupt erst den seltenen erreicht". Fehlt der
 *    Wert in ALLEN Quellen, liefert die Zeile null/null/null und die Anzeige
 *    „Nennfuelldruck unbekannt" — keine Prozentzahl, keine Ampel.
 *
 * ⚠️ `summiereCheckErgebnis` KENNT DEN FLASCHENSTAMM NICHT (T40). Fuer die
 * HISTORIE ist das verkraftbar; das DETAIL rechnet die Flaschenzeilen deshalb
 * SELBST mit der vollen Kette und UEBERSCHREIBT die beiden Flaschenzaehler der
 * Summe. Das ist die eine Stelle, an der Uebersicht und Detail auseinandergehen
 * duerfen — und sie geht in die SICHERE Richtung: das Detail weiss mehr.
 */
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { artikel, checks, geraete, lagerorte, o2Flaschen, sollPositionen } from "../../_db/schema";
import { parseCheckErgebnis } from "../checkErgebnis";
import { offenJeArtikel, summiereCheckErgebnis, type CheckSummen } from "../domain/check";
import { o2Status } from "../domain/o2";
import { verfallStatus, verfallSchwellen, type Ampel } from "../domain/verfall";
import { chargeText } from "../format";
import { CHECK_GRENZE } from "../grenzen";
import type { Leser } from "./bestand";

export type CheckFilter = { fahrzeugId?: string; von?: Date; bis?: Date; grenze?: number };

export type CheckHistorieZeile = CheckSummen & {
  id: string; fahrzeugId: string; fahrzeugName: string; completedAt: Date | null;
};

export type CheckHistorie = { zeilen: CheckHistorieZeile[]; mehrVorhanden: boolean };

export function checkHistorie(db: Leser, f: CheckFilter = {}): CheckHistorie {
  const grenze = f.grenze ?? CHECK_GRENZE;
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const conds: SQL[] = [];
  if (f.fahrzeugId) conds.push(eq(checks.fahrzeugId, f.fahrzeugId));
  if (f.von) conds.push(gte(checks.completedAt, f.von));
  if (f.bis) conds.push(lte(checks.completedAt, f.bis));

  const rows = db
    .select()
    .from(checks)
    .where(conds.length > 0 ? and(...conds) : undefined)
    // id-Tiebreaker wie im Journal: `completedAt` sind UNIX-SEKUNDEN (§5.14.4).
    .orderBy(desc(checks.completedAt), desc(checks.id))
    .limit(grenze + 1)
    .all();

  return {
    mehrVorhanden: rows.length > grenze,
    zeilen: rows.slice(0, grenze).map((c) => ({
      id: c.id, fahrzeugId: c.fahrzeugId,
      fahrzeugName: namen.get(c.fahrzeugId) ?? "–",
      completedAt: c.completedAt,
      ...summiereCheckErgebnis(c.ergebnis),
    })),
  };
}

export type CheckPositionDetail = {
  id: string; fachLabel: string; artikelId: string; artikelName: string; einheit: string;
  soll: number; ist: number;
};
export type CheckArtikelDetail = {
  artikelId: string; artikelName: string; einheit: string;
  sollSumme: number; istSumme: number; recordedVorher: number;
  korrektur: number; nachfuellGebucht: number; offen: number;
};
export type CheckGeraetDetail = {
  geraetId: string; name: string; typ: "medizin" | "objekt" | null;
  vorhanden: boolean; zustand: string | null; bemerkung: string | null;
};
export type CheckFlascheDetail = {
  flascheId: string; name: string;
  /** ⚠️ `null` = NICHT GEMESSEN. KEIN `?? 0` — das behauptete eine leere Flasche,
   *  die niemand gemessen hat (§5.12, dieselbe Regel wie beim Nenndruck). */
  druckBar: number | null;
  /** ⚠️ `null` = unbekannt. KEIN `?? 200` (§5.12). */
  nennfuelldruckBar: number | null;
  prozent: number | null;
  ampel: Ampel | null;
  niedrig: boolean;
};
export type CheckVerfallDetail = {
  artikelId: string; artikelName: string; verfall: string;
  ampel: Ampel; abgelaufen: boolean; text: string;
};
export type CheckDetail = {
  id: string; fahrzeugId: string; fahrzeugName: string; fahrzeugKennung: string | null;
  quelleId: string; startedAt: Date; completedAt: Date | null;
  positionen: CheckPositionDetail[]; artikel: CheckArtikelDetail[];
  geraete: CheckGeraetDetail[]; flaschen: CheckFlascheDetail[]; verfall: CheckVerfallDetail[];
  /** ⚠️ Bleibt ein Feld der Antwort, und die Detailseite SAGT es (§4.10, §11.5
   *  Zustand 26) — alles andere ist eine leere Tabelle, die wie ein Fehler
   *  aussieht. */
  altFormat: boolean;
  /**
   * ⚠️ §11.5, Zustand 27, und NICHT dasselbe wie `altFormat`: der Rohwert war
   * nicht lesbar, die leeren Listen unten sind also kein Befund, sondern ein
   * Ausfall. Ohne dieses Feld zeigt die Seite fuer einen zerstoerten Datensatz
   * „0 Positionen" — der Zustand, den §11.5 ausdruecklich ausschliesst, weil ein
   * 200, das luegt, hier am teuersten ist: es sieht aus wie ein Check, bei dem
   * nichts zu tun war.
   *
   * Ein OFFENER Check (`ergebnis IS NULL`, §4.4) ist NICHT unlesbar — er hat
   * noch keins. Die Abgrenzung sitzt im Parser (`checkErgebnis.ts`).
   */
  unlesbar: boolean;
  summe: CheckSummen & { verfallAuffaellig: number };
};

export function checkDetail(db: Leser, id: string, now: Date = new Date()): CheckDetail | null {
  const c = db.select().from(checks).where(eq(checks.id, id)).get();
  if (!c) return null;
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, c.fahrzeugId)).get();
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const sollRows = new Map(db.select().from(sollPositionen).all().map((s) => [s.id, s]));
  const gerStamm = new Map(db.select().from(geraete).all().map((g) => [g.id, g]));
  const flStamm = new Map(db.select().from(o2Flaschen).all().map((f) => [f.id, f]));
  const schwellen = verfallSchwellen();

  const e = parseCheckErgebnis(c.ergebnis);
  const summe = summiereCheckErgebnis(c.ergebnis);

  // Das ALTE Format traegt keine Positionsdetails — leere Listen sind die
  // richtige Antwort, und `altFormat: true` macht sie lesbar.
  const leer = e.version === 1;

  // Alle Detaillisten sind TOLERANT gegen geloeschte Bezugsobjekte: `ergebnis`
  // ist freies JSON OHNE Fremdschluessel (§4.10, 1:1-Pflicht 3).
  const legacyVorkommen = new Map<string, number>();
  const positionen: CheckPositionDetail[] = leer ? [] : e.positionen.map((p) => {
    const a = arts.get(p.artikelId);
    const s = p.sollPositionId ? sollRows.get(p.sollPositionId) : undefined;
    const soll = p.soll ?? 0;
    const ist = p.ist ?? 0;
    const fingerprint = `${p.artikelId}:${soll}:${ist}`;
    const vorkommen = legacyVorkommen.get(fingerprint) ?? 0;
    if (!p.sollPositionId) legacyVorkommen.set(fingerprint, vorkommen + 1);
    return {
      id: p.sollPositionId ?? `legacy:${c.id}:${fingerprint}:${vorkommen}`,
      fachLabel: s?.fachLabel ?? "–", artikelId: p.artikelId,
      artikelName: a?.name ?? "(gelöschter Artikel)", einheit: a?.einheit ?? "",
      soll, ist,
    };
  });

  const artikelD: CheckArtikelDetail[] = leer ? [] : e.artikel.map((g) => {
    const a = arts.get(g.artikelId);
    const sollSumme = g.sollSumme ?? 0;
    const istSumme = g.istSumme ?? 0;
    const nachfuellGebucht = g.nachfuellGebucht ?? 0;
    return {
      artikelId: g.artikelId, artikelName: a?.name ?? "(gelöschter Artikel)",
      einheit: a?.einheit ?? "", sollSumme, istSumme,
      recordedVorher: g.recordedVorher ?? 0, korrektur: g.korrektur ?? 0, nachfuellGebucht,
      // ⚠️ KEINE ZWEITE FORMEL. `offenJeArtikel` ist dieselbe Funktion, aus der
      // `summiereCheckErgebnis` die Summe bildet (§5.8.3) — sonst stuenden hier
      // Zeilen, deren `offen` sich nicht zur ausgewiesenen Summe addiert.
      offen: offenJeArtikel(g),
    };
  });

  const geraeteD: CheckGeraetDetail[] = leer ? [] : e.geraete.map((x) => {
    const g = gerStamm.get(x.geraetId);
    return {
      geraetId: x.geraetId, name: g?.name ?? "(gelöschtes Gerät)", typ: g?.typ ?? null,
      vorhanden: Boolean(x.vorhanden), zustand: x.zustand ?? null,
      bemerkung: x.bemerkung ?? null,
    };
  });

  // DIE VOLLE KETTE — und sie endet auf `null`, nicht auf 200 (§5.12).
  let flaschenAuffaellig = 0;
  let nichtBewertbar = 0;
  const flaschenD: CheckFlascheDetail[] = leer ? [] : e.flaschen.map((x) => {
    const f = flStamm.get(x.flascheId);
    const druckBar = x.druckBar ?? null;
    const nenn = x.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null;
    // ⚠️ BEIDE Seiten muessen bekannt sein. Ein fehlender DRUCK ist genauso
    // unbewertbar wie ein fehlender NENNdruck — `?? 0` machte daraus still
    // „0 bar → 0 % → rot → niedrig" und behauptete auf einem Nachweis eine leere
    // Flasche, die niemand gemessen hat. Die Behandlung ist damit symmetrisch zu
    // den vier Zeilen darueber, statt asymmetrisch in derselben Schleife.
    if (nenn === null || druckBar === null) {
      nichtBewertbar += 1;
      return {
        flascheId: x.flascheId, name: f?.name ?? "(gelöschte Flasche)", druckBar,
        nennfuelldruckBar: nenn, prozent: null, ampel: null, niedrig: false,
      };
    }
    const s = o2Status(druckBar, nenn);
    if (s.niedrig) flaschenAuffaellig += 1;
    return {
      flascheId: x.flascheId, name: f?.name ?? "(gelöschte Flasche)", druckBar,
      nennfuelldruckBar: nenn, prozent: s.prozent, ampel: s.ampel, niedrig: s.niedrig,
    };
  });

  /**
   * ⚠️ DIE AMPEL WIRD NEU GEGEN HEUTE GERECHNET, nicht der damalige Zustand
   * angezeigt (§5.6.3, Begruendung `queries.ts:477-478`): ein damals gruenes Datum
   * kann inzwischen abgelaufen sein. Das ist eine bewusste Entscheidung und
   * bleibt — mit der Konsequenz, dass die Detailseite fuer DENSELBEN Check ueber
   * die Zeit verschiedene Ampeln zeigt. VERBINDLICH FUER DIE OBERFLAECHE: die
   * Seite schreibt aus, dass die Verfall-Ampel gegen HEUTE gerechnet ist. Ohne
   * diesen Satz liest jemand einen Nachweis falsch.
   */
  const verfallD: CheckVerfallDetail[] = leer ? [] : e.verfall.map((x) => {
    const a = arts.get(x.artikelId);
    const s = verfallStatus(x.verfall, schwellen, now);
    return {
      artikelId: x.artikelId, artikelName: a?.name ?? "(gelöschter Artikel)",
      verfall: x.verfall, ampel: s.ampel, abgelaufen: s.abgelaufen,
      text: chargeText(s, x.verfall),
    };
  });

  positionen.sort((x, y) =>
    x.fachLabel.localeCompare(y.fachLabel) || x.artikelName.localeCompare(y.artikelName));
  geraeteD.sort((x, y) => x.name.localeCompare(y.name));
  flaschenD.sort((x, y) => x.name.localeCompare(y.name));
  verfallD.sort((x, y) =>
    x.verfall.localeCompare(y.verfall) || x.artikelName.localeCompare(y.artikelName));

  return {
    id: c.id, fahrzeugId: c.fahrzeugId,
    fahrzeugName: fahrzeug?.name ?? "–", fahrzeugKennung: fahrzeug?.kennung ?? null,
    quelleId: c.quelleId, startedAt: c.startedAt, completedAt: c.completedAt,
    positionen, artikel: artikelD, geraete: geraeteD, flaschen: flaschenD, verfall: verfallD,
    altFormat: summe.altFormat,
    // Direkt aus dem geparsten Wert, nicht aus der Summe: `summiereCheckErgebnis`
    // zaehlt nur und kennt den Grund nicht. V1 kann nie unlesbar sein — ein
    // Array IST lesbar, es traegt nur weniger.
    unlesbar: e.version === 2 && e.unlesbar === true,
    summe: {
      ...summe,
      // Die beiden Flaschenzaehler UEBERSCHREIBEN die Summe: das Detail hat den
      // Stamm gesehen, `summiereCheckErgebnis` nicht.
      flaschenAuffaellig, nichtBewertbar,
      verfallAuffaellig: verfallD.filter((v) => v.ampel !== "gruen").length,
    },
  };
}
