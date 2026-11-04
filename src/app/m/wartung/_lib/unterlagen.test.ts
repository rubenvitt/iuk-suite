import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ladeGeraet, ladeUnterlage, ladeUnterlagen } from "./daten";
import { Abgelehnt, geraetAktiv, geraetAendern, geraetAnlegen, neueId, unterlageAnlegen, unterlageLoeschen, unterlageVerschieben } from "./schreiben";
import { START } from "./startbestand";
import { testDb } from "./testDb";
import { UNTERLAGEN_MAX } from "./eingabe";
import { anzeigeKopf, dateiname, istPdf, legeUnterlageAb, leseUnterlage, pruefeUnterlage, entferneUnterlage, UNTERLAGE_MAX_BYTES } from "./unterlagen";

const K = { jetzt: Date.UTC(2026, 10, 4, 8), wer: "Verwalter Technik" };
const BASIS = {
  gruppeId: START.gruppe.technik, artId: START.art.stromerzeuger, name: "Stromerzeuger 8 kVA", hersteller: "", typ: "",
  seriennr: "", ortArt: "lager" as const, ort: "Lager", stunden: null, hinweise: "",
};

function mitGeraet() {
  const db = testDb();
  return { db, id: geraetAnlegen(db, BASIS, K.jetzt) };
}

describe("Hinweise am Gerät", () => {
  it("stehen am Gerät und lassen sich ändern", () => {
    const { db, id } = mitGeraet();
    expect(ladeGeraet(db, id, "2026-11-04")!.hinweise).toBe("");
    geraetAendern(db, id, { ...BASIS, hinweise: "Nur im Freien betreiben." }, K.jetzt);
    expect(ladeGeraet(db, id, "2026-11-04")!.hinweise).toBe("Nur im Freien betreiben.");
  });
});

describe("Unterlagen am Gerät", () => {
  it("hängen hinten an, lassen sich ordnen und entfernen", () => {
    const { db, id } = mitGeraet();
    const a = neueId();
    const b = neueId();
    unterlageAnlegen(db, id, { id: a, titel: "Kurzanleitung", typ: "pdf", bytes: 1000 }, K);
    unterlageAnlegen(db, id, { id: b, titel: "Handbuch", typ: "pdf", bytes: 2000 }, K);
    expect(ladeUnterlagen(db, id).map((u) => u.titel)).toEqual(["Kurzanleitung", "Handbuch"]);
    unterlageVerschieben(db, b, -1);
    expect(ladeUnterlagen(db, id).map((u) => u.titel)).toEqual(["Handbuch", "Kurzanleitung"]);
    unterlageVerschieben(db, b, -1);
    expect(ladeUnterlagen(db, id).map((u) => u.titel)).toEqual(["Handbuch", "Kurzanleitung"]);
    expect(ladeUnterlage(db, a)).toMatchObject({ geraetId: id, gruppeId: START.gruppe.technik, aktiv: true, typ: "pdf" });
    unterlageLoeschen(db, a);
    expect(ladeUnterlagen(db, id).map((u) => u.id)).toEqual([b]);
  });

  it("nimmt an einem ausgemusterten Gerät nichts an und deckelt die Zahl", () => {
    const { db, id } = mitGeraet();
    for (let i = 0; i < UNTERLAGEN_MAX; i++) unterlageAnlegen(db, id, { id: neueId(), titel: `Blatt ${i}`, typ: "bild", bytes: 1 }, K);
    expect(() => unterlageAnlegen(db, id, { id: neueId(), titel: "zu viel", typ: "bild", bytes: 1 }, K)).toThrow(Abgelehnt);
    geraetAktiv(db, id, false, K.jetzt);
    const { db: db2, id: id2 } = mitGeraet();
    geraetAktiv(db2, id2, false, K.jetzt);
    expect(() => unterlageAnlegen(db2, id2, { id: neueId(), titel: "Handbuch", typ: "pdf", bytes: 1 }, K)).toThrow(Abgelehnt);
  });
});

describe("Dateien der Unterlagen", () => {
  let dir: string;
  const vorher = process.env.DATA_DIR;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "wartung-unterlagen-")); process.env.DATA_DIR = dir; });
  afterEach(async () => { process.env.DATA_DIR = vorher; await rm(dir, { recursive: true, force: true }); });

  it("erkennt ein PDF an den ersten Bytes, nicht am Namen", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n%…\n");
    expect(istPdf(pdf)).toBe(true);
    expect(await pruefeUnterlage(pdf)).toMatchObject({ typ: "pdf" });
    expect(await pruefeUnterlage(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(await pruefeUnterlage(new Uint8Array(0))).toBeNull();
    expect(await pruefeUnterlage(new Uint8Array(UNTERLAGE_MAX_BYTES + 1))).toBeNull();
  });

  it("rechnet ein Bild neu und legt es ab", async () => {
    const { default: sharp } = await import("sharp");
    const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#c8000f" } }).png().toBuffer();
    const r = await pruefeUnterlage(new Uint8Array(png));
    expect(r?.typ).toBe("bild");
    expect(r!.inhalt.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const id = neueId();
    await legeUnterlageAb(id, "bild", r!.inhalt);
    expect(await leseUnterlage(id, "bild")).toEqual(r!.inhalt);
    await entferneUnterlage(id, "bild");
    expect(await leseUnterlage(id, "bild")).toBeNull();
  });

  it("baut aus keiner fremden ID einen Pfad", async () => {
    await expect(leseUnterlage("../../etc/passwd", "pdf")).rejects.toThrow();
  });

  it("gibt dem Browser einen sauberen Dateinamen", () => {
    expect(dateiname('Betriebsanleitung: "SEA" 8/kVA', "pdf")).toBe("Betriebsanleitung SEA 8 kVA.pdf");
    expect(anzeigeKopf("Kurzanleitung Zeltheizung", "bild")).toBe(
      `inline; filename="Kurzanleitung Zeltheizung.jpg"; filename*=UTF-8''Kurzanleitung%20Zeltheizung.jpg`,
    );
    expect(anzeigeKopf("Größe", "pdf")).toContain(`filename="Groe.pdf"`);
  });
});
