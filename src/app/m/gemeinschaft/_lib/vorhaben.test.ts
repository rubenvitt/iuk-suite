import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setzeAktiveZeitzone } from "@/core/zeit";
import { anfrage, aufgabe, mitglied, sperrzeit, vorhaben, zustaendig } from "../_db/schema";
import { testDb, type TestDb } from "./testDb";
import {
  Abgelehnt, barBelegung, eventKarten, legeAufgabeAn, loescheAufgabe, loescheVorhaben, NichtGefunden, projektKarten,
  setzeErledigt, setzeVerantwortlich, setzeZustaendige, speichereVorhaben, vorhabenDetail,
} from "./vorhaben";
import { barKonflikte } from "./vorhabenBar";
import { aufgabeEingabe, vorhabenEingabe } from "./vorhabenEingabe";
import { faelligText, zeitraumText } from "./vorhabenTypen";
import { zeitpunkt } from "./zeit";

const JETZT = zeitpunkt("2026-11-01", "12:00");
let db: TestDb;

function mitgliedAn(name: string): string {
  const id = `m-${name}`;
  db.insert(mitglied).values({ id, name, link: `link-${name}`.padEnd(22, "x"), angelegtAm: JETZT, aktualisiertAm: JETZT }).run();
  return id;
}

const event = (x: Record<string, unknown> = {}) => vorhabenEingabe.parse({
  art: "event", titel: "Spieleabend", von: zeitpunkt("2026-11-12", "19:00"), bis: zeitpunkt("2026-11-12", "22:00"), ...x,
});
const projekt = (x: Record<string, unknown> = {}) => vorhabenEingabe.parse({ art: "projekt", titel: "Bar renovieren", ...x });

beforeEach(() => { db = testDb(); });
afterEach(() => setzeAktiveZeitzone("Europe/Berlin"));

describe("Events und Projekte", () => {
  it("legt ein Event an, ändert es und lehnt einen Artwechsel ab", () => {
    const nele = mitgliedAn("Nele Vogt");
    const id = speichereVorhaben(db, null, event({ verantwortlichId: nele, ort: "Bar" }), JETZT);
    expect(db.select().from(vorhaben).all()).toHaveLength(1);
    speichereVorhaben(db, id, event({ titel: "Großer Spieleabend", verantwortlichId: nele }), JETZT);
    const d = vorhabenDetail(db, id, JETZT)!;
    expect(d.titel).toBe("Großer Spieleabend");
    expect(d.verantwortlich).toEqual({ id: nele, name: "Nele Vogt" });
    expect(() => speichereVorhaben(db, id, projekt(), JETZT)).toThrow(Abgelehnt);
    expect(() => speichereVorhaben(db, "gibt-es-nicht", event(), JETZT)).toThrow(NichtGefunden);
  });

  it("nimmt nur existierende Mitglieder und Projekte", () => {
    expect(() => speichereVorhaben(db, null, event({ verantwortlichId: "fremd" }), JETZT)).toThrow(Abgelehnt);
    const ev = speichereVorhaben(db, null, event(), JETZT);
    expect(() => speichereVorhaben(db, null, event({ projektId: ev }), JETZT)).toThrow(/Projekt/);
    const p = speichereVorhaben(db, null, projekt(), JETZT);
    const mitProjekt = speichereVorhaben(db, null, event({ projektId: p }), JETZT);
    expect(vorhabenDetail(db, mitProjekt, JETZT)!.projekt).toEqual({ id: p, titel: "Bar renovieren" });
  });

  it("prüft Eingaben: Titel, Zeitraum, Zieltermin", () => {
    expect(vorhabenEingabe.safeParse({ art: "event", titel: "ab", von: JETZT, bis: JETZT + 1 }).success).toBe(false);
    expect(vorhabenEingabe.safeParse({ art: "event", titel: "Abend", von: JETZT, bis: JETZT }).success).toBe(false);
    expect(vorhabenEingabe.safeParse({ art: "event", titel: "Abend", von: JETZT, bis: JETZT + 15 * 86_400_000 }).success).toBe(false);
    expect(vorhabenEingabe.safeParse({ art: "projekt", titel: "Projekt", ziel: "2026-02-30" }).success).toBe(false);
    expect(vorhabenEingabe.safeParse({ art: "projekt", titel: "Projekt", ziel: "2026-12-24" }).success).toBe(true);
    expect(aufgabeEingabe.safeParse({ titel: "x" }).success).toBe(false);
    expect(aufgabeEingabe.parse({ titel: "Einkauf", zustaendig: ["a", "a"] }).zustaendig).toEqual(["a"]);
  });

  it("löscht ein Projekt, die Events bleiben ohne Projekt, die Aufgaben gehen mit", () => {
    const p = speichereVorhaben(db, null, projekt(), JETZT);
    const e = speichereVorhaben(db, null, event({ projektId: p }), JETZT);
    legeAufgabeAn(db, p, aufgabeEingabe.parse({ titel: "Farbe kaufen" }), JETZT);
    expect(vorhabenDetail(db, p, JETZT)!.eventKarten.map((k) => k.id)).toEqual([e]);
    expect(loescheVorhaben(db, p, JETZT)).toBe("projekt");
    expect(vorhabenDetail(db, p, JETZT)).toBeNull();
    expect(vorhabenDetail(db, e, JETZT)!.projektId).toBeNull();
    expect(db.select().from(aufgabe).all()).toHaveLength(0);
  });

  it("sortiert Events in kommend und vorbei, Projekte nach Zieltermin", () => {
    const alt = speichereVorhaben(db, null, event({ titel: "Grillabend", von: zeitpunkt("2026-10-20", "17:00"), bis: zeitpunkt("2026-10-20", "22:00") }), JETZT);
    const spaet = speichereVorhaben(db, null, event({ titel: "Später", von: zeitpunkt("2026-12-01", "17:00"), bis: zeitpunkt("2026-12-01", "22:00") }), JETZT);
    const frueh = speichereVorhaben(db, null, event({ titel: "Früher" }), JETZT);
    const k = eventKarten(db, JETZT);
    expect(k.kommend.map((x) => x.id)).toEqual([frueh, spaet]);
    expect(k.vorbei.map((x) => x.id)).toEqual([alt]);
    expect(k.vorbei[0].vorbei).toBe(true);
    const ohne = speichereVorhaben(db, null, projekt({ titel: "Sommerfest" }), JETZT);
    const mit = speichereVorhaben(db, null, projekt({ titel: "Weihnachtsmarkt", ziel: "2026-11-29" }), JETZT);
    expect(projektKarten(db, JETZT).map((x) => x.id)).toEqual([mit, ohne]);
  });
});

