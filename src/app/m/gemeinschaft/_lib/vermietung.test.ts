import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { anfrage, vorhaben } from "../_db/schema";
import { neueId } from "./kennung";
import { testDb, type TestDb } from "./testDb";
import {
  Abgelehnt, anfrageNachCode, anfragenSeit, entferneVertrag, ladeAnfragen, ladeBelegendeEintraege, ladeSperrzeiten, ladeVertragsdatei,
  legeAnfrageAn, legeSperrzeitAn, legeVertragAb, lehneAb, macheZusageRueckgaengig, ZUSAGE_RUECKGAENGIG_MS, loescheFaelligeTestanfragen, loescheSperrzeit, NichtGefunden, nimmZusageZurueck, sageZu, setzeVertrag, zieheZurueck,
} from "./vermietung";
import type { AnfrageWert } from "./vermietungEingabe";
import { zeitpunkt } from "./zeit";

const JETZT = zeitpunkt("2026-11-01", "12:00");
const um = (tag: string, uhr: string) => zeitpunkt(tag, uhr);

function wert(vonTag: string, vonUhr: string, bisTag: string, bisUhr: string, anlass = "Geburtstag"): AnfrageWert {
  return { von: um(vonTag, vonUhr), bis: um(bisTag, bisUhr), anlass, personen: 20, person: "Erika Sommer", kontakt: "05141 12345", hinweis: "", webseite: "" };
}

/** Kennung der Anfrage zu einem Code. */
const idVon = (db: TestDb, code: string) => db.select({ id: anfrage.id }).from(anfrage).where(eq(anfrage.code, code)).get()!.id;

function barEvent(db: TestDb, titel: string, von: number, bis: number, barBelegen = true) {
  const id = neueId();
  db.insert(vorhaben).values({ id, art: "event", titel, von, bis, barBelegen, angelegtAm: JETZT, aktualisiertAm: JETZT }).run();
  return id;
}

describe("Anfrage stellen", () => {
  it("speichert eine freie Anfrage als offen und gibt einen Link-Code zurück", () => {
    const db = testDb();
    const code = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), true, JETZT);
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const [a] = ladeAnfragen(db);
    expect(a).toMatchObject({ status: "angefragt", mitglied: true, anlass: "Geburtstag", vertrag: "offen", eingegangenAm: JETZT });
  });

  it("IDA-358: dieselbe Sendung zweimal legt eine Anfrage an und gibt denselben Link-Code zurück", () => {
    const db = testDb();
    const sendung = "c0de0000-0000-4000-8000-000000000001";
    const code = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT, sendung);
    expect(legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT, sendung)).toBe(code);
    expect(ladeAnfragen(db)).toHaveLength(1);
  });

  it("offene Anfragen blockieren nicht — zwei Anfragen für denselben Abend gehen", () => {
    const db = testDb();
    legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    expect(() => legeAnfrageAn(db, wert("2026-11-07", "19:00", "2026-11-07", "22:00"), false, JETZT)).not.toThrow();
  });

  it("Kollision mit Zusage, Sperrzeit und Event wird serverseitig abgelehnt", () => {
    const db = testDb();
    const c = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-08", "01:00"), false, JETZT);
    sageZu(db, idVon(db, c), JETZT);
    expect(() => legeAnfrageAn(db, wert("2026-11-08", "00:00", "2026-11-08", "02:00"), false, JETZT)).toThrow(/schon belegt/);

    legeSperrzeitAn(db, { von: um("2026-11-10", "19:00"), bis: um("2026-11-10", "22:00"), grund: "Dienstabend" }, JETZT);
    expect(() => legeAnfrageAn(db, wert("2026-11-10", "21:00", "2026-11-10", "23:00"), false, JETZT)).toThrow(Abgelehnt);

    barEvent(db, "Spieleabend", um("2026-11-12", "19:00"), um("2026-11-12", "22:00"));
    expect(() => legeAnfrageAn(db, wert("2026-11-12", "18:00", "2026-11-12", "19:30"), false, JETZT)).toThrow(Abgelehnt);
    // Ein Event ohne „Bar belegen“ blockiert nichts.
    barEvent(db, "Weihnachtsmarkt", um("2026-11-14", "12:00"), um("2026-11-14", "20:00"), false);
    expect(() => legeAnfrageAn(db, wert("2026-11-14", "18:00", "2026-11-14", "22:00"), false, JETZT)).not.toThrow();
  });

  it("die Kollisionsmeldung nennt nur den Zeitraum, keine Angaben Dritter", () => {
    const db = testDb();
    const c = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00", "Geburtstag von Jana"), false, JETZT);
    sageZu(db, idVon(db, c), JETZT);
    try {
      legeAnfrageAn(db, wert("2026-11-07", "20:00", "2026-11-07", "22:00"), false, JETZT);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain("Jana");
      expect((e as Error).message).toContain("18:00");
    }
  });

  it("zählt die Anfragen seit einem Zeitpunkt (Mengenbudget)", () => {
    const db = testDb();
    legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT - 7_200_000);
    legeAnfrageAn(db, wert("2026-11-08", "18:00", "2026-11-08", "23:00"), false, JETZT);
    expect(anfragenSeit(db, JETZT - 3_600_000)).toBe(1);
  });
});

