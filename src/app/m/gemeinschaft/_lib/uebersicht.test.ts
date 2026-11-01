import { describe, expect, it } from "vitest";
import { anfrage, mitglied } from "../_db/schema";
import { testDb } from "./testDb";
import { ladeUebersicht } from "./uebersicht";
import { legeAufgabeAn, speichereVorhaben } from "./vorhaben";
import { aufgabeEingabe, vorhabenEingabe } from "./vorhabenEingabe";
import { zeitpunkt } from "./zeit";

const JETZT = zeitpunkt("2026-11-01", "12:00");

describe("Übersicht der Leitung", () => {
  it("zählt Anfragen, offene Verträge, Lücken und Projekte und listet das Nächste", () => {
    const db = testDb();
    db.insert(mitglied).values({ id: "jonas", name: "Jonas Albers", link: "l".repeat(22), angelegtAm: JETZT, aktualisiertAm: JETZT }).run();
    const p = speichereVorhaben(db, null, vorhabenEingabe.parse({ art: "projekt", titel: "Weihnachtsmarkt-Stand", verantwortlichId: "jonas" }), JETZT);
    const ev = speichereVorhaben(db, null, vorhabenEingabe.parse({ art: "event", titel: "Weihnachtsmarkt – Samstag", ort: "Marktplatz", verantwortlichId: "jonas", projektId: p, von: zeitpunkt("2026-11-28", "14:00"), bis: zeitpunkt("2026-11-28", "21:00") }), JETZT);
    const alt = speichereVorhaben(db, null, vorhabenEingabe.parse({ art: "event", titel: "Grillabend", von: zeitpunkt("2026-10-20", "17:00"), bis: zeitpunkt("2026-10-20", "22:00") }), JETZT);
    legeAufgabeAn(db, p, aufgabeEingabe.parse({ titel: "Deko holen", faellig: "2026-11-13" }), JETZT);
    legeAufgabeAn(db, ev, aufgabeEingabe.parse({ titel: "Abbau und Transport" }), JETZT);
    legeAufgabeAn(db, ev, aufgabeEingabe.parse({ titel: "Aufbau", zustaendig: ["jonas"] }), JETZT);
    legeAufgabeAn(db, alt, aufgabeEingabe.parse({ titel: "Grill anheizen" }), JETZT);
    const a = (id: string, status: "angefragt" | "zugesagt", tag: string, vertrag: "offen" | "verschickt" | "unterschrieben" = "offen") => ({
      id, status, vertrag, code: id.padEnd(22, "x"), von: zeitpunkt(tag, "17:00"), bis: zeitpunkt(tag, "21:00"), anlass: id, personen: 10, person: "Timo Brandes", kontakt: "x", eingegangenAm: JETZT,
    });
    db.insert(anfrage).values([
      a("offen1", "angefragt", "2026-11-14"), a("offen2", "angefragt", "2026-11-15"),
      a("zusage", "zugesagt", "2026-11-06", "verschickt"), a("fertig", "zugesagt", "2026-11-07", "unterschrieben"), a("vorbei", "zugesagt", "2026-10-07"),
    ]).run();

    const u = ladeUebersicht(db, JETZT);
    expect([u.anfragen, u.vertraege, u.projekte]).toEqual([2, 1, 1]);
    expect(u.termine.map((t) => t.titel)).toEqual(["Bar vermietet: zusage", "Bar vermietet: fertig", "Weihnachtsmarkt – Samstag"]);
    expect(u.termine[2]).toMatchObject({ art: "event", unter: "Marktplatz · verantwortlich Jonas Albers", ohneZustaendige: 1 });
    expect(u.termine[0]).toMatchObject({ art: "anmietung", vertrag: "verschickt", unter: "Timo Brandes" });
    // Das vergangene Event zählt nicht; sortiert nach Fälligkeit bzw. Tag des Events.
    expect(u.luecken.map((l) => l.titel)).toEqual(["Deko holen", "Abbau und Transport"]);
  });
});
