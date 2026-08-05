import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, checks, fahrzeugTemplates, lagerorte,
         lagerortVerfall, sollPositionen, templatePositionen, newId } from "../../_db/schema";
import { fahrzeugListe, fahrzeugUebersicht, sollFuerFahrzeug,
         templateUebersicht, templateDetail, templateListeAktiv } from "./fahrzeuge";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-fahrzeuge-");
  // Einfuegereihenfolge bewusst GEGEN die erwartete Sortierreihenfolge (aktiv
  // zuerst) — sonst faellt eine fehlende Sortierung nicht auf (T30/T46/T47-Muster:
  // Einfuegereihenfolge faellt zufaellig mit der Sollreihenfolge zusammen).
  t.db.insert(fahrzeugTemplates).values([
    { id: "tpl-alt", name: "Alte Vorlage", aktiv: false, createdAt: NOW },
    { id: "tpl-rtw", name: "RTW-Vorlage", aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(lagerorte).values([
    { id: "rtw-2", name: "ELW", typ: "fahrzeug", kennung: "MS-2", aktiv: false },
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1",
      aktiv: true, templateId: "tpl-rtw" },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(templatePositionen).values(
    { id: "tp1", templateId: "tpl-rtw", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4 }).run();
  // Auch hier ausser der Reihe eingefuegt (sp3, sp4, sp1, sp2 statt der
  // erwarteten Sortierreihenfolge sp1, sp2, sp4, sp3) — und sp4 ist eine ZWEITE
  // Zeile im selben Fach wie sp2 ("Fach 2"), damit der `sort`-Tiebreaker
  // tatsaechlich greift (sonst unterscheidet keine Faecher-Zahl allein
  // "sortiert" von "zufaellig gleich geordnet").
  t.db.insert(sollPositionen).values([
    // GRABSTEIN — kein Soll.
    { id: "sp3", fahrzeugId: "rtw-1", fachLabel: "Fach 3", sort: 2,
      artikelId: "a2", soll: 9, templatePositionId: null,
      ueberschrieben: false, entfernt: true },
    { id: "sp4", fahrzeugId: "rtw-1", fachLabel: "Fach 2", sort: 2,
      artikelId: "a1", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    // DERSELBE Artikel in ZWEI Faechern — die zentrale Asymmetrie (§5.7.1).
    { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4, templatePositionId: "tp1",
      ueberschrieben: false, entfernt: false },
    { id: "sp2", fahrzeugId: "rtw-1", fachLabel: "Fach 2", sort: 1,
      artikelId: "a1", soll: 2, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
  ]).run();
  t.db.insert(chargen).values(
    { id: "c1", artikelId: "a1", chargenNr: "CH", verfall: "2030-01", createdAt: NOW }).run();
  const b = (lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId: "a1", chargeId: "c1",
    lagerortId, menge, quelleTyp: "system" as const, quelleId: "t",
    referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([b(HANDLAGER_ID, 30), b("rtw-1", 5)]).run();
  t.db.insert(lagerortVerfall).values([
    { id: newId(), lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-07",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    // GRUEN — zaehlt NICHT als warnend. Ohne diese Zeile koennte
    // `fahrzeugUebersicht` `nurWarnend` weglassen und der Zaehler bliebe
    // trotzdem bei 1.
    { id: newId(), lagerortId: "rtw-1", artikelId: "a2", verfall: "2029-01",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
  ]).run();
  // Checks ausser der Reihe eingefuegt (juengster ZUERST) — sonst faellt eine
  // fehlende Max-Bildung nicht auf, weil „letzter Insert gewinnt" zufaellig
  // dasselbe Ergebnis liefert wie „juengster completedAt gewinnt".
  t.db.insert(checks).values([
    { id: "chk-neu", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: new Date("2026-06-01T10:00:00Z"),
      completedAt: new Date("2026-06-01T10:05:00Z"), ergebnis: "[]" },
    { id: "chk-alt", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: new Date("2026-05-01T10:00:00Z"),
      completedAt: new Date("2026-05-01T10:05:00Z"), ergebnis: "[]" },
  ]).run();
});
afterEach(() => t.schliessen());

describe("fahrzeugUebersicht — Soll je ARTIKEL summiert, dann verglichen", () => {
  it("zaehlt einen Artikel in ZWEI Faechern EINMAL unter Soll", () => {
    /**
     * §5.7.1: das Soll ist pro (Fahrzeug, Fach, Artikel), der Bestand pro
     * (Fahrzeug, Artikel). a1 steht mit 4 + 2 + 1 = 7 im Soll (Fach 1, zweimal
     * Fach 2); der Fahrzeugbestand ist 5 → EIN Artikel unter Soll, nicht drei.
     * Wer je POSITION vergleicht, zaehlt ihn mehrfach.
     */
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.artikelUnterSoll).toBe(1);
  });

  it("zaehlt Grabsteine NICHT als Soll, und Positionen sind nicht Faecher", () => {
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.positionen).toBe(3);   // sp1, sp2, sp4 — NICHT sp3 (Grabstein)
    expect(z.faecher).toBe(2);      // sp2 und sp4 teilen sich "Fach 2"
  });

  it("nennt den JUENGSTEN abgeschlossenen Check", () => {
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.letzterCheck?.toISOString()).toBe("2026-06-01T10:05:00.000Z");
  });

  it("zaehlt NUR die WARNENDEN Verfallsmeldungen DES FAHRZEUGS", () => {
    // Die gruene Meldung (a2, "2029-01") zaehlt nicht mit — sonst waere der
    // Zaehler 2 statt 1. rtw-2 hat KEINE Meldungen — ein global statt je
    // Fahrzeug gezaehlter Wert liesse hier ebenfalls 1 statt 0 stehen.
    const l = fahrzeugUebersicht(t.db, NOW);
    expect(l.find((x) => x.id === "rtw-1")!.verfallAuffaellig).toBe(1);
    expect(l.find((x) => x.id === "rtw-2")!.verfallAuffaellig).toBe(0);
  });

  it("nennt den Vorlagennamen und sortiert aktive nach vorn", () => {
    const l = fahrzeugUebersicht(t.db, NOW);
    expect(l.map((z) => z.id)).toEqual(["rtw-1", "rtw-2"]);
    expect(l[0].templateName).toBe("RTW-Vorlage");
    expect(l[1].templateName).toBeNull();
  });
});

describe("sollFuerFahrzeug — Grabsteine bleiben DRIN", () => {
  it("gibt auch entfernte Zeilen zurueck, damit der Editor sie wiederherstellen kann", () => {
    // `queries.ts:320-321`. VERBINDLICH: jede Ansicht, die „das Soll" braucht,
    // filtert `entfernt` SELBST heraus.
    const z = sollFuerFahrzeug(t.db, "rtw-1");
    expect(z.map((x) => x.id)).toEqual(["sp1", "sp2", "sp4", "sp3"]);
    expect(z.find((x) => x.id === "sp3")!.entfernt).toBe(true);
  });

  it("nennt fahrzeugBestand und handlagerBestand getrennt", () => {
    const z = sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp1")!;
    expect(z.fahrzeugBestand).toBe(5);
    expect(z.handlagerBestand).toBe(30);
  });

  it("leitet die Herkunft aus templatePositionId und ueberschrieben ab", () => {
    const z = sollFuerFahrzeug(t.db, "rtw-1");
    expect(z.find((x) => x.id === "sp1")!.herkunft).toBe("vorlage");
    expect(z.find((x) => x.id === "sp2")!.herkunft).toBe("manuell");
    t.db.update(sollPositionen).set({ ueberschrieben: true })
      .where(eq(sollPositionen.id, "sp1")).run();
    expect(sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp1")!.herkunft)
      .toBe("ueberschrieben");
  });

  it("sortiert nach Fach, dann nach sort", () => {
    // sp2 (sort 1) und sp4 (sort 2) teilen sich "Fach 2" — nur hier greift der
    // `sort`-Tiebreaker tatsaechlich; bei durchweg verschiedenen Faechern
    // koennte auch eine reine Fach-Sortierung ohne Tiebreaker gruen bleiben.
    expect(sollFuerFahrzeug(t.db, "rtw-1").map((x) => x.fachLabel))
      .toEqual(["Fach 1", "Fach 2", "Fach 2", "Fach 3"]);
    expect(sollFuerFahrzeug(t.db, "rtw-1").map((x) => x.id))
      .toEqual(["sp1", "sp2", "sp4", "sp3"]);
  });

  it("ueberbrueckt einen geloeschten Artikel tolerant", () => {
    // Es gibt einen FK auf artikel.id — der Fall entsteht nur, wenn ein Import
    // Waisen mitbringt. Um ihn ueberhaupt zu erzeugen, wird der FK kurzzeitig
    // abgeschaltet: ohne echten Waisen waere jede Zusicherung „artikelName ist
    // ein String" trivial wahr, ganz gleich ob der Fallback existiert.
    t.sqlite.pragma("foreign_keys = OFF");
    t.db.insert(sollPositionen).values(
      { id: "sp-waise", fahrzeugId: "rtw-1", fachLabel: "Fach 9", sort: 9,
        artikelId: "gibtsnicht", soll: 1, templatePositionId: null,
        ueberschrieben: false, entfernt: false }).run();
    t.sqlite.pragma("foreign_keys = ON");
    const z = sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp-waise")!;
    expect(z.artikelName).toBe("–");
    expect(z.einheit).toBe("");
    expect(z.handlagerFach).toBe("");
  });
});

describe("die drei Vorlagen-Lesepfade (Festlegung H4)", () => {
  it("templateUebersicht zaehlt Positionen, Faecher und verknuepfte Fahrzeuge", () => {
    const l = templateUebersicht(t.db);
    expect(l.map((x) => x.id)).toEqual(["tpl-rtw", "tpl-alt"]);   // aktive nach vorn
    expect(l[0]).toMatchObject({ positionen: 1, faecher: 1, fahrzeuge: 1 });
  });

  it("templateDetail nennt Positionen und verknuepfte Fahrzeuge", () => {
    const d = templateDetail(t.db, "tpl-rtw")!;
    expect(d.positionen.map((p) => p.id)).toEqual(["tp1"]);
    expect(d.positionen[0].artikelName).toBe("Verband");
    expect(d.positionen[0].handlagerFach).toBe("A1");
    expect(d.fahrzeuge.map((f) => f.id)).toEqual(["rtw-1"]);
  });

  it("templateDetail liefert null fuer eine unbekannte ID", () => {
    expect(templateDetail(t.db, "gibtsnicht")).toBeNull();
  });

  it("templateListeAktiv liefert nur aktive, alphabetisch", () => {
    expect(templateListeAktiv(t.db)).toEqual([{ id: "tpl-rtw", name: "RTW-Vorlage" }]);
  });
});

describe("fahrzeugListe", () => {
  it("liefert alle Lagerorte vom Typ fahrzeug, inklusive inaktiver", () => {
    expect(fahrzeugListe(t.db).map((f) => f.id).sort()).toEqual(["rtw-1", "rtw-2"]);
  });
});
