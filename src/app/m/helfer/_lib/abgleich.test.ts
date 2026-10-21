import { describe, expect, it } from "vitest";
import { helfer, importlauf } from "../_db/schema";
import { planeAbgleich, wendeAbgleichAn, type Abgleichplan } from "./abgleich";
import { bereitgestellteHelfer } from "./bereitstellung";
import { listeHelfer, loescheAlles, setzeFreigabe, wechsleQuelle } from "./daten";
import { leseEinstellungen } from "./einstellungen";
import { STANDARD_FILTER, type Importfilter } from "./filter";
import type { QuellPerson } from "./hiorg/person";
import { liesQuelle } from "./quelle";
import { testDb, type TestDb } from "./testDb";

const HEUTE = "2026-10-20";
const VON = { name: "Ruth Test", sub: "sub-ruth" };
const p = (quellId: string, teil: Partial<QuellPerson> = {}): QuellPerson => ({
  quellId, vorname: `V${quellId}`, nachname: `N${quellId}`, status: "aktiv", gesperrt: false, austritt: null,
  gruppen: ["Bereitschaft"], qualifikationen: [{ liste: "med. Qualifikation", name: "Sanitäter", kurz: "San" }], ...teil,
});
const bestand = (db: TestDb) => db.select().from(helfer).all();
const plane = (db: TestDb, personen: QuellPerson[], filter: Importfilter = STANDARD_FILTER, quelle: "demo" | "hiorg" = "hiorg") =>
  planeAbgleich({ personen, unlesbar: 0 }, bestand(db), filter, HEUTE, quelle);
const wende = (db: TestDb, plan: Abgleichplan, neueFreigeben = true) => wendeAbgleichAn(db, plan, { neueFreigeben, von: VON });

describe("planeAbgleich", () => {
  it("klassifiziert neu, geändert, unverändert und entfällt", () => {
    const db = testDb();
    wende(db, plane(db, [p("a"), p("b"), p("c")]));
    const plan = plane(db, [p("a"), p("b", { nachname: "Neu" }), p("d")]);
    const klasse = Object.fromEntries(plan.zeilen.map((z) => [z.quellId, z.klasse]));
    expect(klasse).toEqual({ a: "unveraendert", b: "geaendert", c: "entfaellt", d: "neu" });
  });

  it("eine bloß umsortierte Antwort ist keine Änderung", () => {
    const db = testDb();
    const q = [{ liste: "B", name: "Y", kurz: "y" }, { liste: "A", name: "X", kurz: "x" }];
    wende(db, plane(db, [p("a", { gruppen: ["Z", "A"], qualifikationen: q })]));
    expect(plane(db, [p("a", { gruppen: ["A", "Z"], qualifikationen: [...q].reverse() })]).zeilen[0].klasse).toBe("unveraendert");
  });

  it("wer am Filter scheitert, steht nur als Zahl im Plan — ohne Namen", () => {
    const db = testDb();
    const plan = plane(db, [
      p("ok"), p("gesperrt", { nachname: "Geheim1", gesperrt: true }), p("weg", { nachname: "Geheim2", austritt: "2026-01-01" }),
      p("extern", { nachname: "Geheim3", status: "extern" }), p("passiv", { nachname: "Geheim4", gruppen: ["Passive"] }),
    ], { ...STANDARD_FILTER, gruppenAus: ["Passive"] });
    expect(plan.zeilen.map((z) => z.quellId)).toEqual(["ok"]);
    expect(plan.ausgefiltert).toEqual({ status: 1, gesperrt: 1, ausgetreten: 1, gruppe_fehlt: 0, gruppe_ausgeschlossen: 1 });
    expect(JSON.stringify(plan)).not.toMatch(/Geheim/);
    // Gruppennamen samt Anzahl sind Hilfe beim Einstellen des Filters, keine Personendaten.
    expect(plan.gruppen).toEqual([{ name: "Bereitschaft", anzahl: 4 }, { name: "Passive", anzahl: 1 }]);
  });

  it("eine doppelt gelieferte Person zählt einmal", () => {
    const db = testDb();
    const plan = plane(db, [p("a"), p("a")]);
    expect(plan.gelesen).toBe(1);
    expect(plan.zeilen).toHaveLength(1);
  });
});

