import { describe, expect, it } from "vitest";
import { bereitgestellteFahrzeuge, zuordnungenFuer } from "../bereitstellung";
import { listeFahrzeuge, speichereFahrzeug } from "../daten";
import { fahrzeugEingabe } from "../eingabe";
import { testDb, type TestDb } from "../testDb";
import { wendeErstimportAn, zugeordneteSchluessel } from "./anwenden";
import { planeErstimport, type Kandidat } from "./plan";

const k = (teil: Partial<Kandidat> & Pick<Kandidat, "quelle" | "quellId">): Kandidat => ({
  anzeige: teil.quellId, typ: null, funkrufname: null, funkkenner: null, kennzeichen: null, standort: null, aktiv: true, hinweis: null, ...teil,
});

const EB_RTW = k({ quelle: "einsatzbuch", quellId: "eb1", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", standort: "Uelzen" });
const LB_RTW = k({ quelle: "lagerbuch", quellId: "lb1", anzeige: "RTW 11/83-1", funkkenner: "11-83-1", kennzeichen: "UE-RK 831" });
const FG_HALLE = k({ quelle: "funkgeraete", quellId: "Halle" });

const plane = (db: TestDb, kandidaten: Kandidat[]) => planeErstimport(kandidaten, listeFahrzeuge(db), zugeordneteSchluessel(db));

describe("wendeErstimportAn", () => {
  it("legt Angehaktes neu an und ordnet jede Zeile der Gruppe zu", () => {
    const db = testDb();
    const plan = plane(db, [EB_RTW, LB_RTW]);
    const r = wendeErstimportAn(db, plan, { uebernehmen: [plan.vorschlaege[0].schluessel], offen: {} }, "Ruben");
    expect(r).toEqual({ neu: 1, zugeordnet: 2, keinFahrzeug: 0 });
    const [f] = bereitgestellteFahrzeuge(db).fahrzeuge;
    expect(f).toMatchObject({ funkkenner: "11-83-1", kennzeichen: "UE-RK 831", standort: "Uelzen" });
    expect(zuordnungenFuer("einsatzbuch", db)).toEqual({ eb1: f.id });
    expect(zuordnungenFuer("lagerbuch", db)).toEqual({ lb1: f.id });
  });

  it("Abgewähltes und offen Gelassenes bleibt unentschieden und kommt beim nächsten Plan wieder", () => {
    const db = testDb();
    const plan = plane(db, [EB_RTW, FG_HALLE]);
    expect(wendeErstimportAn(db, plan, { uebernehmen: [], offen: {} }, "Ruben")).toEqual({ neu: 0, zugeordnet: 0, keinFahrzeug: 0 });
    expect(plane(db, [EB_RTW, FG_HALLE]).vorschlaege).toHaveLength(2);
  });

  it("„kein Fahrzeug“ wird vermerkt und fällt aus dem nächsten Plan", () => {
    const db = testDb();
    const plan = plane(db, [FG_HALLE]);
    const r = wendeErstimportAn(db, plan, { uebernehmen: [], offen: { [plan.vorschlaege[0].schluessel]: { art: "kein" } } }, "Ruben");
    expect(r.keinFahrzeug).toBe(1);
    expect(zuordnungenFuer("funkgeraete", db)).toEqual({ Halle: null });
    expect(plane(db, [FG_HALLE]).vorschlaege).toEqual([]);
  });

  it("ein offener Vorschlag kann auf ein neues Fahrzeug aus demselben Lauf zeigen", () => {
    const db = testDb();
    const plan = plane(db, [EB_RTW, FG_HALLE]);
    const neu = plan.vorschlaege.find((v) => v.ziel.art === "neu")!;
    const offen = plan.vorschlaege.find((v) => v.ziel.art === "offen")!;
    wendeErstimportAn(db, plan, { uebernehmen: [neu.schluessel], offen: { [offen.schluessel]: { art: "vorschlag", schluessel: neu.schluessel } } }, "Ruben");
    const [f] = bereitgestellteFahrzeuge(db).fahrzeuge;
    expect(zuordnungenFuer("funkgeraete", db)).toEqual({ Halle: f.id });
  });

  it("ergänzt beim Bestand nur Fehlendes und nie einen Wert, den ein anderes Fahrzeug trägt", () => {
    const db = testDb();
    const basis = { art: "fahrzeug", typ: "RTW", standort: "Uelzen", bemerkung: "", aktiv: true };
    const a = speichereFahrzeug(db, null, fahrzeugEingabe.parse({ ...basis, funkrufname: "A", funkkenner: "11-83-1", kennzeichen: "" }));
    speichereFahrzeug(db, null, fahrzeugEingabe.parse({ ...basis, funkrufname: "B", funkkenner: "", kennzeichen: "UE-RK 999" }));
    const plan = plane(db, [k({ quelle: "lagerbuch", quellId: "lb1", funkkenner: "11-83-1", kennzeichen: "UE-RK 831" })]);
    expect(plan.vorschlaege[0].ziel).toMatchObject({ art: "bestand", stammId: a.id });
    wendeErstimportAn(db, plan, { uebernehmen: [plan.vorschlaege[0].schluessel], offen: {} }, "Ruben");
    expect(listeFahrzeuge(db).find((f) => f.id === a.id)?.kennzeichen).toBe("UE-RK 831");

    const plan2 = plane(db, [k({ quelle: "lagerbuch", quellId: "lb2", funkkenner: "11-83-1", kennzeichen: "UE-RK 999" })]);
    expect(plan2.vorschlaege[0].ziel.art).toBe("offen");
  });

  it("eine Wahl auf ein unbekanntes Stammfahrzeug wird übergangen", () => {
    const db = testDb();
    const plan = plane(db, [FG_HALLE]);
    expect(wendeErstimportAn(db, plan, { uebernehmen: [], offen: { [plan.vorschlaege[0].schluessel]: { art: "stamm", id: "weg" } } }, "Ruben").zugeordnet).toBe(0);
    expect(zuordnungenFuer("funkgeraete", db)).toEqual({});
  });
});
