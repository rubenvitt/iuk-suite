import { eq } from "drizzle-orm";
import type { DB } from "../_db/client";
import {
  artikel,
  buchungen,
  bzGeraete,
  bzKontrollen,
  chargen,
  checks,
  fahrzeugTemplates,
  geraete,
  lagerorte,
  o2Flaschen,
  o2Messungen,
  sollPositionen,
  templatePositionen,
  tokens,
  users,
} from "../_db/schema";
import { CHARGE_OHNE_VERFALL, HANDLAGER_ID, PSEUDO_VERFALL } from "./konstanten";
import { verfallSchwellen, verfallStatus } from "./domain/verfall";
import { heuteIso } from "./zeit";
import { fefoAbbuchung, type Quelle } from "./schreibpfade/abbuchung";
import { korrekturAufLagerort } from "./schreibpfade/korrektur";
import { umlagerung } from "./schreibpfade/umlagerung";
import { setzeVerfall } from "./schreibpfade/lagerortVerfall";
import { syncFahrzeugTemplate } from "./schreibpfade/templateSync";

/**
 * LOKALE DEMODATEN FUER `lagerbuch` — genug, dass jede Oberflaeche des Moduls
 * etwas Sinnvolles zeigt und die interessanten Zustaende (Ampel gruen/gelb/rot,
 * abgelaufen, unter Mindestbestand, offener Check, ueberfaellige MTK, niedrige
 * Flasche, gesperrter Code) sichtbar sind.
 *
 * ⚠️ SIE HAENGT BEWUSST NICHT IM BOOT-PFAD. `shouldSeed()` in `core/bootstrap.ts`
 * ist `SUITE_SEED === "1" || NODE_ENV === "development"`, und `SUITE_SEED=1` ist
 * der GENERALPROBEN-Schalter — ein Boot-Seed waere damit nicht lokal-only und
 * schriebe Demodaten in eine Probe, die den echten Import nachstellt. Diese Datei
 * wird ausschliesslich von einem separaten Skript gerufen. Der Kommentar in
 * `core/bootstrap.ts`, warum lagerbuch dort keinen Seed hat, bleibt richtig.
 *
 * KEIN "use client", KEIN Icon-Import (Fallen 6 und 7).
 *
 * ⚠️ SIE OEFFNET KEINE EIGENE VERBINDUNG. `lb_falte` haengt an der Verbindung, die
 * `_db/client.ts#getDb` aufbaut (bzw. `_db/testdb.ts#migrierteTestDb` im Test);
 * eine zweite Verbindung auf dieselbe WAL-Datei waere zugleich der Sperrkonflikt
 * und eine Verbindung OHNE die Funktion.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ENTSCHEIDUNG: WELCHE ZEILEN UEBER DIE SCHREIBPFADE GEHEN — UND WELCHE NICHT
 * ────────────────────────────────────────────────────────────────────────────
 * Der Bestand dieses Moduls ist REKONSTRUKTIV: es gibt keine Mengenspalte, der
 * Rest einer Charge ist `SUM(buchungen.menge)` je (charge_id, lagerort_id)
 * (`_lib/lesepfade/bestand.ts`). Daraus folgt beides — was direkt eingefuegt
 * werden DARF und was nicht:
 *
 * DIREKT EINGEFUEGT werden Stammdaten (lagerorte, fahrzeug_templates,
 * template_positionen, artikel, chargen, geraete, bz_geraete, bz_kontrollen,
 * o2_flaschen, o2_messungen, checks, tokens, users) UND die ZUGANGS-Buchungen.
 * Fuer keine dieser Tabellen gibt es einen Schreibpfad; ein Zugang ist ausserdem
 * die einzige Buchungsart, die ihren eigenen Bestand ERZEUGT und deshalb keine
 * Vorbedingung verletzen kann. Nebenwirkung, die man nur direkt bekommt: die
 * Zugaenge tragen ZURUECKDATIERTE `ts`, damit das Journal eine Historie hat statt
 * eines einzigen Zeitstempels (`fefoAbbuchung` setzt intern `new Date()`).
 *
 * UEBER DIE SCHREIBPFADE laufen alle ABGAENGE und alle Fahrzeugbestaende:
 *   - `fefoAbbuchung`  — verteilt eine Entnahme FEFO ueber die Chargen AM ORT und
 *     kappt am dortigen Bestand. Von Hand geschriebene Abgaenge waeren die
 *     wahrscheinlichste Quelle eines NEGATIVEN Chargenrests und einer
 *     FEFO-Reihenfolge, die nicht zum Journal passt — beides typecheck-gruen.
 *   - `umlagerung`     — bucht das Ziel-Leg STRIKT aus der tatsaechlich gebuchten
 *     Verteilung (I3, Netto null) und traegt die `chargeId` mit, damit die
 *     Verfall-Provenienz im Fahrzeug erhalten bleibt. Zwei handgeschriebene Legs
 *     waeren genau die Stelle, an der Bestand aus dem Nichts entsteht.
 *   - `korrekturAufLagerort` — stellt I4 her (`bestandProLagerort === istMenge`)
 *     und waehlt bei diff > 0 die juengste Charge. Der MTW unten faehrt bewusst
 *     diesen Weg, damit der dokumentierte „geratene Charge"-Fall lokal ANSCHAUBAR
 *     ist; RTW und KTW werden ueber `umlagerung` bestueckt, damit ihre Chargen
 *     echte Verfallsdaten tragen.
 *   - `syncFahrzeugTemplate` — materialisiert `soll_positionen` MIT
 *     `template_position_id`. Direkt eingefuegte Soll-Zeilen ohne diese
 *     Verknuepfung legte der erste echte Sync ein zweites Mal an (§5.7).
 *   - `setzeVerfall`   — der einzige Monatsvalidator und der Upsert auf den
 *     Unique-Index (lagerort_id, artikel_id).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENZ — PRO ENTITAET, NICHT UEBER EIN GEMEINSAMES GATE
 * ────────────────────────────────────────────────────────────────────────────
 * Vorbild `m/feedback/_lib/seed.ts`: ein abgebrochener Lauf ergaenzt sich beim
 * naechsten Mal selbst, statt dauerhaft unvollstaendig zu bleiben.
 *
 * ⚠️ FUER DIE JOURNALSCHREIBER GENUEGT EINE FESTE ID NICHT — `fefoAbbuchung`,
 * `umlagerung` und `korrekturAufLagerort` vergeben `newId()` je Zeile. Ein
 * zweiter Lauf buchte also erneut, und `buchungen_no_delete` macht das
 * UNUMKEHRBAR. Deshalb haengt jeder dieser Bloecke an einer festen `referenz`,
 * die VORHER abgefragt wird (`journalGebucht`). `referenz` ist genau das Feld,
 * das im Bestand schon Vorgaenge klammert (`check:<id>`, `inventur:<id>`).
 *
 * ⚠️ KEIN `INSERT OR REPLACE`, KEIN UPSERT AUF `buchungen`/`bz_kontrollen`:
 * `_db/append-only.test.ts` misst, dass das bei `recursive_triggers = 0` (dem
 * Vorgabewert, den `openModuleDatabase` NICHT umstellt) still am Trigger
 * vorbeigeht.
 *
 * NICHTS WIRD GELOESCHT UND NICHTS UEBERSCHRIEBEN. Der Handlager-Lagerort kommt
 * aus Migration 0003 und wird nur benutzt.
 */

