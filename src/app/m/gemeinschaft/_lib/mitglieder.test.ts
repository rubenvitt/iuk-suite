import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { aufgabe, mitglied, vorhaben, zustaendig } from "../_db/schema";
import { neueId } from "./kennung";
import { mitgliedZuLink } from "./meinLink";
import {
  aendereMitglied, entferneMitglied, erneuereLink, legeMitgliedAn, linkBasisAus, listeMitglieder,
  MitgliedNichtGefunden, mitgliedEingabe,
} from "./mitglieder";
import { persoenlicherLink } from "./mitgliederAnzeige";
import { testDb, type TestDb } from "./testDb";

const JETZT = Date.UTC(2026, 10, 1, 12);
const STUNDE = 3_600_000;

function vorhabenAn(db: TestDb, x: { art: "event" | "projekt"; titel: string; wer?: string | null; von?: number; bis?: number }) {
  const id = neueId();
  db.insert(vorhaben).values({ id, art: x.art, titel: x.titel, verantwortlichId: x.wer ?? null, von: x.von ?? null, bis: x.bis ?? null, angelegtAm: JETZT, aktualisiertAm: JETZT }).run();
  return id;
}
function aufgabeAn(db: TestDb, vorhabenId: string, wer: string[], erledigt = false) {
  const id = neueId();
  db.insert(aufgabe).values({ id, vorhabenId, titel: "Aufgabe", position: 0, erledigtAm: erledigt ? JETZT : null, angelegtAm: JETZT }).run();
  for (const m of wer) db.insert(zustaendig).values({ aufgabeId: id, mitgliedId: m }).run();
  return id;
}

describe("Mitglieder der Leitung", () => {
  it("legt an, ändert und listet mit Verantwortung und offenen Aufgaben in nicht vergangenen Vorhaben", () => {
    const db = testDb();
    const a = legeMitgliedAn(db, { name: "Mira Hofmann", telefon: "0151 1" }, JETZT);
    const b = legeMitgliedAn(db, { name: "Jonas Albers", telefon: "" }, JETZT);
    const projekt = vorhabenAn(db, { art: "projekt", titel: "Bar renovieren", wer: a });
    const kommend = vorhabenAn(db, { art: "event", titel: "Spieleabend", wer: a, von: JETZT + STUNDE, bis: JETZT + 3 * STUNDE });
    const vorbei = vorhabenAn(db, { art: "event", titel: "Grillabend", wer: a, von: JETZT - 5 * STUNDE, bis: JETZT - STUNDE });
    aufgabeAn(db, projekt, [a]);
    aufgabeAn(db, kommend, [a, b]);
    aufgabeAn(db, kommend, [a], true);
    aufgabeAn(db, vorbei, [a]);

    const zeilen = listeMitglieder(db, JETZT);
    expect(zeilen.map((z) => z.name)).toEqual(["Jonas Albers", "Mira Hofmann"]);
    const mira = zeilen.find((z) => z.id === a)!;
    expect(mira.offeneAufgaben).toBe(2);
    expect(mira.verantwortlich.map((v) => v.titel).sort()).toEqual(["Bar renovieren", "Spieleabend"]);
    expect(zeilen.find((z) => z.id === b)!.offeneAufgaben).toBe(1);

    aendereMitglied(db, b, { name: "Jonas A.", telefon: "0170 2" }, JETZT + 1);
    expect(db.select().from(mitglied).where(eq(mitglied.id, b)).get()).toMatchObject({ name: "Jonas A.", telefon: "0170 2", aktualisiertAm: JETZT + 1 });
    expect(() => aendereMitglied(db, neueId(), { name: "Niemand", telefon: "" }, JETZT)).toThrow(MitgliedNichtGefunden);
  });

  it("nach „Neuer Link“ geht der alte nicht mehr", () => {
    const db = testDb();
    const id = legeMitgliedAn(db, { name: "Lea Kaminski", telefon: "" }, JETZT);
    const alt = db.select().from(mitglied).where(eq(mitglied.id, id)).get()!.link;
    expect(mitgliedZuLink(db, alt)?.id).toBe(id);
    const neu = erneuereLink(db, id, JETZT);
    expect(neu).not.toBe(alt);
    expect(mitgliedZuLink(db, alt)).toBeNull();
    expect(mitgliedZuLink(db, neu)?.id).toBe(id);
  });

  it("Entfernen: Zuständigkeiten fallen weg, Verantwortung wird leer, Aufgaben bleiben", () => {
    const db = testDb();
    const a = legeMitgliedAn(db, { name: "Finn Lorenz", telefon: "" }, JETZT);
    const v = vorhabenAn(db, { art: "projekt", titel: "Sommerfest", wer: a });
    const auf = aufgabeAn(db, v, [a]);
    entferneMitglied(db, a);
    expect(db.select().from(zustaendig).all()).toEqual([]);
    expect(db.select().from(vorhaben).where(eq(vorhaben.id, v)).get()!.verantwortlichId).toBeNull();
    expect(db.select().from(aufgabe).where(eq(aufgabe.id, auf)).get()).toBeTruthy();
    expect(() => entferneMitglied(db, a)).toThrow(MitgliedNichtGefunden);
  });

  it("prüft die Eingabe", () => {
    expect(mitgliedEingabe.safeParse({ name: "  Paul Engel ", telefon: "" }).data).toEqual({ name: "Paul Engel", telefon: "" });
    expect(mitgliedEingabe.safeParse({ name: "P", telefon: "" }).success).toBe(false);
    expect(mitgliedEingabe.safeParse({ name: "x".repeat(81), telefon: "" }).success).toBe(false);
    expect(mitgliedEingabe.safeParse({ name: "Paul", telefon: "<script>" }).success).toBe(false);
    expect(mitgliedEingabe.safeParse({ name: "Paul", telefon: "+49 (0)151 / 123-4" }).success).toBe(true);
  });

  it("baut den vollen Link aus dem Modul-Host der Anfrage", () => {
    const h = new Headers({ host: "intern:3000", "x-forwarded-host": "gemeinschaft.example, proxy", "x-forwarded-proto": "https" });
    expect(persoenlicherLink(linkBasisAus(h), "abc")).toBe("https://gemeinschaft.example/mein/abc");
    expect(linkBasisAus(new Headers({ host: "gemeinschaft.localtest.me:3000" }))).toBe("http://gemeinschaft.localtest.me:3000");
  });
});
