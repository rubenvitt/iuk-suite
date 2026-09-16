"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { buchungen, chargen, inventuren, inventurPositionen, newId } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { bestandProOrte } from "../_lib/domain/bestand";
import { KATEGORIE_MAX_LAENGE, KATEGORIEN_AUSWAHL_MAX } from "../_lib/kategorie";
import { CHARGE_INVENTUR, HANDLAGER_ID, MONAT_REGEX, PSEUDO_VERFALL } from "../_lib/konstanten";
import { INVENTUR_TEXTE } from "../_lib/inventurTexte";
import { zaehlOrtLabel } from "../_lib/inventurOrt";
import { restJeChargeFuerArtikel, restJeChargeUndOrt } from "../_lib/lesepfade/bestand";
import { ortStamm, zaehlBereich, type OrtStammZeile } from "../_lib/lesepfade/orte";
import { fefoAbbuchung, type Quelle, type Tx } from "../_lib/schreibpfade/abbuchung";
import { INVENTUR_PRAEFIX } from "../_lib/vorgang";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * Die Nutzlast, die das Formular sendet. Unterschieden wird AN DER FORM (`ist`
 * gegen `chargen`), nicht an einem `art`-Feld — die Artikelposition bleibt damit
 * woertlich `{ artikelId, ist }` (Spec §B „Nutzlast").
 */
export type InventurNutzlast = {
  kommentar: string;
  /**
   * DRK-337 — der GEZAEHLTE ORT. `null` oder fehlend heisst „ganzer Handlager"
   * (Verhalten vor DRK-337), `HANDLAGER_ID` heisst „nur die Wurzel, also noch
   * keinem Schrank zugeordnet", sonst ein Schrank.
   */
  ortId?: string | null;
  /** LABELS, nicht Schluessel — beschreibend fuer den Verlauf. */
  umfang?: { kategorien: string[]; faecher: string[] } | null;
  positionen: Array<
    | { artikelId: string; ist: number }
    | {
        artikelId: string;
        chargen: { chargeId: string; ist: number }[];
        neu: { verfall: string; chargenNr?: string; ist: number }[];
      }
  >;
};

// Echter Ueberbestand muss zaehlbar bleiben. Eine enge Obergrenze wuerde
// vorhandene Teile am Eingang abweisen und den Abgleich unbrauchbar machen.
const IST = z.coerce.number().int().min(0).max(99_999);

/** Leer oder nur Leerzeichen → `CHARGE_INVENTUR`: der Herkunftshinweis bleibt. */
function chargenNrAus(roh: string | undefined): string {
  return roh?.trim() || CHARGE_INVENTUR;
}

const ArtikelPosition = z.object({ artikelId: z.string().min(1), ist: IST }).strict();

const ChargenPosition = z.object({
  artikelId: z.string().min(1),
  // NUR ANGEFASSTE Chargen. Eine hier fehlende Charge wird nicht gebucht —
  // nie implizit 0 (1:1-Pflicht 21, Spec §B).
  chargen: z.array(z.object({ chargeId: z.string().min(1), ist: IST }).strict()),
  neu: z.array(z.object({
    verfall: z.string().regex(MONAT_REGEX, "Verfall muss YYYY-MM sein"),
    // Keine eigene Laengengrenze: `bucheZugang` (Wareneingang) hat auch keine.
    chargenNr: z.string().optional(),
    ist: z.coerce.number().int().min(1, "Menge muss größer als 0 sein").max(99_999),
  }).strict()),
}).strict()
  .refine((p) => p.chargen.length + p.neu.length > 0, { message: "Keine Charge gezählt", path: ["chargen"] })
  .refine((p) => new Set(p.chargen.map((c) => c.chargeId)).size === p.chargen.length,
    { message: "Charge doppelt gezählt", path: ["chargen"] })
  .refine((p) => new Set(p.neu.map((n) => `${chargenNrAus(n.chargenNr)}|${n.verfall}`)).size === p.neu.length,
    { message: "Charge doppelt ergänzt", path: ["neu"] });

const InventurSchema = z.object({
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
  /*
   * DRK-337 — NICHT beschreibend, sondern WIRKSAM: der Ort entscheidet, gegen
   * welchen Bestand gerechnet und auf welchen Ort korrigiert wird. Ob es ihn
   * gibt, prueft `zaehlBereich` in der Transaktion — nur dort ist die Liste der
   * Orte bekannt, und nur dort ist sie zum Zeitpunkt des Schreibens aktuell.
   */
  ortId: z.string().min(1).nullable().optional(),
  // BESCHREIBEND: der Filter beim Abschluss, als LABELS fuer den Verlauf.
  umfang: z.object({
    kategorien: z.array(z.string().max(KATEGORIE_MAX_LAENGE)).max(KATEGORIEN_AUSWAHL_MAX),
    faecher: z.array(z.string().max(200)).max(500),
  }).strict().nullable().optional(),
  positionen: z.array(z.union([ArtikelPosition, ChargenPosition]))
    .min(1, "Keine Zählung erfasst")
    .refine((ps) => new Set(ps.map((p) => p.artikelId)).size === ps.length,
      { message: "Artikel doppelt gezählt" }),
});

type ArtikelPositionT = z.infer<typeof ArtikelPosition>;
type ChargenPositionT = z.infer<typeof ChargenPosition>;
type Lauf = {
  inventurId: string; referenz: string; quelle: Quelle; kommentar: string;
  /**
   * DRK-337 — WOHIN EIN UEBERHANG GEHT, DER NIRGENDS SCHON LIEGT. Beim ganzen
   * Handlager ist das die Wurzel („noch nicht einsortiert", Betreiberentscheidung
   * DRK-297); bei einer Zaehlung VOR EINEM SCHRANK ist es dieser Schrank — sonst
   * fiele Material, das jemand gerade dort in der Hand hatte, auf einen Ort, an
   * dem es nicht liegt (Akzeptanzkriterium 3).
   */
  rueckfallOrt: string;
};

/** Fachliche Abweisung INNERHALB der Transaktion — sie rollt alles zurueck. */
class InventurAbgewiesen extends Error {}

function positionSpeichern(
  tx: Tx, lauf: Lauf, artikelId: string, chargeId: string | null, erwartet: number, gezaehlt: number,
): void {
  tx.insert(inventurPositionen).values({
    id: newId(), inventurId: lauf.inventurId, artikelId, chargeId, erwartet, gezaehlt,
  }).run();
}

/**
 * Der ARTIKELWEG — unveraendert gegenueber vor DRK-299, plus die gespeicherte
 * Position. Liefert, ob die Position abwich.
 *
 * `orte`/`stamm` kommen FERTIG BERECHNET vom Aufrufer (`inventurKorrektur`) —
 * beide haengen an keiner Charge und keinem Artikel, ein Neuladen je Position
 * waere unnoetig (Fixrunde 1, Befund 3: `better-sqlite3` ist synchron, eine
 * Inventur mit vielen Positionen blockierte sonst laenger als noetig die
 * gesamte Suite, nicht nur dieses Modul).
 */
function artikelPosition(
  tx: Tx, lauf: Lauf, orte: readonly string[], stamm: Map<string, OrtStammZeile>,
  position: ArtikelPositionT,
): boolean {
  // Der Bestand wird innerhalb derselben Transaktion frisch gelesen. Das
  // Lagerortfeld bleibt erhalten, damit Fahrzeugbestand nicht einfliesst.
  const zeilen = tx.select({ lagerortId: buchungen.lagerortId, menge: buchungen.menge })
    .from(buchungen).where(eq(buchungen.artikelId, position.artikelId)).all();
  const liveBestand = bestandProOrte(zeilen, orte);
  const diff = position.ist - liveBestand;
  positionSpeichern(tx, lauf, position.artikelId, null, liveBestand, position.ist);
  if (diff === 0) return false;

  if (diff < 0) {
    // DRK-297 (Nachtrag) — der Bereich, nicht die Wurzel: liegt der Bestand in
    // einem Schrank, fand die Wurzel dort nichts und kappte nach I2 auf zu
    // wenig, ohne den Fehlschlag zu melden.
    fefoAbbuchung(tx, {
      artikelId: position.artikelId, menge: -diff, orte,
      quelle: lauf.quelle, kommentar: lauf.kommentar, referenz: lauf.referenz, typ: "korrektur",
    });
    return true;
  }

  // ⚠️ DIE GERATENE CHARGE (korrektur.ts:15-27) — nur im Artikelweg.
  const vorhandeneChargen = tx.select().from(chargen).where(eq(chargen.artikelId, position.artikelId)).all();
  let chargeId: string;
  if (vorhandeneChargen.length > 0) {
    chargeId = juengsteZuerst(vorhandeneChargen)[0]!.id;
  } else {
    chargeId = newId();
    tx.insert(chargen).values({
      id: chargeId, artikelId: position.artikelId, chargenNr: CHARGE_INVENTUR,
      verfall: PSEUDO_VERFALL, createdAt: new Date(),
    }).run();
  }
  const bestandJeOrt = restJeChargeUndOrt(tx, position.artikelId).get(chargeId);
  bucheKorrektur(tx, lauf, orte, stamm, position.artikelId, chargeId, diff, bestandJeOrt);
  return true;
}

/**
 * Der CHARGENWEG (DRK-299). Liefert die Zahl abweichender Positionen.
 * Keine geratene Charge, kein FEFO: gebucht wird auf GENAU die gezaehlte Charge.
 */
function chargenPosition(
  tx: Tx, lauf: Lauf, orte: readonly string[], stamm: Map<string, OrtStammZeile>,
  position: ChargenPositionT,
): number {
  // Vor dem Anlegen neuer Chargen gelesen — eine neue Charge hat Rest 0.
  const rest = restJeChargeFuerArtikel(tx, position.artikelId, orte);
  // DRK-297, Fixrunde 1 (Befund 3) — EINMAL je Position geladen, nicht einmal
  // je gezaehlter Charge: `restJeChargeUndOrt` aggregiert die GESAMTE
  // Buchungshistorie des Artikels ohne Ortspraedikat und ist damit die
  // teuerste Abfrage in dieser Funktion.
  const bestandJeCharge = restJeChargeUndOrt(tx, position.artikelId);
  const zuZaehlen: { chargeId: string; ist: number }[] = [];

  for (const c of position.chargen) {
    const zeile = tx.select().from(chargen).where(eq(chargen.id, c.chargeId)).get();
    if (!zeile || zeile.artikelId !== position.artikelId) {
      throw new InventurAbgewiesen(INVENTUR_TEXTE.chargeUnpassend);
    }
    zuZaehlen.push(c);
  }

  for (const n of position.neu) {
    const chargenNr = chargenNrAus(n.chargenNr);
    const treffer = juengsteZuerst(tx.select().from(chargen).where(and(
      eq(chargen.artikelId, position.artikelId),
      eq(chargen.chargenNr, chargenNr),
      eq(chargen.verfall, n.verfall),
    )).all())[0];
    let chargeId = treffer?.id;
    if (!chargeId) {
      chargeId = newId();
      // ECHTES MHD, kein PSEUDO_VERFALL — die Charge ist gezaehlt, nicht geraten.
      tx.insert(chargen).values({
        id: chargeId, artikelId: position.artikelId, chargenNr, verfall: n.verfall, createdAt: new Date(),
      }).run();
    }
    if (zuZaehlen.some((z) => z.chargeId === chargeId)) {
      throw new InventurAbgewiesen(INVENTUR_TEXTE.chargeDoppelt);
    }
    zuZaehlen.push({ chargeId, ist: n.ist });
  }

  let abweichend = 0;
  for (const z of zuZaehlen) {
    const erwartet = rest.get(z.chargeId) ?? 0;
    const diff = z.ist - erwartet;
    positionSpeichern(tx, lauf, position.artikelId, z.chargeId, erwartet, z.ist);
    if (diff === 0) continue;
    // Kein Kappen noetig: `ist >= 0`, der Rest dieser Charge danach ist `ist` (I2).
    bucheKorrektur(
      tx, lauf, orte, stamm, position.artikelId, z.chargeId, diff, bestandJeCharge.get(z.chargeId),
    );
    abweichend++;
  }
  return abweichend;
}

/** `verfall` ↓, `createdAt` ↓, `id` ↓ — derselbe Tiebreak wie `korrektur.ts`. */
function juengsteZuerst<T extends { id: string; verfall: string; createdAt: Date }>(zeilen: T[]): T[] {
  return zeilen.slice().sort((a, b) =>
    b.verfall.localeCompare(a.verfall)
    || b.createdAt.getTime() - a.createdAt.getTime()
    || b.id.localeCompare(a.id));
}

/**
 * DRK-297 (Nachtrag) — schreibt NICHT MEHR BLIND auf die Wurzel.
 *
 *   diff < 0  → ueber `fefoAbbuchung`, `chargeId`-gescoped, `orte`: die Menge
 *               verschwindet dort, wo sie liegt, und die I2-Kappung greift.
 *               `chargeId` haelt die FEFO-Verteilung auf GENAU diese eine
 *               Charge fest — sonst koennte eine ANDERE, frueher ablaufende
 *               Charge desselben Artikels die Korrektur abbekommen, und das
 *               Journal wiche von der gespeicherten Position (die genau
 *               diese `chargeId` traegt) ab.
 *   diff > 0  → Gutschrift an den Ort, an dem die Charge SCHON Bestand hat:
 *               unter den Orten mit Bestand > 0 der mit der kleinsten
 *               `ortSortierung` (Gleichstand: kleinere `lagerortId`) — DIESELBE
 *               Ordnung, die FEFOs Raenge 4/5 verwenden (`domain/fefo.ts`).
 *               Hat die Charge NIRGENDS Bestand, traegt `lauf.rueckfallOrt`:
 *               beim ganzen Handlager die Wurzel — „noch nicht einsortiert"
 *               (Betreiberentscheidung des Hauptlaufs) —, bei einer Zaehlung
 *               vor einem Schrank DIESER Schrank (DRK-337). ⚠️ Der Rueckfall
 *               ist bei einer Ortszaehlung der REGELFALL, nicht die Ausnahme:
 *               `orte` ist dann einelementig, und was dort noch nicht liegt,
 *               hat auch keinen Kandidaten. Bliebe hier die Wurzel stehen,
 *               buchte jede Ortszaehlung ihren Ueberhang an den Ort, vor dem
 *               gerade NIEMAND stand.
 *
 * ⚠️ FIXRUNDE 1, BEFUND 1 — `orte` (= `handlagerOrte(tx)`) liefert BAUMORDNUNG
 * und stellt die Wurzel unbedingt voran (`domain/orte.ts`: `ergebnis.push(id)`
 * VOR dem Abstieg in die Kinder), unabhaengig von deren `sortierung`. FEFOs
 * Raenge 4/5 kennen dieses Wurzelprivileg NICHT. Heute deckungsgleich, weil
 * die Migration der Wurzel `sortierung` 0 gibt und jeder Schrank einen
 * positiven Wert — ein Schrank mit `sortierung <= 0` triebe beide Ordnungen
 * auseinander, und ein negativer wie ein positiver Diff derselben Inventur
 * waehlten dann VERSCHIEDENE Orte. Deshalb wird hier extra sortiert, statt
 * `orte.find(...)` (Baumordnung) zu verwenden.
 *
 * Vorher schrieb diese Funktion die Rohmenge direkt auf `lagerortId:
 * HANDLAGER_ID`, ohne FEFO und ohne I2-Kappung: eine Charge, die vollstaendig
 * in einem Schrank liegt, konnte den (Wurzel, Charge)-Saldo ins Minus druecken
 * — in ein Journal, das kein UPDATE und kein DELETE kennt.
 */
function bucheKorrektur(
  tx: Tx, lauf: Lauf, orte: readonly string[], stamm: Map<string, OrtStammZeile>,
  artikelId: string, chargeId: string, diff: number, bestandJeOrt: Map<string, number> | undefined,
): void {
  if (diff < 0) {
    fefoAbbuchung(tx, {
      artikelId, chargeId, menge: -diff, orte,
      quelle: lauf.quelle, kommentar: lauf.kommentar, referenz: lauf.referenz, typ: "korrektur",
    });
    return;
  }

  const bestand = bestandJeOrt ?? new Map<string, number>();
  const kandidaten = orte.filter((ort) => (bestand.get(ort) ?? 0) > 0);
  kandidaten.sort((a, b) =>
    (stamm.get(a)?.sortierung ?? 0) - (stamm.get(b)?.sortierung ?? 0) || a.localeCompare(b));
  const ziel = kandidaten[0] ?? lauf.rueckfallOrt;
  tx.insert(buchungen).values({
    id: newId(), ts: new Date(), typ: "korrektur", artikelId, chargeId, lagerortId: ziel, menge: diff,
    quelleTyp: lauf.quelle.quelleTyp, quelleId: lauf.quelle.quelleId,
    referenz: lauf.referenz, kommentar: lauf.kommentar,
  }).run();
}

/**
 * DRK-337 — der Umfang als eine Zeichenkette fuer den append-only Verlauf.
 *
 * ⚠️ DER ORTSNAME KOMMT AUS DER DATENBANK, NICHT AUS DER NUTZLAST. Kategorien
 * und Faecher sind Labels, die das Formular schickt — dort sind sie auch der
 * Wert selbst. Beim Ort schickt das Formular eine KENNUNG; der Name daneben
 * waere eine zweite, ungepruefte Behauptung ueber denselben Ort, und im
 * Verlauf stuende sie unkorrigierbar (append-only).
 *
 * `null` heisst weiterhin „vollstaendig, kein Filter": ein Lauf ueber den
 * ganzen Handlager ohne Spaltenfilter sieht im Verlauf aus wie vor DRK-337.
 */
function umfangJson(
  filter: { kategorien: string[]; faecher: string[] } | null,
  ortId: string | null,
  ortLabel: string,
): string | null {
  if (!filter && ortId === null) return null;
  return JSON.stringify({
    kategorien: filter?.kategorien ?? [],
    faecher: filter?.faecher ?? [],
    // ⚠️ OHNE ORTSWAHL FEHLEN BEIDE FELDER GANZ, statt `null` zu tragen: ein Lauf
    // ueber den ganzen Handlager schreibt damit BUCHSTABENGLEICH dieselbe
    // Zeichenkette wie vor DRK-337. `umfangAus` liest ein fehlendes Feld
    // ohnehin als `null` — Altlaeufe und neue Laeufe bleiben eine Sorte.
    //
    // ⚠️ DIE KENNUNG STEHT NEBEN DEM NAMEN, UND ZWAR WEIL DER VERLAUF
    // APPEND-ONLY IST (dritter Codex-Befund). Solange zwei Schraenke gleich
    // heissen duerfen, ist der NAME allein keine Identitaet: zwei Laeufe an
    // verschiedenen Orten stuenden als derselbe „Ort Schrank 1" da, und
    // spaeter ist das nicht mehr aufzuloesen — hier gibt es kein UPDATE.
    // Der Name bleibt trotzdem der ANGEZEIGTE Wert: er ist das, was ein Leser
    // wiedererkennt, und er ueberlebt auch das Umbenennen des Schranks.
    ...(ortId === null ? {} : { ort: ortLabel, ortId }),
  });
}

/**
 * Gleicht ausschliesslich die tatsaechlich gezaehlten Positionen gegen den
 * LIVE-Bestand AM GEZAEHLTEN ORT ab (DRK-337: ganzer Handlager ohne Angabe,
 * sonst die Wurzel allein oder ein Schrank) und speichert den Lauf mit JEDER
 * angefassten Position (DRK-299). Lauf, Positionen und Buchungen entstehen
 * atomar; die Lauf-ID ist die ID in `inventur:<id>`.
 *
 * Dieser Pfad ist bewusst von `korrekturAufLagerort` getrennt: Inventurzugang
 * ohne vorhandene Charge braucht den Herkunftshinweis `Inventur`, waehrend der
 * allgemeine Korrekturpfad `Korrektur` anlegt.
 */
export async function inventurKorrektur(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ korrigiert: number; inventurId: string }>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<{ korrigiert: number; inventurId: string }>> => {
    const geparst = InventurSchema.safeParse(eingabe);
    if (!geparst.success) {
      const feldFehler = zodFehler(geparst.error);
      return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
    }
    const v = geparst.data;
    const ortId = v.ortId ?? null;
    const inventurId = newId();
    const lauf: Lauf = {
      inventurId,
      referenz: `${INVENTUR_PRAEFIX}${inventurId}`,
      quelle: { quelleTyp: "oidc", quelleId: viewer.sub },
      kommentar: v.kommentar,
      rueckfallOrt: ortId ?? HANDLAGER_ID,
    };
    let korrigiert = 0;

    try {
      db.transaction((tx) => {
        // DRK-297, Fixrunde 1 (Befund 3) — EINMAL fuer den ganzen Lauf geladen:
        // beide haengen an keiner Position, ein Neuladen je Artikel oder je
        // Charge waere unnoetig (`better-sqlite3` ist synchron, s. Kopf von
        // `lesepfade/bestand.ts`).
        //
        // ⚠️ DRK-337 — DIESE DREI ZEILEN STEHEN JETZT VOR DEM KOPF, nicht mehr
        // dahinter: der Kopf traegt den Ortsnamen, und der kommt aus `stamm`.
        // Die alte Reihenfolge („zuerst der Kopf, die Positionen tragen einen
        // Fremdschluessel auf ihn") bleibt gewahrt — Positionen entstehen erst
        // in der Schleife darunter.
        const orte = zaehlBereich(tx, ortId);
        if (!orte) throw new InventurAbgewiesen(INVENTUR_TEXTE.ortUnbekannt);
        const stamm = ortStamm(tx);
        tx.insert(inventuren).values({
          id: inventurId, ts: new Date(), quelleTyp: lauf.quelle.quelleTyp, quelleId: lauf.quelle.quelleId,
          kommentar: v.kommentar,
          umfang: umfangJson(v.umfang ?? null, ortId, zaehlOrtLabel(ortId, stamm.get(ortId ?? "")?.name)),
        }).run();
        for (const position of v.positionen) {
          korrigiert += "ist" in position
            ? (artikelPosition(tx, lauf, orte, stamm, position) ? 1 : 0)
            : chargenPosition(tx, lauf, orte, stamm, position);
        }
      });
    } catch (e) {
      if (e instanceof InventurAbgewiesen) return { ok: false, fehler: e.message };
      // SQLite- und Infrastrukturtexte gehoeren weder ins Formular noch an den
      // Client. Erwartbare Eingabefehler wurden bereits oberhalb abgebildet.
      return { ok: false, fehler: INVENTUR_TEXTE.buchungsFehler };
    }

    revalidatePath("/m/lagerbuch/verwaltung/inventur");
    revalidatePath("/m/lagerbuch/verwaltung/inventur/verlauf");
    revalidatePath("/m/lagerbuch/verwaltung/artikel");
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true, wert: { korrigiert, inventurId } };
  });
}
