import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DirectoryResult } from "@/core/directory";
import { artPruefart, checkpunkt, eintrag, geraet, geraetPruefart, mangel, pruefart, verwalter } from "../_db/schema";
import { ladeArten, ladeGeraet, ladeKatalog, ladePruefarten } from "./daten";
import {
  Abgelehnt, artSpeichern, erledigtEintragen, geraetAnlegen, gruppeLoeschen, gruppeSpeichern, mangelBeheben, mangelMelden,
  neueId, pruefartLoeschen, pruefartSpeichern, pruefplanSpeichern, pruefungAbschliessen, schonGesendet, stundenEintragen,
  ungepushteAusfaelle,
} from "./schreiben";
import { merkePerson, verwalterHinzufuegen } from "./personen";
import { START } from "./startbestand";
import { testDb } from "./testDb";

const OHNE_VERZEICHNIS: DirectoryResult = { status: "unconfigured", people: [] };

const HEUTE = "2026-11-03";
const K = { jetzt: Date.UTC(2026, 10, 3, 10), heute: HEUTE, wer: "Helfer A" };

function mitStromerzeuger() {
  const db = testDb();
  const id = geraetAnlegen(db, {
    gruppeId: START.gruppe.technik, artId: START.art.stromerzeuger, name: "Stromerzeuger 8 kVA", hersteller: "", typ: "", hinweise: "",
    seriennr: "", ortArt: "fahrzeug", ort: "GW-Technik", fahrzeugId: null, stunden: 100,
  }, K.jetzt);
  const punkte = db.select().from(checkpunkt).where(eq(checkpunkt.artId, START.art.stromerzeuger)).orderBy(checkpunkt.position).all();
  return { db, id, punkte };
}

const alleOk = (punkte: { id: string }[]) => punkte.map((p) => ({ punktId: p.id, ok: true, text: "" }));

describe("Startbestand", () => {
  it("bringt vier Arten mit Prüfarten und Checklisten mit, dazu die Materialkisten", () => {
    const arten = ladeArten(testDb());
    expect(arten.map((a) => a.name)).toEqual(["Stromerzeuger", "Heizungen", "Akkus und Powerstationen", "IT und Netzwerk", "Materialkisten"]);
    const strom = arten[0];
    expect(strom.stundenPflicht).toBe(true);
    expect(strom.pruefarten).toEqual([START.pruefart.quartal, START.pruefart.wartung, START.pruefart.dguv]);
    expect(strom.checkliste).toHaveLength(8);
  });

  it("legt gleichnamige Fristen der Arten zu einer Prüfart zusammen (IDA-368)", () => {
    const db = testDb();
    expect(ladeKatalog(db).map((p) => [p.id, p.name, p.wer, p.monate, p.stunden])).toEqual([
      [START.pruefart.quartal, "Quartalsprüfung", "intern", 3, null],
      [START.pruefart.wartung, "Wartung", "fachfirma", 12, 100],
      [START.pruefart.dguv, "Elektroprüfung (DGUV V3)", "elektrofachkraft", 12, null],
      [START.pruefart.heizsaison, "Wartung vor der Heizsaison", "fachfirma", 12, null],
    ]);
    const arten = ladeArten(db);
    expect(arten.find((a) => a.id === START.art.it)!.pruefarten).toEqual([START.pruefart.quartal, START.pruefart.dguv]);
    expect(arten.find((a) => a.id === START.art.kiste)!.pruefarten).toEqual([START.pruefart.quartal]);
  });
});

