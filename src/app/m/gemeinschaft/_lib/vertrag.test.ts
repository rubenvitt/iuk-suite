import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";
import { anfrage, vertragsunterschrift } from "../_db/schema";
import { testDb, type TestDb } from "./testDb";
import { dokumentPdf, leseVorlage, type Rahmen } from "./dokumentPdf";
import { ansichtPdf, fassungMitLeitung, fassungMitMieter } from "./dokumentErzeugen";
import {
  Abgelehnt, anfrageNachCode, dokumentFuerStatus, dokumentGrundlage, entferneVertrag, entferneVorlage, erstelleDokument, gebeDokumentFrei,
  ladeAnfragen, ladeDokument, ladeVertragsdatei, ladeVorlage, ladeVorlagenInfo, legeAnfrageAn, legeUnterschriebenAb, legeVertragAb, legeVorlageAb,
  nimmFreigabeZurueck, pruefeLeitungUnterschreibbar, sageZu, setzeVorlageFelder, setzeVorlageZeichnen, speichereWerte, unterschreibeAlsLeitung, verwirfDokument,
} from "./vermietung";
import { EIGENE_SEITE, feldAusPixeln, feldInPixeln, mieterFeldIds, pruefeFelder, pruefeRect, pruefeWerte, type Vertragsfeld } from "./vertragFeld";
import { fotoAlsPdf, pruefeUnterschriebeneDatei, sha256, unterschriftAusDataUrl } from "./vertragUnterschrift";
import { zeitpunkt } from "./zeit";

/*
 * Die Dokumente der Vermietung (IDA-343, IDA-354): Vorlage mit Formular- und aufgezogenen Feldern, je Zusage ein
 * Dokument mit Werten der Leitung, Freigabe, Unterschrift der mietenden Person, danach die der Leitung (IDA-364).
 */

const JETZT = zeitpunkt("2026-11-01", "12:00");
// Ein 1×1-PNG — klein, aber echt (embedPng muss es dekodieren).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PNG_URL = `data:image/png;base64,${PNG.toString("base64")}`;
const A4 = [{ b: 595.28, h: 841.89 }];
const RAHMEN: Rahmen = { titel: "Mietvertrag Bar", dokument: "Mietvertrag", zeitraum: "Sa., 7. Nov. 2026", anlass: "Geburtstag", am: JETZT };

async function vorlagePdf(seiten = 2): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) d.addPage([595.28, 841.89]).drawText(`Seite ${i + 1}`, { x: 50, y: 800 });
  return Buffer.from(await d.save());
}

/** Eine Vorlage mit echtem Formular: ein Textfeld „Kaution“ und ein Ankreuzfeld „Reinigung“ auf Seite 1. */
async function formularPdf(): Promise<Buffer> {
  const d = await PDFDocument.create();
  const s = d.addPage([595.28, 841.89]);
  const form = d.getForm();
  form.createTextField("Kaution").addToPage(s, { x: 100, y: 600, width: 200, height: 20 });
  form.createCheckBox("Reinigung.erledigt").addToPage(s, { x: 100, y: 560, width: 12, height: 12 });
  return Buffer.from(await d.save());
}

const gezogen = (id: string, art: Vertragsfeld["art"], mehr: Partial<Vertragsfeld> = {}): Vertragsfeld =>
  ({ id: `g:${id}`, art, name: id, quelle: "gezogen", seite: 0, x: 300, y: 80, b: 200, h: 60, ...mehr });

function zusage(db: TestDb, tag = "2026-11-07"): { code: string; id: string } {
  const code = legeAnfrageAn(db, {
    von: zeitpunkt(tag, "18:00"), bis: zeitpunkt(tag, "23:00"), anlass: "Geburtstag", personen: 20,
    person: "Erika Sommer", kontakt: "05141 12345", hinweis: "", webseite: "",
  }, false, JETZT);
  const id = db.select({ id: anfrage.id }).from(anfrage).where(eq(anfrage.code, code)).get()!.id;
  sageZu(db, id, JETZT);
  return { code, id };
}

