import { describe, expect, it } from "vitest";
import { pruefe } from "../_lib/pruefung";
import type { PlanHelfer, PlanungDTO } from "../_lib/typen";
import { STUNDE } from "../_lib/typen";
import { xlsxAntwort } from "@/core/export/server";
import type { FertigesBlatt } from "@/core/export/spalten";
import { blattnamen, blattZellen, mappenBytes } from "@/core/export/test-mappe";
import { dateiname, eintraege, planungsMappe } from "./export";

const T0 = Date.UTC(2026, 10, 14, 7);
const h = (id: string, vorname: string, nachname: string, quelle: "stamm" | "temp" = "stamm"): PlanHelfer =>
  ({ schluessel: `${quelle}:${id}`, quelle, id, vorname, nachname, qualifikationen: [], demo: true, organisation: quelle === "temp" ? "Nachbarkreis" : undefined });
const helfer = [h("a", "Anna", "Albers"), h("b", "Ben", "Brandt"), h("t", "Erika", "Beispiel", "temp")];
const p: PlanungDTO = {
  id: "p", name: "Stadtfest Ärger & Co", art: "veranstaltung", ort: "Markt", von: T0, bis: T0 + 8 * STUNDE, maxDienstMin: 720, minRuheMin: 480,
  einheiten: [{ id: "e", art: "abschnitt", name: "Wache", fahrzeugId: null, kenner: null, schichtMin: 240, soll: 2, anforderungen: [], position: 0 }],
  schichten: [{ id: "s2", einheitId: "e", von: T0 + 4 * STUNDE, bis: T0 + 8 * STUNDE }, { id: "s1", einheitId: "e", von: T0, bis: T0 + 4 * STUNDE }],
  zuordnungen: [{ schichtId: "s1", quelle: "stamm", helferId: "b" }, { schichtId: "s1", quelle: "temp", helferId: "t" }, { schichtId: "s2", quelle: "stamm", helferId: "a" }],
  temporaere: [],
};

describe("Excel-Mappe der Planung", () => {
  it("Schichten zeitlich, Personen nach Nachnamen", () => {
    expect(eintraege(p, helfer).map((x) => [x.s.id, x.personen.map((y) => y.nachname)])).toEqual([["s1", ["Beispiel", "Brandt"]], ["s2", ["Albers"]]]);
  });

  it("vier Blätter zum Lesen und das Austauschblatt, je Helfer mit Herkunft und Stunden", () => {
    const mappe = planungsMappe(p, pruefe(p, helfer), helfer);
    expect(mappe.map((b) => b.name)).toEqual(["Planung", "Je Abschnitt", "Je Helfer", "Konflikte", "Austausch"]);
    const jeHelfer = mappe[2].daten.slice(1).map((z) => z.map((c) => c?.value ?? null));
    expect(jeHelfer.map((z) => [z[0], z[1], z[5]])).toEqual([["Albers, Anna", "Stammdaten", 4], ["Beispiel, Erika", "Temporär (Nachbarkreis)", 4], ["Brandt, Ben", "Stammdaten", 4]]);
  });

  it("Dateiname ohne Umlaute und Sonderzeichen", () => {
    expect(dateiname(p, "2026-11-14")).toBe("schichtplan-stadtfest-aerger-co-2026-11-14.xlsx");
  });
});

/*
 * Das Blatt „Austausch“ (IDA-365) ist ein Vertrag mit Lifeline Hub. Der Leser dort ist
 * `lifeline-hub/src/abloesung/schichtplan/uebernahme/datei.rs` (`lies_paket`), die Regeln stehen in
 * dessen Anwenderdoku, „Format der Schichtplan-Datei“. `liesWieLifelineHub` spiegelt die Regeln, an
 * denen eine Datei dort scheitert — ein Fehler dort heißt Nacharbeit, und genau die soll es nicht geben.
 */
const LLH_SPALTEN = ["posten", "abschnitt", "postenart", "beginn", "ende", "sollanzahl", "sollqualifikationen", "nachname", "vorname", "telefon", "organisation", "qualifikationen", "kennung", "herkunft"];
const LLH_ZEIT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/;