describe("Statusseite", () => {
  it("findet die Anfrage nur über den Code und zeigt nur die eigenen Angaben", () => {
    const db = testDb();
    const code = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    const s = anfrageNachCode(db, code);
    expect(s).toMatchObject({ status: "angefragt", anlass: "Geburtstag", person: "Erika Sommer" });
    expect(Object.keys(s!)).not.toContain("id");
    expect(Object.keys(s!)).not.toContain("hinweis");
    expect(anfrageNachCode(db, "A".repeat(22))).toBeNull();
  });

  it("Zurückziehen macht die Bar wieder frei, auch nach einer Zusage; danach nicht noch einmal", () => {
    const db = testDb();
    const code = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    sageZu(db, idVon(db, code), JETZT);
    expect(ladeBelegendeEintraege(db)).toHaveLength(1);
    zieheZurueck(db, code, JETZT);
    expect(anfrageNachCode(db, code)?.status).toBe("zurueckgezogen");
    expect(ladeBelegendeEintraege(db)).toHaveLength(0);
    expect(() => zieheZurueck(db, code, JETZT)).toThrow(Abgelehnt);
    expect(() => zieheZurueck(db, "B".repeat(22), JETZT)).toThrow(NichtGefunden);
  });
});

describe("Entscheiden", () => {
  it("Zusagen meldet wartende offene Anfragen im selben Zeitraum", () => {
    const db = testDb();
    const a = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    legeAnfrageAn(db, wert("2026-11-07", "20:00", "2026-11-08", "01:00"), false, JETZT);
    legeAnfrageAn(db, wert("2026-11-09", "20:00", "2026-11-09", "22:00"), false, JETZT);
    expect(sageZu(db, idVon(db, a), JETZT)).toEqual({ weitereOffene: 1 });
    expect(anfrageNachCode(db, a)?.status).toBe("zugesagt");
  });

  it("Zusagen ist blockiert bei harter Überschneidung (Zusage, Sperrzeit, Event)", () => {
    const db = testDb();
    const a = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    const b = legeAnfrageAn(db, wert("2026-11-07", "22:00", "2026-11-08", "01:00"), false, JETZT);
    const c = legeAnfrageAn(db, wert("2026-11-12", "18:00", "2026-11-12", "20:00"), false, JETZT);
    sageZu(db, idVon(db, a), JETZT);
    expect(() => sageZu(db, idVon(db, b), JETZT)).toThrow(/Zusagen geht nicht/);
    barEvent(db, "Spieleabend", um("2026-11-12", "19:00"), um("2026-11-12", "22:00"));
    expect(() => sageZu(db, idVon(db, c), JETZT)).toThrow(/Event: Spieleabend/);
  });

  it("Ablehnen nur offen, Zusage zurücknehmen nur zugesagt — beide mit Begründung für die Statusseite", () => {
    const db = testDb();
    const a = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    const b = legeAnfrageAn(db, wert("2026-11-08", "18:00", "2026-11-08", "23:00"), false, JETZT);
    lehneAb(db, idVon(db, a), "Dienstabend.", JETZT);
    expect(anfrageNachCode(db, a)).toMatchObject({ status: "abgelehnt", begruendung: "Dienstabend." });
    expect(() => lehneAb(db, idVon(db, a), "Noch mal.", JETZT)).toThrow(Abgelehnt);
    expect(() => nimmZusageZurueck(db, idVon(db, b), "Geht nicht.", JETZT)).toThrow(Abgelehnt);
    sageZu(db, idVon(db, b), JETZT);
    nimmZusageZurueck(db, idVon(db, b), "Wasserschaden in der Bar.", JETZT);
    expect(anfrageNachCode(db, b)).toMatchObject({ status: "abgelehnt", begruendung: "Wasserschaden in der Bar." });
    expect(() => sageZu(db, "unbekannt", JETZT)).toThrow(NichtGefunden);
  });
});