/** Vorlage mit einem Text-, einem Leitungs- und einem Mieterfeld, Dokument erstellt und freigegeben. */
async function freigegeben(db: TestDb, art: "mietvertrag" | "uebergabe" = "mietvertrag") {
  const pdf = await vorlagePdf();
  legeVorlageAb(db, art, "v.pdf", pdf, sha256(pdf), [], JETZT);
  setzeVorlageFelder(db, art, [gezogen("text", "text", { h: 20 }), gezogen("leitung", "unterschrift", { rolle: "leitung", y: 200 }), gezogen("mieter", "unterschrift", { rolle: "mieter", seite: 1 })]);
  const z = zusage(db);
  erstelleDokument(db, z.id, art, JETZT, "Leitung Bar");
  const v = speichereWerte(db, z.id, art, { "g:text": "200 €" }, JETZT);
  gebeDokumentFrei(db, z.id, art, v, JETZT);
  return { ...z, db, version: v + 1, pdf };
}

describe("Felder", () => {
  it("Pixel ↔ Punkte: Ursprung oben links auf dem Schirm, unten links in der PDF", () => {
    const f = feldAusPixeln(0, { x1: 300, y1: 700, x2: 100, y2: 650 }, 1, A4[0]);
    expect(f).toEqual({ seite: 0, x: 100, y: 141.9, b: 200, h: 50 });
    const px = feldInPixeln(f, 2, A4[0]);
    expect(px).toMatchObject({ links: 200, breite: 400, hoehe: 100 });
    expect(px.oben).toBeCloseTo(1300, 0);
    // Ein Zug über den Seitenrand wird gekappt, nicht verworfen.
    expect(feldAusPixeln(0, { x1: 500, y1: 10, x2: 900, y2: 60 }, 1, A4[0])).toMatchObject({ x: 500, b: 95.3 });
  });

  it("Rechteck: zu klein, außerhalb der Seite oder auf einer fehlenden Seite abgelehnt", () => {
    const min = { b: 56, h: 20 };
    expect(pruefeRect({ seite: 0, x: 10, y: 10, b: 200, h: 60 }, A4, min)).not.toBeNull();
    expect(pruefeRect({ seite: 0, x: 10, y: 10, b: 20, h: 60 }, A4, min)).toBeNull();
    expect(pruefeRect({ seite: 0, x: 500, y: 10, b: 200, h: 60 }, A4, min)).toBeNull();
    expect(pruefeRect({ seite: 1, x: 10, y: 10, b: 200, h: 60 }, A4, min)).toBeNull();
  });

  it("Feldliste: Formularfelder nur aus der PDF (Lage und Art von dort), aufgezogene groß genug, Unterschrift mit Rolle", async () => {
    const lesbar = await leseVorlage(await formularPdf());
    if (!lesbar.ok) throw new Error("unlesbar");
    const [kaution] = lesbar.formular;
    // Lage und Art aus der PDF, auch wenn der Client etwas anderes schickt; Name von der Leitung.
    expect(pruefeFelder([{ ...kaution, x: 0, art: "unterschrift", name: "Kaution in €" }], lesbar.seiten, lesbar.formular))
      .toEqual([{ ...kaution, name: "Kaution in €" }]);
    expect(pruefeFelder([{ ...kaution, id: "f:99" }], lesbar.seiten, lesbar.formular)).toBeNull();
    expect(pruefeFelder([gezogen("a", "text", { h: 8, b: 8 })], A4, [])).not.toBeNull();
    expect(pruefeFelder([gezogen("a", "unterschrift", { h: 8, rolle: "mieter" })], A4, [])).toBeNull();
    expect(pruefeFelder([gezogen("a", "unterschrift")], A4, [])).toBeNull();
    expect(pruefeFelder([gezogen("a", "text"), gezogen("a", "text")], A4, [])).toBeNull();
    expect(pruefeFelder([{ ...gezogen("a", "text"), mehr: 1 }], A4, [])).toBeNull();
    // Ein aufgezogenes Feld behält keine Rolle, wenn es keine Unterschrift ist.
    expect(pruefeFelder([gezogen("a", "text", { rolle: "leitung" })], A4, [])?.[0]).not.toHaveProperty("rolle");
  });

  it("Werte: nur Text- und Ankreuzfelder, Typ passend, leere fallen weg", () => {
    const felder = [gezogen("t", "text"), gezogen("k", "ankreuz"), gezogen("u", "unterschrift", { rolle: "mieter" })];
    expect(pruefeWerte({ "g:t": "a\r\nb", "g:k": true }, felder)).toEqual({ "g:t": "a\nb", "g:k": true });
    expect(pruefeWerte({ "g:t": "  ", "g:k": false }, felder)).toEqual({});
    expect(pruefeWerte({ "g:t": true }, felder)).toBeNull();
    expect(pruefeWerte({ "g:u": "x" }, felder)).toBeNull();
    expect(pruefeWerte({ "g:x": "x" }, felder)).toBeNull();
    expect(pruefeWerte({ "g:t": "x".repeat(2001) }, felder)).toBeNull();
  });

  it("ohne Mieterfeld unterschreibt die mietende Person auf einer eigenen Seite", () => {
    expect(mieterFeldIds([gezogen("l", "unterschrift", { rolle: "leitung" })])).toEqual([EIGENE_SEITE]);
    expect(mieterFeldIds([gezogen("m", "unterschrift", { rolle: "mieter" }), gezogen("n", "unterschrift", { rolle: "mieter" })])).toEqual(["g:m", "g:n"]);
  });
});

