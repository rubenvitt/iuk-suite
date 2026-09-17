import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  artikel, buchungen, bzGeraete, chargen, checks, geraete, lagerorte,
  lagerortVerfall, o2Flaschen, sollPositionen, tokens,
} from "../_db/schema";
import { seedLokalLagerbuch } from "./seedLokal";
import { ENTNAHMEBOX_ID, HANDLAGER_ID, PSEUDO_VERFALL } from "./konstanten";
import { ENTNAHMEBOX_PRAEFIX } from "./vorgang";
import { verfallSchwellen, verfallStatus } from "./domain/verfall";
import { mtkFaelligkeit } from "./domain/geraet";
import { bzFaelligkeit } from "./domain/bz";
import { o2Status } from "./domain/o2";
import { restJeChargeImBereich } from "./lesepfade/bestand";
import { handlagerOrte } from "./lesepfade/orte";
import { syncFahrzeugTemplate } from "./schreibpfade/templateSync";
import { parseCheckErgebnis } from "./checkErgebnis";
import { heuteIso } from "./zeit";
import { and, eq } from "drizzle-orm";

/**
 * ZWEI FRAGEN, DIE DIESER TEST BEANTWORTEN MUSS — und eine, die er NICHT stellt.
 *
 * 1. IST DER ERZEUGTE BESTAND FACHLICH KONSISTENT? Der Bestand dieses Moduls ist
 *    rekonstruktiv; ein Seed kann typecheck-gruen Zeilen anlegen, aus denen ein
 *    NEGATIVER Chargenrest, eine Umlagerung mit Netto ungleich null oder eine
 *    Buchung auf die Charge eines FREMDEN Artikels folgt (I5 — dafuer gibt es
 *    keinen Fremdschluessel, `buchungen` haelt zwei getrennte FKs). Genau diese
 *    drei Eigenschaften werden unten einzeln behauptet.
 *
 * 2. IST DER ZWEITE LAUF WIRKLICH FOLGENLOS? Die Behauptung ist PRO TABELLE, nicht
 *    ueber eine Gesamtsumme: eine Summe bliebe gleich, wenn eine Tabelle
 *    Zeilen verloere und eine andere welche gewaenne. Und sie ist scharf, weil
 *    `buchungen` append-only ist — ein doppelter Lauf waere gegen `.data/`
 *    UNUMKEHRBAR.
 *
 * NICHT GESTELLT: die Frage nach festen Zeilenzahlen. Ein Test, der „16 Chargen"
 * behauptet, bricht bei jeder inhaltlichen Ergaenzung des Seeds, ohne je einen
 * Fehler gefunden zu haben.
 *
 * ⚠️ DIE UHR LAEUFT MIT. Der Seed rechnet seine Verfallsmonate gegen `new Date()`,
 * und die Ampelstufe GELB ist ueber Monatsenden nicht an jedem Kalendertag
 * erreichbar (das Fenster ist 25 Tage breit, zwei Monatsenden liegen 28–31 Tage
 * auseinander). Der Test rechnet die Erreichbarkeit deshalb SELBST aus —
 * mit `verfallStatus`, also der Spezifikation — statt einen Monat zu verdrahten.
 */

const TABELLEN = [
  "lagerorte", "fahrzeug_templates", "template_positionen", "artikel", "chargen",
  "soll_positionen", "geraete", "buchungen", "checks", "lagerort_verfall",
  "bz_geraete", "bz_kontrollen", "o2_flaschen", "o2_messungen", "tokens", "users",
] as const;

let t: TestDb;

function zeilenzahlen(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tab of TABELLEN) {
    out[tab] = (t.sqlite.prepare(`select count(*) as n from ${tab}`).get() as { n: number }).n;
  }
  return out;
}

/** Ist heute ueberhaupt ein Monatsende im Gelb-Fenster? Dieselbe Rechnung wie im
 *  Seed, aber unabhaengig formuliert: Kandidaten bilden, `verfallStatus` fragen. */
function gelbUeberMonatsendeErreichbar(jetzt: Date): boolean {
  const schwellen = verfallSchwellen();
  const [jahr, monat] = heuteIso(jetzt).split("-").map(Number);
  for (let offset = 1; offset <= 3; offset++) {
    const gesamt = jahr * 12 + (monat - 1) + offset;
    const kandidat = `${Math.floor(gesamt / 12)}-${String((gesamt % 12) + 1).padStart(2, "0")}`;
    if (verfallStatus(kandidat, schwellen, jetzt).ampel === "gelb") return true;
  }
  return false;
}

beforeEach(() => { t = migrierteTestDb("lagerbuch-seed-"); });
afterEach(() => { t.schliessen(); });

