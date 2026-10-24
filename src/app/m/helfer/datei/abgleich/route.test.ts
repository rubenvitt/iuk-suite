import { beforeEach, describe, expect, it, vi } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { freiesBlatt, mappe, type ExportZelle } from "@/core/export/spalten";
import { helfer, importlauf } from "../../_db/schema";
import { schreibeEinstellung } from "../../_lib/einstellungen";
import { STANDARD_FILTER } from "../../_lib/filter";
import { testDb as neueDb, type TestDb } from "../../_lib/testDb";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
let db: TestDb;
vi.mock("../../_db/client", () => ({ getDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { POST } from "./route";

const VERWALTUNG = { user: { id: "sub-v", name: "Vera Verwaltung", groups: ["helfer-nutzer", "helfer-admin"] } };

async function xlsx(zeilen: ExportZelle[][]): Promise<File> {
  const bytes = await writeXlsxFile(mappe([freiesBlatt("Helfer", zeilen)])).toBuffer();
  return new File([new Uint8Array(bytes)], "helfer.xlsx");
}

function anfrage(schritt: string, datei: File | null, host = "helfer.localtest.me"): Request {
  const f = new FormData();
  f.set("schritt", schritt);
  f.set("filter", JSON.stringify(STANDARD_FILTER));
  if (datei) f.set("datei", datei);
  return new Request(`http://${host}/datei/abgleich`, { method: "POST", body: f, headers: { host } });
}

const LISTE: ExportZelle[][] = [
  ["Kennung", "Vorname", "Nachname", "Status", "Telefon"],
  ["1", "Jana", "Albers", "aktiv", "0151 1"],
  ["2", "Tom", "Brandt", "gesperrt", "0151 2"],
  ["3", "Uta", "Claßen", "", "0151 3"],
];

describe("POST datei/abgleich", () => {
  beforeEach(() => {
    db = neueDb();
    schreibeEinstellung(db, "quelle", "datei");
    sitzung = VERWALTUNG;
  });

  it("ohne Verwaltungsrecht oder auf fremdem Host: 404, ohne Namen", async () => {
    sitzung = { user: { id: "sub-l", name: "Lea Lesend", groups: ["helfer-nutzer"] } };
    expect((await POST(anfrage("vorschau", await xlsx(LISTE)))).status).toBe(404);
    sitzung = VERWALTUNG;
    expect((await POST(anfrage("vorschau", await xlsx(LISTE), "radio.localtest.me"))).status).toBe(404);
  });

  it("Vorschau schreibt nichts und nennt Ausgefilterte nur als Zahl", async () => {
    const antwort = await (await POST(anfrage("vorschau", await xlsx(LISTE)))).json();
    expect(antwort.ok).toBe(true);
    expect(antwort.wert.zeilen.map((z: { nachname: string }) => z.nachname)).toEqual(["Albers", "Claßen"]);
    expect(antwort.wert.ausgefiltert.gesperrt).toBe(1);
    expect(antwort.wert.ignorierteSpalten).toEqual(["Telefon"]);
    expect(JSON.stringify(antwort)).not.toMatch(/Brandt|0151/);
    expect(db.select().from(helfer).all()).toHaveLength(0);
  });

  it("Übernehmen gleicht ab; wer aus der Datei verschwindet, wird gelöscht", async () => {
    const erst = await (await POST(anfrage("uebernehmen", await xlsx(LISTE)))).json();
    expect(erst).toEqual({ ok: true, wert: { neu: 2, geaendert: 0, entfernt: 0, unveraendert: 0 } });
    const dann = await (await POST(anfrage("uebernehmen", await xlsx([LISTE[0], ["1", "Jana", "Albers-Neu"]])))).json();
    expect(dann).toEqual({ ok: true, wert: { neu: 0, geaendert: 1, entfernt: 1, unveraendert: 0 } });
    expect(db.select().from(helfer).all().map((h) => [h.herkunft, h.quellId, h.nachname])).toEqual([["datei", "k:1", "Albers-Neu"]]);
    expect(db.select().from(importlauf).all().map((l) => l.quelle)).toEqual(["datei", "datei"]);
  });

  it("ohne Datei, mit fremder Datei oder bei anderer Quelle: eine Meldung, kein Schreiben", async () => {
    expect(await (await POST(anfrage("uebernehmen", null))).json()).toEqual({ ok: false, fehler: "Bitte zuerst eine Excel-Datei wählen." });
    const csv = new File(["Vorname;Nachname\n"], "helfer.csv");
    expect((await (await POST(anfrage("uebernehmen", csv))).json()).fehler).toContain("keine Excel-Datei");
    schreibeEinstellung(db, "quelle", "demo");
    // Die Seite ist veraltet: weder die Datei noch stillschweigend die Demo wird gelesen.
    expect((await (await POST(anfrage("uebernehmen", await xlsx(LISTE)))).json()).fehler).toContain("nicht mehr „Excel-Datei“");
    expect(db.select().from(helfer).all()).toHaveLength(0);
  });
});
