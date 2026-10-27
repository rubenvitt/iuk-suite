import { describe, expect, it } from "vitest";
import { auditOutbox } from "../_db/schema";
import { alsVertrag, konfigurationEingabe, leseKonfiguration, speichereKonfiguration, suchlageLinkAus, VORGABE, type KonfigurationEingabe } from "./konfiguration";
import { testDb } from "./testDb";

const TOKEN = "a".repeat(64);
const LINK = `https://suchlage.example.org/kiosk#${TOKEN}`;

function eingabe(ueber: Partial<KonfigurationEingabe> = {}): KonfigurationEingabe {
  return konfigurationEingabe.parse({
    standortName: "Bad Bevensen",
    standortBreite: 53.08,
    standortLaenge: 10.58,
    regionArs: "033600000000",
    regionName: "Landkreis Uelzen",
    warnschwelle: "Moderate",
    module: { wetter: true, radar: false, warngebiete: true, warnliste: true, suchlage: true },
    suchlage: { flugspuren: true, gebiete: false, drohnenbild: true },
    ...ueber,
  });
}

describe("Großbild-Link aus Suchlage", () => {
  it("liefert Adresse und Token", () => {
    expect(suchlageLinkAus(LINK)).toEqual({ adresse: "https://suchlage.example.org", token: TOKEN });
    expect(suchlageLinkAus(` https://iuk.example.org/suchlage/kiosk/#${TOKEN} `)).toEqual({ adresse: "https://iuk.example.org/suchlage", token: TOKEN });
  });

  it("lehnt alles andere ab", () => {
    expect(suchlageLinkAus("https://suchlage.example.org/kiosk")).toBeNull();
    expect(suchlageLinkAus(`https://suchlage.example.org/karte#${TOKEN}`)).toBeNull();
    expect(suchlageLinkAus(`ftp://suchlage.example.org/kiosk#${TOKEN}`)).toBeNull();
    expect(suchlageLinkAus("https://suchlage.example.org/kiosk#zukurz")).toBeNull();
    expect(suchlageLinkAus("kein Link")).toBeNull();
  });
});

describe("Eingabe", () => {
  it("prüft Regionalschlüssel, Koordinaten und Link am Feld", () => {
    const r = konfigurationEingabe.safeParse({ ...eingabe(), regionArs: "0336", standortBreite: 95, suchlageLink: "https://x.example/" });
    expect(r.success).toBe(false);
    const felder = r.error!.issues.map((i) => i.path.join("."));
    expect(felder).toEqual(expect.arrayContaining(["regionArs", "standortBreite", "suchlageLink"]));
  });

  it("eine fehlende Zahl ist ein Feldfehler, kein Absturz", () => {
    const r = konfigurationEingabe.safeParse({ ...eingabe(), standortLaenge: null });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe("Bitte eine Zahl angeben.");
  });
});

describe("Speichern und Drahtformat", () => {
  it("ohne gespeicherte Anzeige gelten die Vorgaben", () => {
    const db = testDb();
    expect(leseKonfiguration(db)).toEqual(VORGABE);
    const v = alsVertrag(db);
    expect(v).toMatchObject({ version: 1, changedAt: null, warnThreshold: "Severe", suchlage: null });
    expect(v.modules).toEqual({ weather: true, radar: true, warningAreas: true, warningList: true, suchlage: false });
  });

  it("speichert alles und gibt es im Format des Lagemonitors aus", () => {
    const db = testDb();
    const k = speichereKonfiguration(db, eingabe({ suchlageLink: LINK }), "Ruben", new Date("2026-10-27T18:00:00Z"));
    expect(k).toMatchObject({ standortName: "Bad Bevensen", suchlageVerbunden: true, suchlageAdresse: "https://suchlage.example.org", aktualisiertVon: "Ruben" });
    expect(JSON.stringify(k)).not.toContain(TOKEN);
    expect(alsVertrag(db)).toEqual({
      version: 1,
      changedAt: "2026-10-27T18:00:00.000Z",
      location: { lat: 53.08, lon: 10.58, label: "Bad Bevensen" },
      region: { ars: "033600000000", name: "Landkreis Uelzen" },
      warnThreshold: "Moderate",
      modules: { weather: true, radar: false, warningAreas: true, warningList: true, suchlage: true },
      suchlage: { url: "https://suchlage.example.org", token: TOKEN, tracks: true, areas: false, video: true },
    });
  });

  it("ein leeres Linkfeld behält die Verbindung, Trennen löscht sie", () => {
    const db = testDb();
    speichereKonfiguration(db, eingabe({ suchlageLink: LINK }), "Ruben");
    speichereKonfiguration(db, eingabe({ standortName: "Uelzen" }), "Ruben");
    expect(alsVertrag(db).suchlage?.token).toBe(TOKEN);
    speichereKonfiguration(db, eingabe({ suchlageTrennen: true }), "Ruben");
    expect(alsVertrag(db).suchlage).toBeNull();
    expect(leseKonfiguration(db).suchlageVerbunden).toBe(false);
  });

  it("jede Änderung steht im Audit", () => {
    const db = testDb();
    speichereKonfiguration(db, eingabe(), "Ruben");
    speichereKonfiguration(db, eingabe({ warnschwelle: "Extreme" }), "Ruben");
    const zeilen = db.select().from(auditOutbox).all();
    expect(zeilen.map((z) => z.action)).toEqual(["create", "update"]);
  });
});
