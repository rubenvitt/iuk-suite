import { GENESIS, type Blockkopf, type Einsatz } from "./format";

/** Ein vollständiger Einsatz für Tests — Umlaute, Anführungszeichen und Zeilenumbruch mit Absicht. */
export function beispielEinsatz(nummer = "2026-047"): Einsatz {
  return {
    v: 1, nummer, stichwort: "MANV 10",
    beginnDatum: "2026-09-23", beginnZeit: "18:42", endeDatum: "2026-09-23", endeZeit: "21:05",
    strasse: "B4, Abfahrt Uelzen-Nord", ort: "29525 Uelzen", objekt: "VU Reisebus / Pkw",
    fahrzeuge: [{ id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" }],
    personal: [
      { id: "p4", name: "Dierks, Malte", quali: "NotSan", ov: "Uelzen", fahrzeugId: "11-83-1" },
      { id: "p9", name: "Isermann, Paula", quali: "SanH", ov: "Ebstorf", fahrzeugId: null },
    ],
    vorOrt: 7, transport: 3,
    notizen: "Übergabe an OrgL RD um 19:05 Uhr.\n„Behandlungsplatz\" am GW-San.",
  };
}

export function kopf(block: number, prev: string, schluesselId: string, umgebung: Blockkopf["umgebung"] = "echt"): Blockkopf {
  return { v: 1, block, prev, versiegelt: "2026-09-23T21:08:00+02:00", schluesselId, umgebung };
}

export { GENESIS };