function liesWieLifelineHub(raster: (string | number | null)[][]): string[] {
  const fehler: string[] = [];
  const kopf = raster[0].map((k) => String(k).replace(/[\s_-]/g, "").toLowerCase());
  for (const k of kopf) if (!LLH_SPALTEN.includes(k)) fehler.push(`Spalte ${k} unbekannt`);
  const sp = (zeile: (string | number | null)[], name: string) => zeile[kopf.indexOf(name)] ?? null;
  const bloecke = new Map<string, { soll: unknown; quali: unknown; von: number; bis: number; posten: string }>();
  raster.slice(1).forEach((z, i) => {
    const nr = i + 2;
    const posten = sp(z, "posten");
    if (typeof posten !== "string" || !posten || posten.length > 200) fehler.push(`${nr}: Posten`);
    if (!["Einheit", "Fahrzeug", "UHS", "Pause"].includes(String(sp(z, "postenart")))) fehler.push(`${nr}: Posten-Art`);
    const zeiten = ["beginn", "ende"].map((s) => String(sp(z, s)));
    const ohne = zeiten.find((t) => !LLH_ZEIT.test(t));
    // Lifeline Hub liest auch Ortszeit, aber in der Zone des Einsatzes — für die Suite ein Fehler.
    if (ohne !== undefined) return void fehler.push(`${nr}: Zeit ohne Versatz: ${ohne}`);
    const [von, bis] = zeiten.map((t) => Date.parse(t.replace(/T(\d{2}:\d{2})/, "T$1:00")));
    if (von % (5 * 60_000) || bis % (5 * 60_000)) fehler.push(`${nr}: nicht auf 5 Minuten`);
    if (bis - von < 10 * 60_000 || bis - von > 24 * STUNDE) fehler.push(`${nr}: Dauer`);
    const soll = sp(z, "sollanzahl");
    if (soll !== null && (typeof soll !== "number" || soll < 1 || soll > 200)) fehler.push(`${nr}: Soll-Anzahl`);
    const quali = sp(z, "sollqualifikationen");
    if (quali !== null && !String(quali).split(/[,;]/).every((t) => /^\s*\d+\s+\S/.test(t))) fehler.push(`${nr}: Soll-Qualifikationen`);
    const nachname = sp(z, "nachname");
    if (nachname === null && sp(z, "vorname") !== null) fehler.push(`${nr}: Nachname fehlt`);
    if (nachname === null && (sp(z, "kennung") !== null || sp(z, "telefon") !== null)) fehler.push(`${nr}: Person ohne Namen`);
    const kennung = sp(z, "kennung");
    if (nachname !== null && (typeof kennung !== "string" || kennung.length > 100 || !sp(z, "herkunft"))) fehler.push(`${nr}: Kennung/Herkunft`);
    const schluessel = `${posten}|${von}|${bis}`;
    const b = bloecke.get(schluessel);
    if (b && (b.soll !== soll || b.quali !== quali)) fehler.push(`${nr}: Soll widerspricht derselben Schicht`);
    if (!b) bloecke.set(schluessel, { soll, quali, von, bis, posten: String(posten) });
  });
  const liste = [...bloecke.values()];
  for (const a of liste) for (const b of liste) {
    if (a !== b && a.posten === b.posten && a.von < b.bis && b.von < a.bis) fehler.push(`Blöcke überschneiden sich: ${a.posten}`);
  }
  return [...new Set(fehler)];
}

