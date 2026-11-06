import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { checkpunkt, eintrag } from "../_db/schema";
import { ladeArten, ladeGeraet } from "./daten";
import { anlassVermerken, artSpeichern, erledigtEintragen, geraetAnlegen, pruefartSpeichern, pruefplanSpeichern, pruefungAbschliessen } from "./schreiben";
import { START } from "./startbestand";
import { ladeAmGeraet } from "./telefon";
import { testDb } from "./testDb";

/**
 * IDA-369: Prüfungen vor der Verwendung und nach der Benutzung. „Wird eingesetzt“ bzw. „Zurück“ macht sie fällig,
 * bis jemand sie abhakt; die Punkte der Checkliste gehören zu einzelnen Prüfarten oder zu allen.
 */
const HEUTE = "2026-11-06";
let uhr = Date.UTC(2026, 10, 6, 8);
const k = () => ({ jetzt: (uhr += 60_000), heute: HEUTE, wer: "Helfer A" });

function mitLaptop() {
  const db = testDb();
  const vorher = pruefartSpeichern(db, null, { name: "Kurzcheck vor dem Einsatz", wer: "intern", monate: null, stunden: null, anlass: "einsatz" });
  const nachher = pruefartSpeichern(db, null, { name: "Nach dem Einsatz", wer: "intern", monate: null, stunden: null, anlass: "rueckkehr" });
  const it = ladeArten(db).find((a) => a.id === START.art.it)!;
  // „Einschalten“ zu allen, „Konfiguration sichern“ nur zur Quartalsprüfung.
  artSpeichern(db, it.id, {
    name: it.name, einzahl: it.einzahl, ikone: it.ikone, stundenPflicht: false, kiste: false,
    pruefarten: [...it.pruefarten, vorher, nachher],
    checkliste: [
      { id: null, text: "Einschalten", hinweis: "", pruefarten: [] },
      { id: null, text: "Konfiguration sichern", hinweis: "", pruefarten: [START.pruefart.quartal] },
      { id: null, text: "Akku laden", hinweis: "", pruefarten: [nachher] },
    ],
  }, k().jetzt);
  const id = geraetAnlegen(db, {
    gruppeId: START.gruppe.iuk, artId: START.art.it, name: "Laptop 1", hersteller: "", typ: "", hinweise: "",
    seriennr: "", ortArt: "lager", ort: "Lager", fahrzeugId: null, stunden: null,
  }, k().jetzt);
  const punkt = (text: string) => db.select().from(checkpunkt).where(eq(checkpunkt.text, text)).get()!.id;
  return { db, id, vorher, nachher, punkt };
}

const stand = (db: ReturnType<typeof testDb>, id: string, pruefartId: string) =>
  ladeGeraet(db, id, HEUTE)!.staende.find((f) => f.vorlage.id === pruefartId)!;

