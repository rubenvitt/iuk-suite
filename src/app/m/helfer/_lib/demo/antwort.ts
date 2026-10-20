/**
 * Die Demo-Quelle: eine Personalantwort im Format von HiOrg-Server (`GET /core/v1/personal`), mit
 * erfundenen Personen. Der Demo-Modus liest sie über denselben Weg wie die echte Antwort
 * (`lesePersonal`, Filter, Abgleich) — wer ihn anschaut, sieht also genau, was ein echter Import tut.
 *
 * ABSICHTLICH MIT ALLEN FELDERN, die HiOrg liefert, auch Bankverbindung, Geburtsdatum, Allergien und
 * Führerschein (alles erfunden, die IBAN ist eine gültig gebaute Test-IBAN ohne Konto). So belegt
 * die Demo, dass nichts davon gespeichert wird; `person.test.ts` prüft das an dieser Antwort.
 *
 * Die Mischung ist gewollt: Aktive, Eingeschränkte, Externe, Gesperrte, Ausgetretene, Passive und
 * Fördermitglieder, damit der Importfilter etwas zu tun hat.
 */

type Zeile = readonly [vorname: string, nachname: string, status: string, gesperrt: boolean, austritt: string, gruppen: readonly string[], qualis: readonly string[]];

const BEREITSCHAFT = "Bereitschaft";
const SAN = "Sanitätsdienst";
const BT = "Betreuung";
const IUK = "IuK";
const PASSIV = "Passive";
const JRK = "Jugendrotkreuz";
const FOERDER = "Fördermitglieder";

/** Kürzel → [Liste, Name]. */
const QUALI: Record<string, readonly [string, string]> = {
  EH: ["med. Qualifikation", "Ersthelfer"],
  SanH: ["med. Qualifikation", "Sanitätshelfer"],
  San: ["med. Qualifikation", "Sanitäter"],
  RS: ["med. Qualifikation", "Rettungssanitäter"],
  RA: ["med. Qualifikation", "Rettungsassistent"],
  NotSan: ["med. Qualifikation", "Notfallsanitäter"],
  GrF: ["Führungsqualifikation", "Gruppenführer"],
  ZF: ["Führungsqualifikation", "Zugführer"],
  SprF: ["Technik", "Sprechfunker"],
  BtH: ["Betreuung", "Betreuungshelfer"],
};

const ZEILEN: readonly Zeile[] = [
  ["Jana", "Albers", "aktiv", false, "", [BEREITSCHAFT, SAN], ["NotSan", "GrF", "SprF"]],
  ["Tim", "Behrens", "aktiv", false, "", [BEREITSCHAFT, SAN], ["RS", "SprF"]],
  ["Lea", "Cordes", "aktiv", false, "", [BEREITSCHAFT, SAN], ["San"]],
  ["Malte", "Dierks", "aktiv", false, "", [BEREITSCHAFT, IUK], ["SanH", "SprF"]],
  ["Sophie", "Ehlers", "aktiv", false, "", [BEREITSCHAFT, BT], ["BtH", "EH"]],
  ["Jonas", "Fricke", "aktiv", false, "", [BEREITSCHAFT, SAN], ["RA", "ZF"]],
  ["Nele", "Garbers", "aktiv", false, "", [BEREITSCHAFT, SAN], ["RS"]],
  ["Ole", "Hansen", "aktiv", false, "", [BEREITSCHAFT, IUK], ["San", "SprF"]],
  ["Paula", "Isermann", "aktiv", false, "", [BEREITSCHAFT, SAN], ["SanH"]],
  ["Finn", "Jürgens", "aktiv", false, "", [BEREITSCHAFT, SAN, BT], ["San", "BtH"]],
  ["Marie", "Kruse", "aktiv", false, "", [BEREITSCHAFT, SAN], ["NotSan"]],
  ["Ben", "Lüders", "aktiv", false, "", [BEREITSCHAFT, SAN], ["RS", "GrF"]],
  ["Hanna", "Meyer", "aktiv", false, "", [BEREITSCHAFT], ["EH"]],
  ["Lukas", "Niemann", "aktiv", false, "", [BEREITSCHAFT, SAN], ["San"]],
  ["Clara", "Otte", "aktiv", false, "", [BEREITSCHAFT, BT], ["SanH", "BtH"]],
  ["Henrik", "Peters", "aktiv", false, "", [BEREITSCHAFT, IUK], ["SprF"]],
  ["Emma", "Quast", "aktiv", false, "", [BEREITSCHAFT, SAN], ["RS"]],
  ["Mats", "Rademacher", "aktiv", false, "", [BEREITSCHAFT, SAN], ["San", "SprF"]],
  ["Lina", "Schulz", "aktiv", false, "", [BEREITSCHAFT, SAN], ["SanH"]],
  ["Jan", "Thies", "aktiv", false, "", [BEREITSCHAFT, SAN], ["RS", "ZF"]],
  ["Mia", "Ulrich", "aktiv", false, "", [BEREITSCHAFT, JRK], ["EH"]],
  ["Paul", "Voß", "aktiv", false, "", [BEREITSCHAFT, SAN], ["NotSan", "SprF"]],
  ["Ida", "Wiebe", "aktiv", false, "", [BEREITSCHAFT, BT], ["BtH"]],
  ["Tom", "Zander", "aktiv", false, "", [BEREITSCHAFT, SAN], ["San"]],
  ["Frieda", "Brandt", "aktiv", false, "", [BEREITSCHAFT, PASSIV], ["SanH"]],
  ["Nils", "Heuer", "aktiv", false, "", [PASSIV], ["RS"]],
  ["Greta", "Möller", "aktiv", false, "", [FOERDER], []],
  ["Lars", "Schröder", "aktiv", false, "", [FOERDER], []],
  ["Merle", "Albers", "aktiv", false, "", [JRK], []],
  ["Hauke", "Behrens", "eingeschraenkt", false, "", [BEREITSCHAFT, SAN], ["San"]],
  ["Svenja", "Cordes", "eingeschraenkt", false, "", [BEREITSCHAFT], ["SanH"]],
  ["Arne", "Dierks", "extern", false, "", [SAN], ["NotSan"]],
  ["Kira", "Ehlers", "extern", false, "", [SAN], ["RS"]],
  ["Timo", "Fricke", "gesperrt", true, "", [BEREITSCHAFT, SAN], ["RS"]],
  ["Wiebke", "Garbers", "aktiv", true, "", [BEREITSCHAFT], ["San"]],
  ["Sönke", "Hansen", "aktiv", false, "31.12.2025", [BEREITSCHAFT, SAN], ["RA"]],
  ["Anke", "Isermann", "aktiv", false, "2026-06-30", [BEREITSCHAFT, BT], ["BtH"]],
  ["Jens", "Jürgens", "aktiv", false, "31.12.2099", [BEREITSCHAFT, SAN], ["San"]],
];

