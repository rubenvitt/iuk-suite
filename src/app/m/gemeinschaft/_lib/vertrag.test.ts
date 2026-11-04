import { PDFDocument } from "pdf-lib";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { anfrage } from "../_db/schema";
import { testDb, type TestDb } from "./testDb";
import {
  Abgelehnt, anfrageNachCode, entferneVorlage, ladeAnfragen, ladeVertragsdatei, ladeVorlageInfo, legeAnfrageAn, legeUnterschriebenAb,
  legeVorlageAb, sageZu, setzeVorlageFeld, setzeVorlageZeichnen, vertragFuerStatus,
} from "./vermietung";
import { feldAusPixeln, feldInPixeln, pruefeFeld } from "./vertragFeld";
import { fotoAlsPdf, leseVorlage, pruefeUnterschriebeneDatei, sha256, unterschriebenePdf, unterschriftAusDataUrl } from "./vertragUnterschrift";
import { zeitpunkt } from "./zeit";

/*
 * Der digitale Mietvertrag (IDA-343): Vorlage, Unterschriftenfeld, Unterschreiben auf der Statusseite.
 */

const JETZT = zeitpunkt("2026-11-01", "12:00");
// Ein 1×1-PNG — klein, aber echt (embedPng muss es dekodieren).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PNG_URL = `data:image/png;base64,${Buffer.concat([PNG, Buffer.alloc(0)]).toString("base64")}`;

async function vorlagePdf(seiten = 2): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) d.addPage([595.28, 841.89]).drawText(`Seite ${i + 1}`, { x: 50, y: 800 });
  return Buffer.from(await d.save());
}

function zusage(db: TestDb, tag = "2026-11-07"): string {
  const code = legeAnfrageAn(db, {
    von: zeitpunkt(tag, "18:00"), bis: zeitpunkt(tag, "23:00"), anlass: "Geburtstag", personen: 20,
    person: "Erika Sommer", kontakt: "05141 12345", hinweis: "", webseite: "",
  }, false, JETZT);
  const id = db.select({ id: anfrage.id }).from(anfrage).where(eq(anfrage.code, code)).get()!.id;
  sageZu(db, id, JETZT);
  return code;
}

describe("Unterschriftenfeld", () => {
  const A4 = [{ b: 595.28, h: 841.89 }];
  it("Pixel ↔ Punkte: Ursprung oben links auf dem Schirm, unten links in der PDF", () => {
    const f = feldAusPixeln(0, { x1: 300, y1: 700, x2: 100, y2: 650 }, 1, A4[0]);
    expect(f).toEqual({ seite: 0, x: 100, y: 141.9, b: 200, h: 50 });
    const px = feldInPixeln(f, 2, A4[0]);
    expect(px).toMatchObject({ links: 200, breite: 400, hoehe: 100 });
    expect(px.oben).toBeCloseTo(1300, 0);
    // Ein Zug über den Seitenrand wird gekappt, nicht verworfen.
    expect(feldAusPixeln(0, { x1: 500, y1: 10, x2: 900, y2: 60 }, 1, A4[0])).toMatchObject({ x: 500, b: 95.3 });
  });
  it("zu klein, außerhalb der Seite oder auf einer fehlenden Seite: abgelehnt", () => {
    expect(pruefeFeld({ seite: 0, x: 10, y: 10, b: 200, h: 60 }, A4)).not.toBeNull();
    expect(pruefeFeld({ seite: 0, x: 10, y: 10, b: 20, h: 60 }, A4)).toBeNull();
    expect(pruefeFeld({ seite: 0, x: 500, y: 10, b: 200, h: 60 }, A4)).toBeNull();
    expect(pruefeFeld({ seite: 1, x: 10, y: 10, b: 200, h: 60 }, A4)).toBeNull();
    expect(pruefeFeld({ seite: 0, x: 10, y: 10, b: 200, h: 60, mehr: 1 }, A4)).toBeNull();
  });
});