describe("Prüfung am Gerät", () => {
  it("erkennt eine schon angekommene Sendung, nur am selben Gerät", () => {
    const { db, id, punkte } = mitStromerzeuger();
    const sendung = neueId();
    expect(schonGesendet(db, "pruefung", sendung, id)).toBeNull();
    pruefungAbschliessen(db, id, { sendung, stunden: 110, antworten: alleOk(punkte), ergebnis: "ok", notiz: "" }, new Map(), K);
    expect(schonGesendet(db, "pruefung", sendung, id)).toEqual({ maengel: 0 });
    expect(schonGesendet(db, "pruefung", sendung, neueId())).toBe("fremd");
    const m = neueId();
    mangelMelden(db, id, { id: m, text: "Riss", foto: false, einsatzbereit: true }, K);
    expect(schonGesendet(db, "mangel", m, id)).toEqual({ maengel: 1 });
    expect(schonGesendet(db, "pruefung", m, id)).toBeNull();
  });

  it("in Ordnung setzt die Frist und die Stunden", () => {
    const { db, id, punkte } = mitStromerzeuger();
    pruefungAbschliessen(db, id, { sendung: neueId(), stunden: 110, antworten: alleOk(punkte), ergebnis: "ok", notiz: "" }, new Map(), K);
    const g = ladeGeraet(db, id, HEUTE)!;
    expect(g.stunden).toBe(110);
    expect(g.zustand).toBe("ok");
    const quartal = g.staende.find((f) => f.vorlage.id === START.pruefart.quartal)!;
    expect(quartal.letzte).toEqual({ am: HEUTE, stunden: 110 });
    expect(quartal.stufe).toBe("ok");
  });

  it("verlangt jeden Punkt, Stunden bei Pflicht und keinen Rückschritt", () => {
    const { db, id, punkte } = mitStromerzeuger();
    expect(() => pruefungAbschliessen(db, id, { sendung: neueId(), stunden: 110, antworten: alleOk(punkte).slice(1), ergebnis: "ok", notiz: "" }, new Map(), K)).toThrow(Abgelehnt);
    expect(() => pruefungAbschliessen(db, id, { sendung: neueId(), stunden: null, antworten: alleOk(punkte), ergebnis: "ok", notiz: "" }, new Map(), K)).toThrow("Betriebsstunden fehlen.");
    expect(() => pruefungAbschliessen(db, id, { sendung: neueId(), stunden: 90, antworten: alleOk(punkte), ergebnis: "ok", notiz: "" }, new Map(), K)).toThrow(/Kleiner als der letzte Stand/);
  });

  it("ein Punkt mit Mangel wird ein Mangel, mit Foto-Kennung; „In Ordnung“ geht dann nicht", () => {
    const { db, id, punkte } = mitStromerzeuger();
    const antworten = alleOk(punkte).map((a, i) => (i === 1 ? { ...a, ok: false, text: "Öl unter Minimum" } : a));
    expect(() => pruefungAbschliessen(db, id, { sendung: neueId(), stunden: 110, antworten, ergebnis: "ok", notiz: "" }, new Map(), K)).toThrow(/nicht „In Ordnung“/);
    const fotoId = neueId();
    const r = pruefungAbschliessen(db, id, { sendung: neueId(), stunden: 110, antworten, ergebnis: "mangel", notiz: "" }, new Map([[punkte[1].id, fotoId]]), K);
    expect(r.maengel).toBe(1);
    const m = db.select().from(mangel).where(eq(mangel.geraetId, id)).all();
    expect(m).toEqual([expect.objectContaining({ id: fotoId, text: "Ölstand: Öl unter Minimum", foto: true, einsatzbereit: true })]);
    expect(ladeGeraet(db, id, HEUTE)!.zustand).toBe("mangel");
  });

  it("nicht einsatzbereit ohne einzelnen Punkt braucht eine Bemerkung, die der Mangel wird", () => {
    const { db, id, punkte } = mitStromerzeuger();
    expect(() => pruefungAbschliessen(db, id, { sendung: neueId(), stunden: 110, antworten: alleOk(punkte), ergebnis: "defekt", notiz: "" }, new Map(), K)).toThrow(/Bemerkung/);
    pruefungAbschliessen(db, id, { sendung: neueId(), stunden: 110, antworten: alleOk(punkte), ergebnis: "defekt", notiz: "Springt nicht an" }, new Map(), K);
    expect(ladeGeraet(db, id, HEUTE)!.zustand).toBe("defekt");
    expect(ungepushteAusfaelle(db, 0)).toEqual([expect.objectContaining({ geraetId: id, gruppeId: START.gruppe.technik })]);
  });
});

