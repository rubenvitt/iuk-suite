import { describe, expect, it } from "vitest";
import { ladeAkten, speicherePruefung, speichereReifensatz } from "./akte/daten";
import { speichereFahrzeug } from "./daten";
import { fahrzeugEingabe } from "./eingabe";
import { seedLokalAkten, seedLokalFahrzeuge } from "./seedLokal";
import { testDb, type TestDb } from "./testDb";

const zaehle = (db: TestDb) => Object.fromEntries(["stammfahrzeug", "fahrzeugakte", "pruefung", "reifensatz"].map((t) =>
  [t, (db.$client.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n]));

describe("seedLokalFahrzeuge", () => {
  it("füllt einen leeren Bestand mit Fahrzeugen und Akten und ist beim zweiten Lauf still", async () => {
    const db = testDb();
    expect(await seedLokalFahrzeuge(db)).toEqual(["fahrzeuge: 6 Beispielfahrzeuge angelegt", "fahrzeuge: 6 Fahrzeugakten gefüllt"]);
    const stand = zaehle(db);
    expect(stand).toEqual({ stammfahrzeug: 6, fahrzeugakte: 6, pruefung: 24, reifensatz: 10 });
    const vorher = ladeAkten(db);
    expect(await seedLokalFahrzeuge(db)).toEqual(["fahrzeuge: Bestand vorhanden, kein Fahrzeug angelegt", "fahrzeuge: Akten vorhanden, nichts geändert"]);
    expect(zaehle(db)).toEqual(stand);
    expect(ladeAkten(db)).toEqual(vorher);
  });

  it("zieht die Akten auf einem schon geseedeten Bestand nach — über den Funkrufnamen", async () => {
    const db = testDb();
    await seedLokalFahrzeuge(db);
    db.$client.exec("DELETE FROM pruefung; DELETE FROM reifensatz; DELETE FROM fahrzeugakte");
    expect(await seedLokalFahrzeuge(db)).toEqual(["fahrzeuge: Bestand vorhanden, kein Fahrzeug angelegt", "fahrzeuge: 6 Fahrzeugakten gefüllt"]);
    expect(zaehle(db)).toEqual({ stammfahrzeug: 6, fahrzeugakte: 6, pruefung: 24, reifensatz: 10 });
  });

  it("lässt ein Fahrzeug in Ruhe, das schon etwas in der Akte hat, und fremde Fahrzeuge sowieso", () => {
    const db = testDb();
    const neu = (funkrufname: string) => speichereFahrzeug(db, null, fahrzeugEingabe.parse({ art: "fahrzeug", typ: "RTW", funkrufname, funkkenner: "", kennzeichen: "", standort: "Uelzen", bemerkung: "", aktiv: true }));
    const mitPruefung = neu("Rotkreuz Uelzen 11-83-1");
    const mitReifen = neu("Rotkreuz Uelzen 11-85-1");
    const leer = neu("Rotkreuz Uelzen 11-19-1");
    const fremd = neu("Florian Uelzen 1");
    speicherePruefung(db, mitPruefung.id, null, { art: "HU", name: "Meine HU", monate: 12, kmAbstand: null, zuletzt: null, vonHand: null }, "2026-11-12");
    speichereReifensatz(db, mitReifen.id, null, { art: "Winter", dot: "0120", lager: "" });
    expect(seedLokalAkten(db, "2026-11-12")).toBe(1);
    const akten = new Map(ladeAkten(db).map((a) => [a.fahrzeug.id, a]));
    expect(akten.get(mitPruefung.id)).toMatchObject({ pruefungen: [{ name: "Meine HU" }], reifensaetze: [], technik: { modell: null } });
    expect(akten.get(mitReifen.id)).toMatchObject({ pruefungen: [], reifensaetze: [{ dot: "0120" }] });
    expect(akten.get(leer.id)).toMatchObject({ technik: { modell: "VW Crafter 35, 9-Sitzer" }, km: 63410, kmAm: "2026-11-03", aufgezogen: "Ganzjahres" });
    expect(akten.get(fremd.id)).toMatchObject({ pruefungen: [], reifensaetze: [], km: null });
  });

  it("rechnet die Tage relativ zum Seed-Tag und die Reifen nach der Jahreszeit", async () => {
    const db = testDb();
    await seedLokalFahrzeuge(db);
    db.$client.exec("DELETE FROM pruefung; DELETE FROM reifensatz; DELETE FROM fahrzeugakte");
    seedLokalAkten(db, "2026-07-01");
    const nach = (name: string) => ladeAkten(db).find((a) => a.fahrzeug.funkrufname === name)!;
    const rtw = nach("Rotkreuz Uelzen 11-83-1");
    expect(rtw.aufgezogen).toBe("Winter");
    expect(rtw.pruefungen.find((p) => p.art === "HU")).toMatchObject({ zuletzt: "2025-06-25", monate: 12 });
    expect(rtw.pruefungen.find((p) => p.art === "Service")).toMatchObject({ zuletztKm: 133140, kmAbstand: 20000 });
    expect(nach("Rotkreuz Uelzen 11-11-1").aufgezogen).toBe("Sommer");
    const anhaenger = nach("Anhänger Betreuung Uelzen");
    expect(anhaenger).toMatchObject({ km: null, kmAm: null, technik: { staerke: null, besonderheiten: ["Tempo 100", "Auflaufbremse"] } });
  });
});