describe("Aufgaben", () => {
  it("anlegen, abhaken, Zuständige ersetzen, löschen — mit Zählung auf der Karte", () => {
    const [mira, paul] = [mitgliedAn("Mira Hofmann"), mitgliedAn("Paul Engel")];
    const v = speichereVorhaben(db, null, event(), JETZT);
    const a1 = legeAufgabeAn(db, v, aufgabeEingabe.parse({ titel: "Einkauf", zustaendig: [paul, mira], faellig: "2026-11-11" }), JETZT);
    const a2 = legeAufgabeAn(db, v, aufgabeEingabe.parse({ titel: "Abbau und Spülen" }), JETZT);
    let d = vorhabenDetail(db, v, JETZT)!;
    expect(d.aufgabenListe.map((a) => a.titel)).toEqual(["Einkauf", "Abbau und Spülen"]);
    expect(d.aufgabenListe[0].zustaendig).toEqual([mira, paul]);
    expect([d.aufgaben, d.erledigt, d.ohneZustaendige]).toEqual([2, 0, 1]);

    setzeErledigt(db, v, a1, true, JETZT);
    setzeZustaendige(db, v, a2, [paul], JETZT);
    d = vorhabenDetail(db, v, JETZT)!;
    expect(d.aufgabenListe.map((a) => a.titel)).toEqual(["Abbau und Spülen", "Einkauf"]);
    expect([d.aufgaben, d.erledigt, d.ohneZustaendige]).toEqual([2, 1, 0]);

    setzeZustaendige(db, v, a1, [mira], JETZT);
    expect(db.select().from(zustaendig).all().filter((z) => z.aufgabeId === a1).map((z) => z.mitgliedId)).toEqual([mira]);
    loescheAufgabe(db, v, a2, JETZT);
    expect(vorhabenDetail(db, v, JETZT)!.aufgaben).toBe(1);
  });

  it("riegelt fremde Aufgaben und unbekannte Personen ab (IDOR)", () => {
    const v1 = speichereVorhaben(db, null, event(), JETZT);
    const v2 = speichereVorhaben(db, null, projekt(), JETZT);
    const a = legeAufgabeAn(db, v1, aufgabeEingabe.parse({ titel: "Einkauf" }), JETZT);
    expect(() => setzeErledigt(db, v2, a, true, JETZT)).toThrow(NichtGefunden);
    expect(() => loescheAufgabe(db, v2, a, JETZT)).toThrow(NichtGefunden);
    expect(() => setzeZustaendige(db, v1, a, ["fremd"], JETZT)).toThrow(Abgelehnt);
    expect(() => legeAufgabeAn(db, v1, aufgabeEingabe.parse({ titel: "Snacks", zustaendig: ["fremd"] }), JETZT)).toThrow(Abgelehnt);
    expect(() => setzeVerantwortlich(db, v1, "fremd", JETZT)).toThrow(Abgelehnt);
    expect(() => setzeVerantwortlich(db, "fremd", null, JETZT)).toThrow(NichtGefunden);
  });
});