describe("PDF", () => {
  it("erkennt Formularfelder: Text und Ankreuzen, mit lesbarem Namen und Lage", async () => {
    const r = await leseVorlage(await formularPdf());
    expect(r).toMatchObject({ ok: true, formular: [
      { art: "text", name: "Kaution", quelle: "formular", formular: "Kaution", seite: 0, x: 99.5, y: 599.5, b: 201, h: 21 },
      { art: "ankreuz", name: "Reinigung erledigt", quelle: "formular", formular: "Reinigung.erledigt", seite: 0 },
    ] });
    expect((await leseVorlage(Buffer.from("%PDF-1.7 kaputt"))).ok).toBe(false);
    expect(await leseVorlage(await vorlagePdf(3))).toMatchObject({ ok: true, seiten: [{ b: 595.28 }, {}, {}], formular: [] });
  });

  it("füllt Formularfelder und macht die Fassung flach", async () => {
    const pdf = await formularPdf();
    const r = await leseVorlage(pdf);
    if (!r.ok) throw new Error("unlesbar");
    const [kaution, reinigung] = r.formular;
    const fertig = await PDFDocument.load(await dokumentPdf(pdf, r.formular, { [kaution.id]: "200 €", [reinigung.id]: true }, [], RAHMEN));
    expect(fertig.getForm().getFields()).toHaveLength(0);
    expect(fertig.getPageCount()).toBe(1);
  });

  it("setzt Unterschriften in ihre Felder; ohne Mieterfeld auf eine eigene letzte Seite", async () => {
    const pdf = await vorlagePdf(1);
    const mitFeld = await dokumentPdf(pdf, [gezogen("m", "unterschrift", { rolle: "mieter" })], {}, [{ feldId: "g:m", rolle: "mieter", name: "Erika Sommer ✓", am: JETZT, bild: PNG }], RAHMEN);
    expect((await PDFDocument.load(mitFeld)).getPageCount()).toBe(1);
    const ohne = await dokumentPdf(pdf, [], {}, [{ feldId: EIGENE_SEITE, rolle: "mieter", name: "Erika Sommer", am: JETZT, bild: PNG }], RAHMEN);
    expect((await PDFDocument.load(ohne)).getPageCount()).toBe(2);
  });

  it("der Titel der Vorlage, auch aus XMP, kommt nicht in die Fassung", async () => {
    const d = await PDFDocument.load(await vorlagePdf(1));
    d.setTitle("IDA");
    d.catalog.set(PDFName.of("Metadata"), d.context.register(d.context.stream("<x:xmpmeta><dc:title>IDA</dc:title></x:xmpmeta>", { Type: "Metadata", Subtype: "XML" })));
    const fertig = await PDFDocument.load(await dokumentPdf(await d.save(), [], {}, [], RAHMEN));
    expect(fertig.getTitle()).toBe("Mietvertrag Bar");
    expect(fertig.catalog.get(PDFName.of("Metadata"))).toBeUndefined();
  });
});

