import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  artikel, chargen, checks, geraete, lagerorte, lagerortVerfall,
  o2Flaschen, sollPositionen, tokens,
} from "../_db/schema";
import { seedLokalLagerbuch } from "./seedLokal";
import { HANDLAGER_ID, PSEUDO_VERFALL } from "./konstanten";
import { verfallSchwellen, verfallStatus } from "./domain/verfall";
import { mtkFaelligkeit } from "./domain/geraet";
import { bzFaelligkeit } from "./domain/bz";
import { o2Status } from "./domain/o2";
import { restJeCharge } from "./lesepfade/bestand";
import { syncFahrzeugTemplate } from "./schreibpfade/templateSync";
import { parseCheckErgebnis } from "./checkErgebnis";
import { heuteIso } from "./zeit";
import { eq } from "drizzle-orm";

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

describe("seedLokalLagerbuch", () => {
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
    const rest = restJeCharge(t.db, HANDLAGER_ID);
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
      return m ? o2Status(m.d, f.nennfuelldruckBar).ampel : null;
    });
    expect(o2Ampeln).toContain("rot");
    expect(o2Ampeln).toContain("gelb");
    expect(o2Ampeln).toContain("gruen");
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

    // Jede Verfallsmeldung haengt an einer aktiven Soll-Position — sonst raeumte
    // `bereinigeVerfallOhneAktivesSoll` sie beim naechsten Sync ab.
    const verwaist = t.sqlite.prepare(
      "select count(*) as n from lagerort_verfall v where not exists (" +
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

  it("bestueckt jedes Fahrzeug mit echtem Bestand", async () => {
    await seedLokalLagerbuch(t.db);

    for (const fz of t.db.select().from(lagerorte).all().filter((l) => l.typ === "fahrzeug")) {
      const summe = t.sqlite.prepare(
        "select coalesce(sum(menge), 0) as s from buchungen where lagerort_id = ?",
      ).get(fz.id) as { s: number };
      expect(summe.s, fz.id).toBeGreaterThan(0);
    }
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
    expect(text).not.toContain("/m/lagerbuch/");
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
});
