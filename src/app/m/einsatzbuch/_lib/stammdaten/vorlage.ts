import type { FahrzeugDTO, PersonDTO, StichwortDTO } from "./typen";

/** Wörtlich aus der Vorlage (`Einsatzbuch v2.dc.html`, `ORTE`): Fahrzeugstandort → Kennungspräfix. */
export const ORTE = [["Uelzen", 11], ["Bad Bevensen", 12], ["Ebstorf", 13], ["Suderburg", 14], ["Bienenbüttel", 15], ["Rosche", 16], ["Wrestedt", 17], ["Bad Bodenteich", 18]] as const;
export const GRUPPEN = [
  { name: "Rettungsdienst", items: ["RD 1", "RD 2", "Unterstützung RD"] },
  { name: "MANV", items: ["MANV 5", "MANV 10", "MANV 25"] },
  { name: "Sanitätsdienst", items: ["SanD"] },
  { name: "Betreuung", items: ["Betreuung 25", "Betreuung 50", "Evakuierung"] },
  { name: "Sonstiges", items: ["Personensuche", "Sonstiges"] },
] as const;
/**
 * Die Qualifikationen des Personals, höchste zuerst (DRK-488). Gespeichert wird die Abkürzung;
 * sie wandert als Schnappschuss in jeden Einsatz und steht in der App auf dem Auswahlchip.
 */
export const QUALIFIKATIONEN = [
  { kurz: "NotSan", lang: "Notfallsanitäter" },
  { kurz: "RettAss", lang: "Rettungsassistent" },
  { kurz: "RS", lang: "Rettungssanitäter" },
  { kurz: "SiK", lang: "Sanitäter im Katastrophenschutz" },
  { kurz: "SanH", lang: "Sanitätshelfer" },
] as const;
export const QUALIS = QUALIFIKATIONEN.map((q) => q.kurz);

export const VORLAGE_FAHRZEUGE: FahrzeugDTO[] = (() => {
  const T: Record<string, number> = { "ELW 1": 11, RTW: 83, "KTW-B": 85, "GW-San": 64, "GW-Bt": 68, MTF: 19, PKW: 10 };
  const U: Record<string, number> = { "ELW 1": 1, RTW: 2, "KTW-B": 3, "GW-San": 2, "GW-Bt": 1, MTF: 3, PKW: 2 };
  const A: Record<string, number> = { RTW: 1, "KTW-B": 1, "GW-San": 1, MTF: 2, PKW: 1 };
  const out: FahrzeugDTO[] = [];
  ORTE.forEach(([ort, k], i) => {
    Object.entries(i === 0 ? U : A).forEach(([typ, n]) => {
      for (let j = 1; j <= n; j++) { const kennung = `${k}-${T[typ]}-${j}`; out.push({ id: kennung, typ, kennung, ruf: `Rotkreuz ${ort} ${kennung}`, standort: ort, aktiv: true }); }
    });
  });
  return out;
})();

export const VORLAGE_PERSONAL: PersonDTO[] = (() => {
  const nn = ["Albers", "Behrens", "Cordes", "Dierks", "Ehlers", "Fricke", "Garbers", "Hansen", "Isermann", "Jürgens", "Kruse", "Lüders", "Meyer", "Niemann", "Otte", "Peters", "Quast", "Rademacher", "Schulz", "Thies", "Ulrich", "Voß", "Wiebe", "Zander", "Brandt", "Heuer", "Möller", "Schröder"];
  const vn = ["Jana", "Tim", "Lea", "Malte", "Sophie", "Jonas", "Nele", "Ole", "Paula", "Finn", "Marie", "Ben", "Hanna", "Lukas", "Clara", "Henrik", "Emma", "Mats", "Lina", "Jan", "Mia", "Paul", "Ida", "Tom", "Frieda", "Nils", "Greta", "Lars", "Merle", "Hauke", "Svenja", "Arne", "Kira", "Timo", "Wiebke", "Sönke", "Anke", "Jens", "Maren", "Bjarne"];
  const q = ["SanH", "SanH", "RS", "SanH", "SiK", "RS", "SanH", "NotSan", "SiK", "SanH", "RettAss", "RS", "SanH", "SiK", "NotSan", "SiK", "RS", "SanH"];
  const out: PersonDTO[] = [];
  for (let i = 0; i < 112; i++) out.push({ id: "p" + (i + 1), name: `${nn[i % 28]}, ${vn[(i * 7 + Math.floor(i / 28) * 3) % 40]}`, quali: q[i % q.length], aktiv: true });
  return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
})();

const slug = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const VORLAGE_STICHWORTE: StichwortDTO[] = GRUPPEN.flatMap((g) =>
  g.items.map((name, i) => ({ id: `sw-${slug(name)}`, gruppe: g.name, name, reihenfolge: i + 1, aktiv: true })));