describe("Blatt „Austausch“ für Lifeline Hub (IDA-365)", () => {
  const T = Date.UTC(2027, 5, 26, 12); // 14:00 Sommerzeit
  const stamm: PlanHelfer = { ...h("x", "Karl", "Beispiel"), hiorgId: "0123456789abcdef0123456789abcdef", qualifikationen: [{ kurz: "San", name: "Sanitäter" }, { kurz: "C1", name: "Fahrerlaubnis C1" }] };
  const ohneHiorg = h("y", "Lotte", "Exempel");
  const temp: PlanHelfer = { ...h("t1", "Jonas", "Fiktiv", "temp"), telefon: "0170 0000301", organisation: "DRK Nachbarstadt, Zug 2", qualifikationen: [{ kurz: "RS", name: "Rettungssanitäter" }] };
  const leute = [stamm, ohneHiorg, temp];
  const plan: PlanungDTO = {
    ...p, name: "Stadtfest (Demo)", von: T, bis: T + 8 * STUNDE,
    einheiten: [
      { id: "w", art: "abschnitt", name: "Sanitätswache Markt", fahrzeugId: null, kenner: null, schichtMin: 240, soll: 3, anforderungen: [{ quali: { kurz: "San", name: "Sanitäter" }, anzahl: 1 }], position: 0 },
      { id: "f", art: "fahrzeug", name: "GW-San 12/83-1", fahrzeugId: "fz", kenner: "12/83-1", schichtMin: 240, soll: 2, anforderungen: [{ quali: { kurz: "RS", name: "Rettungssanitäter" }, anzahl: 1 }, { quali: { kurz: "C1", name: "Fahrerlaubnis C1" }, anzahl: 1 }], position: 1 },
    ],
    schichten: [
      { id: "w1", einheitId: "w", von: T, bis: T + 4 * STUNDE }, { id: "w2", einheitId: "w", von: T + 4 * STUNDE, bis: T + 8 * STUNDE },
      { id: "f1", einheitId: "f", von: T, bis: T + 4 * STUNDE },
    ],
    zuordnungen: [{ schichtId: "w1", quelle: "stamm", helferId: "x" }, { schichtId: "w1", quelle: "temp", helferId: "t1" }, { schichtId: "f1", quelle: "stamm", helferId: "y" }],
  };
  const mappe = () => planungsMappe(plan, pruefe(plan, leute), leute);
  const werte = (b: FertigesBlatt) => b.daten.map((z) => z.map((c) => c?.value ?? null));

  it("kommt als fünftes Blatt dazu; die vier bisherigen bleiben, wie sie waren", () => {
    const mit = mappe();
    expect(mit.map((b) => b.name)).toEqual(["Planung", "Je Abschnitt", "Je Helfer", "Konflikte", "Austausch"]);
    expect(mit.slice(0, 4).map((b) => b.name)).toEqual(planungsMappe(p, pruefe(p, helfer), helfer).slice(0, 4).map((b) => b.name));
    expect(mit[1].daten[0].map((c) => c?.value)).toEqual(["Abschnitt / Fahrzeug", "Schicht", "Soll", "Ist", "Eingeteilt"]);
    expect(mit[2].daten[0].map((c) => c?.value)).toEqual(["Name", "Herkunft", "Telefon", "Abschnitt / Fahrzeug", "Schicht", "Stunden"]);
  });

  it("eine Zeile je Person und Schicht, unbesetzte Schicht ohne Person, Zeiten mit Versatz", () => {
    const [kopf, ...zeilen] = werte(mappe()[4]);
    expect(kopf).toEqual(["Posten", "Abschnitt", "Posten-Art", "Beginn", "Ende", "Soll-Anzahl", "Soll-Qualifikationen", "Nachname", "Vorname", "Telefon", "Organisation", "Qualifikationen", "Kennung", "Herkunft"]);
    expect(zeilen).toEqual([
      ["Sanitätswache Markt", null, "Einheit", "2027-06-26T14:00+02:00", "2027-06-26T18:00+02:00", 3, "1 Sanitäter", "Beispiel", "Karl", null, null, "Sanitäter, Fahrerlaubnis C1", "0123456789abcdef0123456789abcdef", "HiOrg"],
      ["Sanitätswache Markt", null, "Einheit", "2027-06-26T14:00+02:00", "2027-06-26T18:00+02:00", 3, "1 Sanitäter", "Fiktiv", "Jonas", "0170 0000301", "DRK Nachbarstadt, Zug 2", "Rettungssanitäter", "t1", "IuK-Suite temporär"],
      ["GW-San 12/83-1", null, "Fahrzeug", "2027-06-26T14:00+02:00", "2027-06-26T18:00+02:00", 2, "1 Rettungssanitäter, 1 Fahrerlaubnis C1", "Exempel", "Lotte", null, null, null, "y", "IuK-Suite Stammdaten"],
      ["Sanitätswache Markt", null, "Einheit", "2027-06-26T18:00+02:00", "2027-06-26T22:00+02:00", 3, "1 Sanitäter", null, null, null, null, null, null, null],
    ]);
  });

  it("Komma und Semikolon in Namen von Qualifikationen trennen keine Liste", () => {
    const mitKomma: PlanHelfer = { ...stamm, qualifikationen: [{ kurz: "X", name: "Führer; Zug, Verband" }] };
    const zeilen = werte(planungsMappe(plan, pruefe(plan, [mitKomma, ohneHiorg, temp]), [mitKomma, ohneHiorg, temp])[4]);
    expect(zeilen[1][11]).toBe("Führer Zug Verband");
  });

  it("höchstens 20 Qualifikationen je Person, ohne Doppel", () => {
    const viele: PlanHelfer = { ...stamm, qualifikationen: [stamm.qualifikationen[0], ...Array.from({ length: 25 }, (_, i) => ({ kurz: `Q${i}`, name: `Quali ${i}` }))] };
    const zeilen = werte(planungsMappe(plan, pruefe(plan, [viele, ohneHiorg, temp]), [viele, ohneHiorg, temp])[4]);
    expect(String(zeilen[1][11]).split(", ")).toHaveLength(20);
  });

  it("die geschriebene Mappe liest Lifeline Hub ohne Fehler: Blatt „Austausch“, Text- und Zahlzellen", async () => {
    const bytes = await mappenBytes(await xlsxAntwort("x.xlsx", mappe()));
    expect(blattnamen(bytes)[4]).toBe("Austausch");
    const raster = blattZellen(bytes, 4);
    expect(raster).toHaveLength(5);
    expect(raster[1][5]).toBe(3);
    expect(raster[1][12]).toBe("0123456789abcdef0123456789abcdef");
    expect(liesWieLifelineHub(raster)).toEqual([]);
  });

  it("der Vertragsleser schlägt an, wo Lifeline Hub abweist", () => {
    const raster = werte(mappe()[4]);
    raster[2][5] = 4;
    raster[4][4] = "2027-06-26 22:00";
    expect(liesWieLifelineHub(raster)).toEqual(["3: Soll widerspricht derselben Schicht", "5: Zeit ohne Versatz: 2027-06-26 22:00"]);
  });
});
