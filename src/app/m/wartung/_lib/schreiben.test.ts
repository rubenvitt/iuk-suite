import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DirectoryResult } from "@/core/directory";
import { checkpunkt, eintrag, frist, geraet, mangel, verwalter } from "../_db/schema";
import { ladeArten, ladeGeraet } from "./daten";
import {
  Abgelehnt, artSpeichern, erledigtEintragen, geraetAnlegen, gruppeLoeschen, gruppeSpeichern, mangelBeheben, mangelMelden,
  neueId, pruefungAbschliessen, schonGesendet, stundenEintragen, ungepushteAusfaelle,
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
  it("bringt vier Arten mit Fristen und Checklisten mit, dazu die Materialkisten", () => {
    const arten = ladeArten(testDb());
    expect(arten.map((a) => a.name)).toEqual(["Stromerzeuger", "Heizungen", "Akkus und Powerstationen", "IT und Netzwerk", "Materialkisten"]);
    const strom = arten[0];
    expect(strom.stundenPflicht).toBe(true);
    expect(strom.fristen.map((f) => [f.wer, f.monate, f.stunden])).toEqual([["intern", 3, null], ["fachfirma", 12, 100], ["elektrofachkraft", 12, null]]);
    expect(strom.checkliste).toHaveLength(8);
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
    const quartal = g.staende.find((f) => f.vorlage.id === START.frist.stromerzeuger.quartal)!;
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
    const fristId = START.frist.stromerzeuger.wartung;
    expect(() => erledigtEintragen(db, id, { fristId, am: HEUTE, stunden: null, wer: "", notiz: "" }, K)).toThrow(/Stundenintervall/);
    expect(() => erledigtEintragen(db, id, { fristId, am: "2026-11-04", stunden: 120, wer: "", notiz: "" }, K)).toThrow(/Zukunft/);
    expect(() => erledigtEintragen(db, id, { fristId: START.frist.heizung.wartung, am: HEUTE, stunden: 120, wer: "", notiz: "" }, K)).toThrow(/gilt für das Gerät nicht/);
    erledigtEintragen(db, id, { fristId, am: HEUTE, stunden: 120, wer: "Fachfirma", notiz: "Öl gewechselt" }, K);
    const g = ladeGeraet(db, id, HEUTE)!;
    expect(g.stunden).toBe(120);
    expect(g.staende.find((f) => f.vorlage.id === fristId)!.text).toBe("fällig 03.11.2027 oder in 100 h");
  });

  it("Stunden ablesen lehnt einen kleineren Stand ab", () => {
    const { db, id } = mitStromerzeuger();
    expect(() => stundenEintragen(db, id, 99, K)).toThrow(Abgelehnt);
    stundenEintragen(db, id, 130, K);
    expect(db.select().from(geraet).where(eq(geraet.id, id)).get()!.stunden).toBe(130);
    expect(db.select().from(eintrag).where(eq(eintrag.typ, "stunden")).all()).toHaveLength(1);
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

  it("Geräteart: Fristen und Punkte werden abgeglichen, bestehende behalten ihre Kennung", () => {
    const db = testDb();
    const vorher = ladeArten(db).find((a) => a.id === START.art.heizung)!;
    artSpeichern(db, vorher.id, {
      name: "Heizungen", einzahl: "Heizung", ikone: "fire", stundenPflicht: false, kiste: false,
      fristen: [vorher.fristen[0], { id: null, name: "Elektroprüfung", wer: "elektrofachkraft", monate: 12, stunden: null }],
      checkliste: [vorher.checkliste[1], { id: null, text: "Neu", hinweis: "" }],
    }, K.jetzt);
    const nachher = ladeArten(db).find((a) => a.id === START.art.heizung)!;
    expect(nachher.fristen.map((f) => f.name)).toEqual(["Quartalsprüfung", "Elektroprüfung"]);
    expect(nachher.fristen[0].id).toBe(vorher.fristen[0].id);
    expect(nachher.checkliste.map((p) => p.text)).toEqual([vorher.checkliste[1].text, "Neu"]);
    expect(db.select().from(frist).where(eq(frist.id, START.frist.heizung.wartung)).get()).toBeUndefined();
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
