import { describe, expect, it } from "vitest";
import { anfrage, sperrzeit } from "../_db/schema";
import { kalenderEintraege } from "./kalender";
import { beginntAm, eintraegeAmTag, kalenderFenster, kalenderTag } from "./kalenderTage";
import { testDb } from "./testDb";
import { speichereVorhaben } from "./vorhaben";
import { vorhabenEingabe } from "./vorhabenEingabe";
import { zeitpunkt } from "./zeit";

const JETZT = zeitpunkt("2026-11-01", "12:00");

describe("Kalender der Leitung", () => {
  it("zeigt Events und die Bar, aber keine Absagen und kein Bar-Event doppelt", () => {
    const db = testDb();
    const ev = speichereVorhaben(db, null, vorhabenEingabe.parse({ art: "event", titel: "Glühweinabend", barBelegen: true, von: zeitpunkt("2026-11-13", "18:00"), bis: zeitpunkt("2026-11-13", "23:00") }), JETZT);
    speichereVorhaben(db, null, vorhabenEingabe.parse({ art: "projekt", titel: "Bar renovieren", ziel: "2026-11-20" }), JETZT);
    const a = (id: string, status: "angefragt" | "zugesagt" | "abgelehnt" | "zurueckgezogen", tag: string) => ({
      id, status, code: id.padEnd(22, "x"), von: zeitpunkt(tag, "17:00"), bis: zeitpunkt(tag, "21:00"), anlass: id, personen: 10, person: "Lena Kraus", kontakt: "x", eingegangenAm: JETZT,
    });
    db.insert(anfrage).values([a("offen", "angefragt", "2026-11-14"), a("zusage", "zugesagt", "2026-11-15"), a("nein", "abgelehnt", "2026-11-16"), a("weg", "zurueckgezogen", "2026-11-17")]).run();
    db.insert(sperrzeit).values({ id: "s1", von: zeitpunkt("2026-11-17", "19:00"), bis: zeitpunkt("2026-11-17", "22:00"), grund: "Dienstabend Bereitschaft", angelegtAm: JETZT }).run();
    db.insert(sperrzeit).values({ id: "s-alt", von: zeitpunkt("2026-08-17", "19:00"), bis: zeitpunkt("2026-08-17", "22:00"), grund: "Alt", angelegtAm: JETZT }).run();

    const { von, bis } = kalenderFenster("2026-11-10");
    const e = kalenderEintraege(db, von, bis);
    expect(e.map((x) => [x.art, x.titel, x.href])).toEqual([
      ["event", "Glühweinabend", `/events/${ev}`],
      ["angefragt", "Bar: offen", "/vermietung/anfragen?id=offen"],
      ["zugesagt", "Bar: zusage", "/vermietung/anfragen?id=zusage"],
      ["gesperrt", "Dienstabend Bereitschaft", "/vermietung/sperrzeiten"],
    ]);
  });

  it("ordnet Einträge über Mitternacht beiden Tagen zu", () => {
    const e = { id: "x", art: "zugesagt" as const, von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-08", "01:00"), titel: "Geburtstag", href: "/" };
    expect(eintraegeAmTag([e], "2026-11-07")).toHaveLength(1);
    expect(eintraegeAmTag([e], "2026-11-08")).toHaveLength(1);
    expect(eintraegeAmTag([e], "2026-11-09")).toHaveLength(0);
    expect(beginntAm(e, "2026-11-07")).toBe(true);
    expect(beginntAm(e, "2026-11-08")).toBe(false);
    // Endet genau um Mitternacht: gehört nicht mehr zum Folgetag.
    expect(eintraegeAmTag([{ ...e, bis: zeitpunkt("2026-11-08", "00:00") }], "2026-11-08")).toHaveLength(0);
  });

  it("nimmt nur einen gültigen Tag aus der Adresse", () => {
    expect(kalenderTag("2026-12-24", "2026-11-01")).toBe("2026-12-24");
    expect(kalenderTag("2026-02-30", "2026-11-01")).toBe("2026-11-01");
    expect(kalenderTag("morgen", "2026-11-01")).toBe("2026-11-01");
    expect(kalenderTag(undefined, "2026-11-01")).toBe("2026-11-01");
    const f = kalenderFenster("2026-11-10");
    expect(new Date(f.von).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(new Date(f.bis).toISOString()).toBe("2026-12-14T23:00:00.000Z");
  });
});
