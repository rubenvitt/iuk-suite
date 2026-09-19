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
import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { artikel, checks, geraete, lagerorte, o2Flaschen, sollPositionen } from "../../_db/schema";
import type { DB } from "../../_db/client";
import { quelleAufloeser } from "../../_db/quelle";
import type { Einheitenart } from "../konstanten";
import { parseCheckErgebnis } from "../checkErgebnis";
import { offenJeArtikel, summiereCheckErgebnis, type CheckSummen } from "../domain/check";
import { o2Status } from "../domain/o2";
import { wechselGrenzeNachschlag } from "./o2";
import { verfallStatus, verfallSchwellen, type Ampel } from "../domain/verfall";
import { chargeText } from "../format";
import { CHECK_GRENZE } from "../grenzen";
import type { Leser } from "./bestand";

/**
 * ⚠️ `mitOffenen` IST EINE ANZEIGEENTSCHEIDUNG, KEINE BERECHTIGUNG (DRK-196).
 * Ein Check mit `completedAt IS NULL` ist ein vom Schema vorgesehener Zustand
 * (§4.4) — einer, an dem noch nichts geschrieben wurde. Aus dem Modul heraus
 * entsteht er NIE (`_actions/check.ts` schreibt immer ein vollstaendiges
 * Ergebnis); die zwei Wege sind der lokale Seed und der Datenimport aus der
 * Alt-Anwendung. Nach dem Cutover ist das also keine hypothetische Zeile mehr.
 *
 * ⛔ DIE VORGABE IST `false`, UND ZWAR HIER UND NICHT AN DER AUFRUFSTELLE: die
 * Liste heisst „abgeschlossene Checks", ihr Leertext sagt das woertlich, und
 * eine offene Zeile stand darin bisher nur mit einem Gedankenstrich in der
 * Abschlussspalte — das liest sich wie ein FEHLENDER WERT, nicht wie ein
 * laufender Vorgang. Wer den Parameter vergisst, bekommt damit die Bedeutung,
 * die der Text daneben ohnehin behauptet.
 *
 * ⚠️ UND DESHALB IST ES EIN SCHALTER UND KEIN FESTER AUSSCHLUSS: `/verwaltung/
 * checks` ist der EINZIGE Link auf `/verwaltung/checks/[id]` (gemessen, es gibt
 * keinen zweiten Einstieg im Modul). Ein harter Filter machte die importierten
 * Zeilen unerreichbar und den Offen-Zustand der Detailseite zu totem Code.
 */
export type CheckFilter = {
  fahrzeugId?: string; von?: Date; bis?: Date; grenze?: number; mitOffenen?: boolean;
};

export type CheckHistorieZeile = CheckSummen & {
  id: string; fahrzeugId: string; fahrzeugName: string; completedAt: Date | null;
  /**
   * ⚠️ DER NAME ALLEIN TRAEGT DIE ZEILE NICHT MEHR (DRK-309, Reviewrunde 7).
   * `lagerorte.name` traegt keinen Eindeutigkeitsschluessel; ein Fahrzeug und
   * eine Tasche duerfen gleich heissen, und dann sind ihre Checks in der
   * Historie weder auseinanderzuhalten noch getrennt zu filtern — der
   * Spaltenfilter gruppiert ueber genau diesen Namen und faengt beide.
   */
  fahrzeugKennung: string | null;
  fahrzeugEinheitenart: Einheitenart | null;
  /**
   * DER VERFASSER DES CHECKS — DRK-311.
   *
   * ⚠️ AUFGELOEST, NICHT ROH. `checks.quelleTyp`/`quelleId` bleiben in der
   * Datenbank nachweisfest stehen; `quelleAufloeser` macht daraus einen Namen
   * (Konto → `users.name`, Kaertchen → `tokens.label`, sonst „System").
   *
   * ⚠️ NIE `null`. Loest die Kennung auf nichts auf — geloeschtes Kaertchen,
   * Konto aus dem alten Kennungsraum (§4.13) —, steht dort die ROHE Kennung und
   * nicht ein Strich: „unbekannt" laesst offen, ob niemand es weiss oder
   * niemand es erfasst hat, die rohe Kennung ist wenigstens nachschlagbar. Das
   * ist zugleich die Lesart von „soweit vorhanden" im Ticket.
   */
  wer: string;
};

