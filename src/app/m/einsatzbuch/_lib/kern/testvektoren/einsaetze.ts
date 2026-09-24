import type { Einsatz } from "../format";

/**
 * Drei Einsätze aus der Vorlage (`Einsatzbuch v2.dc.html`, `SEEDS`), als Schnappschuss
 * umgeschrieben. Mit Absicht dabei: Umlaute, „typografische" und gerade Anführungszeichen,
 * Zeilenumbruch, Tab, Steuerzeichen U+0001, U+2028, DEL, Emoji, leeres Objekt, offenes Ende,
 * Person ohne Fahrzeug — jede Stelle, an der eine JCS-Umsetzung in Rust anders maskieren könnte.
 */
export const TESTEINSAETZE: Einsatz[] = [
  {
    v: 1, nummer: "2026-041", stichwort: "RD 2",
    beginnDatum: "2026-08-22", beginnZeit: "03:12", endeDatum: "2026-08-22", endeZeit: "04:40",
    strasse: "Lindenstraße 8", ort: "29525 Uelzen", objekt: "",
    fahrzeuge: [{ id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" }],
    personal: [
      { id: "p4", name: "Dierks, Malte", quali: "NotSan", ov: "Uelzen", fahrzeugId: "11-83-1" },
      { id: "p8", name: "Hansen, Ole", quali: "RS", ov: "Uelzen", fahrzeugId: "11-83-1" },
    ],
    vorOrt: 0, transport: 1, notizen: "",
  },
  {
    v: 1, nummer: "2026-042", stichwort: "SanD",
    beginnDatum: "2026-08-29", beginnZeit: "13:00", endeDatum: null, endeZeit: null,
    strasse: "Am Sportzentrum", ort: "29549 Bad Bevensen", objekt: "Stadtfest, ca. 2.500 Besucher",
    fahrzeuge: [{ id: "12-19-1", typ: "MTF", kennung: "12-19-1", ruf: "Rotkreuz Bad Bevensen 12-19-1", standort: "Bad Bevensen" }],
    personal: [{ id: "p11", name: "Kruse, Marie", quali: "SanH", ov: "Bad Bevensen", fahrzeugId: null }],
    vorOrt: 11, transport: 2, notizen: "Zwei Transporte durch den Regel-RD übernommen.",
  },
  {
    v: 1, nummer: "2026-043", stichwort: "MANV 10",
    beginnDatum: "2026-09-23", beginnZeit: "18:42", endeDatum: "2026-09-23", endeZeit: "21:05",
    strasse: "B4, Abfahrt Uelzen-Nord", ort: "29525 Uelzen", objekt: "VU Reisebus / Pkw",
    fahrzeuge: [
      { id: "11-11-1", typ: "ELW 1", kennung: "11-11-1", ruf: "Rotkreuz Uelzen 11-11-1", standort: "Uelzen" },
      { id: "11-64-1", typ: "GW-San", kennung: "11-64-1", ruf: "Rotkreuz Uelzen 11-64-1", standort: "Uelzen" },
    ],
    personal: [
      { id: "p1", name: "Albers, Jana", quali: "ZF", ov: "Uelzen", fahrzeugId: "11-11-1" },
      { id: "p13", name: "Meyer, Hanna", quali: "BtH", ov: "Rosche", fahrzeugId: "11-64-1" },
    ],
    vorOrt: 7, transport: 3,
    notizen: "Übergabe an OrgL RD um 19:05 Uhr.\n„Behandlungsplatz\" am GW-San aufgebaut. 😀\tTab \u0001 \u2028 \u007f Ende",
  },
];

export const TESTVERSIEGELT = ["2026-08-22T04:43:00+02:00", "2026-08-29T19:33:00+02:00", "2026-09-23T21:08:00+02:00"];
