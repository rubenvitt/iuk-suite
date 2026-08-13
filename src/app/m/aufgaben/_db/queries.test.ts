import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "./testdb";
import { migrierteTestDb } from "./testdb";
import {
  personen,
  aufgaben,
  routinen,
  nachweise,
  verlauf,
  type PersonRow,
  type Rolle,
} from "./schema";
import {
  allePersonen,
  aktivePersonen,
  bufdis,
  personNachSub,
  personNachId,
  aufgabe,
  aufgabenFuerPerson,
  posteingang,
  freigabenFuer,
  aufgabenVonErsteller,
  archiv,
  routinenFuer,
  verlaufFuer,
  nachweiseFuer,
  schreibeVerlauf,
} from "./queries";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(() => t.schliessen());

const HEUTE = "2026-08-13";

function legePerson(sub: string, rolle: Rolle, extra: Partial<PersonRow> = {}): PersonRow {
  return t.db
    .insert(personen)
    .values({
      sub,
      name: extra.name ?? sub,
      initialen: extra.initialen ?? sub.slice(0, 2).toUpperCase(),
      rolle,
      aktivVon: extra.aktivVon ?? "2026-01-01",
      aktivBis: extra.aktivBis ?? null,
    })
    .returning()
    .get();
}

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert>) {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      erstellerId: extra.erstellerId as string,
      status: "eingegangen",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

describe("allePersonen — sortiert nach Rolle, dann Name", () => {
  it("koordination vor auftrag vor bufdi, innerhalb der Rolle alphabetisch", () => {
    legePerson("b1", "bufdi", { name: "Zoe" });
    legePerson("b2", "bufdi", { name: "Anna" });
    legePerson("a1", "auftrag", { name: "Bert" });
    legePerson("k1", "koordination", { name: "Sarah" });
    const namen = allePersonen(t.db).map((p) => p.name);
    expect(namen).toEqual(["Sarah", "Bert", "Anna", "Zoe"]);
  });
});

describe("aktivePersonen — schliesst ausgeschiedene aus", () => {
  it("nimmt nur, wer an `heute` aktiv ist", () => {
    const aktiv = legePerson("akt", "bufdi");
    legePerson("ex", "bufdi", { aktivBis: "2026-08-01" });
    const ergebnis = aktivePersonen(t.db, HEUTE);
    expect(ergebnis.map((p) => p.id)).toEqual([aktiv.id]);
  });
});

describe("bufdis — aktive Personen mit rolle === 'bufdi'", () => {
  it("schliesst koordination/auftrag UND ausgeschiedene BuFDis aus", () => {
    const lea = legePerson("lea", "bufdi");
    legePerson("noah-ex", "bufdi", { aktivBis: "2026-08-01" });
    legePerson("sarah", "koordination");
    legePerson("schulle", "auftrag");
    expect(bufdis(t.db, HEUTE).map((p) => p.id)).toEqual([lea.id]);
  });
});

describe("personNachSub / personNachId", () => {
  it("findet ueber sub, liefert null ohne Treffer", () => {
    const p = legePerson("gesucht", "bufdi");
    expect(personNachSub(t.db, "gesucht")?.id).toBe(p.id);
    expect(personNachSub(t.db, "nicht-vorhanden")).toBeNull();
  });

  it("findet ueber id, liefert null ohne Treffer", () => {
    const p = legePerson("gesucht2", "bufdi");
    expect(personNachId(t.db, p.id)?.sub).toBe("gesucht2");
    expect(personNachId(t.db, "unbekannte-id")).toBeNull();
  });
});

describe("aufgabe — Einzelabruf", () => {
  it("liefert die Zeile, null ohne Treffer", () => {
    const ersteller = legePerson("e1", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    expect(aufgabe(t.db, a.id)?.id).toBe(a.id);
    expect(aufgabe(t.db, "unbekannt")).toBeNull();
  });
});

describe("aufgabenFuerPerson — zugewiesenAn === personId", () => {
  it("schliesst Aufgaben anderer Personen aus", () => {
    const ersteller = legePerson("e2", "auftrag");
    const lea = legePerson("lea2", "bufdi");
    const noah = legePerson("noah2", "bufdi");
    const leaAufgabe = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: lea.id });
    legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: noah.id });
    const ergebnis = aufgabenFuerPerson(t.db, lea.id);
    expect(ergebnis.map((a) => a.id)).toEqual([leaAufgabe.id]);
  });
});

