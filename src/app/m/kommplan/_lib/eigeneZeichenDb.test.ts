import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { eigenesZeichen } from "../_db/schema";
import { ZEICHEN_WEG, ladeEigeneZeichen, loescheEigenesZeichen, speichereEigenesZeichen } from "./eigeneZeichenDb";
import { BEISPIELE } from "./beispiele";
import { legePlanAn, speichereInhalt } from "./speichern";
import { testDb } from "./testDb";
import { symboleFuerPlan, zeichenIndexMitEigenen } from "./zeichen/symbole";

const WER = { nutzer: "u1", name: "Jana" };
const ILS = { kind: "post", organization: "fuehrung-leitung", labels: { center: "ILS", bottomRight: "SW" } };
const neu = (titel: string, spec: unknown = ILS) => ({ id: null, titel, spec });

describe("eigene Zeichen in der Datenbank", () => {
  it("anlegen, lesen (mit Beschreibung), umbenennen, ändern; Spec kanonisch gespeichert", () => {
    const db = testDb();
    const r = speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1000);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.schluessel).toBe(`eigen:${r.id}`);
    expect(ladeEigeneZeichen(db)).toEqual([{ id: r.id, schluessel: r.schluessel, titel: "ILS Schweinfurt", spec: { kind: "post", labels: { bottomRight: "SW", center: "ILS" }, organization: "fuehrung-leitung" }, beschreibung: expect.stringContaining("Kürzel: ILS"), nutzung: 0 }]);
    expect(speichereEigenesZeichen(db, { id: r.id, titel: "ILS SW", spec: { ...ILS, labels: { center: "ILS" } } }, WER, 2000)).toMatchObject({ ok: true, titel: "ILS SW" });
    expect(ladeEigeneZeichen(db)[0]).toMatchObject({ titel: "ILS SW", spec: { labels: { center: "ILS" } } });
    expect(db.select().from(eigenesZeichen).get()).toMatchObject({ aktualisiertVon: "Jana", aktualisiertAm: new Date(2000) });
  });
  it("Dubletten nach Name, unbekannte ID, Pflichtname", () => {
    const db = testDb();
    expect(speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1).ok).toBe(true);
    expect(speichereEigenesZeichen(db, neu("  ils   schweinfurt "), WER, 1)).toMatchObject({ ok: false, feldFehler: { titel: "„ILS Schweinfurt“ heißt schon ein eigenes Zeichen." } });
    expect(speichereEigenesZeichen(db, { id: "8f1c2c1e-0000-4000-8000-000000000000", titel: "X", spec: ILS }, WER, 1)).toEqual({ ok: false, fehler: ZEICHEN_WEG });
    expect(speichereEigenesZeichen(db, neu(" "), WER, 1)).toMatchObject({ ok: false, feldFehler: { titel: "Bitte einen Namen eintragen." } });
    expect(speichereEigenesZeichen(db, { id: "../x", titel: "X", spec: ILS }, WER, 1).ok).toBe(false);
  });
  it("nimmt nur, was sich lesen UND zeichnen lässt — der Server zeichnet selbst, ein Bild aus dem Browser gibt es nicht", () => {
    const db = testDb();
    expect(speichereEigenesZeichen(db, neu("A", { kind: "post", svg: "<script>" }), WER, 1)).toMatchObject({ ok: false, fehler: expect.stringContaining("nicht lesen") });
    expect(speichereEigenesZeichen(db, neu("B", { kind: "person", organization: "feuerwehr", technicalFill: "rot" }), WER, 1)).toMatchObject({ ok: false, fehler: expect.stringContaining("nicht zeichnen") });
    expect(speichereEigenesZeichen(db, { ...neu("C"), bild: "<svg/>" }, WER, 1).ok).toBe(false);
    expect(db.select().from(eigenesZeichen).all()).toEqual([]);
  });
  it("Nutzung zählt Pläne mit dem Schlüssel; Löschen lässt den Schlüssel im Plan stehen, das Symbol fällt weg", () => {
    const db = testDb();
    const z = speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1);
    if (!z.ok) throw new Error(z.fehler);
    const p = legePlanAn(db, { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: null }, WER, 1);
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
  it("jede Änderung ist eine Audit-Zeile (Trigger der Migration 0003)", () => {
    const db = testDb();
    const z = speichereEigenesZeichen(db, neu("ILS Schweinfurt"), WER, 1);
    if (!z.ok) throw new Error(z.fehler);
    speichereEigenesZeichen(db, { id: z.id, titel: "ILS SW", spec: ILS }, WER, 2);
    loescheEigenesZeichen(db, { id: z.id });
    const zeilen = db.all<{ action: string }>(sql`SELECT action FROM audit_outbox WHERE object_type = 'eigenes_zeichen' ORDER BY rowid`);
    expect(zeilen.map((r) => r.action)).toEqual(["create", "update", "delete"]);
  });
});