describe("Zusage rückgängig (IDA-387)", () => {
  it("kurz nach dem Zusagen zurück auf offen, ohne Begründung und ohne Absage auf der Statusseite", () => {
    const db = testDb();
    const code = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    const id = idVon(db, code);
    sageZu(db, id, JETZT);
    macheZusageRueckgaengig(db, id, JETZT + ZUSAGE_RUECKGAENGIG_MS);
    expect(anfrageNachCode(db, code)).toMatchObject({ status: "angefragt", begruendung: "" });
    expect(ladeAnfragen(db)[0].entschiedenAm).toBeNull();
    // Danach wieder ganz normal zusagbar.
    expect(sageZu(db, id, JETZT + ZUSAGE_RUECKGAENGIG_MS)).toEqual({ weitereOffene: 0 });
  });

  it("nicht mehr nach der Frist, nicht mit Vertrag, nicht ohne Zusage", () => {
    const db = testDb();
    const id = idVon(db, legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT));
    expect(() => macheZusageRueckgaengig(db, id, JETZT)).toThrow(/nicht zugesagt/);
    sageZu(db, id, JETZT);
    expect(() => macheZusageRueckgaengig(db, id, JETZT + ZUSAGE_RUECKGAENGIG_MS + 1)).toThrow(/Rückgängig geht nicht mehr/);
    setzeVertrag(db, id, "verschickt");
    expect(() => macheZusageRueckgaengig(db, id, JETZT)).toThrow(Abgelehnt);
    expect(() => macheZusageRueckgaengig(db, "unbekannt", JETZT)).toThrow(NichtGefunden);
  });
});

describe("Sperrzeiten", () => {
  it("geht nicht über eine Zusage; offene Anfragen blockieren nicht", () => {
    const db = testDb();
    const a = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    legeAnfrageAn(db, wert("2026-11-09", "18:00", "2026-11-09", "23:00"), false, JETZT);
    sageZu(db, idVon(db, a), JETZT);
    expect(() => legeSperrzeitAn(db, { von: um("2026-11-07", "08:00"), bis: um("2026-11-07", "20:00"), grund: "Blutspende" }, JETZT)).toThrow(/schon eine Zusage/);
    expect(() => legeSperrzeitAn(db, { von: um("2026-11-09", "08:00"), bis: um("2026-11-09", "20:00"), grund: "Blutspende" }, JETZT)).not.toThrow();
  });

  it("Events mit „Bar belegen“ erscheinen abgeleitet und lassen sich hier nicht löschen", () => {
    const db = testDb();
    const ev = barEvent(db, "Glühweinabend", um("2026-11-13", "18:00"), um("2026-11-13", "23:00"));
    barEvent(db, "Markt", um("2026-11-14", "10:00"), um("2026-11-14", "18:00"), false);
    const id = legeSperrzeitAn(db, { von: um("2026-11-10", "19:00"), bis: um("2026-11-10", "22:00"), grund: "Dienstabend" }, JETZT);
    const liste = ladeSperrzeiten(db);
    expect(liste.map((s) => [s.grund, s.eventId])).toEqual([["Dienstabend", null], ["Event: Glühweinabend", ev]]);
    expect(() => loescheSperrzeit(db, `ev-${ev}`)).toThrow(/aus einem Event/);
    loescheSperrzeit(db, id);
    expect(ladeSperrzeiten(db)).toHaveLength(1);
    expect(() => loescheSperrzeit(db, id)).toThrow(NichtGefunden);
  });
});