describe("Vorlage", () => {
  it("ablegen setzt laufende Zusagen auf „verschickt“, neue Zusagen kommen gleich so an", async () => {
    const db = testDb();
    const vorher = zusage(db);
    expect(anfrageNachCode(db, vorher)?.vertrag).toEqual({ stand: "offen", vorlage: null, zeichnen: false, datei: null });
    const pdf = await vorlagePdf();
    legeVorlageAb(db, "Mietvertrag.pdf", pdf, sha256(pdf), JETZT);
    expect(anfrageNachCode(db, vorher)?.vertrag).toEqual({ stand: "verschickt", vorlage: sha256(pdf), zeichnen: true, datei: null });
    const danach = zusage(db, "2026-11-14");
    expect(anfrageNachCode(db, danach)?.vertrag?.stand).toBe("verschickt");
    expect(vertragFuerStatus(db, danach)).toMatchObject({ art: "vorlage", name: "Mietvertrag Bar 2026-11-14.pdf" });
  });

  it("ersetzen verwirft das Unterschriftenfeld; entfernen nimmt den Vertrag von der Statusseite", async () => {
    const db = testDb();
    const pdf = await vorlagePdf();
    legeVorlageAb(db, "a.pdf", pdf, sha256(pdf), JETZT);
    setzeVorlageFeld(db, { seite: 1, x: 300, y: 80, b: 200, h: 60 });
    expect(ladeVorlageInfo(db)?.feld).toEqual({ seite: 1, x: 300, y: 80, b: 200, h: 60 });
    legeVorlageAb(db, "b.pdf", pdf, sha256(pdf), JETZT);
    expect(ladeVorlageInfo(db)).toMatchObject({ name: "b.pdf", feld: null });
    const code = zusage(db);
    entferneVorlage(db);
    expect(vertragFuerStatus(db, code)).toBeNull();
  });

  it("Zeichnen lässt sich ausschalten und bleibt beim Ersetzen der Vorlage aus", async () => {
    const db = testDb();
    const pdf = await vorlagePdf();
    legeVorlageAb(db, "a.pdf", pdf, sha256(pdf), JETZT);
    const code = zusage(db);
    setzeVorlageZeichnen(db, false);
    expect(ladeVorlageInfo(db)?.zeichnen).toBe(false);
    expect(anfrageNachCode(db, code)?.vertrag?.zeichnen).toBe(false);
    legeVorlageAb(db, "b.pdf", pdf, sha256(pdf), JETZT);
    expect(ladeVorlageInfo(db)?.zeichnen).toBe(false);
    setzeVorlageZeichnen(db, true);
    expect(anfrageNachCode(db, code)?.vertrag?.zeichnen).toBe(true);
    entferneVorlage(db);
    expect(() => setzeVorlageZeichnen(db, true)).toThrow();
  });

  it("eine unlesbare PDF taugt nicht als Vorlage", async () => {
    expect((await leseVorlage(Buffer.from("%PDF-1.7 kaputt"))).ok).toBe(false);
    expect(await leseVorlage(await vorlagePdf(3))).toMatchObject({ ok: true, seiten: [{ b: 595.28 }, {}, {}] });
  });
});