/**
 * ⏱ WARUM DIESE SUITE 20 SEKUNDEN BEKOMMT UND NICHT DIE VORGABE VON FUENF.
 *
 * Jeder der 15 Faelle ruft `seedLokalLagerbuch` VOLLSTAENDIG — das ist die
 * Bedingung, unter der die zwei schaerfsten Zusagen der Datei ueberhaupt etwas
 * behaupten: „ist idempotent" und „ergaenzt nach einem abgebrochenen Lauf nur
 * das Fehlende" brauchen beide eine JUNGFRAEULICHE Datenbank. Eine geteilte,
 * einmal geseedete DB waere schneller und wuerde beide Zusagen inhaltsleer
 * machen. Die Laufzeit ist hier also sachlich begruendet und nicht verschwendet.
 *
 * Der Seed schreibt in 16 Tabellen, und er tut es zu grossen Teilen mit
 * einzelnen `.run()`-Aufrufen (`seedLokal.ts`; nur die Schreibpfade um Zeile
 * 392/406/443/509/537 klammern selbst). Jeder davon ist ein eigener Commit.
 *
 * ⚠️ NACHTRAG: `_db/testdb.ts` setzt inzwischen `journal_mode = WAL` und
 * `synchronous = NORMAL` (dort Punkt 4 des Kopfkommentars, mit der Messung).
 * Damit kostet ein Einzel-Commit lokal 0,009 ms statt 0,254 ms, und diese Datei
 * faellt einzeln von 619 ms auf 225 ms — Faktor 2,7. DER TIMEOUT BLEIBT
 * TROTZDEM: der Gewinn ist lokal gemessen, die Grenze reisst in der CI, und die
 * dortige Zahl war ABGESCHNITTEN (siehe unten). Wer ihn entfernen will, braucht
 * dafuer einen CI-Lauf mit WAL, der die echte Rumpfdauer zeigt.
 *
 * GEMESSEN (PR #80, Lauf 33090214227, `ubuntu-24.04`):
 *   – ein Fall lokal unter voller Suitenlast: 57 ms; einzeln 61 ms; auf `main`
 *     einzeln 54 ms (eigener Worktree — die Datei ist dort byte-identisch)
 *   – diese Datei in der CI: 39 493 ms auf 15 Faelle, also ~2 630 ms je Fall,
 *     EINSCHLIESSLICH der `beforeEach`-Hooks
 *   – Faktor dieser Datei CI/lokal: 41, waehrend die GANZE Suite bei 4 liegt
 *     (lokal 170 s, CI 686 s). Der Runner ist nicht gleichmaessig langsamer:
 *     Dateien mit einer Datei-SQLite je Test liegen bei 30–125, reine Rechen-
 *     und jsdom-Dateien bei 1,5–7.
 *
 * ⚠️ WIE GROSSZUEGIG SIND 20 SEKUNDEN WIRKLICH? Ehrlicherweise: unbekannt nach
 * oben. „hat einen abgeschlossenen und einen offenen Check" wurde in der CI bei
 * 5 000 ms ABGEBROCHEN — die echte Rumpfdauer ist damit nicht gemessen, sondern
 * nur nach unten begrenzt. Sie kann 6 s gewesen sein oder 15 s. 20 000 ms sind
 * das Vierfache dieser ABBRUCHGRENZE, nicht das Vierfache eines Endwertes.
 * Gegen den einzigen vollstaendig gemessenen Bezugspunkt — ~2 630 ms je Fall
 * im Dateidurchschnitt — sind es rund das Achtfache. Wer die Zahl spaeter
 * pruefen will, braucht dafuer einen CI-Lauf, der NICHT abbricht.
 * ⛔ Die Zahl gilt NUR fuer diese Suite. Der globale `testTimeout` bleibt bei 5 s;
 * er heraufzusetzen wuerde jeden kuenftigen Fall derselben Art verdecken.
 */