describe("Vertrag", () => {
  const PDF = Buffer.from("%PDF-1.7\n…");
  const datei = (db: ReturnType<typeof testDb>, art = "mietvertrag") => ladeAnfragen(db)[0].dokumente.find((d) => d.art === art)?.datei ?? null;

  it("nur zu einer Zusage; Ablegen setzt „offen“ auf „unterschrieben“, Entfernen fällt zurück", () => {
    const db = testDb();
    const c = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT);
    const id = idVon(db, c);
    expect(() => setzeVertrag(db, id, "verschickt")).toThrow(Abgelehnt);
    expect(() => legeVertragAb(db, id, "mietvertrag", "v.pdf", PDF, JETZT)).toThrow(Abgelehnt);
    sageZu(db, id, JETZT);
    legeVertragAb(db, id, "mietvertrag", "Mietvertrag.pdf", PDF, JETZT);
    expect(ladeAnfragen(db)[0].vertrag).toBe("unterschrieben");
    expect(datei(db)).toMatchObject({ name: "Mietvertrag Bar 2026-11-07 18.00 Uhr – unterschrieben.pdf", groesse: PDF.length, herkunft: "leitung" });
    expect(ladeVertragsdatei(db, id, "mietvertrag")?.inhalt.equals(PDF)).toBe(true);
    legeVertragAb(db, id, "mietvertrag", "Neu.pdf", PDF, JETZT);
    expect(ladeVertragsdatei(db, id, "mietvertrag")?.name).toBe("Mietvertrag Bar 2026-11-07 18.00 Uhr – unterschrieben.pdf");
    entferneVertrag(db, id, "mietvertrag");
    expect(ladeVertragsdatei(db, id, "mietvertrag")).toBeNull();
    expect(ladeAnfragen(db)[0].vertrag).toBe("offen");
    expect(() => entferneVertrag(db, id, "mietvertrag")).toThrow(NichtGefunden);
  });

  it("Übergabe und Rückgabe ändern den Stand des Mietvertrags nicht", () => {
    const db = testDb();
    const id = idVon(db, legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT));
    sageZu(db, id, JETZT);
    legeVertragAb(db, id, "uebergabe", "u.pdf", PDF, JETZT);
    expect(ladeAnfragen(db)[0].vertrag).toBe("offen");
    expect(datei(db, "uebergabe")?.name).toBe("Übergabeprotokoll Bar 2026-11-07 18.00 Uhr – unterschrieben.pdf");
    expect(datei(db)).toBeNull();
  });

  it("Ablegen bei „verschickt“ setzt „unterschrieben“ (IDA-343)", () => {
    const db = testDb();
    const id = idVon(db, legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00"), false, JETZT));
    sageZu(db, id, JETZT);
    setzeVertrag(db, id, "verschickt");
    legeVertragAb(db, id, "mietvertrag", "v.pdf", PDF, JETZT);
    expect(ladeAnfragen(db)[0].vertrag).toBe("unterschrieben");
  });
});

describe("Löschfrist für Testanfragen (IDA-375)", () => {
  it("löscht „Test“ einen Kalendermonat nach dem Eingangstag, samt Vertrag — andere Anlässe nie", () => {
    const db = testDb();
    const test = legeAnfrageAn(db, wert("2026-11-07", "18:00", "2026-11-07", "23:00", " test "), false, JETZT);
    legeAnfrageAn(db, wert("2026-11-14", "18:00", "2026-11-14", "23:00", "Testament"), false, JETZT);
    legeAnfrageAn(db, wert("2026-11-21", "18:00", "2026-11-21", "23:00"), false, JETZT);
    const id = idVon(db, test);
    sageZu(db, id, JETZT);
    legeVertragAb(db, id, "mietvertrag", "v.pdf", Buffer.from("%PDF-1.7\n…"), JETZT);

    expect(loescheFaelligeTestanfragen(db, um("2026-11-30", "23:59"))).toBe(0);
    expect(ladeAnfragen(db)).toHaveLength(3);
    expect(loescheFaelligeTestanfragen(db, um("2026-12-01", "00:01"))).toBe(1);
    expect(ladeAnfragen(db).map((a) => a.anlass)).toEqual(["Testament", "Geburtstag"]);
    expect(anfrageNachCode(db, test)).toBeNull();
    expect(ladeVertragsdatei(db, id, "mietvertrag")).toBeNull();
    expect(loescheFaelligeTestanfragen(db, um("2027-06-01", "12:00"))).toBe(0);
  });
});