describe("Vorlagen", () => {
  it("je Art eine; ersetzen setzt die Felder auf die Formularfelder zurück, Zeichnen bleibt", async () => {
    const db = testDb();
    const pdf = await vorlagePdf();
    legeVorlageAb(db, "mietvertrag", "a.pdf", pdf, sha256(pdf), [], JETZT);
    legeVorlageAb(db, "rueckgabe", "r.pdf", pdf, sha256(pdf), [], JETZT);
    setzeVorlageFelder(db, "mietvertrag", [gezogen("x", "text")]);
    setzeVorlageZeichnen(db, "mietvertrag", false);
    expect(ladeVorlagenInfo(db).map((v) => [v.art, v.felder.length, v.zeichnen])).toEqual([["mietvertrag", 1, false], ["rueckgabe", 0, true]]);
    const form = await formularPdf();
    const r = await leseVorlage(form);
    legeVorlageAb(db, "mietvertrag", "b.pdf", form, sha256(form), r.ok ? r.formular : [], JETZT);
    expect(ladeVorlage(db, "mietvertrag")).toMatchObject({ name: "b.pdf", zeichnen: false, felder: [{ quelle: "formular" }, { quelle: "formular" }] });
    entferneVorlage(db, "rueckgabe");
    expect(() => entferneVorlage(db, "rueckgabe")).toThrow();
    expect(() => setzeVorlageZeichnen(db, "rueckgabe", true)).toThrow();
  });

  it("ein Dokument kopiert die Vorlage: spätere Änderungen an der Vorlage ändern es nicht", async () => {
    const db = testDb();
    const pdf = await vorlagePdf();
    legeVorlageAb(db, "uebergabe", "u.pdf", pdf, sha256(pdf), [], JETZT);
    setzeVorlageFelder(db, "uebergabe", [gezogen("a", "text")]);
    const { id } = zusage(db);
    erstelleDokument(db, id, "uebergabe", JETZT);
    expect(() => erstelleDokument(db, id, "uebergabe", JETZT)).toThrow("schon");
    expect(() => erstelleDokument(db, id, "rueckgabe", JETZT)).toThrow("keine Vorlage");
    setzeVorlageFelder(db, "uebergabe", []);
    entferneVorlage(db, "uebergabe");
    expect(ladeDokument(db, id, "uebergabe")?.felder.map((f) => f.id)).toEqual(["g:a"]);
    expect(ladeAnfragen(db)[0].dokumente.map((d) => [d.art, d.vorlage, d.stand])).toEqual([["mietvertrag", false, null], ["uebergabe", false, "entwurf"], ["rueckgabe", false, null]]);
  });
});