describe("Verwaltung", () => {
  it("Wartung nach Stunden braucht den Stand und hebt ihn an", () => {
    const { db, id } = mitStromerzeuger();
    const pruefartId = START.pruefart.wartung;
    expect(() => erledigtEintragen(db, id, { pruefartId, am: HEUTE, stunden: null, wer: "", notiz: "" }, K)).toThrow(/Stundenintervall/);
    expect(() => erledigtEintragen(db, id, { pruefartId, am: "2026-11-04", stunden: 120, wer: "", notiz: "" }, K)).toThrow(/Zukunft/);
    expect(() => erledigtEintragen(db, id, { pruefartId: START.pruefart.heizsaison, am: HEUTE, stunden: 120, wer: "", notiz: "" }, K)).toThrow(/gilt für das Gerät nicht/);
    erledigtEintragen(db, id, { pruefartId, am: HEUTE, stunden: 120, wer: "Fachfirma", notiz: "Öl gewechselt" }, K);
    const g = ladeGeraet(db, id, HEUTE)!;
    expect(g.stunden).toBe(120);
    expect(g.staende.find((f) => f.vorlage.id === pruefartId)!.text).toBe("fällig 03.11.2027 oder in 100 h");
  });

  it("Stunden ablesen lehnt einen kleineren Stand ab", () => {
    const { db, id } = mitStromerzeuger();
    expect(() => stundenEintragen(db, id, 99, K)).toThrow(Abgelehnt);
    stundenEintragen(db, id, 130, K);
    expect(db.select().from(geraet).where(eq(geraet.id, id)).get()!.stunden).toBe(130);
    expect(db.select().from(eintrag).where(eq(eintrag.typ, "stunden")).all()).toHaveLength(1);
  });

  it("Stunden ablesen: dieselbe Sendung zweimal bucht einmal (IDA-358)", () => {
    const { db, id } = mitStromerzeuger();
    const sendung = neueId();
    stundenEintragen(db, id, 130, K, sendung);
    stundenEintragen(db, id, 130, K, sendung);
    const e = db.select().from(eintrag).where(eq(eintrag.typ, "stunden")).all();
    expect(e.map((x) => x.id)).toEqual([sendung]);
  });

  it("„Behoben“ setzt das Gerät zurück, wenn nichts anderes offen ist", () => {
    const { db, id } = mitStromerzeuger();
    const a = neueId();
    const b = neueId();
    mangelMelden(db, id, { id: a, text: "Tankdeckel", foto: false, einsatzbereit: true }, K);
    mangelMelden(db, id, { id: b, text: "Zündet nicht", foto: false, einsatzbereit: false }, K);
    expect(ladeGeraet(db, id, HEUTE)!.zustand).toBe("defekt");
    mangelBeheben(db, b, K);
    expect(ladeGeraet(db, id, HEUTE)!.zustand).toBe("mangel");
    expect(() => mangelBeheben(db, b, K)).toThrow(/schon behoben/);
    mangelBeheben(db, a, K);
    expect(ladeGeraet(db, id, HEUTE)!.zustand).toBe("ok");
  });

  it("Geräteart: Prüfarten und Punkte werden abgeglichen, bestehende Punkte behalten ihre Kennung", () => {
    const db = testDb();
    const vorher = ladeArten(db).find((a) => a.id === START.art.heizung)!;
    artSpeichern(db, vorher.id, {
      name: "Heizungen", einzahl: "Heizung", ikone: "fire", stundenPflicht: false, kiste: false,
      pruefarten: [START.pruefart.quartal, START.pruefart.dguv],
      checkliste: [vorher.checkliste[1], { id: null, text: "Neu", hinweis: "" }],
    }, K.jetzt);
    const nachher = ladeArten(db).find((a) => a.id === START.art.heizung)!;
    expect(nachher.pruefarten).toEqual([START.pruefart.quartal, START.pruefart.dguv]);
    expect(nachher.checkliste.map((p) => p.text)).toEqual([vorher.checkliste[1].text, "Neu"]);
    // Die Prüfart selbst bleibt im Katalog, nur die Heizungen haben sie nicht mehr.
    expect(db.select().from(pruefart).where(eq(pruefart.id, START.pruefart.heizsaison)).get()).toBeDefined();
  });

  it("Geräteart: höchstens eine Prüfart selbst am Gerät, und sie braucht eine Checkliste", () => {
    const db = testDb();
    const zweite = pruefartSpeichern(db, null, { name: "Probelauf", wer: "intern", monate: 1, stunden: null });
    const a = ladeArten(db).find((x) => x.id === START.art.heizung)!;
    const basis = { name: a.name, einzahl: a.einzahl, ikone: a.ikone, stundenPflicht: false, kiste: false, checkliste: a.checkliste };
    expect(() => artSpeichern(db, a.id, { ...basis, pruefarten: [START.pruefart.quartal, zweite] }, K.jetzt)).toThrow(/nur eine Prüfart/);
    expect(() => artSpeichern(db, a.id, { ...basis, pruefarten: [START.pruefart.quartal], checkliste: [] }, K.jetzt)).toThrow(/mindestens einen Punkt/);
    // Abgelehnt heißt: nichts geändert.
    expect(ladeArten(db).find((x) => x.id === a.id)!.pruefarten).toEqual(a.pruefarten);
  });

  it("Prüfart im Katalog ändern gilt an jedem Gerät ohne eigenes Intervall (IDA-368)", () => {
    const { db, id } = mitStromerzeuger();
    pruefartSpeichern(db, START.pruefart.dguv, { name: "Elektroprüfung (DGUV V3)", wer: "elektrofachkraft", monate: 24, stunden: null });
    expect(ladeGeraet(db, id, HEUTE)!.staende.find((f) => f.vorlage.id === START.pruefart.dguv)!.vorlage.monate).toBe(24);
    expect(() => pruefartSpeichern(db, START.pruefart.dguv, { name: "DGUV", wer: "intern", monate: 12, stunden: null })).toThrow(/nur eine Prüfart/);
  });

  it("Prüfplan am Gerät: abwählen, zusätzlich, eigenes Intervall — gespeichert wird nur die Abweichung", () => {
    const { db, id } = mitStromerzeuger();
    pruefplanSpeichern(db, id, [
      { pruefartId: START.pruefart.dguv, an: false, eigenes: null },
      { pruefartId: START.pruefart.wartung, an: true, eigenes: { monate: 24, stunden: null } },
      { pruefartId: START.pruefart.heizsaison, an: true, eigenes: null },
      { pruefartId: START.pruefart.quartal, an: true, eigenes: null },
    ]);
    const g = ladeGeraet(db, id, HEUTE)!;
    expect(g.staende.map((f) => [f.vorlage.id, f.vorlage.monate, f.vorlage.stunden])).toEqual([
      [START.pruefart.quartal, 3, null],
      [START.pruefart.wartung, 24, null],
      [START.pruefart.heizsaison, 12, null],
    ]);
    expect(g.plan.find((p) => p.pruefart.id === START.pruefart.dguv)).toMatchObject({ standard: true, an: false, vorlage: null });
    expect(db.select().from(geraetPruefart).where(eq(geraetPruefart.geraetId, id)).all()).toHaveLength(3);
    expect(() => erledigtEintragen(db, id, { pruefartId: START.pruefart.dguv, am: HEUTE, stunden: null, wer: "", notiz: "" }, K)).toThrow(/gilt für das Gerät nicht/);
    // Die Art schaltet DGUV ab und wieder an: das Gerät bleibt bei seiner Abwahl.
    expect(ladePruefarten(db).find((p) => p.id === START.pruefart.dguv)!.geraete).toBe(0);
  });

  it("Prüfplan am Gerät: eine zweite Prüfung selbst am Gerät wird abgelehnt", () => {
    const { db, id } = mitStromerzeuger();
    const zweite = pruefartSpeichern(db, null, { name: "Probelauf", wer: "intern", monate: 1, stunden: null });
    expect(() => pruefplanSpeichern(db, id, [{ pruefartId: zweite, an: true, eigenes: null }])).toThrow(/nur eine Prüfart/);
    expect(db.select().from(geraetPruefart).all()).toEqual([]);
  });

  it("Prüfart löschen: fällt aus Arten und Geräten, der Verlauf behält den Namen", () => {
    const { db, id } = mitStromerzeuger();
    erledigtEintragen(db, id, { pruefartId: START.pruefart.dguv, am: HEUTE, stunden: null, wer: "Elektrofachbetrieb", notiz: "" }, K);
    pruefartLoeschen(db, START.pruefart.dguv);
    expect(db.select().from(artPruefart).where(eq(artPruefart.pruefartId, START.pruefart.dguv)).all()).toEqual([]);
    expect(ladeGeraet(db, id, HEUTE)!.staende.map((f) => f.vorlage.id)).not.toContain(START.pruefart.dguv);
    const e = db.select().from(eintrag).where(eq(eintrag.typ, "erledigt")).get()!;
    expect([e.pruefartId, e.titel]).toEqual([null, "Elektroprüfung (DGUV V3)"]);
  });

  it("Gruppen: Löschen nur ohne Geräte, die Verwalter gehen mit", () => {
    const { db } = mitStromerzeuger();
    expect(() => gruppeLoeschen(db, START.gruppe.technik)).toThrow(/noch Geräte/);
    const neu = gruppeSpeichern(db, null, { name: "Logistik" }, K.jetzt);
    merkePerson(db, "sub-1", "Verwalterin Logistik");
    verwalterHinzufuegen(db, neu, "sub-1", K.jetzt, OHNE_VERZEICHNIS);
    gruppeLoeschen(db, neu);
    expect(db.select().from(verwalter).all()).toEqual([]);
  });
});
