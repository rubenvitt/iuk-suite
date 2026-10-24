import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { freiesBlatt, mappe, type ExportZelle } from "@/core/export/spalten";
import { blattnamen, blattZellen } from "@/core/export/test-mappe";
import { liesHelferMappe, ordneMappeZu } from "./lesen";
import { vorlageBlaetter } from "./vorlage";
import { DATEI_SPALTEN, feldFuerKopf } from "./spalten";

async function xlsx(zeilen: ExportZelle[][]): Promise<Uint8Array> {
  return new Uint8Array(await writeXlsxFile(mappe([freiesBlatt("Helfer", zeilen)])).toBuffer());
}

describe("Spaltenköpfe", () => {
  it("erkennt Köpfe ohne Groß-/Kleinschreibung, Leerraum, Sternchen und Umlaute", () => {
    expect(feldFuerKopf(" Vorname* ")).toBe("vorname");
    expect(feldFuerKopf("NACHNAME")).toBe("nachname");
    expect(feldFuerKopf("Mitglieds-Nr.")).toBe("kennung");
    expect(feldFuerKopf("Qualifikation")).toBe("qualifikationen");
    expect(feldFuerKopf("Geburtsdatum")).toBeNull();
    // „Name“ allein bleibt unbeachtet: es könnte „Albers, Jana“ heißen.
    expect(feldFuerKopf("Name")).toBeNull();
  });
});

describe("liesHelferMappe", () => {
  it("liest eine Liste und verwirft jede Spalte außerhalb der Allowlist", async () => {
    const bytes = await xlsx([
      ["Vorname", "Nachname", "Telefon", "Gruppen", "Qualifikationen", "Geburtsdatum"],
      ["Jana", "Albers", "0151 123", "Bereitschaft; Sanitätsdienst", "Rettungssanitäter (RS), Sanitätshelfer", "01.02.1990"],
    ]);
    const g = liesHelferMappe(bytes);
    expect(g).toEqual({
      ok: true,
      unlesbar: 0,
      ignorierteSpalten: ["Telefon", "Geburtsdatum"],
      personen: [{
        quellId: "n:albers|jana", vorname: "Jana", nachname: "Albers", status: "aktiv", gesperrt: false, austritt: null,
        gruppen: ["Bereitschaft", "Sanitätsdienst"],
        qualifikationen: [{ liste: "", name: "Rettungssanitäter", kurz: "RS" }, { liste: "", name: "Sanitätshelfer", kurz: "" }],
      }],
    });
    // Datensparsamkeit: weder Telefon noch Geburtsdatum stehen noch irgendwo im Ergebnis.
    expect(JSON.stringify(g)).not.toMatch(/0151|1990/);
  });

  it("Kennung vor Name; eine Zahlzelle wird zur Kennung ohne Nachkommastellen", async () => {
    const g = liesHelferMappe(await xlsx([
      ["Kennung", "Vorname", "Nachname"],
      [1001, "Jana", "Albers"],
      [null, "Tom", "Brandt"],
    ]));
    expect(g.ok && g.personen.map((p) => p.quellId)).toEqual(["k:1001", "n:brandt|tom"]);
  });

  it("Status und Austritt gehen an den Filter; leerer Status heißt aktiv", async () => {
    const g = liesHelferMappe(await xlsx([
      ["Vorname", "Nachname", "Status", "Austritt"],
      ["A", "Eins", "", ""],
      ["B", "Zwei", "Eingeschränkt", "31.12.2030"],
      ["C", "Drei", "gesperrt", "2026-01-15"],
      ["D", "Vier", "Pausiert", ""],
    ]));
    expect(g.ok && g.personen.map((p) => [p.status, p.austritt])).toEqual([
      ["aktiv", null], ["eingeschraenkt", "2030-12-31"], ["gesperrt", "2026-01-15"], ["Pausiert", null],
    ]);
  });

  it("eine Zeile ohne Vor- oder Nachname oder mit unlesbarem Austritt ist unlesbar, nicht ein Abbruch", async () => {
    const g = liesHelferMappe(await xlsx([
      ["Vorname", "Nachname", "Austritt"],
      ["Jana", "Albers", ""],
      ["", "Ohnevorname", ""],
      ["Tom", "Brandt", "irgendwann"],
    ]));
    expect(g.ok && { n: g.personen.length, unlesbar: g.unlesbar }).toEqual({ n: 1, unlesbar: 2 });
  });

  it("fehlende Pflichtspalte, fremde Datei, leere Datei: eine Meldung", async () => {
    const ohneVorname = liesHelferMappe(await xlsx([["Nachname"], ["Albers"]]));
    expect(ohneVorname).toEqual({ ok: false, fehler: expect.stringContaining("„Vorname“") });
    expect(liesHelferMappe(new TextEncoder().encode("Vorname;Nachname\nJana;Albers\n"))).toEqual({ ok: false, fehler: expect.stringContaining("keine Excel-Datei") });
    expect(liesHelferMappe(new Uint8Array(0))).toEqual({ ok: false, fehler: "Die Datei ist leer." });
    expect(liesHelferMappe(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toEqual({ ok: false, fehler: expect.stringContaining("lässt sich nicht lesen") });
  });

  it("eine doppelte Spalte wird nur einmal gelesen", () => {
    const g = ordneMappeZu({ spalten: ["Vorname", "Nachname", "Vorname"], zeilen: [["Jana", "Albers", "Anders"]] });
    expect(g.ok && [g.personen[0].vorname, g.ignorierteSpalten]).toEqual(["Jana", ["Vorname"]]);
  });
});

describe("Vorlage", () => {
  it("hat die Köpfe im ersten Blatt, keine Beispielperson, und liest sich leer zurück", async () => {
    const bytes = new Uint8Array(await writeXlsxFile(mappe(vorlageBlaetter())).toBuffer());
    expect(blattnamen(bytes)).toEqual(["Helfer", "Hinweise"]);
    expect(blattZellen(bytes, 0)).toEqual([DATEI_SPALTEN.map((s) => s.kopf)]);
    expect(liesHelferMappe(bytes)).toEqual({ ok: true, personen: [], unlesbar: 0, ignorierteSpalten: [] });
  });
});