describe("posteingang — status === 'eingegangen'", () => {
  it("schliesst andere Stati aus", () => {
    const ersteller = legePerson("e3", "auftrag");
    const offen = legeAufgabe({ erstellerId: ersteller.id, status: "eingegangen" });
    legeAufgabe({ erstellerId: ersteller.id, status: "verteilt" });
    expect(posteingang(t.db).map((a) => a.id)).toEqual([offen.id]);
  });
});

describe("freigabenFuer — filtert serverseitig auf darfFreigeben", () => {
  it("ein Dritter (weder Pruefer noch koordination) sieht die Warteschlange leer", () => {
    const ersteller = legePerson("fe1-ersteller", "auftrag");
    const pruefer = legePerson("fe1-pruefer", "auftrag");
    const bufdi = legePerson("fe1-bufdi", "bufdi");
    const dritter = legePerson("fe1-dritter", "auftrag");
    legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(freigabenFuer(t.db, dritter)).toEqual([]);
  });

  it("der eingetragene Pruefer sieht genau seine Aufgabe, keine fremde", () => {
    const ersteller = legePerson("fe2-ersteller", "auftrag");
    const pruefer = legePerson("fe2-pruefer", "auftrag");
    const bufdi = legePerson("fe2-bufdi", "bufdi");
    const andererPruefer = legePerson("fe2-anderer-pruefer", "auftrag");
    const meine = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: andererPruefer.id,
      status: "freigabe_offen",
    });
    expect(freigabenFuer(t.db, pruefer).map((a) => a.id)).toEqual([meine.id]);
  });

  it("koordination sieht ALLE offenen Freigaben, auch fremde", () => {
    const ersteller = legePerson("fe3-ersteller", "auftrag");
    const pruefer = legePerson("fe3-pruefer", "auftrag");
    const bufdi = legePerson("fe3-bufdi", "bufdi");
    const sarah = legePerson("fe3-sarah", "koordination");
    legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(freigabenFuer(t.db, sarah)).toHaveLength(1);
  });

  it("schliesst Aufgaben aus, die nicht freigabe_offen sind — auch fuer koordination", () => {
    const ersteller = legePerson("fe4-ersteller", "auftrag");
    const bufdi = legePerson("fe4-bufdi", "bufdi");
    const sarah = legePerson("fe4-sarah", "koordination");
    legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id, status: "in_arbeit" });
    expect(freigabenFuer(t.db, sarah)).toEqual([]);
  });

  it("eine Selbstaufgabe im Status freigabe_offen kann es nicht geben — aber selbst dann liefert die Funktion nichts an eine ausgeschiedene koordination", () => {
    const bufdi = legePerson("fe5-bufdi", "bufdi");
    const sarahEx = legePerson("fe5-sarah-ex", "koordination", { aktivBis: "2026-08-01" });
    legeAufgabe({
      erstellerId: bufdi.id,
      zugewiesenAn: bufdi.id,
      prueferId: bufdi.id,
      status: "freigabe_offen",
    });
    expect(freigabenFuer(t.db, sarahEx)).toEqual([]);
  });
});

describe("aufgabenVonErsteller", () => {
  it("schliesst Aufgaben anderer Ersteller aus", () => {
    const e1 = legePerson("ave1", "auftrag");
    const e2 = legePerson("ave2", "auftrag");
    const meine = legeAufgabe({ erstellerId: e1.id });
    legeAufgabe({ erstellerId: e2.id });
    expect(aufgabenVonErsteller(t.db, e1.id).map((a) => a.id)).toEqual([meine.id]);
  });
});

describe("archiv — status === 'abgeschlossen'", () => {
  it("schliesst nicht abgeschlossene Aufgaben aus", () => {
    const ersteller = legePerson("arc1", "auftrag");
    const fertig = legeAufgabe({ erstellerId: ersteller.id, status: "abgeschlossen" });
    legeAufgabe({ erstellerId: ersteller.id, status: "in_arbeit" });
    expect(archiv(t.db).map((a) => a.id)).toEqual([fertig.id]);
  });
});

