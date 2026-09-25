import { describe, expect, it } from "vitest";

import { anfangText, kennzahlen, listeneintraege, sitzungText, stichwortVerteilung, type Offen } from "./modell";
import { BLOECKE, EINSAETZE } from "./testvektoren";

const ZONE = "Europe/Berlin";
const OFFEN: Offen[] = BLOECKE.map((block, i) => ({ block, einsatz: EINSAETZE[i] }));

describe("kennzahlen", () => {
  it("zählt die drei Einsätze der Testvektoren wie `kpis` der Vorlage", () => {
    // Patienten 1 + 13 + 10, Transport 1 + 2 + 3, Dauer 88 + (offen) + 143 min = 3,85 h → 4.
    expect(kennzahlen(OFFEN, { anzahl: 3, zeitzone: ZONE })).toEqual([
      { label: "Einsätze versiegelt", zahl: "3" },
      { label: "Patienten gesamt", zahl: "24" },
      { label: "davon mit Transport", zahl: "6" },
      { label: "Einsatzstunden", zahl: "4" },
    ]);
  });

  it("zeigt nur die Anzahl, solange ein Block zu ist — eine Teilsumme sähe wie die ganze aus", () => {
    expect(kennzahlen(OFFEN.slice(0, 2), { anzahl: 3, zeitzone: ZONE })).toEqual([
      { label: "Einsätze versiegelt", zahl: "3" },
      { label: "Patienten gesamt", zahl: "—" },
      { label: "davon mit Transport", zahl: "—" },
      { label: "Einsatzstunden", zahl: "—" },
    ]);
  });
});

describe("stichwortVerteilung", () => {
  it("zählt je Stichwort, meiste zuerst, sonst nach Namen", () => {
    expect(stichwortVerteilung(OFFEN)).toEqual([
      { name: "MANV 10", anz: 1, breite: "100%" },
      { name: "RD 2", anz: 1, breite: "100%" },
      { name: "SanD", anz: 1, breite: "100%" },
    ]);
  });

  it("skaliert die Balken auf das häufigste Stichwort", () => {
    const zweimalRd = [...OFFEN, { block: BLOECKE[0], einsatz: EINSAETZE[0] }];
    expect(stichwortVerteilung(zweimalRd)[0]).toEqual({ name: "RD 2", anz: 2, breite: "100%" });
    expect(stichwortVerteilung(zweimalRd)[1]).toEqual({ name: "MANV 10", anz: 1, breite: "50%" });
  });
});

describe("listeneintraege", () => {
  it("neueste oben, offen mit Stichwort, Ort und Meta", () => {
    const l = listeneintraege({ offen: OFFEN, zu: [], gesperrt: false }, { art: "intakt", vollstaendig: true }, ZONE);
    expect(l.map((e) => e.block)).toEqual([3, 2, 1]);
    expect(l[2]).toMatchObject({
      block: 1,
      nummer: "2026-041",
      stichwort: "RD 2",
      ort: "Lindenstraße 8, 29525 Uelzen",
      versiegelt: "22.8.2026, 04:43 Uhr",
      meta: "1 Fahrzeug · 2 Kräfte · 1 Patient",
      knoten: "geprueft",
    });
  });

  it("ein Block, der sich nicht öffnen lässt, nennt das statt des Inhalts", () => {
    const l = listeneintraege({ offen: [OFFEN[0], OFFEN[2]], zu: [BLOECKE[1]], gesperrt: false }, null, ZONE);
    const zwei = l.find((e) => e.block === 2);
    expect(zwei).toMatchObject({ fehler: "Block 2 lässt sich nicht öffnen", stichwort: null, knoten: "neutral" });
    expect(zwei?.gesperrt).toBeUndefined();
  });

  it("ohne Freigabe steht jede Zeile gesperrt mit einem Anschnitt des Chiffrats", () => {
    const l = listeneintraege({ offen: [], zu: BLOECKE, gesperrt: true }, null, ZONE);
    expect(l.every((e) => e.gesperrt === true && e.stichwort === null)).toBe(true);
    expect(l[0].chiffre).toBe(`${BLOECKE[2].daten.slice(0, 48)}…`);
  });
});

describe("Texte mit Zone als Parameter", () => {
  it("sitzungText nennt Name und Ende in der Zone", () => {
    const ende = Date.parse("2026-09-25T11:00:00+02:00");
    expect(sitzungText({ name: "Ruben Vitt", ablaufMs: ende }, ZONE)).toBe("Sitzung von Ruben Vitt, endet 11:00 Uhr");
    expect(sitzungText({ name: "Ruben Vitt", ablaufMs: ende }, "UTC")).toBe("Sitzung von Ruben Vitt, endet 09:00 Uhr");
  });

  it("anfangText nennt Tag und Person der Einrichtung", () => {
    expect(anfangText("2026-09-01T00:30:00+02:00", "Ruben Vitt", ZONE)).toBe("Block 0 · Anfang der Kette · angelegt am 1.9.2026 von Ruben Vitt");
    expect(anfangText(null, null, ZONE)).toBe("Block 0 · Anfang der Kette");
  });
});