export type CheckHistorie = { zeilen: CheckHistorieZeile[]; mehrVorhanden: boolean };

/**
 * ⚠️ `DB` STATT `Leser` SEIT DRK-311, und das ist keine Verengung ohne Grund:
 * `quelleAufloeser` nimmt `DB` (Festlegung H11, ausgeschrieben im Kopf von
 * `lesepfade/bz.ts`), und wer ihn ruft, nimmt `DB`. Die Historie wird nur aus
 * Server Components gelesen, nie aus einer offenen Transaktion — anders als die
 * Geraeteliste, die innerhalb der Check-Transaktion laeuft.
 */
export function checkHistorie(db: DB, f: CheckFilter = {}): CheckHistorie {
  const grenze = f.grenze ?? CHECK_GRENZE;
  // EIN Aufloeser fuer ALLE Zeilen — er laedt `users` und `tokens` je Aufruf
  // einmal (`_db/quelle.ts`), nicht je Check.
  const wer = quelleAufloeser(db);
  const einheiten = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l]));
  // EIN Abruf des Flaschenstamms fuer ALLE Zeilen — der Nachschlag steckt in der
  // Summenfunktion, die je Zeile laeuft; ein Abruf dort waere einer je Check.
  const wechselGrenze = wechselGrenzeNachschlag(db);
  const conds: SQL[] = [];
  if (f.fahrzeugId) conds.push(eq(checks.fahrzeugId, f.fahrzeugId));
  /*
   * ⛔ DER ZEITRAUM MISST `completedAt` ODER, WO DAS FEHLT, `startedAt`
   * (Codex-Review zu PR #210, P2; gemessen in `checks.test.ts`).
   *
   * Ein nacktes `completedAt >= von` schliesst NULL aus — SQL vergleicht NULL
   * mit nichts. Sobald also ein Datum gesetzt war, verschwanden die laufenden
   * Checks WIEDER, und der Schalter daneben tat still nichts. Das ist dieselbe
   * Unerreichbarkeit wie bei der Grenze, nur mit einem anderen Ausloeser — und
   * sie faellt noch weniger auf, weil der Schalter ja sichtbar gesetzt ist.
   *
   * ⚠️ `coalesce` UND NICHT EIN ZWEITER ZWEIG JE GRENZE: „wann war dieser
   * Check?" ist EINE Frage, und ein laufender Check beantwortet sie mit seinem
   * Beginn. Zwei `or`-Verschachtelungen sagten dasselbe in vier Zeilen und
   * liefen beim naechsten Filter auseinander.
   *
   * ⚠️ FUER EINE ABGESCHLOSSENE ZEILE AENDERT SICH NICHTS: `coalesce` gibt dort
   * `completedAt` zurueck, der Ausdruck ist also zeichengleich zum alten.
   */
  /*
   * ⚠️ DIE SEKUNDEN WERDEN HIER VON HAND GERECHNET, und das ist kein Umweg,
   * sondern der Preis des rohen Ausdrucks: `gte(checks.completedAt, …)` kennt
   * die Abbildung der SPALTE und wandelt ein `Date` selbst um; ein `sql`-Stueck
   * kennt sie nicht und versuchte, das `Date` direkt zu binden — „SQLite3 can
   * only bind numbers, strings, bigints, buffers, and null", gemessen.
   * `mode: "timestamp"` legt beide Spalten als UNIX-SEKUNDEN ab (§5.14.4).
   */
  const sekunden = (d: Date) => Math.floor(d.getTime() / 1000);
  const zeitpunkt = sql`coalesce(${checks.completedAt}, ${checks.startedAt})`;
  if (f.von) conds.push(sql`${zeitpunkt} >= ${sekunden(f.von)}`);
  if (f.bis) conds.push(sql`${zeitpunkt} <= ${sekunden(f.bis)}`);
  /*
   * DRK-196 — der Ausschluss steht VOR der Grenze, nicht hinter ihr. Ein Filter
   * erst auf den 50 geholten Zeilen lieferte weniger als 50 abgeschlossene und
   * meldete trotzdem „mehr vorhanden" — die Deckelzeile daneben zaehlte dann
   * eine Menge, die so nie auf dem Schirm stand.
   */
  if (!f.mitOffenen) conds.push(isNotNull(checks.completedAt));

  const rows = db
    .select()
    .from(checks)
    .where(conds.length > 0 ? and(...conds) : undefined)
    /*
     * ⛔ OFFENE ZEILEN ZUERST — UND DAS IST KEINE ANZEIGEVORLIEBE, SONDERN DIE
     * BEDINGUNG DAFUER, DASS DER SCHALTER UEBERHAUPT ETWAS TUT (Codex-Review zu
     * PR #210, P1; gemessen in `checks.test.ts`).
     *
     * SQLite sortiert NULLs bei `DESC` nach HINTEN. Ohne diesen ersten
     * Sortierschluessel standen die offenen Checks also hinter JEDEM
     * abgeschlossenen — und `limit` darunter schnitt sie ab, bevor sie je
     * gemappt wurden. Ab `grenze + 1` abgeschlossenen Checks war ein offener
     * damit UNERREICHBAR, obwohl `mitOffenen` gesetzt war; diese Liste ist der
     * einzige Link auf die Detailseite. Mit kleinem Seed gruen, im Betrieb
     * kaputt — genau die Klasse, die erst nach dem Cutover auffiele.
     *
     * ⚠️ UNBEDINGT UND NICHT NUR BEI `mitOffenen`: ohne den Schalter enthaelt
     * die Menge gar keine NULLs, der Schluessel ist dort also wirkungslos. Eine
     * bedingte Sortierung waere zwei Abfrageformen fuer eine Frage — und die
     * seltener gefahrene veraltet.
     *
     * Fachlich liest es sich ebenso: ein laufender Check ist der aktuellste
     * Vorgang am Fahrzeug, nicht der aelteste.
     */
    .orderBy(
      sql`(${checks.completedAt} is null) desc`,
      // id-Tiebreaker wie im Journal: `completedAt` sind UNIX-SEKUNDEN (§5.14.4).
      desc(checks.completedAt),
      desc(checks.id),
    )
    .limit(grenze + 1)
    .all();

  return {
    mehrVorhanden: rows.length > grenze,
    zeilen: rows.slice(0, grenze).map((c) => ({
      id: c.id, fahrzeugId: c.fahrzeugId,
      fahrzeugName: einheiten.get(c.fahrzeugId)?.name ?? "–",
      fahrzeugKennung: einheiten.get(c.fahrzeugId)?.kennung ?? null,
      fahrzeugEinheitenart: einheiten.get(c.fahrzeugId)?.einheitenart ?? null,
      completedAt: c.completedAt,
      wer: wer(c.quelleTyp, c.quelleId),
      ...summiereCheckErgebnis(c.ergebnis, wechselGrenze),
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
  /**
   * ⚠️ DIESELBE BEGRUENDUNG WIE IN `CheckHistorieZeile` (DRK-309,
   * Reviewrunde 11) — und hier wiegt sie schwerer, nicht leichter: wer aus
   * der Historie auf eine Zeile tippt, landet auf dieser Seite, und ohne die
   * Art steht im Kopf wieder nur ein Name, den sich ein Fahrzeug und eine
   * Tasche teilen duerfen. Die Seite ist zugleich der Ort, an den ein Link
   * aus einer Mail oder aus dem Protokoll fuehrt — dort gab es die Zeile
   * davor gar nicht zu sehen.
   */
  fahrzeugEinheitenart: Einheitenart | null;
  quelleId: string; startedAt: Date; completedAt: Date | null;
  /** Der Verfasser, aufgeloest — dieselbe Begruendung wie an
   *  `CheckHistorieZeile.wer`. Wer aus der Historie hierher tippt, soll
   *  denselben Namen wiederfinden, nicht die rohe Kennung daneben. */
  wer: string;
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
  /**
   * DRK-196 — DER CHECK HAT NOCH KEIN ERGEBNIS, und das ist KEIN Fehler.
   *
   * ⚠️ DIE DRITTE URSACHE NEBEN `altFormat` UND `unlesbar`, und die drei
   * auseinanderzuhalten ist der ganze Punkt: `altFormat` heisst „vollstaendig,
   * aber ohne Positionsdetails", `unlesbar` heisst „beschaedigt", und `offen`
   * heisst „noch nichts geschrieben" (§4.4, `completed_at IS NULL`). Ohne
   * dieses Feld zeigt die Seite dafuer „0 Positionen" — also dasselbe wie fuer
   * einen abgeschlossenen Check, bei dem wirklich nichts zu tun war. Genau der
   * luegende 200, den §11.5 fuer die Nachbarlage ausschliesst.
   *
   * ⚠️ AUS DEM MODUL HERAUS ENTSTEHT DER ZUSTAND NIE (`_actions/check.ts`
   * schreibt immer ein vollstaendiges Ergebnis). Die zwei Wege sind der lokale
   * Seed und der Datenimport aus der Alt-Anwendung — nach dem Cutover ist das
   * also keine hypothetische Zeile.
   *
   * ⛔ GEPRUEFT WIRD `completedAt`, NICHT `ergebnis` — UND DER ERSTE WURF HATTE
   * ES FALSCH HERUM (Codex-Review zu PR #210, P2; nachgemessen).
   *
   * Die Begruendung damals lautete „das Feld beantwortet, ob hier etwas steht,
   * und daran haengt die leere Liste darunter; das Schema fuehrt beide ohnehin
   * gemeinsam". Der letzte Halbsatz ist eine Annahme, keine Zusage: das Schema
   * ERLAUBT eine abgeschlossene Zeile mit leerem `ergebnis`. Fuer die zeigte
   * die Seite dann einen Abschlusszeitpunkt UND „Dieser Check laeuft noch" —
   * nebeneinander, im selben Bild. Ein Widerspruch auf dem Schirm ist teurer
   * als die „0 Positionen", gegen die der Vorgang ueberhaupt antrat.
   *
   * ⚠️ UND DIE ZWEITE HAELFTE WIEGT SCHWERER: die Liste daneben filtert ueber
   * `completedAt`. Zwei Flaechen mit zwei Diskriminatoren fuer DIESELBE Frage
   * laufen auseinander, sobald die beiden Felder es tun — genau die Sorte
   * Inkonsistenz, die erst auffaellt, wenn jemand sie in der Hand hat.
   * `completedAt IS NULL` ist ausserdem die Form, die §4.4 nennt.
   *
   * ⚠️ WAS DAMIT NICHT ABGEDECKT IST, ausgeschrieben statt verschwiegen: eine
   * ABGESCHLOSSENE Zeile mit leerem `ergebnis` zeigt weiterhin „0 Positionen"
   * ohne Meldung. Sie entsteht aus dem Modul heraus nicht, und einen vierten
   * Zustand dafuer zu erfinden waere Overbuild — sie ist weder offen noch
   * unlesbar noch altes Format, sondern abgeschlossen ohne erfasstes Ergebnis.
   * Taucht sie nach dem Cutover auf, ist das ein eigener Posten.
   */
  offen: boolean;
  summe: CheckSummen & { verfallAuffaellig: number };
};

/** ⚠️ `DB` statt `Leser` — Begruendung an `checkHistorie`. */
export function checkDetail(db: DB, id: string, now: Date = new Date()): CheckDetail | null {
  const c = db.select().from(checks).where(eq(checks.id, id)).get();
  if (!c) return null;
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, c.fahrzeugId)).get();
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const sollRows = new Map(db.select().from(sollPositionen).all().map((s) => [s.id, s]));
  const gerStamm = new Map(db.select().from(geraete).all().map((g) => [g.id, g]));
  const flStamm = new Map(db.select().from(o2Flaschen).all().map((f) => [f.id, f]));
  const schwellen = verfallSchwellen();

  const e = parseCheckErgebnis(c.ergebnis);
  // Derselbe Stamm, der unten die Flaschendetails traegt — kein zweiter Abruf.
  const summe = summiereCheckErgebnis(c.ergebnis, (id) => flStamm.get(id)?.wechselAbProzent);

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
    // ⚠️ DER GRENZWERT KOMMT AUS DEM HEUTIGEN STAMM, nicht aus dem Check. Er ist
    // bewusst NICHT gesnapshottet (Begruendung an `WechselGrenzeNachschlag` in
    // `domain/check.ts`); eine geloeschte Flasche faellt auf die Vorbelegung
    // zurueck, weil es fuer sie keine geltende Vorgabe mehr gibt.
    const s = o2Status(druckBar, nenn, f?.wechselAbProzent);
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
    fahrzeugEinheitenart: fahrzeug?.einheitenart ?? null,
    quelleId: c.quelleId, startedAt: c.startedAt, completedAt: c.completedAt,
    wer: quelleAufloeser(db)(c.quelleTyp, c.quelleId),
    positionen, artikel: artikelD, geraete: geraeteD, flaschen: flaschenD, verfall: verfallD,
    altFormat: summe.altFormat,
    // Aus DERSELBEN Quelle wie `altFormat` daneben. Seit die Uebersicht den
    // Grund ebenfalls anzeigt, traegt ihn `CheckSummen`; eine zweite Herleitung
    // hier waere eine zweite Wahrheit ueber dasselbe JSON — genau der Bruch, den
    // §5.8.3 fuer die Summen beschreibt.
    unlesbar: summe.unlesbar,
    offen: c.completedAt === null,
    summe: {
      ...summe,
      // Die beiden Flaschenzaehler UEBERSCHREIBEN die Summe: das Detail hat den
      // Stamm gesehen, `summiereCheckErgebnis` nicht.
      flaschenAuffaellig, nichtBewertbar,
      verfallAuffaellig: verfallD.filter((v) => v.ampel !== "gruen").length,
    },
  };
}