/** 32 Hex-Zeichen wie eine HiOrg-Kennung, fest je Zeile — derselbe Demo-Bestand bei jedem Abruf. */
const kennung = (i: number) => `de0de${(i + 1).toString(16).padStart(27, "0")}`;

/**
 * Baut die Antwort frisch (keine geteilte, veränderbare Struktur). Die erfundenen Zusatzfelder
 * stehen bei JEDER Person, damit „nichts davon wird gespeichert“ nicht an einer Stichprobe hängt.
 */
export function demoAntwort(): unknown {
  return {
    jsonapi: { version: "1.0" },
    data: ZEILEN.map(([vorname, nachname, status, gesperrt, austritt, gruppen, qualis], i) => ({
      type: "user",
      id: kennung(i),
      links: { self: `https://api.hiorg-server.de/core/v1/personal/${kennung(i)}` },
      attributes: {
        anrede: "", vorname, nachname, titel: "",
        username: `${vorname}.${nachname}`.toLowerCase(), kuerzel: `${vorname[0]}${nachname.slice(0, 2)}`,
        telpriv: "0581 000000", teldienst: "", handy: "+49 170 0000000",
        email: `${vorname}.${nachname}@demo.invalid`.toLowerCase(),
        adresse: "Musterstraße 1", plz: "29525", ort: "Uelzen", land: "Deutschland",
        gebdat: "1990-01-01", gebort: "Uelzen",
        gruppen_namen: gruppen, orgakuerzel: "demo", leitung: false, status, gesperrt,
        rechte: ["helfer"],
        qualifikationen: qualis.map((kurz, position) => ({
          position: position + 1, liste_id: 1, liste: QUALI[kurz][0], rang: position, name: QUALI[kurz][1],
          name_kurz: kurz, zentralliste_id: 1, zentralliste_rang: 1, zentralliste_name_kurz: kurz, erwerb_datum: "2020-01-01",
        })),
        ausbildungen: [{ id: 1, ausbildung_id: 1, bezeichnung: "Erste Hilfe", datum: "2024-01-01", lehrgangsnummer: "DEMO", gueltig_bis: "2026-01-01" }],
        fahrerlaubnis: { klassen: ["B"], beschraenkung: "", fuehrerscheinnummer: "DEMO0000000", fuehrerscheindatum: "2010-01-01" },
        angehoerige: "Demo-Angehörige, 0581 000000",
        ernaehrung: ["vegetarisch"], allerg_intol: ["Demo-Allergie"], verpflegung_weiteres: "",
        kontoinhaber: `${vorname} ${nachname}`, iban: "DE02120300000000202051", bic: "BYLADEM1001", kreditinstitut: "Demo-Bank",
        mitgliednr: String(1000 + i), mitglied_seit: "01.01.2015", austritt_datum: austritt, wechseljgddat: "",
        beruf: "Demo-Beruf", arbeitgeber: "Demo GmbH", bemerkung: "Erfundene Person für den Demo-Modus.", funktion: "",
        benutzerdefinierte_felder: [{ id: "user1", name: "Führungszeugnis", wert: "liegt vor" }],
      },
      relationships: { organisation: { data: { type: "orga", id: "0" } } },
    })),
  };
}

/** Wie viele Personen die Demo-Antwort trägt (für Tests und den Hinweis in der Oberfläche). */
export const DEMO_ANZAHL = ZEILEN.length;