describe("Bar belegen", () => {
  const abend = { von: zeitpunkt("2026-11-12", "19:00"), bis: zeitpunkt("2026-11-12", "22:00") };
  function anfrageAn(status: "angefragt" | "zugesagt" | "abgelehnt", anlass: string) {
    db.insert(anfrage).values({ id: `a-${anlass}`, status, code: `c-${anlass}`.padEnd(22, "x"), ...abend, anlass, personen: 10, person: "Erika Sommer", kontakt: "05141 12345", eingegangenAm: JETZT }).run();
  }

  it("offene Anfragen sind nur ein Hinweis, Zusagen und Sperrzeiten blockieren", () => {
    anfrageAn("angefragt", "Kaffeetrinken");
    anfrageAn("abgelehnt", "Junggesellenabschied");
    const id = speichereVorhaben(db, null, event({ barBelegen: true }), JETZT);
    expect(barBelegung(db, JETZT).map((e) => e.art).sort()).toEqual(["angefragt", "event"]);

    // Das Event steht sich beim Bearbeiten nicht selbst im Weg …
    speichereVorhaben(db, id, event({ barBelegen: true, titel: "Spieleabend mit Snacks" }), JETZT);
    // … ein zweites Bar-Event im selben Zeitraum schon.
    expect(() => speichereVorhaben(db, null, event({ barBelegen: true, titel: "Quizabend" }), JETZT)).toThrow(/Event „Spieleabend mit Snacks“/);
    // Ohne „Bar belegen“ geht es.
    speichereVorhaben(db, null, event({ titel: "Quizabend" }), JETZT);

    db.insert(sperrzeit).values({ id: "s1", von: zeitpunkt("2026-11-19", "19:00"), bis: zeitpunkt("2026-11-19", "22:00"), grund: "Dienstabend Bereitschaft", angelegtAm: JETZT }).run();
    expect(() => speichereVorhaben(db, null, event({ barBelegen: true, von: zeitpunkt("2026-11-19", "21:00"), bis: zeitpunkt("2026-11-19", "23:00") }), JETZT))
      .toThrow(/Sperrzeit „Dienstabend Bereitschaft“/);
    // Direkt im Anschluss überschneidet sich nichts.
    speichereVorhaben(db, null, event({ barBelegen: true, von: zeitpunkt("2026-11-19", "22:00"), bis: zeitpunkt("2026-11-19", "23:00") }), JETZT);
  });

  it("eine Zusage blockiert", () => {
    anfrageAn("zugesagt", "40. Geburtstag");
    expect(() => speichereVorhaben(db, null, event({ barBelegen: true }), JETZT)).toThrow(/Zusage „40. Geburtstag“/);
  });

  it("die reine Prüfung trennt hart und Hinweis", () => {
    const k = barKonflikte([
      { id: "x", art: "angefragt", ...abend, titel: "A" },
      { id: "y", art: "sperre", ...abend, titel: "S" },
      { id: "e", art: "event", ...abend, titel: "E" },
    ], abend, "e");
    expect(k.hart.map((e) => e.id)).toEqual(["y"]);
    expect(k.hinweis.map((e) => e.id)).toEqual(["x"]);
  });
});

describe("Zeit als Text", () => {
  it("schreibt Zeiträume wie im POC", () => {
    expect(zeitraumText(zeitpunkt("2026-11-28", "14:00"), zeitpunkt("2026-11-28", "21:00"))).toBe("Sa, 28. Nov. 2026, 14:00–21:00 Uhr");
    expect(zeitraumText(zeitpunkt("2026-11-07", "18:00"), zeitpunkt("2026-11-08", "01:00"))).toBe("Sa, 7. Nov. 2026, 18:00–01:00 Uhr (bis in die Nacht)");
    expect(zeitraumText(zeitpunkt("2026-11-07", "18:00"), zeitpunkt("2026-11-09", "12:00"))).toBe("Sa, 7. Nov. 2026, 18:00 Uhr – Mo, 9. Nov. 2026, 12:00 Uhr");
  });

  it("nennt die Fälligkeit relativ zu heute", () => {
    expect(faelligText("2026-10-26", "2026-11-01")).toEqual({ text: "überfällig seit 26. Okt.", warn: true });
    expect(faelligText("2026-11-01", "2026-11-01")).toEqual({ text: "fällig heute", warn: true });
    expect(faelligText("2026-11-02", "2026-11-01")).toEqual({ text: "fällig morgen", warn: false });
    expect(faelligText("2026-11-06", "2026-11-01")).toEqual({ text: "fällig Fr, 6. Nov.", warn: false });
    expect(faelligText("2026-10-26", "2026-11-01", true)).toEqual({ text: "war fällig 26. Okt.", warn: false });
    expect(faelligText(null, "2026-11-01")).toBeNull();
  });
});