describe("Prüfungen vor und nach dem Einsatz (IDA-369)", () => {
  it("„Wird eingesetzt“ macht die Prüfung vorher fällig, bis sie abgehakt ist; „Zurück“ die nachher", () => {
    const { db, id, vorher, nachher, punkt } = mitLaptop();
    expect(stand(db, id, vorher)).toMatchObject({ stufe: "ok", text: "vor jeder Verwendung" });
    expect(ladeGeraet(db, id, HEUTE)!.imEinsatz).toBe(false);

    anlassVermerken(db, id, "einsatz", k());
    expect(stand(db, id, vorher)).toMatchObject({ stufe: "ueberfaellig", text: "eingesetzt am 06.11.2026" });
    expect(stand(db, id, nachher).stufe).toBe("ok");
    expect(ladeGeraet(db, id, HEUTE)!.imEinsatz).toBe(true);

    // Ohne Auswahl läuft am Gerät die fällige, mit ihren Punkten.
    const am = ladeAmGeraet(db, id, HEUTE)!;
    expect(am.pruefung?.vorlage.id).toBe(vorher);
    expect(am.checkliste.map((p) => p.text)).toEqual(["Einschalten"]);
    pruefungAbschliessen(db, id, {
      sendung: crypto.randomUUID(), stunden: null, antworten: [{ punktId: punkt("Einschalten"), ok: true, text: "" }], ergebnis: "ok", notiz: "",
    }, new Map(), k());
    expect(stand(db, id, vorher).stufe).toBe("ok");
    expect(db.select().from(eintrag).where(eq(eintrag.typ, "pruefung")).get()!.pruefartId).toBe(vorher);

    anlassVermerken(db, id, "rueckkehr", k());
    expect(stand(db, id, nachher)).toMatchObject({ stufe: "ueberfaellig", text: "zurück am 06.11.2026" });
    expect(stand(db, id, vorher).stufe).toBe("ok");
    expect(ladeAmGeraet(db, id, HEUTE)!.checkliste.map((p) => p.text)).toEqual(["Einschalten", "Akku laden"]);
  });

  it("eine Prüfung vom Einsatztag, aber vor dem Einsatz, hebt ihn nicht auf, auch nicht mit einer älteren nachgetragen", () => {
    const { db, id, vorher, punkt } = mitLaptop();
    pruefungAbschliessen(db, id, {
      sendung: crypto.randomUUID(), pruefartId: vorher, stunden: null, antworten: [{ punktId: punkt("Einschalten"), ok: true, text: "" }], ergebnis: "ok", notiz: "",
    }, new Map(), k());
    anlassVermerken(db, id, "einsatz", k());
    expect(stand(db, id, vorher).stufe).toBe("ueberfaellig");
    erledigtEintragen(db, id, { pruefartId: vorher, am: "2026-11-01", stunden: null, wer: "Helfer A", notiz: "" }, k());
    expect(stand(db, id, vorher).stufe).toBe("ueberfaellig");
  });

  it("doppelt getippt und „Zurück“ ohne Einsatz schreiben nichts", () => {
    const { db, id } = mitLaptop();
    anlassVermerken(db, id, "rueckkehr", k());
    anlassVermerken(db, id, "einsatz", k());
    anlassVermerken(db, id, "einsatz", k());
    expect(db.select({ typ: eintrag.typ }).from(eintrag).where(eq(eintrag.geraetId, id)).all()).toEqual([{ typ: "einsatz" }]);
  });

  it("die gewählte Prüfung nimmt nur ihre Punkte; fehlt einer, wird abgelehnt", () => {
    const { db, id, punkt } = mitLaptop();
    const am = ladeAmGeraet(db, id, HEUTE, START.pruefart.quartal)!;
    expect(am.checkliste.map((p) => p.text)).toEqual(["Einschalten", "Konfiguration sichern"]);
    expect(am.punkteJe[START.pruefart.quartal]).toBe(2);
    const p = (antworten: { punktId: string; ok: boolean; text: string }[]) => ({
      sendung: crypto.randomUUID(), pruefartId: START.pruefart.quartal, stunden: null, antworten, ergebnis: "ok" as const, notiz: "",
    });
    expect(() => pruefungAbschliessen(db, id, p([{ punktId: punkt("Einschalten"), ok: true, text: "" }]), new Map(), k())).toThrow(/Checkliste hat sich geändert/);
    pruefungAbschliessen(db, id, p([
      { punktId: punkt("Einschalten"), ok: true, text: "" }, { punktId: punkt("Konfiguration sichern"), ok: true, text: "" },
    ]), new Map(), k());
    expect(JSON.parse(db.select().from(eintrag).where(eq(eintrag.typ, "pruefung")).get()!.antworten!)).toHaveLength(2);
    // Was nicht selbst am Gerät erledigt wird, ist keine Prüfung am Gerät.
    expect(() => pruefungAbschliessen(db, id, { ...p([]), pruefartId: START.pruefart.dguv }, new Map(), k())).toThrow(/gilt für das Gerät nicht/);
  });

  it("Regeln: je Anlass eine, kein Intervall auf Anlass, und jede braucht einen Punkt", () => {
    const { db, id, nachher } = mitLaptop();
    const it = ladeArten(db).find((a) => a.id === START.art.it)!;
    const zweite = pruefartSpeichern(db, null, { name: "Noch ein Kurzcheck", wer: "intern", monate: null, stunden: null, anlass: "einsatz" });
    const basis = { name: it.name, einzahl: it.einzahl, ikone: it.ikone, stundenPflicht: false, kiste: false, checkliste: it.checkliste };
    expect(() => artSpeichern(db, it.id, { ...basis, pruefarten: [...it.pruefarten, zweite] }, k().jetzt)).toThrow(/nur eine Prüfart „Vor Verwendung“/);
    expect(() => pruefplanSpeichern(db, id, [{ pruefartId: nachher, an: true, eigenes: { monate: 3, stunden: null } }])).toThrow(/kein Intervall/);
    // „Akku laden“ nur noch zur Quartalsprüfung: dann hat die Prüfung nach dem Einsatz keine eigenen Punkte, aber „Einschalten“ gilt für alle.
    const ohneAlle = it.checkliste.filter((p) => p.text !== "Einschalten");
    expect(() => artSpeichern(db, it.id, { ...basis, pruefarten: it.pruefarten, checkliste: ohneAlle.map((p) => ({ ...p, pruefarten: [START.pruefart.quartal] })) }, k().jetzt))
      .toThrow(/„Kurzcheck vor dem Einsatz“ braucht mindestens einen Punkt/);
    // Ein Punkt gehört nur zu Prüfarten, die man selbst erledigt.
    expect(() => artSpeichern(db, it.id, { ...basis, pruefarten: it.pruefarten, checkliste: [{ ...it.checkliste[0], pruefarten: [START.pruefart.dguv] }] }, k().jetzt))
      .toThrow(/nicht selbst am Gerät/);
    expect(ladeArten(db).find((a) => a.id === it.id)!.checkliste.map((p) => [p.text, p.pruefarten])).toEqual(it.checkliste.map((p) => [p.text, p.pruefarten]));
  });

  it("eine Prüfart wird auf Anlass umgestellt: ihr Intervall am Gerät fällt weg", () => {
    const { db, id } = mitLaptop();
    const probe = pruefartSpeichern(db, null, { name: "Probelauf", wer: "fachfirma", monate: 6, stunden: null });
    pruefplanSpeichern(db, id, [{ pruefartId: probe, an: true, eigenes: { monate: 3, stunden: null } }]);
    expect(() => pruefartSpeichern(db, probe, { name: "Probelauf", wer: "fachfirma", monate: null, stunden: null, anlass: "rueckkehr" })).toThrow();
    // Zweite Prüfart „Nach Benutzung“ am Laptop: abgelehnt, die Umstellung rollt zurück.
    expect(() => pruefartSpeichern(db, probe, { name: "Probelauf", wer: "intern", monate: null, stunden: null, anlass: "rueckkehr" })).toThrow(/nur eine Prüfart „Nach Benutzung“/);
    expect(stand(db, id, probe).vorlage).toMatchObject({ monate: 3, anlass: null });
  });
});