describe("routinenFuer", () => {
  it("schliesst Routinen anderer Personen aus", () => {
    const lea = legePerson("rou1-lea", "bufdi");
    const noah = legePerson("rou1-noah", "bufdi");
    const meine = t.db
      .insert(routinen)
      .values({ personId: lea.id, titel: "R", wochentage: 31, dauerMinuten: 30 })
      .returning()
      .get();
    t.db
      .insert(routinen)
      .values({ personId: noah.id, titel: "R2", wochentage: 31, dauerMinuten: 30 })
      .run();
    expect(routinenFuer(t.db, lea.id).map((r) => r.id)).toEqual([meine.id]);
  });
});

describe("verlaufFuer — aufsteigend nach ts", () => {
  it("schliesst Verlauf anderer Aufgaben aus und sortiert die eigenen aufsteigend", () => {
    const ersteller = legePerson("vlf1", "auftrag");
    const a1 = legeAufgabe({ erstellerId: ersteller.id });
    const a2 = legeAufgabe({ erstellerId: ersteller.id });
    // EXPLIZITE, verschiedene `ts`-Werte statt dreier `schreibeVerlauf`-Aufrufe in derselben
    // Sekunde — `ts` speichert Unix-SEKUNDEN, zwei Aufrufe im selben Testlauf koennten sonst
    // denselben Wert tragen und die Aufsteigend-Aussage waere vom Timing abhaengig, nicht belegt.
    const frueher = t.db
      .insert(verlauf)
      .values({
        aufgabeId: a1.id,
        ereignis: "eingestellt",
        akteurId: ersteller.id,
        ts: new Date("2026-08-01T08:00:00Z"),
      })
      .returning()
      .get();
    const spaeter = t.db
      .insert(verlauf)
      .values({
        aufgabeId: a1.id,
        ereignis: "verteilt",
        akteurId: ersteller.id,
        ts: new Date("2026-08-02T08:00:00Z"),
      })
      .returning()
      .get();
    t.db
      .insert(verlauf)
      .values({ aufgabeId: a2.id, ereignis: "eingestellt", akteurId: ersteller.id })
      .run();
    const ergebnis = verlaufFuer(t.db, a1.id);
    expect(ergebnis.map((v) => v.id)).toEqual([frueher.id, spaeter.id]);
    expect(ergebnis.every((v) => v.aufgabeId === a1.id)).toBe(true);
  });
});

describe("nachweiseFuer", () => {
  it("schliesst Nachweise anderer Aufgaben aus", () => {
    const ersteller = legePerson("nwf1", "auftrag");
    const bufdi = legePerson("nwf1-bufdi", "bufdi");
    const a1 = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const a2 = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const meiner = t.db
      .insert(nachweise)
      .values({ aufgabeId: a1.id, art: "text", text: "Erledigt.", erstelltVon: bufdi.id })
      .returning()
      .get();
    t.db
      .insert(nachweise)
      .values({ aufgabeId: a2.id, art: "text", text: "Anderer.", erstelltVon: bufdi.id })
      .run();
    expect(nachweiseFuer(t.db, a1.id).map((n) => n.id)).toEqual([meiner.id]);
  });
});

describe("schreibeVerlauf — das eine Schreibprimitiv dieser Aufgabe", () => {
  it("schreibt eine Zeile mit Akteur, Ereignis und optionaler Notiz", () => {
    const ersteller = legePerson("sv1", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    const zeile = schreibeVerlauf(t.db, {
      aufgabeId: a.id,
      ereignis: "eingestellt",
      akteurId: ersteller.id,
      notiz: "Testnotiz",
    });
    expect(zeile.aufgabeId).toBe(a.id);
    expect(zeile.ereignis).toBe("eingestellt");
    expect(zeile.akteurId).toBe(ersteller.id);
    expect(zeile.notiz).toBe("Testnotiz");
  });

  it("notiz ist optional und wird ohne Angabe null", () => {
    const ersteller = legePerson("sv2", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    const zeile = schreibeVerlauf(t.db, {
      aufgabeId: a.id,
      ereignis: "eingestellt",
      akteurId: ersteller.id,
    });
    expect(zeile.notiz).toBeNull();
  });
});