/** Der aeussere Host. `moduleForHost` trifft `<key>.localtest.me` OHNE jede Env
 *  (`core/registry.ts:175`) — die Links unten gelten also ohne `.env`-Eintrag. */
const BASIS_URL = "http://lagerbuch.localtest.me:3000";

/** Anzeigequelle der verwaltungsseitigen Buchungen. Der Dev-Login bildet
 *  `dev:${email}` als `sub` (belegt in `m/feedback/_lib/seed.ts`). */
const SEED_SUB = "dev:demo@localtest.me";
const QUELLE_OIDC: Quelle = { quelleTyp: "oidc", quelleId: SEED_SUB };

/* ── Feste Kennungen ─────────────────────────────────────────────────────── */

const LAGER_KELLER = "lo-lager-keller";
const RTW = "fz-rtw-1";
const KTW = "fz-ktw-1";
const MTW = "fz-mtw-1";

const TPL_RTW = "tpl-rtw";
const TPL_KTW = "tpl-ktw";

const CHECK_RTW = "chk-rtw1-abgeschlossen";
const CHECK_KTW = "chk-ktw1-offen";

/** ⚠️ FESTE CODES, damit lokale QR-Links und Lesezeichen stabil bleiben. Sie
 *  stehen so im Rueckgabeprotokoll. */
const CODE_HELFER = "100-100";
const CODE_RTW = "200-200";
const CODE_ARTIKEL = "300-300";
const CODE_GESPERRT = "900-900";

const A = {
  kompresse: "art-kompresse-10x10",
  mullbinde: "art-mullbinde-6",
  verbandpaeckchen: "art-verbandpaeckchen-m",
  dreiecktuch: "art-dreiecktuch",
  nacl: "art-nacl-500",
  ringer: "art-ringer-500",
  handschuh: "art-handschuh-m",
  desinfektion: "art-desinfektion-250",
  rettungsdecke: "art-rettungsdecke",
  o2maske: "art-o2-maske",
  bzstreifen: "art-bz-teststreifen",
  pflaster: "art-pflasterset",
} as const;

/* ── Zeitrechnung ────────────────────────────────────────────────────────── */

const TAG_MS = 86_400_000;

/** Ein um `tage` verschobener Zeitpunkt. */
const vor = (jetzt: Date, tage: number): Date => new Date(jetzt.getTime() - tage * TAG_MS);

/** "YYYY-MM-DD" in ZEITZONE, um `tage` verschoben — fuer `geraete.mtk_faellig`
 *  und `geraete.ablaufdatum`. Ueber `heuteIso`, nie ueber lokale Komponenten. */
const tagIso = (jetzt: Date, tage: number): string => heuteIso(new Date(jetzt.getTime() + tage * TAG_MS));

/** "YYYY-MM" in ZEITZONE, um `offset` Monate verschoben. Ueber `heuteIso`, damit
 *  die Zone dieselbe ist, gegen die `verfallStatus` spaeter rechnet. */
function monat(jetzt: Date, offset: number): string {
  const [jahr, m] = heuteIso(jetzt).split("-").map(Number);
  const gesamt = jahr * 12 + (m - 1) + offset;
  return `${Math.floor(gesamt / 12)}-${String((gesamt % 12) + 1).padStart(2, "0")}`;
}

/**
 * Die vier Verfallsmonate der Demodaten.
 *
 * ⚠️ GELB IST UEBER MONATSENDEN NICHT AN JEDEM TAG ERREICHBAR, und das ist keine
 * Nachlaessigkeit, sondern Arithmetik: das Gelb-Fenster ist
 * `(rotTage, gelbTage]`, also 25 Tage breit (31 < tage <= 56), waehrend zwei
 * aufeinanderfolgende Monatsenden 28 bis 31 Tage auseinanderliegen. Faellt das
 * naechste Monatsende auf Tag 30, liegt das uebernaechste bei 60 — das Fenster
 * wird uebersprungen. Deshalb wird gesucht statt gerechnet, und wenn nichts
 * passt, sagt das Protokoll es.
 *
 * DIE AMPELSTUFE GELB IST TROTZDEM IMMER BELEGT: `geraete.mtk_faellig`
 * (tagesgenau, Warnfenster 30 Tage), `bz_kontrollen` (Faelligkeit 31 Tage,
 * Warnfenster 5) und `o2_messungen` (35 % vom Nennfuelldruck) treffen sie
 * unabhaengig vom Kalendertag.
 */
function verfallsMonate(jetzt: Date): {
  abgelaufen: string; rot: string; gelb: string | null; gruen: string;
} {
  const schwellen = verfallSchwellen();
  let gelb: string | null = null;
  for (let offset = 1; offset <= 3 && gelb === null; offset++) {
    const kandidat = monat(jetzt, offset);
    if (verfallStatus(kandidat, schwellen, jetzt).ampel === "gelb") gelb = kandidat;
  }
  return {
    // Zwei Monate zurueck: sicher abgelaufen, unabhaengig vom Kalendertag.
    abgelaufen: monat(jetzt, -2),
    // Das Ende des LAUFENDEN Monats liegt nie mehr als 31 Tage voraus — also
    // immer rot und (bis zur letzten Sekunde) nicht abgelaufen.
    rot: monat(jetzt, 0),
    gelb,
    gruen: monat(jetzt, 14),
  };
}

/* ── Idempotenz-Helfer ───────────────────────────────────────────────────── */

/** Die bereits vorhandenen Primaerschluessel einer Tabelle. Filtert die
 *  Einfuegelisten, statt sie zu ueberschreiben. */
function vorhandeneIds(rows: { id: string }[]): Set<string> {
  return new Set(rows.map((r) => r.id));
}

/**
 * Hat dieser Vorgang schon gebucht? DAS Gate der Journalschreiber — eine feste
 * `id` genuegt hier nicht, weil die Schreibpfade ihre Zeilen-IDs selbst vergeben.
 */
function journalGebucht(db: DB, referenz: string): boolean {
  return db.select({ id: buchungen.id })
    .from(buchungen)
    .where(eq(buchungen.referenz, referenz))
    .get() !== undefined;
}

/* ── Der Seed ────────────────────────────────────────────────────────────── */