/**
 * DER ZEITPUNKT DES LETZTEN ABGESCHLOSSENEN CHECKS EINES FAHRZEUGS — DRK-306.
 *
 * `null` heisst „noch nie abgeschlossen geprueft" und ist eine ANDERE Aussage
 * als „vor langer Zeit": die Oberflaeche muss beide unterscheiden koennen, sonst
 * liest jemand einen fehlenden Wert als frischen Stand.
 *
 * ⚠️ NICHT UEBER `fahrzeugUebersicht`, obwohl die Zeile dort `letzterCheck`
 * schon fuehrt. Jene Funktion liest ALLE Fahrzeuge, ALLE Soll-Positionen und
 * `bestandJeArtikelUndLagerort` — genau die Vollladung, gegen die
 * `helfer/check/page.tsx` auf „ERST WAEHLEN, DANN LADEN" umgebaut wurde, weil
 * der Helferweg auf einem PRIVATEN Telefon in einer Sitzung OHNE Konto laeuft.
 * Ein Aufruf von dort holte die Lage der ganzen Organisation zurueck, um EINE
 * Zahl anzuzeigen.
 *
 * ⚠️ `completedAt IS NOT NULL` MACHT §4.4 IM AUSDRUCK SICHTBAR — ES IST ABER
 * KEIN TOR, UND DAS STEHT HIER, DAMIT ES NIEMAND DAFUER HAELT. Gemessen: nimmt
 * man den Riegel heraus, bleibt `checks.test.ts` VOLLSTAENDIG GRUEN. Zwei
 * Gruende, die sich ueberlagern — SQLite sortiert NULLs bei `DESC` nach HINTEN,
 * und selbst wenn eine offene Zeile gewaenne, faengt das `?? null` unten sie zum
 * selben Ergebnis ab. Wer den Riegel „aufraeumt", aendert heute also nichts;
 * wer ihn stehen laesst, haelt die Absicht fest, falls die Rueckgabe einmal
 * mehr als diesen einen Wert traegt. Eine Begruendung, die hier einen Mutanten
 * behauptet, waere schlimmer als keine.
 *
 * ⚠️ DER `id`-TIEBREAKER IST NICHT KOSMETIK, sondern dieselbe Zusage wie in
 * `checkHistorie` und im Journal: `completedAt` sind UNIX-SEKUNDEN (§5.14.4).
 * Zwei Checks in derselben Sekunde sind ohne ihn in beliebiger Reihenfolge, und
 * die Anzeige koennte zwischen zwei Aufrufen springen.
 */
export function letzterCheckZeitpunkt(db: Leser, fahrzeugId: string): Date | null {
  const c = db
    .select({ completedAt: checks.completedAt })
    .from(checks)
    .where(and(eq(checks.fahrzeugId, fahrzeugId), isNotNull(checks.completedAt)))
    .orderBy(desc(checks.completedAt), desc(checks.id))
    .limit(1)
    .get();
  return c?.completedAt ?? null;
}