describe("wendeAbgleichAn", () => {
  it("legt an, ändert, löscht und protokolliert ohne Helfernamen", () => {
    const db = testDb();
    expect(wende(db, plane(db, [p("a"), p("b")]))).toEqual({ neu: 2, geaendert: 0, entfernt: 0, unveraendert: 0 });
    expect(wende(db, plane(db, [p("a", { vorname: "Anders" })]))).toEqual({ neu: 0, geaendert: 1, entfernt: 1, unveraendert: 0 });
    expect(bestand(db).map((h) => [h.quellId, h.vorname])).toEqual([["a", "Anders"]]);
    const laeufe = db.select().from(importlauf).all();
    expect(laeufe).toHaveLength(2);
    expect(JSON.stringify(laeufe)).not.toMatch(/Anders|"Na"|"Nb"|"Va"|"Vb"/);
    expect(laeufe[1]).toMatchObject({ vonName: "Ruth Test", vonSub: "sub-ruth", gelesen: 1, neu: 0, geaendert: 1, entfernt: 1 });
  });

  it("die Freigabe fürs Einsatzbuch folgt der Vorgabe und überlebt eine Änderung", () => {
    const db = testDb();
    wende(db, plane(db, [p("a")]), false);
    expect(bestand(db)[0].fuerEinsatzbuch).toBe(false);
    setzeFreigabe(db, [bestand(db)[0].id], true);
    wende(db, plane(db, [p("a", { nachname: "Geändert" })]), false);
    expect(bestand(db)[0]).toMatchObject({ nachname: "Geändert", fuerEinsatzbuch: true });
  });

  it("eine andere Quelle bleibt nie liegen", () => {
    const db = testDb();
    wende(db, plane(db, [p("a")], STANDARD_FILTER, "demo"));
    wende(db, plane(db, [p("b")], STANDARD_FILTER, "hiorg"));
    expect(bestand(db).map((h) => [h.herkunft, h.quellId])).toEqual([["hiorg", "b"]]);
  });

  it("jede geschriebene Zeile ist auditiert, ohne Namen im Audit", () => {
    const db = testDb();
    wende(db, plane(db, [p("a", { nachname: "Auditname" })]));
    const audit = db.all<{ object_type: string; action: string }>("SELECT object_type, action FROM audit_outbox");
    expect(audit).toEqual(expect.arrayContaining([{ object_type: "helfer", action: "create" }, { object_type: "importlauf", action: "create" }]));
    expect(JSON.stringify(db.all("SELECT * FROM audit_outbox"))).not.toContain("Auditname");
  });
});

describe("Quellen, Demo und Löschen", () => {
  it("die Demo-Quelle läuft durch Filter und Abgleich wie eine echte", async () => {
    const db = testDb();
    const e = leseEinstellungen(db);
    expect(e.quelle).toBe("demo");
    const gelesen = await liesQuelle(db, e);
    if (!gelesen.ok) throw new Error(gelesen.fehler);
    const plan = planeAbgleich(gelesen, [], { ...e.filter, gruppenAus: ["Passive", "Fördermitglieder"] }, HEUTE, "demo");
    expect(plan.ausgefiltert.gesperrt).toBe(2);
    expect(plan.ausgefiltert.ausgetreten).toBe(2);
    expect(plan.ausgefiltert.status).toBe(4);
    expect(plan.ausgefiltert.gruppe_ausgeschlossen).toBe(4);
    wende(db, plan);
    expect(listeHelfer(db).every((h) => h.demo)).toBe(true);
    expect(listeHelfer(db).map((h) => h.nachname)).toContain("Jürgens");
  });

  it("der Wechsel der Quelle löscht die Helfer der bisherigen", () => {
    const db = testDb();
    wende(db, plane(db, [p("a"), p("b")], STANDARD_FILTER, "demo"));
    expect(wechsleQuelle(db, "hiorg")).toBe(2);
    expect(leseEinstellungen(db).quelle).toBe("hiorg");
    expect(bestand(db)).toHaveLength(0);
  });

  it("alles löschen nimmt Helfer und Protokoll", () => {
    const db = testDb();
    wende(db, plane(db, [p("a")]));
    expect(loescheAlles(db)).toBe(1);
    expect(db.select().from(importlauf).all()).toHaveLength(0);
    expect(bereitgestellteHelfer(db)).toEqual({ helfer: [], stand: null });
  });
});