describe("Unterschreiben auf der Statusseite", () => {
  it("gezeichnet: Unterschrift landet im Feld, Stand „unterschrieben“, danach nur noch Download", async () => {
    const db = testDb();
    const pdf = await vorlagePdf();
    legeVorlageAb(db, "Mietvertrag.pdf", pdf, sha256(pdf), JETZT);
    const code = zusage(db);
    const fertig = await unterschriebenePdf(pdf, { seite: 1, x: 300, y: 80, b: 200, h: 60 }, PNG, { name: "Erika Sommer ✓", am: JETZT, zeitraum: "Sa.", anlass: "Geburtstag", titel: "Mietvertrag Bar 2026-11-07 – unterschrieben" });
    expect((await PDFDocument.load(fertig)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(fertig)).getTitle()).toBe("Mietvertrag Bar 2026-11-07 – unterschrieben");
    legeUnterschriebenAb(db, code, { name: "v.pdf", inhalt: Buffer.from(fertig), herkunft: "gezeichnet", unterschriebenVon: "Erika Sommer", vorlageStand: sha256(pdf) }, JETZT);
    expect(anfrageNachCode(db, code)?.vertrag).toMatchObject({ stand: "unterschrieben", datei: { am: JETZT, herkunft: "gezeichnet" } });
    expect(ladeAnfragen(db)[0].datei).toMatchObject({ herkunft: "gezeichnet", unterschriebenVon: "Erika Sommer" });
    expect(vertragFuerStatus(db, code)).toMatchObject({ art: "unterschrieben", name: "Mietvertrag Bar 2026-11-07 – unterschrieben.pdf" });
    expect(() => legeUnterschriebenAb(db, code, { name: "x.pdf", inhalt: Buffer.from(fertig), herkunft: "hochgeladen", unterschriebenVon: null, vorlageStand: null }, JETZT))
      .toThrow("schon unterschrieben");
  });

  it("ohne Feld kommt eine eigene letzte Seite dazu", async () => {
    const pdf = await vorlagePdf(1);
    const fertig = await unterschriebenePdf(pdf, null, PNG, { name: "Erika Sommer", am: JETZT, zeitraum: "Sa., 7. Nov. 2026, 18:00–23:00 Uhr", anlass: "Geburtstag", titel: "Mietvertrag Bar" });
    expect((await PDFDocument.load(fertig)).getPageCount()).toBe(2);
  });

  it("wurde die Vorlage inzwischen ersetzt, wird nicht unterschrieben", async () => {
    const db = testDb();
    const alt = await vorlagePdf(1);
    const neu = await vorlagePdf(2);
    legeVorlageAb(db, "a.pdf", alt, sha256(alt), JETZT);
    const code = zusage(db);
    legeVorlageAb(db, "b.pdf", neu, sha256(neu), JETZT);
    expect(() => legeUnterschriebenAb(db, code, { name: "v.pdf", inhalt: alt, herkunft: "gezeichnet", unterschriebenVon: "E", vorlageStand: sha256(alt) }, JETZT))
      .toThrow(Abgelehnt);
    expect(ladeVertragsdatei(db, ladeAnfragen(db)[0].id)).toBeNull();
  });

  it("nur zu einer Zusage", async () => {
    const db = testDb();
    const code = legeAnfrageAn(db, { von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-07", "23:00"), anlass: "x", personen: 2, person: "E S", kontakt: "1", hinweis: "", webseite: "" }, false, JETZT);
    expect(() => legeUnterschriebenAb(db, code, { name: "v.pdf", inhalt: PNG, herkunft: "hochgeladen", unterschriebenVon: null, vorlageStand: null }, JETZT)).toThrow("nur zu einer Zusage");
    expect(vertragFuerStatus(db, code)).toBeNull();
  });
});

describe("Eingaben", () => {
  it("Unterschrift nur als PNG-Data-URL in vernünftiger Größe", () => {
    expect(unterschriftAusDataUrl(PNG_URL)?.equals(PNG)).toBe(true);
    expect(unterschriftAusDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBeNull();
    expect(unterschriftAusDataUrl(`data:image/png;base64,${Buffer.from("<svg/>".repeat(30)).toString("base64")}`)).toBeNull();
    expect(unterschriftAusDataUrl(`data:image/png;base64,${"A".repeat(600_000)}`)).toBeNull();
    expect(unterschriftAusDataUrl(42)).toBeNull();
  });

  it("hochgeladen: PDF, JPG oder PNG nach Magic Bytes; ein Foto wird zur einseitigen PDF", async () => {
    expect(pruefeUnterschriebeneDatei("scan.pdf", Buffer.from("%PDF-1.7"))).toMatchObject({ ok: true, art: "pdf", name: "scan.pdf" });
    expect(pruefeUnterschriebeneDatei("IMG_1.jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ ok: true, art: "jpg", name: "IMG_1.pdf" });
    expect(pruefeUnterschriebeneDatei("x.pdf", Buffer.from("<html>"))).toMatchObject({ ok: false, status: 415 });
    const pdf = await fotoAlsPdf(PNG, "png", "Mietvertrag Bar 2026-11-07 – unterschrieben");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect((await PDFDocument.load(pdf)).getTitle()).toBe("Mietvertrag Bar 2026-11-07 – unterschrieben");
  });
  it("PNG mit riesigen Maßen (Dekompressionsbombe) wird vor dem Dekodieren abgelehnt", () => {
    const bombe = Buffer.from(PNG);
    bombe.writeUInt32BE(30_000, 16);
    bombe.writeUInt32BE(30_000, 20);
    expect(unterschriftAusDataUrl(`data:image/png;base64,${bombe.toString("base64")}`)).toBeNull();
    expect(pruefeUnterschriebeneDatei("IMG.png", bombe)).toMatchObject({ ok: false, status: 413 });
    expect(pruefeUnterschriebeneDatei("IMG.png", PNG)).toMatchObject({ ok: true, art: "png" });
    // Ein zweiter IHDR hinter dem harmlosen ersten: der Decoder nähme dessen Maße.
    const ihdr = bombe.subarray(8, 33);
    const zweiter = Buffer.concat([PNG.subarray(0, 33), ihdr, PNG.subarray(33)]);
    expect(pruefeUnterschriebeneDatei("IMG.png", zweiter)).toMatchObject({ ok: false, status: 413 });
    const actl = Buffer.concat([Buffer.from([0, 0, 0, 8]), Buffer.from("acTL"), Buffer.alloc(8), Buffer.alloc(4)]);
    const apng = Buffer.concat([PNG.subarray(0, 33), actl, PNG.subarray(33)]);
    expect(pruefeUnterschriebeneDatei("IMG.png", apng)).toMatchObject({ ok: false, status: 415 });
    expect(unterschriftAusDataUrl(`data:image/png;base64,${apng.toString("base64")}`)).toBeNull();
  });

  it("ohne Vorlage nimmt die Statusseite keinen Vertrag an", () => {
    const db = testDb();
    const code = zusage(db);
    expect(() => legeUnterschriebenAb(db, code, { name: "v.pdf", inhalt: PNG, herkunft: "hochgeladen", unterschriebenVon: null, vorlageStand: null }, JETZT)).toThrow("kein Vertrag");
  });
});
