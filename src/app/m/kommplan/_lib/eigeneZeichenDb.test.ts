import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { eigenesZeichen } from "../_db/schema";
import { ZEICHEN_WEG, ladeEigeneZeichen, loescheEigenesZeichen, speichereEigenesZeichen } from "./eigeneZeichenDb";
import { BEISPIELE } from "./beispiele";
import { legePlanAn, speichereInhalt } from "./speichern";
import { TEST_ADMIN, testDb } from "./testDb";
import { symboleFuerPlan, zeichenIndexMitEigenen } from "./zeichen/symbole";

const WER = { nutzer: "u1", name: "Jana" };
const ILS = { kind: "post", organization: "fuehrung-leitung", text: { center: "ILS", bottomRight: "SW" } };
const neu = (titel: string, zeichen: unknown = ILS) => ({ id: null, titel, zeichen });

describe("eigene Zeichen in der Datenbank", () => {
  it("anlegen, lesen (mit Beschreibung), umbenennen, ändern; Beschreibung kanonisch in der Hülle v2 gespeichert", () => {
    const db = testDb();
    const r = speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1000);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.schluessel).toBe(`eigen:${r.id}`);
    expect(ladeEigeneZeichen(db)).toEqual([{ id: r.id, schluessel: r.schluessel, titel: "ILS Schweinfurt", zeichen: { kind: "post", organization: "fuehrung-leitung", text: { center: "ILS", bottomRight: "SW" } }, beschreibung: expect.stringContaining("Kürzel: ILS"), nutzung: 0 }]);
    expect(db.select().from(eigenesZeichen).get()!.spec).toBe('{"v":2,"sign":{"kind":"post","organization":"fuehrung-leitung","text":{"center":"ILS","bottomRight":"SW"}}}');
    expect(speichereEigenesZeichen(db, { id: r.id, titel: "ILS SW", zeichen: { ...ILS, text: { center: "ILS" } } }, WER, 2000)).toMatchObject({ ok: true, titel: "ILS SW" });
    expect(ladeEigeneZeichen(db)[0]).toMatchObject({ titel: "ILS SW", zeichen: { text: { center: "ILS" } } });
    expect(db.select().from(eigenesZeichen).get()).toMatchObject({ aktualisiertVon: "Jana", aktualisiertAm: new Date(2000) });
  });
  it("Dubletten nach Name, unbekannte ID, Pflichtname", () => {
    const db = testDb();
    expect(speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1).ok).toBe(true);
    expect(speichereEigenesZeichen(db, neu("  ils   schweinfurt "), WER, 1)).toMatchObject({ ok: false, feldFehler: { titel: "„ILS Schweinfurt“ heißt schon ein eigenes Zeichen." } });
    expect(speichereEigenesZeichen(db, { id: "8f1c2c1e-0000-4000-8000-000000000000", titel: "X", zeichen: ILS }, WER, 1)).toEqual({ ok: false, fehler: ZEICHEN_WEG });
    expect(speichereEigenesZeichen(db, neu(" "), WER, 1)).toMatchObject({ ok: false, feldFehler: { titel: "Bitte einen Namen eintragen." } });
    expect(speichereEigenesZeichen(db, { id: "../x", titel: "X", zeichen: ILS }, WER, 1).ok).toBe(false);
  });
  it("nimmt nur, was sich lesen UND zeichnen lässt — der Server zeichnet selbst, ein Bild aus dem Browser gibt es nicht", () => {
    const db = testDb();
    expect(speichereEigenesZeichen(db, neu("A", { kind: "post", svg: "<script>" }), WER, 1)).toMatchObject({ ok: false, fehler: expect.stringContaining("nicht lesen") });
    expect(speichereEigenesZeichen(db, neu("B", { kind: "formation", chassis: "kfz-kategorie-1" }), WER, 1)).toMatchObject({ ok: false, fehler: expect.stringContaining("nicht ganz zeichnen") });
    expect(speichereEigenesZeichen(db, neu("L", { kind: "formation", text: { center: "Integrierte Leitstelle Schweinfurt" } }), WER, 1)).toMatchObject({ ok: false, fehler: expect.stringContaining("nicht ganz zeichnen") });
    expect(speichereEigenesZeichen(db, neu("F", { kind: "weather", values: ["weather-cloudy"] }), WER, 1)).toMatchObject({ ok: false, fehler: expect.stringContaining("ohne Grundzeichen") });
    expect(speichereEigenesZeichen(db, { ...neu("C"), bild: "<svg/>" }, WER, 1).ok).toBe(false);
    // Die Eingabe passt knapp, die Hülle v2 nicht mehr: abgelehnt, bevor die Datenbank (CHECK ≤ 4000) wirft.
    const knapp = { kind: "post", text: { below: "x".repeat(3955) } };
    expect(JSON.stringify(knapp).length).toBeLessThanOrEqual(4000);
    expect(speichereEigenesZeichen(db, neu("G", knapp), WER, 1)).toEqual({ ok: false, fehler: "Die Zusammenstellung ist zu groß." });
    expect(db.select().from(eigenesZeichen).all()).toEqual([]);
  });
  it("Nutzung zählt Pläne mit dem Schlüssel; Löschen lässt den Schlüssel im Plan stehen, das Symbol fällt weg", () => {
    const db = testDb();
    const z = speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1);
    if (!z.ok) throw new Error(z.fehler);
    const p = legePlanAn(db, { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: null }, WER, 1, TEST_ADMIN);
    if (!p.ok) throw new Error(p.fehler);
    const inhalt = structuredClone(BEISPIELE[0].inhalt);
    inhalt.stellen[0].zeichen = z.schluessel;
    expect(speichereInhalt(db, { id: p.id, version: 1, inhalt }, WER, 2).ok).toBe(true);
    expect(ladeEigeneZeichen(db)[0].nutzung).toBe(1);

    const farbe = symboleFuerPlan(db, inhalt);
    const sw = symboleFuerPlan(db, inhalt, { schwarzweiss: true });
    expect(farbe[z.schluessel].inhalt).toContain("#fafa00");
    expect(sw[z.schluessel].inhalt).not.toContain("#fafa00");
    expect(Object.keys(farbe)).toEqual(expect.arrayContaining(["rezept:D.1.4", z.schluessel]));

    expect(loescheEigenesZeichen(db, { id: z.id })).toEqual({ ok: true });
    expect(loescheEigenesZeichen(db, { id: z.id })).toEqual({ ok: false, fehler: ZEICHEN_WEG });
    expect(symboleFuerPlan(db, inhalt)[z.schluessel]).toBeUndefined();
  });
  it("der Zeichen-Index führt eigene Zeichen vor dem Katalog, auffindbar unter „eigenes Zeichen“", () => {
    const db = testDb();
    speichereEigenesZeichen(db, neu("ILS Würzburg"), WER, 1);
    speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1);
    const index = zeichenIndexMitEigenen(db);
    expect(index.slice(0, 2).map((e) => e.titel)).toEqual(["ILS Schweinfurt", "ILS Würzburg"]);
    expect(index[0].suchtext).toContain("eigenes zeichen");
    expect(index.length).toBeGreaterThan(200);
  });
  it("eine Zeile aus der Zeit vor IDA-408 (nackter Bauplan) liest sich als Beschreibung und zeichnet weiter", () => {
    const db = testDb();
    db.insert(eigenesZeichen).values({
      id: "8f1c2c1e-0000-4000-8000-000000000002", titel: "Alt", aktualisiertAm: new Date(1), aktualisiertVon: "Jana",
      spec: JSON.stringify({ kind: "circle-12", organization: "fuehrung-leitung", administrativeLevel: "kreis", bodyMarks: ["circle-solid-cap-4mm"], labels: { center: "LST", centerCapHeightMm: 7.3 } }),
    }).run();
    expect(ladeEigeneZeichen(db)[0].zeichen).toEqual({
      kind: "circle-12", organization: "fuehrung-leitung", head: "kreis", text: { center: "LST", centerSize: "large" }, exact: { bodyMarks: ["circle-solid-cap-4mm"] },
    });
    const schluessel = "eigen:8f1c2c1e-0000-4000-8000-000000000002";
    const inhalt = structuredClone(BEISPIELE[0].inhalt);
    inhalt.stellen[0].zeichen = schluessel;
    expect(symboleFuerPlan(db, inhalt)[schluessel].inhalt).toContain(">LST</text>");
  });
  it("jede Änderung ist eine Audit-Zeile (Trigger der Migration 0003)", () => {
    const db = testDb();
    const z = speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1);
    if (!z.ok) throw new Error(z.fehler);
    speichereEigenesZeichen(db, { id: z.id, titel: "ILS SW", zeichen: ILS }, WER, 2);
    loescheEigenesZeichen(db, { id: z.id });
    const zeilen = db.all<{ action: string }>(sql`SELECT action FROM audit_outbox WHERE object_type = 'eigenes_zeichen' ORDER BY rowid`);
    expect(zeilen.map((r) => r.action)).toEqual(["create", "update", "delete"]);
  });
});