describe("seedLokalLagerbuch", { timeout: 20_000 }, () => {
  it("fuellt jede Fachtabelle des Moduls", async () => {
    const protokoll = await seedLokalLagerbuch(t.db);

    expect(protokoll.length).toBeGreaterThan(0);
    for (const [tabelle, n] of Object.entries(zeilenzahlen())) {
      expect(n, `Tabelle ${tabelle} ist leer geblieben`).toBeGreaterThan(0);
    }
  });

  it("laesst die Handlager-Zeile aus Migration 0003 unangetastet", async () => {
    await seedLokalLagerbuch(t.db);

    const handlager = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, HANDLAGER_ID)).all();
    expect(handlager).toHaveLength(1);
    expect(handlager[0].name).toBe("Handlager");
    expect(handlager[0].typ).toBe("lager");
  });

  it("erzeugt nirgends einen negativen Bestand je (Lagerort, Charge)", async () => {
    await seedLokalLagerbuch(t.db);

    const zeilen = t.sqlite.prepare(
      "select lagerort_id, charge_id, sum(menge) as summe from buchungen group by 1, 2",
    ).all() as { lagerort_id: string; charge_id: string; summe: number }[];

    expect(zeilen.length).toBeGreaterThan(0);
    for (const z of zeilen) {
      expect(z.summe, `${z.lagerort_id}/${z.charge_id}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("haelt I5: jede Buchung liegt auf einer Charge IHRES Artikels", async () => {
    await seedLokalLagerbuch(t.db);

    // Kein Fremdschluessel deckt das ab — `buchungen` fuehrt artikel_id und
    // charge_id unabhaengig. Eine Fehlpaarung ergaebe Phantombestand, den FEFO
    // nie findet (`_actions/buchung.ts:103-106`).
    const fehlpaarungen = t.sqlite.prepare(
      "select count(*) as n from buchungen b join chargen c on c.id = b.charge_id" +
      " where c.artikel_id <> b.artikel_id",
    ).get() as { n: number };
    expect(fehlpaarungen.n).toBe(0);
  });

  it("haelt I3: jede Umlagerung ist je Vorgang netto null", async () => {
    await seedLokalLagerbuch(t.db);

    const jeReferenz = t.sqlite.prepare(
      "select referenz, sum(menge) as summe from buchungen" +
      " where typ = 'umlagerung' group by referenz",
    ).all() as { referenz: string; summe: number }[];

    expect(jeReferenz.length).toBeGreaterThan(0);
    for (const z of jeReferenz) expect(z.summe, z.referenz).toBe(0);
  });

  it("belegt die Verfallsampel ueber die Chargen im Handlager", async () => {
    const jetzt = new Date();
    await seedLokalLagerbuch(t.db);

    const schwellen = verfallSchwellen();
    const rest = restJeChargeImBereich(t.db, handlagerOrte(t.db));
    const stufen = t.db.select().from(chargen).all()
      .filter((c) => (rest.get(c.id) ?? 0) > 0)
      .map((c) => {
        const s = verfallStatus(c.verfall, schwellen, jetzt);
        return s.abgelaufen ? "abgelaufen" : s.ampel;
      });

    expect(stufen).toContain("abgelaufen");
    expect(stufen).toContain("rot");
    expect(stufen).toContain("gruen");
    // Nur behaupten, was heute ueber Monatsenden ueberhaupt erreichbar ist.
    if (gelbUeberMonatsendeErreichbar(jetzt)) expect(stufen).toContain("gelb");

    // Der Sentinel „kein Verfall" ist eigenstaendig belegt — er ist gruen, aber
    // eine andere Aussage.
    const ohneVerfall = t.db.select().from(chargen).all()
      .filter((c) => c.verfall === PSEUDO_VERFALL);
    expect(ohneVerfall.length).toBeGreaterThan(0);
  });

  it("belegt GELB kalendertagsunabhaengig ueber Geraet, BZ-Kontrolle und Flasche", async () => {
    const jetzt = new Date();
    await seedLokalLagerbuch(t.db);

    // Geraet: tagesgenaues Datum, Warnfenster 30 Tage.
    const geraeteAmpeln = t.db.select().from(geraete).all()
      .filter((g) => g.typ === "medizin")
      .map((g) => mtkFaelligkeit(g.mtkFaellig, jetzt).ampel);
    expect(geraeteAmpeln).toContain("gelb");
    expect(geraeteAmpeln).toContain("rot");
    expect(geraeteAmpeln).toContain("gruen");

    // BZ: letzte Kontrolle 27 Tage her → faellig in 4 → gelb (Fenster 5 Tage).
    const letzte = t.sqlite.prepare(
      "select geraet_id, max(ts) as ts from bz_kontrollen group by geraet_id",
    ).all() as { geraet_id: string; ts: number }[];
    expect(letzte.length).toBeGreaterThan(0);
    const bzAmpeln = letzte.map((k) => bzFaelligkeit(new Date(k.ts * 1000), jetzt).ampel);
    expect(bzAmpeln).toContain("gelb");

    // Ein BZ-Geraet ohne jede Kontrolle → rot bei ueberfaellig: false (§5.11).
    const ohneKontrolle = t.sqlite.prepare(
      "select count(*) as n from bz_geraete g" +
      " where not exists (select 1 from bz_kontrollen k where k.geraet_id = g.id)",
    ).get() as { n: number };
    expect(ohneKontrolle.n).toBeGreaterThan(0);

    // O2: juengste Messung je Flasche gegen den Nennfuelldruck.
    const flaschen = t.db.select().from(o2Flaschen).all();
    const o2Ampeln = flaschen.map((f) => {
      const m = t.sqlite.prepare(
        "select druck_bar as d from o2_messungen where flasche_id = ? order by ts desc limit 1",
      ).get(f.id) as { d: number } | undefined;
      // Der Grenzwert der ZEILE, nicht die Vorbelegung: seit DRK-308 traegt ihn
      // jede Flasche selbst, und der Seed setzt ihn bewusst nicht ueberall gleich.
      return m ? o2Status(m.d, f.nennfuelldruckBar, f.wechselAbProzent).ampel : null;
    });
    expect(o2Ampeln).toContain("rot");
    expect(o2Ampeln).toContain("gelb");
    expect(o2Ampeln).toContain("gruen");

    // ⚠️ MINDESTENS EINE FLASCHE WEICHT AB (DRK-308). Ohne diese Behauptung
    // stuende der Seed irgendwann wieder auf viermal derselben Vorgabe, und dass
    // die Zahl einstellbar ist, waere lokal an keiner Zeile mehr zu sehen —
    // still, weil alles andere gruen bliebe.
    const grenzen = new Set(flaschen.map((f) => f.wechselAbProzent));
    expect(grenzen.size).toBeGreaterThan(1);
  });

  it("stellt die Bestell-Kennzahlen beidseitig dar", async () => {
    await seedLokalLagerbuch(t.db);

    const bestand = new Map(
      (t.sqlite.prepare(
        "select artikel_id as a, sum(menge) as s from buchungen where lagerort_id = ? group by 1",
      ).all(HANDLAGER_ID) as { a: string; s: number }[]).map((r) => [r.a, r.s]),
    );
    const unterMindest = t.db.select().from(artikel).all()
      .filter((a) => a.aktiv && a.mindestbestand > 0
        && (bestand.get(a.id) ?? 0) < a.mindestbestand);

    expect(unterMindest.length).toBeGreaterThan(0);
    expect(unterMindest.some((a) => a.bestelltAt === null)).toBe(true);
    expect(unterMindest.some((a) => a.bestelltAt !== null)).toBe(true);
  });

  it("legt Soll-Positionen ueber den Vorlagen-Sync an — der zweite Sync ist folgenlos", async () => {
    await seedLokalLagerbuch(t.db);

    const ausVorlage = t.db.select().from(sollPositionen).all()
      .filter((s) => s.templatePositionId !== null);
    const manuell = t.db.select().from(sollPositionen).all()
      .filter((s) => s.templatePositionId === null);
    expect(ausVorlage.length).toBeGreaterThan(0);
    expect(manuell.length).toBeGreaterThan(0);

    // Waeren die Zeilen direkt eingefuegt worden (ohne template_position_id),
    // legte dieser Aufruf sie ein zweites Mal an.
    for (const fz of t.db.select().from(lagerorte).all().filter((l) => l.typ === "fahrzeug")) {
      const erg = syncFahrzeugTemplate(t.db, fz.id);
      expect(erg.hinzugefuegt, fz.id).toBe(0);
      expect(erg.aktualisiert, fz.id).toBe(0);
      expect(erg.entfernt, fz.id).toBe(0);
    }

    /*
     * Jede Verfallsmeldung AN EINER EINHEIT haengt an einer aktiven
     * Soll-Position — sonst raeumte `bereinigeVerfallOhneAktivesSoll` sie beim
     * naechsten Sync ab.
     *
     * ⚠️ „AN EINER EINHEIT" IST SEIT DRK-377 DER TRAGENDE TEIL DES SATZES, und
     * vorher stand er nicht da. Bis dahin galt die Soll-Bindung fuer die ganze
     * Tabelle; seither ist sie eine Auflage der PFLEGE und keine der ZEILE, und
     * `bereinigeVerfallOhneAktivesSoll` fasst ausdruecklich nur Fahrzeuge an
     * (geprueft in `schreibpfade/lagerortVerfall.test.ts`). Die Entnahmebox
     * traegt einen gemeldeten Verfall OHNE Soll — das ist der Kern des Tickets
     * und kein verwaister Eintrag.
     *
     * ⚠️ DIE ABFRAGE MUSS DESHALB UEBER `lagerorte.typ` GEHEN und nicht ueber
     * eine Ausnahmeliste mit der Box-Id: waechst die Suite um einen zweiten
     * Ort ohne Soll, der eine Meldung traegt, faellt dieser Test sonst mit
     * einer Begruendung, die auf ihn nicht zutrifft.
     */
    const verwaist = t.sqlite.prepare(
      "select count(*) as n from lagerort_verfall v" +
      " join lagerorte l on l.id = v.lagerort_id and l.typ = 'fahrzeug'" +
      " where not exists (" +
      " select 1 from soll_positionen s where s.fahrzeug_id = v.lagerort_id" +
      " and s.artikel_id = v.artikel_id and s.entfernt = 0)",
    ).get() as { n: number };
    expect(verwaist.n).toBe(0);
    expect(t.db.select().from(lagerortVerfall).all().length).toBeGreaterThan(0);
  });

  it("hat einen abgeschlossenen und einen offenen Check", async () => {
    await seedLokalLagerbuch(t.db);

    const alle = t.db.select().from(checks).all();
    const offen = alle.filter((c) => c.completedAt === null);
    const fertig = alle.filter((c) => c.completedAt !== null);
    expect(offen.length).toBeGreaterThan(0);
    expect(fertig.length).toBeGreaterThan(0);

    const erg = parseCheckErgebnis(fertig[0].ergebnis);
    expect(erg.version).toBe(2);
    if (erg.version === 2) {
      expect(erg.positionen.length).toBeGreaterThan(0);
      expect(erg.artikel.length).toBeGreaterThan(0);
      expect(erg.geraete.length).toBeGreaterThan(0);
      expect(erg.flaschen.length).toBeGreaterThan(0);
      // Die Positions-IDs im Ergebnis zeigen auf echte Soll-Zeilen — sie sind aus
      // dem Sync gelesen, nicht erfunden.
      const sollIds = new Set(t.db.select().from(sollPositionen).all().map((s) => s.id));
      for (const p of erg.positionen) expect(sollIds.has(p.sollPositionId ?? "")).toBe(true);
    }
  });

  it("bestueckt jede zugeordnete Einheit mit echtem Bestand — die Tasche auch", async () => {
    await seedLokalLagerbuch(t.db);

    /**
     * ⚠️ DIE TASCHE IST HIER NICHT MITGEZAEHLT, SIE IST DER PUNKT (DRK-309).
     * Das Akzeptanzkriterium lautet „die Bestandsablaeufe sind auch fuer
     * Taschen nutzbar" — belegt ist das nicht dadurch, dass eine Tasche
     * ANLEGBAR ist, sondern dadurch, dass ein Schreibpfad sie als Ziel nimmt.
     * Die Schleife laeuft ueber `typ === "fahrzeug"` und faende eine Tasche
     * ohne Bestand genauso rot wie ein leeres Fahrzeug; das ist richtig so.
     */
    const einheiten = t.db.select().from(lagerorte).all()
      .filter((l) => l.typ === "fahrzeug");
    const bestandVon = (id: string) => (t.sqlite.prepare(
      "select coalesce(sum(menge), 0) as s from buchungen where lagerort_id = ?",
    ).get(id) as { s: number }).s;

    /**
     * ⚠️ DIE EINE AUSNAHME IST DIE NICHT ZUGEORDNETE EINHEIT, und sie ist
     * ABSICHT, kein Loch im Seed. Sie bildet den Zwischenstand aus Migration
     * 0010 nach: eine Einheit, die es vor der Art gab, die niemand
     * zugeordnet hat und an der seither nichts passiert ist. Wer ihr Bestand
     * gibt, damit diese Zusicherung ohne Ausnahme auskommt, nimmt der lokalen
     * Umgebung den einzigen Fall, an dem sich der Nachtrag ausprobieren
     * laesst.
     */
    const offen = einheiten.filter((l) => l.einheitenart === null);
    expect(offen.map((l) => l.id), "genau eine Einheit bleibt nicht zugeordnet")
      .toEqual(["ta-rucksack-1"]);
    expect(bestandVon("ta-rucksack-1")).toBe(0);

    expect(einheiten.filter((l) => l.einheitenart === "tasche").length)
      .toBeGreaterThan(0);
    for (const fz of einheiten.filter((l) => l.einheitenart !== null)) {
      expect(bestandVon(fz.id), fz.id).toBeGreaterThan(0);
    }
  });

  it("legt etwas in die Entnahmebox — sonst steht die Seite lokal leer", async () => {
    /*
     * ⚠️ DIE VERWALTUNGSSEITE, DIE HERKUNFTSSPALTE UND DER REITER „Box" HAENGEN
     * ALLE AN BUCHUNGEN MIT DEM PRAEFIX `entnahmebox:` (DRK-314) — kaeme keine
     * im Seed vor, stuende die Seite lokal leer, und dieselbe Luecke bliebe
     * fuer jeden Playwright-Lauf. Dieselbe Begruendung wie bei der
     * Aussonderung eine Zusicherung weiter oben.
     */
    await seedLokalLagerbuch(t.db);

    const inBox = t.db.select().from(buchungen).all()
      .filter((b) => b.lagerortId === ENTNAHMEBOX_ID);
    expect(inBox.length, "die Box ist nicht leer").toBeGreaterThan(0);
    expect(inBox.reduce((sum, b) => sum + b.menge, 0)).toBeGreaterThan(0);

    // ⚠️ DIE HERKUNFT MUSS AUFLOESBAR BLEIBEN: die Referenz traegt die Id der
    // Einheit und KEINEN Fremdschluessel. Zeigte sie auf eine Zeile, die der
    // Seed gar nicht anlegt, stuende in der Spalte „Aus" dauerhaft „—".
    const orte = new Set(t.db.select().from(lagerorte).all().map((l) => l.id));
    for (const b of inBox) {
      expect(b.referenz, "jede Boxbuchung traegt das Praefix")
        .toMatch(new RegExp(`^${ENTNAHMEBOX_PRAEFIX}`));
      expect(orte.has(b.referenz!.slice(ENTNAHMEBOX_PRAEFIX.length)), b.referenz!).toBe(true);
    }

    // Und die Box haengt NEBEN dem Handlager — ihr Inhalt zaehlt dort nicht mit.
    expect(handlagerOrte(t.db)).not.toContain(ENTNAHMEBOX_ID);
  });

  it("gibt der Box auch den GEMELDETEN Verfall mit — sonst fehlt der Kernzustand", async () => {
    /*
     * ⚠️ DER ZUSTAND, DEN DRK-377 HERSTELLT, MUSS IM SEED SICHTBAR SEIN (Codex
     * zu PR #194, P2). Der Seed bucht die Kompressen ueber `umlagerungVonOrt`
     * DIREKT und nicht ueber `bucheInEntnahmebox` — er faehrt also an der
     * Action und damit an `verfallFolgtDemMaterial` vorbei, wenn er die Regel
     * nicht selbst ruft. Ohne sie stuende in der Kiste „—" in der Spalte
     * „Gemeldet", die Box fehlte in der Verfallsuebersicht, und der
     * auffaelligste Zustand des Tickets waere weder lokal noch in einem
     * Playwright-Lauf zu sehen.
     *
     * ⚠️ GEPRUEFT WIRD DIE ZEILE, NICHT IHR DATUM: welchen Monat der Seed für
     * die Kompressen meldet, haengt an `m.rot` und damit am Lauftag. Eine
     * Zusicherung darauf prueefte den Kalender statt den Seed.
     */
    await seedLokalLagerbuch(t.db);

    const inDerBox = t.db.select().from(lagerortVerfall).all()
      .filter((z) => z.lagerortId === ENTNAHMEBOX_ID);
    expect(inDerBox.length, "die Box traegt mindestens eine Meldung")
      .toBeGreaterThan(0);

    // ⚠️ UND SIE STAMMT AUS EINER EINHEIT, die auch wirklich dorthin gebucht
    // hat — eine Meldung ohne Herkunft waere eine erfundene Zahl.
    const herkuenfte = new Set(
      t.db.select().from(buchungen).all()
        .filter((b) => b.lagerortId === ENTNAHMEBOX_ID && b.referenz)
        .map((b) => b.referenz!.slice(ENTNAHMEBOX_PRAEFIX.length)),
    );
    for (const z of inDerBox) {
      const ausEinheit = t.db.select().from(buchungen).all()
        .some((b) => herkuenfte.has(b.lagerortId) && b.artikelId === z.artikelId);
      expect(ausEinheit, z.artikelId).toBe(true);
    }
  });

  it("traegt die Boxmeldung auch auf einer SCHON geseedeten Datenbank nach", async () => {
    /*
     * ⚠️ „IDEMPOTENT UND REIN ADDITIV" IST EINE ZUSAGE UEBER DEN ZWEITEN LAUF
     * (CLAUDE.md, Codex zu PR #194, P2). Stuende der Verfallsschritt hinter dem
     * Riegel der Boxbuchung, liefe er auf einer Datenbank, die den Vorgang
     * schon kennt, NIE — jede bestehende Demo-Datenbank haette die Meldung also
     * dauerhaft nicht, und niemand saehe es, weil der erste Lauf richtig ist.
     *
     * Der Test stellt genau diesen Zustand her: einmal seeden, die Boxmeldung
     * wegnehmen (als waere sie nie geschrieben worden), erneut seeden.
     */
    await seedLokalLagerbuch(t.db);
    t.db.delete(lagerortVerfall)
      .where(eq(lagerortVerfall.lagerortId, ENTNAHMEBOX_ID)).run();
    expect(t.db.select().from(lagerortVerfall).all()
      .filter((z) => z.lagerortId === ENTNAHMEBOX_ID)).toEqual([]);

    await seedLokalLagerbuch(t.db);

    expect(
      t.db.select().from(lagerortVerfall).all()
        .filter((z) => z.lagerortId === ENTNAHMEBOX_ID).length,
      "der zweite Lauf traegt sie nach",
    ).toBeGreaterThan(0);
  });

  it("nimmt KEINE RTW-Meldung, die NACH der Abgabe entstanden ist", async () => {
    /*
     * ⚠️ DIE FUENFTE KANTE (Codex zu PR #194, P2). Die drei bisherigen Proben
     * pruefen alle die KISTE — Bestand, fehlende Meldung, nie herausgebucht —,
     * keine von ihnen die ZEIT. `lagerort_verfall` fuehrt keine Historie: ein
     * ECHTER RTW-Check in einer benutzten Demo-Datenbank ueberschreibt die
     * einzige Zeile der Einheit. Der Nachtrag truege diese Beobachtung dann auf
     * Kistenmaterial, das sie nie beschrieben hat — der Seed behauptete eine
     * Zuordnung, die es nie gab.
     *
     * Migration 0013 weist dieselbe Chronologie ab; hier steht die Entsprechung.
     */
    await seedLokalLagerbuch(t.db);
    t.db.delete(lagerortVerfall)
      .where(eq(lagerortVerfall.lagerortId, ENTNAHMEBOX_ID)).run();

    // Ein spaeterer Check am RTW: die Meldung ist juenger als jede Box-Abgabe.
    const spaeter = new Date(Date.now() + 86_400_000);
    t.db.update(lagerortVerfall).set({ erfasstAt: spaeter })
      .where(eq(lagerortVerfall.lagerortId, "fz-rtw-1")).run();

    await seedLokalLagerbuch(t.db);

    expect(
      t.db.select().from(lagerortVerfall).all()
        .filter((z) => z.lagerortId === ENTNAHMEBOX_ID),
      "die juengere Beobachtung gehoert nicht an die Kiste",
    ).toEqual([]);
  });

  it("erfindet KEINE Meldung fuer eine leergeraeumte Box", async () => {
    /*
     * ⚠️ DIE KEHRSEITE DES NACHTRAGS (Codex zu PR #194, Folgebefund zum P2).
     * „Ausserhalb des Buchungsriegels" heisst „bei JEDEM Lauf" — und der RTW
     * behaelt seine Meldung ja. Wer die geseedete Box einraeumt und danach
     * erneut seedet, bekaeme sonst eine Meldung fuer eine LEERE Kiste zurueck:
     * der Seed erfaende einen Zustand, statt einen nachzutragen. „Rein additiv"
     * heisst nicht „egal, was inzwischen passiert ist".
     */
    await seedLokalLagerbuch(t.db);
    // Die Kiste leerraeumen — wie es die Einraeumflaeche tut.
    for (const b of t.db.select().from(buchungen).all()
      .filter((z) => z.lagerortId === ENTNAHMEBOX_ID)) {
      t.db.insert(buchungen).values({
        ...b, id: `${b.id}-raus`, menge: -b.menge, referenz: null,
      }).run();
    }
    t.db.delete(lagerortVerfall)
      .where(eq(lagerortVerfall.lagerortId, ENTNAHMEBOX_ID)).run();

    await seedLokalLagerbuch(t.db);

    expect(
      t.db.select().from(lagerortVerfall).all()
        .filter((z) => z.lagerortId === ENTNAHMEBOX_ID),
      "kein Bestand, keine Meldung",
    ).toEqual([]);
  });

  it("SCHREIBT eine vorhandene Boxmeldung nicht um", async () => {
    /*
     * ⚠️ DIE DRITTE KANTE DESSELBEN NACHTRAGS (Codex zu PR #194). Der
     * RTW-Check im Seed ist geriegelt, seine Meldung also stabil — ein ECHTER
     * Check in einer benutzten Demo-Datenbank aendert sie aber. Ist das neue
     * Datum frueher, gewaenne es in `uebernimmVerfall`, und die Kiste truege
     * danach eine Beobachtung, die am RTW gemacht wurde, NACHDEM das Material
     * ihn verlassen hat. Ein zweiter Lauf soll nachtragen, nicht umschreiben.
     */
    await seedLokalLagerbuch(t.db);
    const vorher = t.db.select().from(lagerortVerfall).all()
      .filter((z) => z.lagerortId === ENTNAHMEBOX_ID);
    expect(vorher.length, "der erste Lauf hat die Meldung gesetzt").toBeGreaterThan(0);

    // Ein spaeterer Check am RTW meldet einen FRUEHEREN Monat.
    for (const z of vorher) {
      t.db.update(lagerortVerfall)
        .set({ verfall: "2000-01" })
        .where(and(
          eq(lagerortVerfall.lagerortId, "fz-rtw-1"),
          eq(lagerortVerfall.artikelId, z.artikelId),
        ))
        .run();
    }

    await seedLokalLagerbuch(t.db);

    const nachher = t.db.select().from(lagerortVerfall).all()
      .filter((z) => z.lagerortId === ENTNAHMEBOX_ID);
    expect(nachher.map((z) => z.verfall), "die Kiste behaelt ihren Stand")
      .toEqual(vorher.map((z) => z.verfall));
  });

  it("NIMMT der Herkunftseinheit ihre Meldung nicht weg", async () => {
    /*
     * ⚠️ DIE FUENFTE KANTE (Codex zu PR #194), und die einzige, bei der der
     * Nachtrag etwas LOESCHT statt etwas zu erfinden. Die drei Proben oben
     * sagen nichts ueber den Bestand am RTW. Hat ein spaeterer Check ihn auf
     * null gebracht, raeumte `verfallFolgtDemMaterial` mit seiner zweiten
     * Haelfte die RTW-Meldung ab — ein Seed, der Zustand WEGNIMMT, und genau
     * das verbietet „rein additiv".
     *
     * Der Nachtrag ruft deshalb `uebernimmVerfall`: ein Nachtrag kopiert, er
     * bewegt nicht. Nur die echte Abgabe raeumt am Quellort ab.
     */
    await seedLokalLagerbuch(t.db);
    const boxZeilen = t.db.select().from(buchungen).all()
      .filter((z) => z.lagerortId === ENTNAHMEBOX_ID && z.menge > 0);
    expect(boxZeilen.length, "der Seed hat in die Box gebucht").toBeGreaterThan(0);

    const rtwMeldungen = t.db.select().from(lagerortVerfall).all()
      .filter((z) => z.lagerortId === "fz-rtw-1");
    expect(rtwMeldungen.length, "der RTW traegt eine Meldung").toBeGreaterThan(0);

    // Ein spaeterer Check buchte den RTW-Bestand dieser Artikel auf null …
    for (const z of rtwMeldungen) {
      for (const b of t.db.select().from(buchungen).all()
        .filter((b) => b.lagerortId === "fz-rtw-1" && b.artikelId === z.artikelId
          && b.menge > 0)) {
        t.db.insert(buchungen).values({
          ...b, id: `${b.id}-leer`, menge: -b.menge, referenz: "check:fz-rtw-1",
        }).run();
      }
    }
    // … und die Boxmeldung fehlt, der Nachtrag greift also.
    t.db.delete(lagerortVerfall)
      .where(eq(lagerortVerfall.lagerortId, ENTNAHMEBOX_ID)).run();

    await seedLokalLagerbuch(t.db);

    expect(
      t.db.select().from(lagerortVerfall).all()
        .filter((z) => z.lagerortId === "fz-rtw-1")
        .map((z) => [z.artikelId, z.verfall]),
      "die Meldung der Einheit bleibt stehen",
    ).toEqual(rtwMeldungen.map((z) => [z.artikelId, z.verfall]));
  });

  it("haengt die Meldung NICHT an fremdes Material in der Kiste", async () => {
    /*
     * ⚠️ DIE VIERTE KANTE (Codex zu PR #194). Wer die geseedeten Kompressen
     * einraeumt und spaeter welche aus einer ANDEREN Einheit hineinlegt, hat
     * wieder Bestand in der Kiste und keine Meldung daran — die beiden anderen
     * Proben sagen also beide ja. Der Nachtrag haengte dann die HEUTIGE
     * RTW-Beobachtung an Material, das nie am RTW war.
     *
     * Der Beleg dagegen ist der Abgang: ist aus der Kiste je etwas
     * herausgebucht worden, steht nicht mehr fest, dass der geseedete Beitrag
     * noch darin liegt.
     */
    await seedLokalLagerbuch(t.db);
    const boxZeilen = t.db.select().from(buchungen).all()
      .filter((z) => z.lagerortId === ENTNAHMEBOX_ID && z.menge > 0);
    expect(boxZeilen.length, "der Seed hat in die Box gebucht").toBeGreaterThan(0);

    // Einraeumen: alles wieder heraus …
    for (const b of boxZeilen) {
      t.db.insert(buchungen).values({
        ...b, id: `${b.id}-raus`, menge: -b.menge, referenz: "einraeumen:sch-1",
      }).run();
    }
    // … und FREMDES Material derselben Art hinein, ohne Meldung.
    for (const b of boxZeilen) {
      t.db.insert(buchungen).values({
        ...b, id: `${b.id}-fremd`, referenz: "entnahmebox:fz-ktw-1",
      }).run();
    }
    t.db.delete(lagerortVerfall)
      .where(eq(lagerortVerfall.lagerortId, ENTNAHMEBOX_ID)).run();

    await seedLokalLagerbuch(t.db);

    expect(
      t.db.select().from(lagerortVerfall).all()
        .filter((z) => z.lagerortId === ENTNAHMEBOX_ID),
      "fremdes Material bekommt keine RTW-Meldung",
    ).toEqual([]);
  });

  it("vergibt feste Codes — einen davon gesperrt", async () => {
    const protokoll = await seedLokalLagerbuch(t.db);

    const alle = t.db.select().from(tokens).all();
    const codes = alle.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["100-100", "200-200", "300-300", "900-900"]));
    // ⚠️ `aktiv` ist der einzige Widerruf, den es gibt — ein Seed, der alles auf
    // true setzt, macht den gesperrten Fall lokal unsichtbar.
    expect(alle.find((x) => x.code === "900-900")?.aktiv).toBe(false);
    expect(alle.filter((x) => x.zielTyp === "fahrzeug").length).toBeGreaterThan(0);
    expect(alle.filter((x) => x.zielTyp === "artikel").length).toBeGreaterThan(0);

    // Das Protokoll nennt die Codes UND die aeussere Adresse — die innere Form
    // (/m/lagerbuch/…) erreicht der Browser auf dem Modul-Host nie.
    const text = protokoll.join("\n");
    for (const c of ["100-100", "200-200", "300-300", "900-900"]) expect(text).toContain(c);
    expect(text).toContain("http://lagerbuch.localtest.me:3000/verwaltung");
    expect(text).toContain("http://lagerbuch.localtest.me:3000/t/100-100");
    // T175, Review-Fund 5: die Etikettenseite stand bis dahin in KEINER
    // Zusicherung. Sie ist die einzige Adresse der Liste, die Token-Codes im
    // KLARTEXT und als QR zeigt — faellt die Zeile heraus, prueft niemand mehr
    // lokal den Bogen, und der Ausfall waere still.
    expect(text).toContain("http://lagerbuch.localtest.me:3000/verwaltung/etiketten");
    expect(text).not.toContain("/m/lagerbuch/");
  });

  /**
   * FUND AUS T175 (Abruf-Abnahme, §12.4). Das Protokoll trug bis dahin den Satz
   * „Es gibt heute keine Route /g/<code>" — richtig, solange Teil 4 galt, und
   * seit T164 FALSCH: `g/[code]/page.tsx` existiert, wurde abgerufen (307 mit
   * relativem `Location` bei Treffer, 200 mit dem Klartext-Code bei
   * Nichttreffer) und ist der Weg, den ein gescanntes Geraete-Typenschild geht.
   *
   * Ein Protokollsatz, der die Existenz einer Route BESTREITET, ist schlimmer
   * als ein fehlender: wer lokal prueft, laesst die Route dann aus. Kein Gate
   * sah ihn — es ist Fliesstext in einem Array.
   *
   * ZWEI HAELFTEN MIT UNGLEICHER TRAGFAEHIGKEIT — Review-Fund 6 aus T175 hat
   * das benannt, und es steht hier, damit es niemand verwechselt:
   *
   *   POSITIV und datengebunden (traegt die Last): jeder im Protokoll genannte
   *   `/g/<ziffern>` wird gegen `geraete.barcode` und `bzGeraete.barcode`
   *   aufgeloest. Diese Haelfte ist WORTLAUTUNABHAENGIG — ein umformulierter
   *   Hinweis bleibt gruen, ein Barcode ohne Geraet nicht.
   *
   *   NEGATIV und wortlautgebunden (Zusatz, kein Ersatz): das Muster unten
   *   faengt die heute bekannten Bestreitungsformen. Es ist AUSDRUECKLICH
   *   umgehbar — eine neu erfundene Formulierung („der /g/-Pfad ist nicht
   *   implementiert") kaeme durch. Der Grund, es trotzdem zu behalten: der
   *   konkrete Satz, der den Fund ausloeste, kann nicht unbemerkt zurueckkehren.
   *   Wer ihm eine Phrasen-Ratejagd nachschiebt, baut eine Zusicherung, die
   *   Vollstaendigkeit vortaeuscht — die positive Haelfte ist der Riegel.
   */
  it("nennt die /g/<barcode>-Adressen und bestreitet die Route NICHT mehr", async () => {
    const protokoll = await seedLokalLagerbuch(t.db);
    const text = protokoll.join("\n");

    const bestreitung =
      /(keine|keinen)\s+Route\s+\/g\/|Route\s+\/g\/[^\n]{0,40}(existiert nicht|gibt es nicht|ist nicht implementiert)|\/g\/[^\n]{0,20}(existiert nicht|gibt es nicht)/i;
    expect(
      bestreitung.test(text),
      "das Protokoll bestreitet die Existenz von /g/ — seit T164 ist das falsch",
    ).toBe(false);

    const genannt = [...text.matchAll(/\/g\/(\d+)/g)].map((m) => m[1]);
    expect(genannt.length, "das Protokoll nennt keine /g/<barcode>-Adresse").toBeGreaterThan(0);

    const bekannt = new Set([
      ...t.db.select().from(geraete).all().map((g) => g.barcode),
      ...t.db.select().from(bzGeraete).all().map((g) => g.barcode),
    ]);
    for (const b of genannt) {
      expect(bekannt.has(b), `Barcode ${b} steht im Protokoll, aber an keinem Geraet`).toBe(true);
    }
  });

  it("ist idempotent — der zweite Lauf aendert KEINE Tabelle", async () => {
    await seedLokalLagerbuch(t.db);
    const nachher1 = zeilenzahlen();

    await seedLokalLagerbuch(t.db);
    const nachher2 = zeilenzahlen();

    // Pro Tabelle, nicht als Summe: eine Gesamtzahl bliebe gleich, wenn eine
    // Tabelle verloere, was eine andere gewinnt.
    for (const tab of TABELLEN) {
      expect(nachher2[tab], `Tabelle ${tab} hat sich im zweiten Lauf geaendert`)
        .toBe(nachher1[tab]);
    }

    // Und der Bestand bleibt gleich — nicht nur die Zeilenzahl.
    const summe = t.sqlite.prepare(
      "select coalesce(sum(menge), 0) as s from buchungen where lagerort_id = ?",
    ).get(HANDLAGER_ID) as { s: number };
    expect(summe.s).toBeGreaterThan(0);
  });

  it("ergaenzt nach einem abgebrochenen Lauf nur das Fehlende", async () => {
    // Die Nagelprobe fuer „Gate PRO ENTITAET": ein von Hand vorbelegter
    // Artikel-Datensatz darf den Rest des Seeds NICHT blockieren, und die Zeile
    // darf nicht ueberschrieben werden.
    t.db.insert(artikel).values({
      id: "art-kompresse-10x10", name: "Von Hand angelegt", einheit: "Pkg.",
      fach: "Verbandmaterial", mindestbestand: 99, aktiv: true,
      bestelltAt: null, createdAt: new Date(),
    }).run();

    await seedLokalLagerbuch(t.db);

    const erhalten = t.db.select().from(artikel)
      .where(eq(artikel.id, "art-kompresse-10x10")).get();
    expect(erhalten?.name).toBe("Von Hand angelegt");
    expect(erhalten?.mindestbestand).toBe(99);
    expect(t.db.select().from(artikel).all().length).toBeGreaterThan(1);
    expect(t.db.select().from(chargen).all().length).toBeGreaterThan(0);
  });

  /**
   * DRK-367 — dieselbe Nagelprobe fuer den Schrankweg, und der faellt anders
   * aus als der Artikelweg darueber: das Gate dort ist die `id`, hier ist es
   * seit `idx_lagerorte_name_je_parent` zusaetzlich der NAME. Ein von Hand
   * angelegter „GF-Schrank" mit eigener Kennung liess den Seed frueher einfach
   * einen zweiten danebenstellen; jetzt waere es ein UNIQUE-Verstoss — und weil
   * dieser Abschnitt bewusst ohne Transaktion einfuegt, braeche der Lauf
   * MITTENDRIN ab (Befund von Codex zu PR #166).
   *
   * Der Seed weicht deshalb mit SEINEM Namen aus, statt zu ueberspringen: die
   * feste `id` haengt an spaeteren Buchungen, eine ausgelassene Zeile risse
   * deren Fremdschluessel. Die fremde Zeile bleibt unangetastet — ein Seed
   * fasst nicht an, was jemand selbst angelegt hat.
   */
  it("weicht aus, wenn ein Schrankname von Hand schon vergeben ist", async () => {
    t.db.insert(lagerorte).values({
      id: "von-hand", name: "GF-Schrank", typ: "lager", kennung: null, aktiv: true,
      templateId: null, parentId: HANDLAGER_ID, zugangshinweis: null, sortierung: 1,
    }).run();

    const protokoll = await seedLokalLagerbuch(t.db);

    // Die fremde Zeile steht unveraendert da …
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "von-hand")).get())
      .toMatchObject({ name: "GF-Schrank", sortierung: 1 });
    // … der Seed hat seine eigene angelegt, unter seiner festen id …
    const seedZeile = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, "schrank-gf")).get();
    expect(seedZeile?.name).toBe("GF-Schrank (Seed 2)");
    // … und sagt es, statt es still zu tun.
    expect(protokoll.some((z) => z.includes("GF-Schrank (Seed 2)"))).toBe(true);

    // Die Nagelprobe dahinter: der Lauf ist NICHT mittendrin abgebrochen.
    expect(t.db.select().from(chargen).all().length).toBeGreaterThan(0);
    expect(t.db.select().from(buchungen).all().length).toBeGreaterThan(0);
  });

  /** Und der zweite Lauf danach legt nichts Drittes an: das `id`-Gate greift
   *  jetzt, der Ausweichname wird also nicht noch einmal gesucht. */
  it("bleibt nach einem Ausweichnamen idempotent", async () => {
    t.db.insert(lagerorte).values({
      id: "von-hand", name: "GF-Schrank", typ: "lager", kennung: null, aktiv: true,
      templateId: null, parentId: HANDLAGER_ID, zugangshinweis: null, sortierung: 1,
    }).run();

    await seedLokalLagerbuch(t.db);
    const nachher1 = t.db.select().from(lagerorte).all().length;
    await seedLokalLagerbuch(t.db);

    expect(t.db.select().from(lagerorte).all().length).toBe(nachher1);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "schrank-gf")).get()?.name)
      .toBe("GF-Schrank (Seed 2)");
  });
});
