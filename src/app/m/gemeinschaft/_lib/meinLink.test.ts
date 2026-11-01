import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { aufgabe, mitglied, vorhaben, zustaendig } from "../_db/schema";
import { neueId } from "./kennung";
import {
  AufgabeAbgelehnt, faelligText, gebeAufgabeAb, meineSeite, mitgliedZuLink, setzeErledigt, uebernehmeAufgabe, zeitraumText,
} from "./meinLink";
import { legeMitgliedAn } from "./mitglieder";
import { testDb, type TestDb } from "./testDb";
import { plusTage, tagInZone, zeitpunkt } from "./zeit";

const JETZT = Date.UTC(2026, 10, 2, 11); // Montag, 2. November 2026, mittags
const HEUTE = tagInZone(JETZT);
const STUNDE = 3_600_000;

function vorhabenAn(db: TestDb, x: { art: "event" | "projekt"; titel: string; wer?: string | null; von?: number; bis?: number; ort?: string }) {
  const id = neueId();
  db.insert(vorhaben).values({ id, art: x.art, titel: x.titel, verantwortlichId: x.wer ?? null, von: x.von ?? null, bis: x.bis ?? null, ort: x.ort ?? "", angelegtAm: JETZT, aktualisiertAm: JETZT }).run();
  return id;
}
let pos = 0;
function aufgabeAn(db: TestDb, vorhabenId: string, titel: string, wer: string[], x: { erledigt?: boolean; faellig?: string } = {}) {
  const id = neueId();
  db.insert(aufgabe).values({ id, vorhabenId, titel, faellig: x.faellig ?? null, position: pos++, erledigtAm: x.erledigt ? JETZT - 1 : null, angelegtAm: JETZT }).run();
  for (const m of wer) db.insert(zustaendig).values({ aufgabeId: id, mitgliedId: m }).run();
  return id;
}
const linkVon = (db: TestDb, id: string) => db.select().from(mitglied).where(eq(mitglied.id, id)).get()!.link;
const zustaendige = (db: TestDb, aufgabeId: string) => db.select().from(zustaendig).where(eq(zustaendig.aufgabeId, aufgabeId)).all().map((z) => z.mitgliedId);
const erledigtAm = (db: TestDb, aufgabeId: string) => db.select().from(aufgabe).where(eq(aufgabe.id, aufgabeId)).get()!.erledigtAm;

function aufbau() {
  const db = testDb();
  const jonas = legeMitgliedAn(db, { name: "Jonas Albers", telefon: "0151 1000002" }, JETZT);
  const nele = legeMitgliedAn(db, { name: "Nele Vogt", telefon: "0151 1000005" }, JETZT);
  const projekt = vorhabenAn(db, { art: "projekt", titel: "Weihnachtsmarkt-Stand", wer: jonas });
  const markt = vorhabenAn(db, { art: "event", titel: "Weihnachtsmarkt – Samstag", wer: nele, von: zeitpunkt(plusTage(HEUTE, 5), "14:00"), bis: zeitpunkt(plusTage(HEUTE, 5), "21:00"), ort: "Marktplatz" });
  const spiele = vorhabenAn(db, { art: "event", titel: "Spieleabend", wer: nele, von: zeitpunkt(plusTage(HEUTE, 2), "19:00"), bis: zeitpunkt(plusTage(HEUTE, 2), "22:00"), ort: "Bar" });
  const vorbei = vorhabenAn(db, { art: "event", titel: "Grillabend", wer: jonas, von: JETZT - 30 * STUNDE, bis: JETZT - 25 * STUNDE });
  const a = {
    meinSpaet: aufgabeAn(db, projekt, "Deko holen", [jonas], { faellig: plusTage(HEUTE, 9) }),
    meinBald: aufgabeAn(db, markt, "Aufbau Stand", [jonas, nele]),
    meinUeberfaellig: aufgabeAn(db, projekt, "Standplatz anmelden", [jonas], { faellig: plusTage(HEUTE, -1) }),
    meinErledigt: aufgabeAn(db, projekt, "Becher bestellen", [jonas], { erledigt: true }),
    meinVorbei: aufgabeAn(db, vorbei, "Grill anheizen", [jonas]),
    fremd: aufgabeAn(db, spiele, "Spiele mitbringen", [nele]),
    frei: aufgabeAn(db, spiele, "Snacks besorgen", []),
    freiErledigt: aufgabeAn(db, spiele, "Tische rücken", [], { erledigt: true }),
    freiVorbei: aufgabeAn(db, vorbei, "Abbau", []),
  };
  return { db, jonas, nele, a, markt, spiele };
}