export async function seedLokalLagerbuch(db: DB): Promise<string[]> {
  const jetzt = new Date();
  const protokoll: string[] = [];
  const m = verfallsMonate(jetzt);
  /** Fuer Chargen, wenn heute kein Monatsende ins Gelb-Fenster faellt. */
  const gelbOderGruen = m.gelb ?? m.gruen;

  /* 1 ── Anzeigename fuer die verwaltungsseitigen Journalzeilen. */
  if (!vorhandeneIds(db.select({ id: users.id }).from(users).all()).has(SEED_SUB)) {
    db.insert(users).values({
      id: SEED_SUB, name: "Demo Verwaltung", email: "demo@localtest.me", lastLoginAt: jetzt,
    }).run();
  }

  /* 2 ── Vorlagen VOR Lagerorten: `lagerorte.template_id` zeigt rueckwaerts
   *      (`_db/schema.ts:39-41`), und `foreign_keys` ist ON. */
  const tplDa = vorhandeneIds(db.select({ id: fahrzeugTemplates.id }).from(fahrzeugTemplates).all());
  const neueTemplates = [
    { id: TPL_RTW, name: "RTW-Standardbeladung", aktiv: true, createdAt: vor(jetzt, 200) },
    { id: TPL_KTW, name: "KTW-Standardbeladung", aktiv: true, createdAt: vor(jetzt, 200) },
  ].filter((t) => !tplDa.has(t.id));
  for (const t of neueTemplates) db.insert(fahrzeugTemplates).values(t).run();

  /* 3 ── Artikel. */
  const artDa = vorhandeneIds(db.select({ id: artikel.id }).from(artikel).all());
  const artikelListe: {
    id: string; name: string; einheit: string; fach: string;
    mindestbestand: number; bestelltAt?: Date;
  }[] = [
    { id: A.kompresse, name: "Kompressen 10×10 cm, steril", einheit: "Pkg.", fach: "Verbandmaterial", mindestbestand: 20 },
    { id: A.mullbinde, name: "Mullbinde 6 cm", einheit: "Stk.", fach: "Verbandmaterial", mindestbestand: 30 },
    { id: A.verbandpaeckchen, name: "Verbandpäckchen mittel", einheit: "Stk.", fach: "Verbandmaterial", mindestbestand: 25 },
    { id: A.dreiecktuch, name: "Dreiecktuch", einheit: "Stk.", fach: "Verbandmaterial", mindestbestand: 20 },
    { id: A.nacl, name: "NaCl 0,9 % 500 ml", einheit: "Btl.", fach: "Infusion", mindestbestand: 10 },
    { id: A.ringer, name: "Ringer-Lactat 500 ml", einheit: "Btl.", fach: "Infusion", mindestbestand: 8 },
    { id: A.handschuh, name: "Einmalhandschuhe Gr. M", einheit: "Pkg.", fach: "Hygiene", mindestbestand: 15 },
    { id: A.desinfektion, name: "Händedesinfektion 250 ml", einheit: "Fl.", fach: "Hygiene", mindestbestand: 12 },
    { id: A.rettungsdecke, name: "Rettungsdecke gold/silber", einheit: "Stk.", fach: "Sonstiges", mindestbestand: 20 },
    { id: A.o2maske, name: "Sauerstoffmaske mit Reservoir", einheit: "Stk.", fach: "Sauerstoff", mindestbestand: 10 },
    // Bleibt unter Mindestbestand und NICHT bestellt → „unter Mindestbestand,
    // noch nicht bestellt" auf der Uebersicht und in der Bestellliste.
    { id: A.bzstreifen, name: "BZ-Teststreifen", einheit: "Dose", fach: "Diagnostik", mindestbestand: 5 },
    // Unter Mindestbestand, aber BESTELLT — der zweite Zustand der Bestellliste.
    { id: A.pflaster, name: "Pflasterset sortiert", einheit: "Pkg.", fach: "Verbandmaterial", mindestbestand: 10, bestelltAt: vor(jetzt, 5) },
  ].filter((a) => !artDa.has(a.id));
  for (const a of artikelListe) {
    db.insert(artikel).values({
      ...a, aktiv: true, bestelltAt: a.bestelltAt ?? null, createdAt: vor(jetzt, 200),
    }).run();
  }

  /* 4 ── Lagerorte. `handlager` kommt aus Migration 0003 und wird NUR benutzt. */
  const ortDa = vorhandeneIds(db.select({ id: lagerorte.id }).from(lagerorte).all());
  const orteListe = [
    { id: LAGER_KELLER, name: "Lager Keller", typ: "lager" as const, kennung: null, templateId: null },
    { id: RTW, name: "RTW 1", typ: "fahrzeug" as const, kennung: "HN-DRK-1101", templateId: TPL_RTW },
    { id: KTW, name: "KTW 1", typ: "fahrzeug" as const, kennung: "HN-DRK-1201", templateId: TPL_KTW },
    // Ohne Vorlage: individuell gepacktes Fahrzeug, Soll von Hand gepflegt.
    { id: MTW, name: "MTW 1", typ: "fahrzeug" as const, kennung: "HN-DRK-1401", templateId: null },
  ].filter((o) => !ortDa.has(o.id));
  for (const o of orteListe) db.insert(lagerorte).values({ ...o, aktiv: true }).run();

  /* 5 ── Vorlagen-Positionen. Je Artikel GENAU EINE Position — der Check
   *      gruppiert seine Ergebnisse je Artikel, nicht je Position (§5.7.1); mit
   *      einer Position je Artikel bleibt das lokal lesbar. */
  const tpDa = vorhandeneIds(db.select({ id: templatePositionen.id }).from(templatePositionen).all());
  const tpListe = [
    { id: "tp-rtw-01", templateId: TPL_RTW, fachLabel: "Fach 1 – Verbandmaterial", sort: 10, artikelId: A.kompresse, soll: 10 },
    { id: "tp-rtw-02", templateId: TPL_RTW, fachLabel: "Fach 1 – Verbandmaterial", sort: 20, artikelId: A.mullbinde, soll: 20 },
    { id: "tp-rtw-03", templateId: TPL_RTW, fachLabel: "Fach 1 – Verbandmaterial", sort: 30, artikelId: A.verbandpaeckchen, soll: 8 },
    { id: "tp-rtw-04", templateId: TPL_RTW, fachLabel: "Fach 1 – Verbandmaterial", sort: 40, artikelId: A.dreiecktuch, soll: 6 },
    { id: "tp-rtw-05", templateId: TPL_RTW, fachLabel: "Fach 2 – Infusion", sort: 10, artikelId: A.nacl, soll: 4 },
    { id: "tp-rtw-06", templateId: TPL_RTW, fachLabel: "Fach 2 – Infusion", sort: 20, artikelId: A.ringer, soll: 2 },
    { id: "tp-rtw-07", templateId: TPL_RTW, fachLabel: "Fach 3 – Hygiene", sort: 10, artikelId: A.handschuh, soll: 4 },
    { id: "tp-rtw-08", templateId: TPL_RTW, fachLabel: "Fach 3 – Hygiene", sort: 20, artikelId: A.desinfektion, soll: 2 },
    { id: "tp-rtw-09", templateId: TPL_RTW, fachLabel: "Fach 4 – Sauerstoff", sort: 10, artikelId: A.o2maske, soll: 4 },
    { id: "tp-rtw-10", templateId: TPL_RTW, fachLabel: "Fach 5 – Diagnostik", sort: 10, artikelId: A.bzstreifen, soll: 1 },
    { id: "tp-ktw-01", templateId: TPL_KTW, fachLabel: "Fach 1 – Verbandmaterial", sort: 10, artikelId: A.kompresse, soll: 6 },
    { id: "tp-ktw-02", templateId: TPL_KTW, fachLabel: "Fach 1 – Verbandmaterial", sort: 20, artikelId: A.mullbinde, soll: 10 },
    { id: "tp-ktw-03", templateId: TPL_KTW, fachLabel: "Fach 1 – Verbandmaterial", sort: 30, artikelId: A.dreiecktuch, soll: 4 },
    { id: "tp-ktw-04", templateId: TPL_KTW, fachLabel: "Fach 2 – Hygiene", sort: 10, artikelId: A.handschuh, soll: 3 },
    { id: "tp-ktw-05", templateId: TPL_KTW, fachLabel: "Fach 2 – Hygiene", sort: 20, artikelId: A.desinfektion, soll: 1 },
    { id: "tp-ktw-06", templateId: TPL_KTW, fachLabel: "Fach 3 – Sonstiges", sort: 10, artikelId: A.rettungsdecke, soll: 4 },
  ].filter((p) => !tpDa.has(p.id));
  for (const p of tpListe) db.insert(templatePositionen).values(p).run();

  /* 6 ── Soll-Positionen. RTW und KTW ueber den Vorlagen-Sync (er setzt
   *      `template_position_id`; direkt eingefuegte Zeilen legte der erste echte
   *      Sync ein zweites Mal an). Der MTW hat keine Vorlage — seine zwei Zeilen
   *      sind manuell und tragen deshalb feste IDs. */
  const syncRtw = syncFahrzeugTemplate(db, RTW);
  const syncKtw = syncFahrzeugTemplate(db, KTW);

  const spDa = vorhandeneIds(db.select({ id: sollPositionen.id }).from(sollPositionen).all());
  const spListe = [
    { id: "sp-mtw-01", fahrzeugId: MTW, fachLabel: "Materialkiste", sort: 10, artikelId: A.rettungsdecke, soll: 10 },
    { id: "sp-mtw-02", fahrzeugId: MTW, fachLabel: "Materialkiste", sort: 20, artikelId: A.handschuh, soll: 2 },
  ].filter((p) => !spDa.has(p.id));
  for (const p of spListe) {
    db.insert(sollPositionen).values({
      ...p, templatePositionId: null, ueberschrieben: false, entfernt: false,
    }).run();
  }

  /* 7 ── Chargen. Die Ampelstufen stehen im Namen der Konstanten, nicht in
   *      einem Kommentar an der Zeile. */
  const chDa = vorhandeneIds(db.select({ id: chargen.id }).from(chargen).all());
  const chargenListe = [
    { id: "ch-kompresse-alt", artikelId: A.kompresse, chargenNr: "K-2024-118", verfall: m.abgelaufen },
    { id: "ch-kompresse-bald", artikelId: A.kompresse, chargenNr: "K-2025-204", verfall: m.rot },
    { id: "ch-kompresse-gut", artikelId: A.kompresse, chargenNr: "K-2026-071", verfall: m.gruen },
    { id: "ch-mullbinde-bald", artikelId: A.mullbinde, chargenNr: "M-2025-330", verfall: gelbOderGruen },
    { id: "ch-mullbinde-gut", artikelId: A.mullbinde, chargenNr: "M-2026-012", verfall: m.gruen },
    { id: "ch-verbandpaeckchen-gut", artikelId: A.verbandpaeckchen, chargenNr: "VP-2026-004", verfall: m.gruen },
    { id: "ch-dreiecktuch-ohne", artikelId: A.dreiecktuch, chargenNr: CHARGE_OHNE_VERFALL, verfall: PSEUDO_VERFALL },
    { id: "ch-nacl-bald", artikelId: A.nacl, chargenNr: "N-2025-877", verfall: m.rot },
    { id: "ch-nacl-gut", artikelId: A.nacl, chargenNr: "N-2026-140", verfall: m.gruen },
    { id: "ch-ringer-gut", artikelId: A.ringer, chargenNr: "R-2026-055", verfall: m.gruen },
    { id: "ch-handschuh-gut", artikelId: A.handschuh, chargenNr: "H-2026-901", verfall: m.gruen },
    { id: "ch-desinfektion-bald", artikelId: A.desinfektion, chargenNr: "D-2025-660", verfall: gelbOderGruen },
    { id: "ch-rettungsdecke-ohne", artikelId: A.rettungsdecke, chargenNr: CHARGE_OHNE_VERFALL, verfall: PSEUDO_VERFALL },
    { id: "ch-o2maske-ohne", artikelId: A.o2maske, chargenNr: CHARGE_OHNE_VERFALL, verfall: PSEUDO_VERFALL },
    { id: "ch-bzstreifen-bald", artikelId: A.bzstreifen, chargenNr: "BZ-2025-018", verfall: m.rot },
    { id: "ch-pflaster-gut", artikelId: A.pflaster, chargenNr: "P-2026-233", verfall: m.gruen },
  ].filter((c) => !chDa.has(c.id));
  for (const c of chargenListe) {
    db.insert(chargen).values({ ...c, createdAt: vor(jetzt, 150) }).run();
  }

  /* 8 ── Wareneingang. DIREKT und mit FESTEN Buchungs-IDs — die einzige
   *      Buchungsart, die ihren Bestand selbst erzeugt, und die einzige
   *      Gelegenheit, das Journal ueber mehrere Monate zu strecken. */
  const zugaenge: { id: string; chargeId: string; artikelId: string; menge: number; vorTagen: number }[] = [
    { id: "bu-zg-kompresse-alt", chargeId: "ch-kompresse-alt", artikelId: A.kompresse, menge: 45, vorTagen: 140 },
    { id: "bu-zg-kompresse-bald", chargeId: "ch-kompresse-bald", artikelId: A.kompresse, menge: 40, vorTagen: 90 },
    { id: "bu-zg-kompresse-gut", chargeId: "ch-kompresse-gut", artikelId: A.kompresse, menge: 60, vorTagen: 25 },
    { id: "bu-zg-mullbinde-bald", chargeId: "ch-mullbinde-bald", artikelId: A.mullbinde, menge: 50, vorTagen: 120 },
    { id: "bu-zg-mullbinde-gut", chargeId: "ch-mullbinde-gut", artikelId: A.mullbinde, menge: 80, vorTagen: 20 },
    { id: "bu-zg-verbandpaeckchen", chargeId: "ch-verbandpaeckchen-gut", artikelId: A.verbandpaeckchen, menge: 40, vorTagen: 60 },
    { id: "bu-zg-dreiecktuch", chargeId: "ch-dreiecktuch-ohne", artikelId: A.dreiecktuch, menge: 60, vorTagen: 130 },
    { id: "bu-zg-nacl-bald", chargeId: "ch-nacl-bald", artikelId: A.nacl, menge: 12, vorTagen: 110 },
    { id: "bu-zg-nacl-gut", chargeId: "ch-nacl-gut", artikelId: A.nacl, menge: 30, vorTagen: 18 },
    { id: "bu-zg-ringer", chargeId: "ch-ringer-gut", artikelId: A.ringer, menge: 20, vorTagen: 40 },
    { id: "bu-zg-handschuh", chargeId: "ch-handschuh-gut", artikelId: A.handschuh, menge: 40, vorTagen: 35 },
    { id: "bu-zg-desinfektion", chargeId: "ch-desinfektion-bald", artikelId: A.desinfektion, menge: 18, vorTagen: 100 },
    { id: "bu-zg-rettungsdecke", chargeId: "ch-rettungsdecke-ohne", artikelId: A.rettungsdecke, menge: 80, vorTagen: 75 },
    { id: "bu-zg-o2maske", chargeId: "ch-o2maske-ohne", artikelId: A.o2maske, menge: 25, vorTagen: 55 },
    { id: "bu-zg-bzstreifen", chargeId: "ch-bzstreifen-bald", artikelId: A.bzstreifen, menge: 3, vorTagen: 95 },
    { id: "bu-zg-pflaster", chargeId: "ch-pflaster-gut", artikelId: A.pflaster, menge: 4, vorTagen: 12 },
  ];
  const buDa = vorhandeneIds(db.select({ id: buchungen.id }).from(buchungen).all());
  for (const z of zugaenge.filter((z) => !buDa.has(z.id))) {
    db.insert(buchungen).values({
      id: z.id, ts: vor(jetzt, z.vorTagen), typ: "zugang",
      artikelId: z.artikelId, chargeId: z.chargeId, lagerortId: HANDLAGER_ID,
      menge: z.menge, quelleTyp: "oidc", quelleId: SEED_SUB,
      referenz: null, kommentar: "Wareneingang (Demodaten)",
    }).run();
  }

  /* 9 ── Entnahmen aus dem Handlager — ueber `fefoAbbuchung`, damit die
   *      Verteilung ueber die Chargen die echte FEFO-Reihenfolge hat. */
  const REF_SANI = "seed:entnahme-sanitaetsdienst";
  if (!journalGebucht(db, REF_SANI)) {
    db.transaction((tx) => {
      for (const [artikelId, menge] of [
        [A.kompresse, 12], [A.mullbinde, 15], [A.handschuh, 6], [A.desinfektion, 3],
      ] as const) {
        fefoAbbuchung(tx, {
          artikelId, menge, quelle: { quelleTyp: "token", quelleId: CODE_HELFER },
          kommentar: "Sanitätsdienst Stadtfest", referenz: REF_SANI,
        });
      }
    });
  }

  const REF_UEBUNG = "seed:entnahme-uebungsdienst";
  if (!journalGebucht(db, REF_UEBUNG)) {
    db.transaction((tx) => {
      for (const [artikelId, menge] of [[A.verbandpaeckchen, 5], [A.nacl, 2]] as const) {
        fefoAbbuchung(tx, {
          artikelId, menge, quelle: QUELLE_OIDC,
          kommentar: "Übungsdienst Gruppe 2", referenz: REF_UEBUNG,
        });
      }
    });
  }

  /* 10 ── Der abgeschlossene RTW-Check. Er ist der Grund, aus dem der RTW seinen
   *       Bestand hat: erst `korrekturAufLagerort` auf die GEZAEHLTE Menge (I4),
   *       dann `umlagerung` fuer die Nachfuellung aus dem Handlager — genau die
   *       Reihenfolge aus `_actions/check.ts:212-223`. Das Ergebnis-JSON wird aus
   *       den TATSAECHLICHEN Rueckgabewerten gebaut, nicht erfunden.
   *
   *       ⚠️ Idempotenzgate ist die Referenz `check:<fester Id>`, nicht die
   *       Check-Zeile: die Buchungen entstehen VOR ihr. */
  const REF_CHECK_RTW = `check:${CHECK_RTW}`;
  const gezaehltRtw: Record<string, number> = {
    [A.kompresse]: 4, [A.mullbinde]: 8, [A.verbandpaeckchen]: 3, [A.dreiecktuch]: 6,
    [A.nacl]: 1, [A.ringer]: 2, [A.handschuh]: 2, [A.desinfektion]: 0,
    [A.o2maske]: 4, [A.bzstreifen]: 1,
  };
  const nachfuellRtw: Record<string, number> = {
    [A.kompresse]: 6, [A.mullbinde]: 6, [A.verbandpaeckchen]: 5, [A.nacl]: 3, [A.handschuh]: 2,
  };
  const checkAbgeschlossenAm = vor(jetzt, 3);

  if (!journalGebucht(db, REF_CHECK_RTW)) {
    const sollRtw = db.select().from(sollPositionen)
      .where(eq(sollPositionen.fahrzeugId, RTW)).all()
      .filter((s) => !s.entfernt);

    const quelle: Quelle = { quelleTyp: "token", quelleId: CODE_RTW };
    const artikelErgebnis: Record<string, unknown>[] = [];

    db.transaction((tx) => {
      for (const s of sollRtw) {
        const ist = gezaehltRtw[s.artikelId] ?? 0;
        const { diff } = korrekturAufLagerort(tx, {
          artikelId: s.artikelId, lagerortId: RTW, istMenge: ist,
          quelle, kommentar: "Fahrzeug-Check Abgleich", referenz: REF_CHECK_RTW,
        });
        const gewuenscht = nachfuellRtw[s.artikelId] ?? 0;
        const gebucht = gewuenscht > 0
          ? umlagerung(tx, {
              artikelId: s.artikelId, menge: gewuenscht,
              vonLagerortId: HANDLAGER_ID, nachLagerortId: RTW,
              quelle, kommentar: "Fahrzeug-Check Nachfüllung", referenz: REF_CHECK_RTW,
            }).umgelagert
          : 0;
        artikelErgebnis.push({
          artikelId: s.artikelId, positionen: 1, sollSumme: s.soll, istSumme: ist,
          recordedVorher: ist - diff, korrektur: diff,
          nachfuellGewuenscht: gewuenscht, nachfuellGebucht: gebucht,
        });
      }

      /* Der im Fahrzeug GEMELDETE Verfall — die Kompensation aus §4.11. Sie ist
       * kein Beiwerk: weil `korrekturAufLagerort` die Charge raet, ist „wann
       * laeuft das Zeug im RTW ab?" ueber Chargen NICHT beantwortbar. */
      setzeVerfall(tx, { lagerortId: RTW, artikelId: A.kompresse, verfall: m.rot, quelle, jetzt: checkAbgeschlossenAm });
      setzeVerfall(tx, { lagerortId: RTW, artikelId: A.nacl, verfall: gelbOderGruen, quelle, jetzt: checkAbgeschlossenAm });
      setzeVerfall(tx, { lagerortId: RTW, artikelId: A.mullbinde, verfall: m.gruen, quelle, jetzt: checkAbgeschlossenAm });

      tx.insert(checks).values({
        id: CHECK_RTW, fahrzeugId: RTW, quelleTyp: "token", quelleId: CODE_RTW,
        startedAt: new Date(checkAbgeschlossenAm.getTime() - 1_500_000),
        completedAt: checkAbgeschlossenAm,
        // Feldnamen und `version: 2` wie `_actions/check.ts:322-329` — sie sind
        // Vertrag; ein umbenanntes Feld macht jede Auswertung stumm 0 (§4.10).
        ergebnis: JSON.stringify({
          version: 2,
          positionen: sollRtw.map((s) => ({
            sollPositionId: s.id, artikelId: s.artikelId, soll: s.soll,
            ist: gezaehltRtw[s.artikelId] ?? 0,
          })),
          artikel: artikelErgebnis,
          geraete: [
            { geraetId: "ger-defi-rtw1", vorhanden: true, zustand: "In Ordnung", bemerkung: null },
            { geraetId: "ger-absaug-rtw1", vorhanden: true, zustand: "Gebrauchsspuren", bemerkung: "Saugleistung prüfen" },
          ],
          flaschen: [
            { flascheId: "o2-rtw1-a", druckBar: 70, nennfuelldruckBar: 200 },
            { flascheId: "o2-rtw1-b", druckBar: 40, nennfuelldruckBar: 200 },
          ],
          verfall: [
            { artikelId: A.kompresse, verfall: m.rot, ampel: "rot", abgelaufen: false },
            { artikelId: A.nacl, verfall: gelbOderGruen, ampel: m.gelb ? "gelb" : "gruen", abgelaufen: false },
            { artikelId: A.mullbinde, verfall: m.gruen, ampel: "gruen", abgelaufen: false },
          ],
        }),
      }).run();
    });
  }

  /* 11 ── KTW: vollstaendig bestueckt ueber `umlagerung` (keine geratene Charge,
   *        die Verfalls-Provenienz wandert mit) — und ein OFFENER Check dazu.
   *        Offene Checks erzeugt `check.ts` heute nie, das Schema sieht die
   *        Bauform aber ausdruecklich vor (`completed_at IS NULL`, §4.4). */
  const REF_KTW = "seed:nachfuellung-ktw1";
  if (!journalGebucht(db, REF_KTW)) {
    db.transaction((tx) => {
      for (const [artikelId, menge] of [
        [A.kompresse, 6], [A.mullbinde, 10], [A.dreiecktuch, 4],
        [A.handschuh, 3], [A.desinfektion, 1], [A.rettungsdecke, 4],
      ] as const) {
        umlagerung(tx, {
          artikelId, menge, vonLagerortId: HANDLAGER_ID, nachLagerortId: KTW,
          quelle: QUELLE_OIDC, kommentar: "Erstbestückung KTW 1", referenz: REF_KTW,
        });
      }
      setzeVerfall(tx, { lagerortId: KTW, artikelId: A.mullbinde, verfall: gelbOderGruen, quelle: QUELLE_OIDC, jetzt });
    });
  }
  if (db.select({ id: checks.id }).from(checks).where(eq(checks.id, CHECK_KTW)).get() === undefined) {
    db.insert(checks).values({
      id: CHECK_KTW, fahrzeugId: KTW, quelleTyp: "token", quelleId: CODE_HELFER,
      startedAt: new Date(jetzt.getTime() - 3_600_000), completedAt: null, ergebnis: null,
    }).run();
  }

  /* 12 ── MTW: individuell gepackt, Bestand ueber `korrekturAufLagerort`.
   *        BEWUSST dieser Weg — er ist die eine Stelle, an der die Charge
   *        GERATEN wird (§5.3.3), und lokal soll dieser Fall anschaubar sein:
   *        der MTW-Bestand haengt an der juengsten Charge des Artikels, nicht an
   *        einer, die je im Fahrzeug lag. Deshalb steht daneben eine eigene
   *        `lagerort_verfall`-Meldung. */
  const REF_MTW = "seed:inventur-mtw1";
  if (!journalGebucht(db, REF_MTW)) {
    db.transaction((tx) => {
      korrekturAufLagerort(tx, {
        artikelId: A.rettungsdecke, lagerortId: MTW, istMenge: 7,
        quelle: QUELLE_OIDC, kommentar: "Bestandsaufnahme MTW", referenz: REF_MTW,
      });
      korrekturAufLagerort(tx, {
        artikelId: A.handschuh, lagerortId: MTW, istMenge: 2,
        quelle: QUELLE_OIDC, kommentar: "Bestandsaufnahme MTW", referenz: REF_MTW,
      });
      setzeVerfall(tx, { lagerortId: MTW, artikelId: A.rettungsdecke, verfall: m.gruen, quelle: QUELLE_OIDC, jetzt });
    });
  }

  /* 13 ── Geraete: je eine Zeile fuer rot (ueberfaellig), gelb (im Warnfenster),
   *        gruen und GRAU (kein Datum gepflegt → `keinDatum`, kein Fehlalarm). */
  const gerDa = vorhandeneIds(db.select({ id: geraete.id }).from(geraete).all());
  const geraeteListe = [
    { id: "ger-defi-rtw1", typ: "medizin" as const, barcode: "4012345678901", name: "AED LIFEPAK CR2", lagerortId: RTW, anmerkung: null, mtkFaellig: tagIso(jetzt, 18), beschreibung: null, ablaufdatum: null },
    { id: "ger-absaug-rtw1", typ: "medizin" as const, barcode: "4012345678918", name: "Absaugpumpe ACCUVAC Rescue", lagerortId: RTW, anmerkung: "Saugleistung beim letzten Check auffällig", mtkFaellig: tagIso(jetzt, -12), beschreibung: null, ablaufdatum: null },
    { id: "ger-beatmung-ktw1", typ: "medizin" as const, barcode: "4012345678925", name: "Beatmungsbeutel-Set Erwachsene", lagerortId: KTW, anmerkung: null, mtkFaellig: tagIso(jetzt, 210), beschreibung: null, ablaufdatum: null },
    { id: "ger-funk-mtw1", typ: "objekt" as const, barcode: "4012345678932", name: "Handfunkgerät HRT", lagerortId: MTW, anmerkung: null, mtkFaellig: null, beschreibung: "Digitalfunk, Akku im Ladeschacht", ablaufdatum: null },
    { id: "ger-warnwesten-lager", typ: "objekt" as const, barcode: null, name: "Warnwesten-Satz (6 Stk.)", lagerortId: LAGER_KELLER, anmerkung: null, mtkFaellig: null, beschreibung: "EN ISO 20471, Klasse 2", ablaufdatum: tagIso(jetzt, 25) },
  ].filter((g) => !gerDa.has(g.id));
  for (const g of geraeteListe) {
    db.insert(geraete).values({ ...g, aktiv: true, createdAt: vor(jetzt, 180) }).run();
  }

  /* 14 ── BZ-Geraete. Das KTW-Geraet ist NIE GEPRUEFT — `bzFaelligkeit` liefert
   *        dafuer `ampel: "rot"` bei `ueberfaellig: false`, die Falle aus §5.11. */
  const bzDa = vorhandeneIds(db.select({ id: bzGeraete.id }).from(bzGeraete).all());
  const bzListe = [
    {
      id: "bz-rtw1", barcode: "4015630000018", name: "Accu-Chek Guide (RTW 1)", lagerortId: RTW,
      streifenLot: "L-2026-0815", level1Label: "Kontrolle 1 (niedrig)", level1Min: 40, level1Max: 70,
      level2Label: "Kontrolle 2 (hoch)", level2Min: 250, level2Max: 350,
    },
    {
      id: "bz-ktw1", barcode: "4015630000025", name: "Accu-Chek Guide (KTW 1)", lagerortId: KTW,
      streifenLot: null, level1Label: "Kontrolle 1 (niedrig)", level1Min: 40, level1Max: 70,
      level2Label: "Kontrolle 2 (hoch)", level2Min: 250, level2Max: 350,
    },
  ].filter((b) => !bzDa.has(b.id));
  for (const b of bzListe) {
    db.insert(bzGeraete).values({ ...b, aktiv: true, createdAt: vor(jetzt, 180) }).run();
  }

  /* 15 ── BZ-Kontrollen. APPEND-ONLY: Trigger sperren UPDATE und DELETE, also
   *        wird VORHER gefragt und nie mit `INSERT OR REPLACE` gearbeitet
   *        (der laeuft bei `recursive_triggers = 0` still am Trigger vorbei,
   *        gemessen in `_db/append-only.test.ts`).
   *
   *        Die letzte Kontrolle liegt 27 Tage zurueck → faellig in 4 Tagen →
   *        GELB (Intervall 31 Tage, Warnfenster 5). */
  const bzkDa = vorhandeneIds(db.select({ id: bzKontrollen.id }).from(bzKontrollen).all());
  const refSnapshotRtw = JSON.stringify({
    // ⚠️ SIEBEN SCHLUESSEL IN DIESER REIHENFOLGE (`_db/schema.ts:318-323`).
    streifenLot: "L-2026-0815",
    level1Label: "Kontrolle 1 (niedrig)", level1Min: 40, level1Max: 70,
    level2Label: "Kontrolle 2 (hoch)", level2Min: 250, level2Max: 350,
  });
  const bzkListe = [
    {
      id: "bzk-rtw1-01", geraetId: "bz-rtw1", ts: vor(jetzt, 58),
      level1Wert: 52, level1ImBereich: true, level2Wert: 298, level2ImBereich: true,
      sticks: 50, lanzetten: 100, batterieGewechselt: false,
      kommentar: null, bestanden: true,
    },
    {
      id: "bzk-rtw1-02", geraetId: "bz-rtw1", ts: vor(jetzt, 27),
      level1Wert: 58, level1ImBereich: true, level2Wert: 361, level2ImBereich: false,
      sticks: 42, lanzetten: 88, batterieGewechselt: true,
      kommentar: "Level 2 außerhalb — Streifen neu kalibriert, Wiederholung folgt.",
      bestanden: false,
    },
  ].filter((k) => !bzkDa.has(k.id));
  for (const k of bzkListe) {
    db.insert(bzKontrollen).values({
      ...k, quelleTyp: "oidc", quelleId: SEED_SUB,
      kompresseVerfall: m.gruen, refSnapshot: refSnapshotRtw,
    }).run();
  }

  /* 16 ── Sauerstoff. Nennfuelldruck 200 bar; die Messungen unten treffen
   *        gruen (90 %), gelb (35 %) und rot (20 %). */
  const flDa = vorhandeneIds(db.select({ id: o2Flaschen.id }).from(o2Flaschen).all());
  const flaschenListe = [
    { id: "o2-rtw1-a", name: "O₂ 2 l (RTW 1, Tragetasche)", lagerortId: RTW, groesseLiter: 2 },
    { id: "o2-rtw1-b", name: "O₂ 10 l (RTW 1, Halterung)", lagerortId: RTW, groesseLiter: 10 },
    { id: "o2-ktw1-a", name: "O₂ 2 l (KTW 1)", lagerortId: KTW, groesseLiter: 2 },
    { id: "o2-lager-01", name: "O₂ 10 l (Reserve Keller)", lagerortId: LAGER_KELLER, groesseLiter: 10 },
  ].filter((f) => !flDa.has(f.id));
  for (const f of flaschenListe) {
    db.insert(o2Flaschen).values({
      ...f, nennfuelldruckBar: 200, aktiv: true, createdAt: vor(jetzt, 190),
    }).run();
  }

  const msDa = vorhandeneIds(db.select({ id: o2Messungen.id }).from(o2Messungen).all());
  const messungenListe = [
    { id: "o2m-rtw1-a-01", flascheId: "o2-rtw1-a", ts: vor(jetzt, 20), druckBar: 180, kommentar: "Routineprüfung" },
    { id: "o2m-rtw1-a-02", flascheId: "o2-rtw1-a", ts: checkAbgeschlossenAm, druckBar: 70, kommentar: `Fahrzeug-Check ${REF_CHECK_RTW}` },
    { id: "o2m-rtw1-b-01", flascheId: "o2-rtw1-b", ts: checkAbgeschlossenAm, druckBar: 40, kommentar: `Fahrzeug-Check ${REF_CHECK_RTW}` },
    { id: "o2m-ktw1-a-01", flascheId: "o2-ktw1-a", ts: vor(jetzt, 5), druckBar: 190, kommentar: null },
    { id: "o2m-lager-01-01", flascheId: "o2-lager-01", ts: vor(jetzt, 30), druckBar: 200, kommentar: "Neu gefüllt" },
  ].filter((x) => !msDa.has(x.id));
  for (const x of messungenListe) {
    db.insert(o2Messungen).values({ ...x, quelleTyp: "oidc", quelleId: SEED_SUB }).run();
  }

  /* 17 ── Zugangs-Codes. FESTE Codes — sie stehen im Protokoll und auf
   *        laminierten Kaertchen. `aktiv` wird NICHT pauschal gesetzt: der
   *        gesperrte Code ist der einzige Widerruf, den es gibt. */
  const tkDa = vorhandeneIds(db.select({ id: tokens.id }).from(tokens).all());
  const tokenListe = [
    { id: "tok-helfer", code: CODE_HELFER, label: "Helfer Bereitschaft (Demo)", zielTyp: null, zielId: null, aktiv: true, lastUsedAt: vor(jetzt, 2) },
    { id: "tok-rtw1", code: CODE_RTW, label: "RTW 1 – Fahrzeug-Check", zielTyp: "fahrzeug" as const, zielId: RTW, aktiv: true, lastUsedAt: checkAbgeschlossenAm },
    { id: "tok-kompresse", code: CODE_ARTIKEL, label: "Regaletikett Kompressen 10×10", zielTyp: "artikel" as const, zielId: A.kompresse, aktiv: true, lastUsedAt: null },
    { id: "tok-gesperrt", code: CODE_GESPERRT, label: "Verlorenes Kärtchen (gesperrt)", zielTyp: null, zielId: null, aktiv: false, lastUsedAt: vor(jetzt, 60) },
  ].filter((t) => !tkDa.has(t.id));
  for (const t of tokenListe) {
    db.insert(tokens).values({
      ...t, scopeLagerortId: null, createdAt: vor(jetzt, 90), createdBy: SEED_SUB,
    }).run();
  }

  /* 18 ── Protokoll. */
  protokoll.push(
    `lagerbuch: Demodaten geprüft/ergänzt (Stand ${heuteIso(jetzt)}).`,
    `Stammdaten: ${orteListe.length} Lagerorte, ${neueTemplates.length} Vorlagen, ` +
      `${tpListe.length} Vorlagen-Positionen, ${artikelListe.length} Artikel, ` +
      `${chargenListe.length} Chargen, ${zugaenge.filter((z) => !buDa.has(z.id)).length} Wareneingänge neu.`,
    `Soll-Positionen: RTW +${syncRtw.hinzugefuegt}/~${syncRtw.aktualisiert}, ` +
      `KTW +${syncKtw.hinzugefuegt}/~${syncKtw.aktualisiert}, MTW ${spListe.length} manuell neu.`,
    `Ausstattung: ${geraeteListe.length} Geräte, ${bzListe.length} BZ-Geräte, ` +
      `${bzkListe.length} BZ-Kontrollen, ${flaschenListe.length} O₂-Flaschen, ` +
      `${messungenListe.length} O₂-Messungen, ${tokenListe.length} Zugangs-Codes neu.`,
    "",
    "Verfallsampel — belegte Stufen:",
    `  abgelaufen  Chargen mit Verfall ${m.abgelaufen} (Kompressen, Handlager)`,
    `  rot         Chargen mit Verfall ${m.rot} (Kompressen, NaCl, BZ-Teststreifen)`,
    m.gelb
      ? `  gelb        Chargen mit Verfall ${m.gelb} (Mullbinde, Händedesinfektion)`
      : "  gelb        über Monatsenden heute NICHT erreichbar (das Gelb-Fenster ist " +
        "25 Tage breit, zwei Monatsenden liegen 28–31 Tage auseinander) — " +
        "gelb zeigen stattdessen AED-MTK, BZ-Kontrolle und O₂-Flasche 2 l",
    `  grün        Chargen mit Verfall ${m.gruen}; „ohne Verfall" = ${PSEUDO_VERFALL}`,
    `  Gerät rot   Absaugpumpe RTW 1, MTK seit ${tagIso(jetzt, -12)} überfällig`,
    `  Gerät gelb  AED RTW 1, MTK am ${tagIso(jetzt, 18)}`,
    `  Gerät grau  Handfunkgerät MTW 1 (kein Datum gepflegt)`,
    "  O₂ rot/gelb/grün  10 l RTW 1 (20 %), 2 l RTW 1 (35 %), 2 l KTW 1 (95 %)",
    "",
    `Feste Zugangs-Codes (Gate-Eingabe UND QR-Nutzlast):`,
    `  ${CODE_HELFER}  Helfer allgemein → Artikel-Liste`,
    `  ${CODE_RTW}  RTW 1 → Fahrzeug-Check, vorausgewählt`,
    `  ${CODE_ARTIKEL}  Regaletikett Kompressen → Artikel-Detail`,
    `  ${CODE_GESPERRT}  gesperrt (aktiv = false) — muss abgewiesen werden`,
    "",
    "Lokale Adressen (äußere Pfadform auf dem Modul-Host):",
    `  ${BASIS_URL}/                      Gate (Code eintippen)`,
    `  ${BASIS_URL}/t/${CODE_HELFER}               Code einlösen (QR-Weg)`,
    `  ${BASIS_URL}/t/${CODE_RTW}               Code einlösen → RTW-Check`,
    `  ${BASIS_URL}/a/${A.kompresse}   Artikel-Detail`,
    `  ${BASIS_URL}/helfer                Helfer-Startseite (nach Einlösung)`,
    `  ${BASIS_URL}/verwaltung            Übersicht mit Kennzahlen`,
    `  ${BASIS_URL}/verwaltung/artikel`,
    `  ${BASIS_URL}/verwaltung/verfall`,
    `  ${BASIS_URL}/verwaltung/fahrzeuge`,
    `  ${BASIS_URL}/verwaltung/vorlagen`,
    `  ${BASIS_URL}/verwaltung/checks     ein abgeschlossener, ein offener Check`,
    `  ${BASIS_URL}/verwaltung/bz`,
    `  ${BASIS_URL}/verwaltung/sauerstoff`,
    `  ${BASIS_URL}/verwaltung/geraete`,
    `  ${BASIS_URL}/verwaltung/bestellung`,
    `  ${BASIS_URL}/verwaltung/inventur`,
    `  ${BASIS_URL}/verwaltung/journal`,
    `  ${BASIS_URL}/verwaltung/tokens`,
    `  ${BASIS_URL}/verwaltung/etiketten          Bogen mit QR und Klartext-Codes`,
    `  ${BASIS_URL}/g/4012345678901               Geraete-Barcode → Geraete-Detail`,
    `  ${BASIS_URL}/g/4015630000018               Geraete-Barcode → BZ-Detail`,
    "",
    "⚠️ /g/<barcode> und /t/<code> sind ZWEI Namensraeume und nicht austauschbar: " +
      "/t/ nimmt den sechsstelligen Zugangs-Code (denselben, den das Gate auf der " +
      "Modulwurzel entgegennimmt), /g/ den Barcode vom Typenschild eines Geraets. " +
      "Ein unbekannter Barcode antwortet mit 200 und nennt den gescannten Code, " +
      "nicht mit 404 (Entscheidung 8-C2).",
  );

  return protokoll;
}
