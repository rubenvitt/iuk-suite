import { describe, expect, it } from "vitest";
import { abrufAntwort, utc } from "./abruf";
import { speichereVeranstaltung } from "./daten";
import { veranstaltungEingabe } from "./eingabe";
import { legeZugangAn, listeZugaenge, widerrufeZugang, zugangAusSchluessel } from "./schluessel";
import { testDb } from "./testDb";

const H = 3_600_000;
const T = Date.UTC(2026, 10, 25, 8);
const v = (abw: object) => veranstaltungEingabe.parse({ name: "Fest", art: "sanitaetsdienst", status: "zugesagt", von: T, bis: T + 2 * H, ...abw });

describe("Vertrag „Veranstaltungen-Abruf v1“", () => {
  it("liefert UTC ohne Millisekunden, abgesagte mit, und nichts, das länger als 7 Tage vorbei ist", () => {
    const db = testDb();
    const id = speichereVeranstaltung(db, null, v({ ort: "Markt" }), T - H);
    speichereVeranstaltung(db, null, v({ name: "Abgesagt", status: "abgesagt", von: T - 6 * 24 * H, bis: T - 6 * 24 * H + H }));
    speichereVeranstaltung(db, null, v({ name: "Alt", von: T - 8 * 24 * H, bis: T - 8 * 24 * H + H }));
    const a = abrufAntwort(db, T);
    expect(a.fassung).toBe(1);
    expect(a.stand).toBe("2026-11-25T08:00:00Z");
    expect(a.veranstaltungen.map((x) => x.name)).toEqual(["Abgesagt", "Fest"]);
    expect(a.veranstaltungen[1]).toEqual({
      id, name: "Fest", art: "sanitaetsdienst", status: "zugesagt", ort: "Markt", veranstalter: "",
      beginn: "2026-11-25T08:00:00Z", ende: "2026-11-25T10:00:00Z", bemerkung: "", geaendert: "2026-11-25T07:00:00Z",
    });
    expect(utc(T + 1234)).toBe("2026-11-25T08:00:01Z");
  });
});

describe("Abruf-Zugänge", () => {
  it("der Schlüssel gilt bis zum Widerruf, gespeichert ist nur der Hash", () => {
    const db = testDb();
    const { id, schluessel } = legeZugangAn(db, "Lifeline Hub", "Ruben");
    expect(schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(db.$client.prepare("SELECT * FROM veranstaltung_zugang").all())).not.toContain(schluessel);
    expect(zugangAusSchluessel(db, schluessel, new Date(T))).toBe(id);
    expect(listeZugaenge(db)[0].zuletztAbgeholtAm).toBe(new Date(T).toISOString());
    expect(zugangAusSchluessel(db, "x".repeat(43))).toBeNull();
    expect(widerrufeZugang(db, id)).toBe(true);
    expect(zugangAusSchluessel(db, schluessel)).toBeNull();
  });

  it("eine Abholung schreibt keine Audit-Zeile, anlegen und widerrufen schon", () => {
    const db = testDb();
    const { id, schluessel } = legeZugangAn(db, "Hub", "Ruben");
    zugangAusSchluessel(db, schluessel);
    widerrufeZugang(db, id);
    const zeilen = db.$client.prepare("SELECT action FROM audit_outbox WHERE object_type = 'veranstaltung_zugang' ORDER BY rowid").all() as { action: string }[];
    expect(zeilen.map((z) => z.action)).toEqual(["create", "delete"]);
  });
});