describe("persönlicher Link: Lesen", () => {
  it("findet das Mitglied nur über einen gültigen Code", () => {
    const { db, jonas } = aufbau();
    expect(mitgliedZuLink(db, linkVon(db, jonas))).toEqual({ id: jonas, name: "Jonas Albers" });
    expect(mitgliedZuLink(db, "A".repeat(22))).toBeNull();
    expect(mitgliedZuLink(db, "kurz")).toBeNull();
    expect(mitgliedZuLink(db, `${linkVon(db, jonas)}x`)).toBeNull();
  });

  it("zeigt eigene offene Aufgaben nach Fälligkeit/Beginn, Erledigte getrennt, offene ohne Zuständige und Termine", () => {
    const { db, jonas, a, markt } = aufbau();
    const s = meineSeite(db, { id: jonas, name: "Jonas Albers" }, JETZT);
    expect(s.vorname).toBe("Jonas");
    expect(s.verantwortlich).toEqual(["Weihnachtsmarkt-Stand"]);
    expect(s.offen.map((x) => x.id)).toEqual([a.meinUeberfaellig, a.meinBald, a.meinSpaet]);
    expect(s.offen[0]).toMatchObject({ wann: expect.stringMatching(/^überfällig seit /), dringend: true });
    expect(s.offen[1].wann).toMatch(/^Sa, 7\. Nov\., 14:00 Uhr$/);
    expect(s.erledigt.map((x) => x.id)).toEqual([a.meinErledigt]);
    expect(s.gebraucht.map((x) => x.id)).toEqual([a.frei]);
    expect(s.termine.map((t) => t.titel)).toEqual(["Spieleabend", "Weihnachtsmarkt – Samstag"]);
    expect(s.termine.find((t) => t.id === markt)).toMatchObject({ dabei: true, zeit: "14:00–21:00 Uhr", ort: "Marktplatz", wochentag: "Sa", tag: "7", monat: "Nov." });
    expect(s.termine.find((t) => t.titel === "Spieleabend")!.dabei).toBe(false);
  });

  it("enthält keine Telefonnummern und keine Namen anderer Mitglieder", () => {
    const { db, jonas } = aufbau();
    const text = JSON.stringify(meineSeite(db, { id: jonas, name: "Jonas Albers" }, JETZT));
    expect(text).not.toMatch(/0151/);
    expect(text).not.toMatch(/Nele|Vogt/);
  });
});

describe("persönlicher Link: Ändern nur, was dem Mitglied gehört (IDOR)", () => {
  it("hakt eine eigene Aufgabe ab und öffnet sie wieder", () => {
    const { db, jonas, a } = aufbau();
    setzeErledigt(db, jonas, a.meinBald, true, JETZT);
    expect(erledigtAm(db, a.meinBald)).toBe(JETZT);
    setzeErledigt(db, jonas, a.meinBald, false, JETZT);
    expect(erledigtAm(db, a.meinBald)).toBeNull();
  });

  it("ein fremder Link kann eine fremde Aufgabe nicht abhaken, abgeben oder öffnen", () => {
    const { db, jonas, nele, a } = aufbau();
    expect(() => setzeErledigt(db, jonas, a.fremd, true, JETZT)).toThrow(AufgabeAbgelehnt);
    expect(erledigtAm(db, a.fremd)).toBeNull();
    expect(() => gebeAufgabeAb(db, jonas, a.fremd, JETZT)).toThrow(AufgabeAbgelehnt);
    expect(zustaendige(db, a.fremd)).toEqual([nele]);
    expect(() => setzeErledigt(db, nele, a.meinErledigt, false, JETZT)).toThrow(AufgabeAbgelehnt);
    expect(erledigtAm(db, a.meinErledigt)).not.toBeNull();
    // auch eine freie Aufgabe ist niemandes: abhaken geht erst nach „Ich mach’s“
    expect(() => setzeErledigt(db, jonas, a.frei, true, JETZT)).toThrow(AufgabeAbgelehnt);
    expect(() => setzeErledigt(db, jonas, "erfunden", true, JETZT)).toThrow(AufgabeAbgelehnt);
  });

  it("nichts in vergangenen Vorhaben", () => {
    const { db, jonas, a } = aufbau();
    expect(() => setzeErledigt(db, jonas, a.meinVorbei, true, JETZT)).toThrow(AufgabeAbgelehnt);
    expect(() => uebernehmeAufgabe(db, jonas, a.freiVorbei, JETZT)).toThrow(AufgabeAbgelehnt);
  });

  it("„Schaffe ich doch nicht“ trägt nur das Mitglied selbst aus", () => {
    const { db, jonas, nele, a } = aufbau();
    gebeAufgabeAb(db, jonas, a.meinBald, JETZT);
    expect(zustaendige(db, a.meinBald)).toEqual([nele]);
    expect(() => gebeAufgabeAb(db, jonas, a.meinBald, JETZT)).toThrow(AufgabeAbgelehnt);
    expect(() => gebeAufgabeAb(db, jonas, a.meinErledigt, JETZT)).toThrow(/schon erledigt/);
  });

  it("„Ich mach’s“ nur für offene Aufgaben ohne Zuständige, und nur einmal", () => {
    const { db, jonas, nele, a } = aufbau();
    uebernehmeAufgabe(db, nele, a.frei, JETZT);
    expect(zustaendige(db, a.frei)).toEqual([nele]);
    expect(() => uebernehmeAufgabe(db, jonas, a.frei, JETZT)).toThrow(/schneller/);
    expect(() => uebernehmeAufgabe(db, jonas, a.fremd, JETZT)).toThrow(AufgabeAbgelehnt);
    expect(() => uebernehmeAufgabe(db, jonas, a.freiErledigt, JETZT)).toThrow(/erledigt/);
    expect(db.select().from(zustaendig).where(and(eq(zustaendig.mitgliedId, jonas), eq(zustaendig.aufgabeId, a.fremd))).get()).toBeUndefined();
  });
});

describe("Texte", () => {
  it("Fälligkeit relativ zu heute", () => {
    expect(faelligText("2026-11-02", "2026-11-02")).toEqual({ text: "fällig heute", dringend: true });
    expect(faelligText("2026-11-03", "2026-11-02").text).toBe("fällig morgen");
    expect(faelligText("2026-11-13", "2026-11-02").text).toBe("fällig Fr, 13. Nov.");
    expect(faelligText("2026-10-30", "2026-11-02")).toEqual({ text: "überfällig seit 30. Okt.", dringend: true });
  });
  it("Zeitraum über Mitternacht nennt den Endtag", () => {
    expect(zeitraumText(zeitpunkt("2026-11-07", "18:00"), zeitpunkt("2026-11-08", "01:00"))).toBe("18:00 Uhr bis So, 8. Nov., 01:00 Uhr");
  });
});