describe("Dokument einer Zusage", () => {
  it("nur zu einer Zusage", async () => {
    const db = testDb();
    const pdf = await vorlagePdf();
    legeVorlageAb(db, "mietvertrag", "v.pdf", pdf, sha256(pdf), [], JETZT);
    const code = legeAnfrageAn(db, { von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-07", "23:00"), anlass: "x", personen: 2, person: "E S", kontakt: "1", hinweis: "", webseite: "" }, false, JETZT);
    const id = db.select({ id: anfrage.id }).from(anfrage).where(eq(anfrage.code, code)).get()!.id;
    expect(() => erstelleDokument(db, id, "mietvertrag", JETZT)).toThrow("nur zu einer Zusage");
    expect(() => legeUnterschriebenAb(db, { code }, "mietvertrag", { inhalt: PNG, herkunft: "hochgeladen", unterschrift: null, version: null }, JETZT)).toThrow("nur zu einer Zusage");
    expect(dokumentFuerStatus(db, code, "mietvertrag")).toBeNull();
  });

  it("Freigabe ohne Unterschrift der Leitung sperrt die Werte; die Leitung unterschreibt davor nicht", async () => {
    const db = testDb();
    const pdf = await vorlagePdf();
    legeVorlageAb(db, "mietvertrag", "v.pdf", pdf, sha256(pdf), [], JETZT);
    setzeVorlageFelder(db, "mietvertrag", [gezogen("t", "text", { h: 20 }), gezogen("l", "unterschrift", { rolle: "leitung" })]);
    const { id, code } = zusage(db);
    erstelleDokument(db, id, "mietvertrag", JETZT, "  Leitung Bar ");
    expect(ladeDokument(db, id, "mietvertrag")).toMatchObject({ version: JETZT, erstelltVon: "Leitung Bar" });
    expect(speichereWerte(db, id, "mietvertrag", { "g:t": "a" }, JETZT)).toBe(JETZT + 1);
    expect(speichereWerte(db, id, "mietvertrag", { "g:t": "a" }, JETZT + 1)).toBe(JETZT + 1);
    expect(() => speichereWerte(db, id, "mietvertrag", { "g:t": "b" }, JETZT)).toThrow("gerade geändert");
    expect(() => pruefeLeitungUnterschreibbar(db, id, "mietvertrag", JETZT + 1)).toThrow("nachdem die mietende Person");
    expect(anfrageNachCode(db, code)?.vertrag?.dokumente).toEqual([]);
    gebeDokumentFrei(db, id, "mietvertrag", JETZT + 1, JETZT);
    const v = JETZT + 2;
    expect(ladeAnfragen(db)[0].vertrag).toBe("verschickt");
    expect(() => pruefeLeitungUnterschreibbar(db, id, "mietvertrag", v)).toThrow("nachdem die mietende Person");
    expect(() => speichereWerte(db, id, "mietvertrag", { "g:t": "c" }, v)).toThrow("freigegeben");
    expect(() => verwirfDokument(db, id, "mietvertrag")).toThrow("freigegeben");
    expect(anfrageNachCode(db, code)?.vertrag?.dokumente).toEqual([{ art: "mietvertrag", stand: "offen", version: v, zeichnen: true }]);
    nimmFreigabeZurueck(db, id, "mietvertrag", v);
    expect(ladeAnfragen(db)[0].vertrag).toBe("offen");
    verwirfDokument(db, id, "mietvertrag");
    expect(ladeDokument(db, id, "mietvertrag")).toBeNull();
    erstelleDokument(db, id, "mietvertrag", JETZT + 60_000);
    expect(ladeDokument(db, id, "mietvertrag")).toMatchObject({ erstelltVon: null });
    expect(ladeDokument(db, id, "mietvertrag")!.version).toBeGreaterThan(v);
  });

  it("die Ansicht zeigt die Werte, noch ohne Unterschriften", async () => {
    const db = testDb();
    const { id } = await freigegeben(db);
    const g = dokumentGrundlage(db, id, "mietvertrag")!;
    expect(g.unterschriften).toEqual([]);
    expect((await PDFDocument.load(await ansichtPdf(g, "mietvertrag"))).getPageCount()).toBe(2);
  });

  it("gezeichnet auf der Statusseite: Unterschrift im Mieterfeld, „unterschrieben“, dann nur noch Download", async () => {
    const db = testDb();
    const { id, code, version } = await freigegeben(db);
    const g = dokumentGrundlage(db, id, "mietvertrag")!;
    const f = await fassungMitMieter(g, "mietvertrag", { name: "Erika Sommer", bild: PNG, am: JETZT });
    expect(f.feldIds).toEqual(["g:mieter"]);
    expect((await PDFDocument.load(f.inhalt)).getTitle()).toBe("Mietvertrag Bar 2026-11-07 18.00 Uhr – unterschrieben");
    expect(() => legeUnterschriebenAb(db, { code }, "mietvertrag", { inhalt: f.inhalt, herkunft: "gezeichnet", unterschrift: { name: "Erika Sommer", bild: PNG, am: JETZT, feldIds: f.feldIds }, version: version - 1 }, JETZT))
      .toThrow("gerade geändert");
    legeUnterschriebenAb(db, { code }, "mietvertrag", { inhalt: f.inhalt, herkunft: "gezeichnet", unterschrift: { name: "Erika Sommer", bild: PNG, am: JETZT, feldIds: f.feldIds }, version }, JETZT);
    expect(anfrageNachCode(db, code)?.vertrag).toEqual({ stand: "unterschrieben", dokumente: [{ art: "mietvertrag", stand: "unterschrieben", datei: { am: JETZT, herkunft: "gezeichnet" } }] });
    expect(ladeAnfragen(db)[0].dokumente[0]).toMatchObject({ stand: "freigegeben", datei: { herkunft: "gezeichnet", unterschriebenVon: "Erika Sommer" } });
    expect(dokumentFuerStatus(db, code, "mietvertrag")).toMatchObject({ art: "unterschrieben", name: "Mietvertrag Bar 2026-11-07 18.00 Uhr – unterschrieben.pdf" });
    expect(() => legeUnterschriebenAb(db, { code }, "mietvertrag", { inhalt: f.inhalt, herkunft: "hochgeladen", unterschrift: null, version: null }, JETZT)).toThrow("schon unterschrieben");
    expect(() => nimmFreigabeZurueck(db, id, "mietvertrag", version)).toThrow("schon unterschrieben");
    expect(ladeAnfragen(db)[0].dokumente[0].leitungOffen).toBe(true);

    // Danach die Leitung: ihre Unterschrift kommt in ihr Feld, die Fassung wird ersetzt, ein zweites Mal geht nicht.
    const p = pruefeLeitungUnterschreibbar(db, id, "mietvertrag", version);
    expect(p).toMatchObject({ herkunft: "gezeichnet", feldIds: ["g:leitung"] });
    const mitLeitung = await fassungMitLeitung(dokumentGrundlage(db, id, "mietvertrag")!, "mietvertrag", p, { name: "Leitung Bar", bild: PNG, am: JETZT + 1 });
    expect((await PDFDocument.load(mitLeitung)).getPageCount()).toBe(2);
    expect(() => unterschreibeAlsLeitung(db, id, "mietvertrag", version, { name: "Leitung Bar", bild: PNG, am: JETZT + 1 }, { inhalt: mitLeitung, abgelegtAm: JETZT - 1 })).toThrow("gerade geändert");
    expect(unterschreibeAlsLeitung(db, id, "mietvertrag", version, { name: "Leitung Bar", bild: PNG, am: JETZT + 1 }, { inhalt: mitLeitung, abgelegtAm: p.abgelegtAm })).toBe(version + 1);
    expect(ladeVertragsdatei(db, id, "mietvertrag")?.inhalt.equals(mitLeitung)).toBe(true);
    expect(ladeAnfragen(db)[0].dokumente[0]).toMatchObject({ leitungOffen: false, datei: { groesse: mitLeitung.length } });
    expect(() => pruefeLeitungUnterschreibbar(db, id, "mietvertrag", version + 1)).toThrow("schon unterschrieben");

    // Entfernt die Leitung die Fassung, gehen alle Unterschriften mit; die Freigabe bleibt.
    entferneVertrag(db, id, "mietvertrag");
    expect(db.select().from(vertragsunterschrift).all()).toEqual([]);
    expect(ladeAnfragen(db)[0].vertrag).toBe("verschickt");
    expect(ladeVertragsdatei(db, id, "mietvertrag")).toBeNull();
  });

  it("vor Ort über die Kennung; Übergabe ändert den Stand des Mietvertrags nicht", async () => {
    const db = testDb();
    const { id, code, version } = await freigegeben(db, "uebergabe");
    legeUnterschriebenAb(db, { id }, "uebergabe", { inhalt: PNG, herkunft: "gezeichnet", unterschrift: { name: "Erika Sommer", bild: PNG, am: JETZT, feldIds: ["g:mieter"] }, version }, JETZT);
    expect(ladeAnfragen(db)[0].vertrag).toBe("offen");
    expect(anfrageNachCode(db, code)?.vertrag?.dokumente).toEqual([{ art: "uebergabe", stand: "unterschrieben", datei: { am: JETZT, herkunft: "gezeichnet" } }]);
  });

  it("hochgeladener Ausdruck: die Leitung unterschreibt auf einer eigenen letzten Seite; selbst abgelegt: gar nicht", async () => {
    const db = testDb();
    const { id, code, version } = await freigegeben(db);
    const foto = Buffer.from(await fotoAlsPdf(PNG, "png", "x"));
    legeUnterschriebenAb(db, { code }, "mietvertrag", { inhalt: foto, herkunft: "hochgeladen", unterschrift: null, version: null }, JETZT);
    const p = pruefeLeitungUnterschreibbar(db, id, "mietvertrag", version);
    const mitLeitung = await fassungMitLeitung(dokumentGrundlage(db, id, "mietvertrag")!, "mietvertrag", p, { name: "Leitung Bar", bild: PNG, am: JETZT });
    const fertig = await PDFDocument.load(mitLeitung);
    expect(fertig.getPageCount()).toBe(2);
    expect(fertig.getTitle()).toBe("Mietvertrag Bar 2026-11-07 18.00 Uhr – unterschrieben");
    unterschreibeAlsLeitung(db, id, "mietvertrag", version, { name: "Leitung Bar", bild: PNG, am: JETZT }, { inhalt: mitLeitung, abgelegtAm: p.abgelegtAm });
    expect(ladeAnfragen(db)[0].dokumente[0].leitungOffen).toBe(false);

    const zwei = await freigegeben(testDb());
    legeVertragAb(zwei.db, zwei.id, "mietvertrag", "papier.pdf", foto, JETZT);
    expect(ladeAnfragen(zwei.db)[0].dokumente[0].leitungOffen).toBe(false);
    expect(() => pruefeLeitungUnterschreibbar(zwei.db, zwei.id, "mietvertrag", zwei.version)).toThrow("schon unterschrieben");
  });

  it("nicht freigegeben: die Statusseite nimmt nichts an", async () => {
    const db = testDb();
    const { code } = zusage(db);
    expect(() => legeUnterschriebenAb(db, { code }, "mietvertrag", { inhalt: PNG, herkunft: "hochgeladen", unterschrift: null, version: null }, JETZT)).toThrow("nicht zum Unterschreiben");
  });
});

describe("Migration der Verträge aus IDA-343", () => {
  it("Feld, Datei und verschickte Zusage kommen als Mietvertrag mit", () => {
    const roh = openModuleDatabase(":memory:");
    const sql = (n: string) => readFileSync(`src/app/m/gemeinschaft/_db/migrations/${n}.sql`, "utf8").replaceAll("--> statement-breakpoint", "");
    roh.exec(sql("0000_grundbestand"));
    roh.exec(sql("0001_vertragsvorlage"));
    const a = (id: string, vertrag: string) => roh.prepare("INSERT INTO anfrage (id, status, code, von, bis, anlass, personen, person, kontakt, vertrag, eingegangen_am) VALUES (?, 'zugesagt', ?, 1, 2, 'x', 2, 'E S', '1', ?, 1)").run(id, `c-${id}`, vertrag);
    a("a1", "verschickt");
    a("a2", "unterschrieben");
    a("a3", "offen");
    roh.prepare("INSERT INTO vertragsvorlage (raum, name, groesse, inhalt, sha256, feld, zeichnen, abgelegt_am) VALUES ('bar', 'v.pdf', 3, ?, 'abc', ?, 1, 5)")
      .run(Buffer.from("pdf"), JSON.stringify({ seite: 1, x: 300, y: 80, b: 200, h: 60 }));
    roh.prepare("INSERT INTO vertragsdatei (anfrage_id, name, groesse, inhalt, abgelegt_am, herkunft) VALUES ('a2', 'u.pdf', 3, ?, 6, 'gezeichnet')").run(Buffer.from("pdf"));
    roh.exec(sql("0002_dokumente"));
    roh.exec(sql("0003_erstellt_von"));
    const db = drizzle(roh, { schema });
    expect(ladeVorlage(db, "mietvertrag")?.felder).toEqual([{ id: "g:unterschrift", art: "unterschrift", name: "Unterschrift", quelle: "gezogen", rolle: "mieter", seite: 1, x: 300, y: 80, b: 200, h: 60 }]);
    expect(ladeVertragsdatei(db, "a2", "mietvertrag")).not.toBeNull();
    expect(ladeDokument(db, "a1", "mietvertrag")).toMatchObject({ version: 1, freigegebenAm: 5, felder: [{ id: "g:unterschrift" }] });
    expect(ladeDokument(db, "a2", "mietvertrag")).toBeNull();
    expect(ladeDokument(db, "a3", "mietvertrag")).toBeNull();
    expect(anfrageNachCode(db, "c-a1")?.vertrag?.dokumente).toEqual([{ art: "mietvertrag", stand: "offen", version: 1, zeichnen: true }]);
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
});
