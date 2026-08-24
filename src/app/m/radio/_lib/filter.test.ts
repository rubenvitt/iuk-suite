// src/app/m/radio/_lib/filter.test.ts
import { describe, it, expect } from "vitest";
import { geraeteZustandAus, type GeraeteStatus } from "./status";
import {
  OHNE_STANDORT_ETIKETT,
  OHNE_STANDORT_SCHLUESSEL,
  STATUS_FILTER,
  STATUS_FILTER_ETIKETT,
  filtereAusleihen,
  filtereGeraete,
  gruppiereNachStandort,
  normalisiereSuchtext,
  type StatusFilter,
} from "./filter";

/**
 * FLUSS C — SUCHEN, FILTERN, GRUPPIEREN (Spec 1 §4.5,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3596-3637`). Die Alt-Quelle ist
 * `radio-inventar/apps/frontend/src/lib/device-filter.ts`; sie wandert fachlich unveraendert
 * mit (Spec:3600).
 *
 * ⛔ DIE TESTDATEN DIESER DATEI TRAGEN UMLAUTE UND EIN ESZETT, UND ZWAR MIT ANSAGE.
 * `briefs/A13.md:37-38` schreibt das woertlich vor, und Falle Nr. 10 der Analyse
 * (`docs/radio-portierung-analyse.md:1360-1373`) nennt den Grund: „ohne Umlaut-Testdaten
 * sieht das kein Test." Die Hausregel „keine Umlaute in Bezeichnern, Testnamen und
 * Grep-Ankern" gilt hier unveraendert weiter — sie trifft die NAMEN, nicht die DATEN
 * (`briefs/KOPF.md:265-272`, die benannte Ausnahme).
 *
 * ⚠️ ZWEI ZUSAGEN AUS §4.5.1 STEHEN HIER ABSICHTLICH NICHT: „eine einzige Gruppe flach ohne
 * Kopfzeile" (`radio-inventar/apps/frontend/src/components/features/DeviceGroupedList.tsx:34-36`)
 * und „bei aktivem Suchtext alle Gruppen offen, Koepfe unklickbar"
 * (`DeviceGroupedList.tsx:31`, `DeviceGroup.tsx:22`)
 * sind Aussagen ueber das MARKUP der Insel, nicht ueber diese Funktionen. Sie gehoeren zu
 * `_ui/GeraeteListe.test.tsx` in A18 (Plan
 * `docs/superpowers/plans/2026-08-22-radio-modul-plan3-zugang-ausleihe.md:5017-5018`). Ein
 * Scan ueber eine Datei, die es noch nicht gibt, waere leer-gruen und bewachte nichts (NT11;
 * derselbe Grund steht in `_lib/status.test.ts:24-28`).
 */

/** Die Zeilenform, die `geraeteMitLeihstand` in A15 liefert (Plan `:4560-4562`), auf die
 *  Felder verkuerzt, die dieser Planteil hier braucht. */
type Zeile = {
  readonly id: string;
  readonly rufname: string;
  readonly geraetetyp: string | null;
  readonly standort: string | null;
  readonly status: GeraeteStatus;
  readonly suchschluessel: string;
};

/**
 * Baut eine Zeile so, wie A15 sie bauen wird: der `suchschluessel` ist die SCHON
 * normalisierte Verkettung aus Rufname, Geraetetyp, Seriennummer und Standort
 * (Spec:3629-3632, Alt-Quelle `device-filter.ts:36`). Die Seriennummer geht NUR hier ein —
 * sie bekommt bewusst kein eigenes Feld (§4.1 Punkt 2).
 */
function zeile(felder: {
  id: string;
  rufname: string;
  geraetetyp?: string | null;
  seriennummer?: string | null;
  standort?: string | null;
  status?: GeraeteStatus;
}): Zeile {
  const { id, rufname, geraetetyp = null, seriennummer = null, standort = null } = felder;
  return {
    id,
    rufname,
    geraetetyp,
    standort,
    status: felder.status ?? "AVAILABLE",
    suchschluessel: normalisiereSuchtext(
      [rufname, geraetetyp, seriennummer, standort].filter(Boolean).join(" "),
    ),
  };
}

const alles = { suchtext: "", status: "ALL" as StatusFilter };
const ids = (zeilen: readonly Zeile[]): string[] => zeilen.map((z) => z.id);

describe("radio-filter: die Normalisierung des Suchtextes", () => {
  it("findet Mueller ueber muller und Strasse ueber strasse", () => {
    /*
     * 1:1 aus `radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31`: klein, NFD,
     * kombinierende Diakritika weg, Eszett auf Doppel-s, getrimmt. Der Alt-Kommentar
     * (`:21-22`) nennt den Grund fuer den Sonderfall: das Eszett ist KEIN kombinierendes
     * Zeichen, NFD laesst es unberuehrt.
     */
    expect(normalisiereSuchtext("Müller"), "Umlaut nicht zerlegt").toBe("muller");
    expect(normalisiereSuchtext("Straße"), "Eszett nicht auf ss abgebildet").toBe("strasse");
    expect(normalisiereSuchtext("  ÄÖÜ  "), "nicht getrimmt oder nicht kleingeschrieben").toBe(
      "aou",
    );

    // Und dieselbe Zusage eine Ebene hoeher — sonst belegte der Fall nur die Hilfsfunktion.
    const bestand = [
      zeile({ id: "a", rufname: "41/12", geraetetyp: "Müller Funk", standort: "Große Straße" }),
      zeile({ id: "b", rufname: "41/13", geraetetyp: "Motorola", standort: "Bahnhof" }),
    ];
    expect(ids(filtereGeraete(bestand, { ...alles, suchtext: "muller" }))).toEqual(["a"]);
    expect(ids(filtereGeraete(bestand, { ...alles, suchtext: "strasse" }))).toEqual(["a"]);

    /*
     * ⛔ UND DIESELBE ZUSAGE AUF DER EBENE, AUF DER DER MENSCH TIPPT. Die zwei Zeilen darueber
     * geben bereits Normalform ein — sie bewachen die Suche, nicht die Normalisierung DER
     * ANFRAGE. Diese zwei bewachen genau den Aufrufort `filter.ts:184`
     * (`normalisiereSuchtext(zustand.suchtext)`); ohne ihn faende ein eingetipptes „Müller"
     * nichts, weil im `suchschluessel` „muller" steht.
     *
     * ⚠️ WAS SIE NICHT BEWACHEN: die vier Innenschritte von `normalisiereSuchtext`. Der
     * `suchschluessel` der Testdaten laeuft durch dieselbe Funktion, eine Mutation IN ihr
     * bewegt also beide Seiten gleich. Die Innenschritte bewachen `:88-92` oben.
     */
    expect(ids(filtereGeraete(bestand, { ...alles, suchtext: "Müller" }))).toEqual(["a"]);
    expect(ids(filtereGeraete(bestand, { ...alles, suchtext: "  STRASSE  " }))).toEqual(["a"]);
  });

  it("verlangt, dass ALLE Begriffe treffen", () => {
    /*
     * `device-filter.ts:40` — `terms.every`, nicht `terms.some`. Mit `some` faende die
     * Suche „motorola zelt" das Motorola am Bahnhof, und wer zwei Begriffe eintippt, meint
     * eine Verengung, keine Erweiterung.
     */
    const bestand = [
      zeile({ id: "a", rufname: "41/12", geraetetyp: "Motorola", standort: "Bahnhof" }),
      zeile({ id: "b", rufname: "41/13", geraetetyp: "Sepura", standort: "Zelt" }),
    ];
    expect(ids(filtereGeraete(bestand, { ...alles, suchtext: "motorola zelt" }))).toEqual([]);
    expect(ids(filtereGeraete(bestand, { ...alles, suchtext: "motorola bahnhof" }))).toEqual(["a"]);
  });

  it("findet ueber den Suchschluessel, was nicht als Feld mitreist", () => {
    /*
     * §4.5.2 (Spec:3629-3632) und §4.1 Punkt 2: die Seriennummer geht in den
     * `suchschluessel` ein, WANDERT ABER NICHT als eigenes Feld in den Client. Der Fall hat
     * deshalb zwei Haelften — ohne die zweite koennte er nicht unterscheiden, ob die Suche
     * im Schluessel oder in einem Seriennummernfeld gelaufen ist, und genau die zweite
     * traegt die Datenschutz-Zusage.
     */
    const geraet = zeile({
      id: "a",
      rufname: "41/12",
      geraetetyp: "Motorola",
      seriennummer: "SN-4711",
      standort: "Bahnhof",
    });

    expect(ids(filtereGeraete([geraet], { ...alles, suchtext: "sn-4711" }))).toEqual(["a"]);

    /*
     * ⚠️ DIESE HAELFTE PRUEFT DIE ZEILENFORM, DIE `zeile()` OBEN BAUT — nicht den Lesepfad.
     * Sie kann deshalb von keiner Sonde in `filter.ts` rot gemacht werden, und das ist keine
     * Nachlaessigkeit: der Lesepfad entsteht erst in A15, sein Wirknachweis gehoert dorthin
     * und nach A18 (Plan
     * `docs/superpowers/plans/2026-08-22-radio-modul-plan3-zugang-ausleihe.md:5020`).
     * Was sie hier belegt, ist die ANNAHME, unter der die erste Haelfte etwas aussagt.
     */
    const felderOhneSchluessel = Object.entries(geraet)
      .filter(([name]) => name !== "suchschluessel")
      .map(([, wert]) => String(wert));
    for (const wert of felderOhneSchluessel) {
      expect(wert, "die Seriennummer reist als eigenes Feld mit").not.toContain("4711");
    }
  });
});

describe("radio-filter: die vier Statusfilter", () => {
  const bestand = [
    zeile({ id: "frei", rufname: "41/12", status: "AVAILABLE" }),
    zeile({ id: "vergeben", rufname: "41/13", status: "ON_LOAN" }),
    zeile({ id: "defekt", rufname: "41/14", status: "DEFECT" }),
    zeile({ id: "wartung", rufname: "41/15", status: "MAINTENANCE" }),
  ];

  it("der Statusfilter UNAVAILABLE fasst DEFECT und MAINTENANCE zusammen", () => {
    // `device-filter.ts:51-52` — der vierte Filter ist der einzige, der zwei Zustaende
    // zusammenfasst; auf dem Bildschirm heisst er nach einem Wort, nicht nach zweien.
    expect(ids(filtereGeraete(bestand, { ...alles, status: "UNAVAILABLE" }))).toEqual([
      "defekt",
      "wartung",
    ]);
    expect(ids(filtereGeraete(bestand, { ...alles, status: "AVAILABLE" }))).toEqual(["frei"]);
    expect(ids(filtereGeraete(bestand, { ...alles, status: "ON_LOAN" }))).toEqual(["vergeben"]);
    expect(ids(filtereGeraete(bestand, alles))).toHaveLength(4);
  });

  it("sortiert nach Statusprioritaet: AVAILABLE vor ON_LOAN vor DEFECT vor MAINTENANCE", () => {
    /*
     * `radio-inventar/apps/frontend/src/api/devices.ts:44-49` und `:146-149`. Ohne diesen
     * Fall waere ein Vertauschen von DEFECT und MAINTENANCE gruen — die zwei Zustaende
     * kommen in keinem anderen Fall dieser Datei in eine Reihenfolge.
     */
    const gemischt = [
      zeile({ id: "wartung", rufname: "41/15", status: "MAINTENANCE" }),
      zeile({ id: "defekt", rufname: "41/14", status: "DEFECT" }),
      zeile({ id: "vergeben", rufname: "41/13", status: "ON_LOAN" }),
      zeile({ id: "frei", rufname: "41/12", status: "AVAILABLE" }),
    ];
    expect(ids(filtereGeraete(gemischt, alles))).toEqual([
      "frei",
      "vergeben",
      "defekt",
      "wartung",
    ]);
  });

  it("haelt die Eingabereihenfolge innerhalb eines Zustands", () => {
    // Die Sortierung ist stabil — sonst mischte jede Aktualisierung die Liste neu, obwohl
    // sich nichts geaendert hat.
    const gleich = [
      zeile({ id: "c", rufname: "41/14" }),
      zeile({ id: "a", rufname: "41/12" }),
      zeile({ id: "b", rufname: "41/13" }),
    ];
    expect(ids(filtereGeraete(gleich, alles))).toEqual(["c", "a", "b"]);
  });

  it("laesst die uebergebene Liste unangetastet", () => {
    /*
     * Die Grundmenge kommt als Prop aus einer Server Component (A18); ein `sort()` an Ort
     * und Stelle veraenderte sie dort still mit. Die Alt-Quelle schreibt denselben Grund
     * aus (`radio-inventar/apps/frontend/src/api/devices.ts:145`).
     *
     * ⛔ DIE EINGABE IST ABSICHTLICH GEGEN DIE STATUSPRIORITAET GEORDNET. Waere sie schon
     * sortiert, koennte dieser Fall ein `sort()` an Ort und Stelle nicht von einer Kopie
     * unterscheiden — er bliebe gruen und bewachte nichts.
     */
    const verkehrt = [
      zeile({ id: "wartung", rufname: "41/15", status: "MAINTENANCE" }),
      zeile({ id: "defekt", rufname: "41/14", status: "DEFECT" }),
      zeile({ id: "vergeben", rufname: "41/13", status: "ON_LOAN" }),
      zeile({ id: "frei", rufname: "41/12", status: "AVAILABLE" }),
    ];
    filtereGeraete(verkehrt, alles);
    expect(ids(verkehrt), "die uebergebene Liste wurde umsortiert").toEqual([
      "wartung",
      "defekt",
      "vergeben",
      "frei",
    ]);
  });

  it("ein Geraet ohne erfassten Zustand erscheint im Filter AVAILABLE und in der Sortierung ganz oben", () => {
    /*
     * ⬜ A-L13, DIE FOLGESTELLE DIESER AUFGABE (`.superpowers/sdd/planteil3/VORABSCAN-A.md:189`,
     * Vorschlag 7 in `:190`). Der Faltungsort ist `geraeteZustandAus` in `_lib/status.ts`
     * (A12) — hier wird belegt, dass der GEFALTETE Wert durch Filter und Sortierung laeuft
     * und ein Geraet ohne erfassten Zustand nicht durch alle vier Filter faellt.
     *
     * ⛔ DIE FALTUNG SELBST WIRD HIER NICHT NOCHMAL GEPRUEFT — sie hat ihren eigenen Fall
     * samt Sonde in `_lib/status.test.ts:131-152`. Zwei Prueforte fuer eine Entscheidung
     * waeren zwei Wahrheiten.
     */
    const ohneZustand = zeile({
      id: "ohne",
      rufname: "41/16",
      status: geraeteZustandAus(null),
    });
    const gemischt = [
      zeile({ id: "wartung", rufname: "41/15", status: "MAINTENANCE" }),
      ohneZustand,
      zeile({ id: "vergeben", rufname: "41/13", status: "ON_LOAN" }),
    ];

    expect(ids(filtereGeraete(gemischt, { ...alles, status: "AVAILABLE" }))).toEqual(["ohne"]);
    expect(ids(filtereGeraete(gemischt, alles))[0]).toBe("ohne");
    expect(ids(filtereGeraete(gemischt, { ...alles, status: "UNAVAILABLE" }))).not.toContain(
      "ohne",
    );
  });

  it("die vier Statusfilter tragen die Etiketten des Alt-Kiosk", () => {
    /*
     * Woertlich aus
     * `radio-inventar/apps/frontend/src/components/features/DeviceFilterBar.tsx:6-11`.
     * Sie stehen in `_lib/filter.ts` und nicht in der Insel, damit A18 sie von DORT liest
     * statt sie neu zu erfinden — dieselbe Anordnung, die A12 fuer `STATUS_HEX` und A16
     * getroffen hat (`_lib/status.ts`, Kopf).
     *
     * ⚠️ BILDSCHIRMTEXTE MIT UMLAUT — die eine benannte Ausnahme (`briefs/KOPF.md:265-272`).
     */
    expect(STATUS_FILTER).toEqual(["ALL", "AVAILABLE", "ON_LOAN", "UNAVAILABLE"]);
    expect(STATUS_FILTER_ETIKETT.ALL).toBe("Alle");
    expect(STATUS_FILTER_ETIKETT.AVAILABLE).toBe("Frei");
    expect(STATUS_FILTER_ETIKETT.ON_LOAN).toBe("Vergeben");
    expect(STATUS_FILTER_ETIKETT.UNAVAILABLE).toBe("Defekt·Wartung");
  });
});

describe("radio-filter: die Gruppierung nach Standort", () => {
  it("sortiert benannte Standorte nach de-Kollation", () => {
    /*
     * `device-filter.ts:87` — `localeCompare(b, 'de')`, nicht der Vergleich der
     * Zeichenwerte. ⛔ DIE TESTDATEN SIND GENAU DARAUF GEBAUT: nach Zeichenwerten stuende
     * „Bahnhof" (B = U+0042) vor „Ärztehaus" (A-Umlaut = U+00C4) und „Zelt" (U+005A) vor
     * „Übungsraum" (U+00DC). Ein Paar aus reinen ASCII-Namen bestuende BEIDE Ordnungen und
     * bewachte nichts.
     */
    const bestand = [
      zeile({ id: "z", rufname: "41/15", standort: "Zelt" }),
      zeile({ id: "b", rufname: "41/13", standort: "Bahnhof" }),
      zeile({ id: "u", rufname: "41/14", standort: "Übungsraum" }),
      zeile({ id: "a", rufname: "41/12", standort: "Ärztehaus" }),
    ];
    const gruppen = gruppiereNachStandort(bestand);
    expect(gruppen.map((g) => g.etikett)).toEqual([
      "Ärztehaus",
      "Bahnhof",
      "Übungsraum",
      "Zelt",
    ]);
  });

  it("legt Geraete ohne Standort in die letzte Gruppe", () => {
    /*
     * `device-filter.ts:90-92` — die Sammelgruppe wird ANGEHAENGT, nie einsortiert, und sie
     * entsteht nur, wenn sie jemanden enthaelt. Ein leerer Kopf „Ohne Standort" ueber nichts
     * waere eine Zeile, die der Mensch lesen muss, ohne dass sie etwas sagt.
     * `device-filter.ts:76` trimmt den Standort: ein Feld mit einem Leerzeichen ist kein
     * Standort.
     */
    const bestand = [
      zeile({ id: "leer", rufname: "41/12", standort: "   " }),
      zeile({ id: "z", rufname: "41/13", standort: "Zelt" }),
      zeile({ id: "nichts", rufname: "41/14", standort: null }),
      zeile({ id: "a", rufname: "41/15", standort: "Ärztehaus" }),
    ];
    const gruppen = gruppiereNachStandort(bestand);

    expect(gruppen.map((g) => g.schluessel)).toEqual([
      "Ärztehaus",
      "Zelt",
      OHNE_STANDORT_SCHLUESSEL,
    ]);
    const letzte = gruppen.at(-1);
    expect(letzte?.etikett).toBe(OHNE_STANDORT_ETIKETT);
    expect(ids(letzte?.geraete ?? [])).toEqual(["leer", "nichts"]);

    /*
     * ⛔ DIE ZWEI WERTE SELBST, ALS LITERAL — nicht gegen die importierte Konstante. Die
     * Zusicherungen darueber vergleichen das Ergebnis gegen DIESELBE Konstante und belegen
     * damit die Verdrahtung, nie den Wert: eine Umbenennung auf „Kein Standort" liesse sie
     * gruen (gemessen, `REVIEW-A13.md` Fund W2, zwei Sonden 0 rot). „Ohne Standort" ist ein
     * Bildschirmtext, den A18 von hier liest (`filter.ts:58-59`), und `__none__` ist der
     * Schluessel, an dem die Insel die Sammelgruppe erkennt — beide 1:1 aus
     * `radio-inventar/apps/frontend/src/lib/device-filter.ts:16-17`.
     */
    expect(OHNE_STANDORT_SCHLUESSEL).toBe("__none__");
    expect(OHNE_STANDORT_ETIKETT).toBe("Ohne Standort");

    // Ohne Heimatlose gibt es die Gruppe nicht.
    expect(
      gruppiereNachStandort([zeile({ id: "z", rufname: "41/13", standort: "Zelt" })]).map(
        (g) => g.schluessel,
      ),
    ).toEqual(["Zelt"]);
  });
});

describe("radio-filter: die Suche der Rueckgabe geht ueber ANDERE Felder", () => {
  /**
   * Eine offene Ausleihe, wie `_db/leihen.ts` sie liefert — hier auf die zwei Felder
   * verkuerzt, die `filtereAusleihen` liest.
   */
  const leihe = (rufname: string, entleiher: string) => ({ rufname, entleiher });

  const OFFEN = [
    leihe("41/12", "Anna Beispiel"),
    leihe("41/13", "Björn Müller"),
    leihe("Wache 7", "Anna Straße"),
  ];

  it("sucht ueber Rufname UND Entleihername", () => {
    /*
     * ⛔ FALLE № 10 DER ANALYSE (`docs/radio-portierung-analyse.md:1370-1374`), woertlich:
     * „in der Rueckgabe wird ueber `device.callSign` UND `borrowerName` gesucht
     * (`lib/loan-filter.ts:5-9`) … in der Uebersicht ueber `callSign`, `deviceType`,
     * `serialNumber`, `location` — dort kommt der Entleiher NICHT vor."
     * ⛔ WER EINE EINZIGE SUCHE BAUT, AENDERT BEIDE VERHALTEN — genau der Satz, der dort
     * unter „Kein Gate" steht. Dieser Fall misst beide Richtungen an EINER Zeile: der
     * Rufname findet, der Name findet, und keiner der beiden faellt dabei weg.
     */
    expect(filtereAusleihen(OFFEN, "41/12").map((a) => a.rufname)).toEqual(["41/12"]);
    expect(filtereAusleihen(OFFEN, "beispiel").map((a) => a.rufname)).toEqual(["41/12"]);
  });

  it("verknuepft mehrere Begriffe mit UND, ueber beide Felder hinweg", () => {
    /*
     * `loan-filter.ts:5` zerlegt an Leerzeichen, `:9` verlangt `every`. ⛔ MIT `some` faende
     * „41/12 mueller" beide Zeilen — die Verengung, die eine zweite Eingabe meint, waere
     * eine Erweiterung.
     * ⛔ UND DER HEUHAUFEN IST EINE ZEICHENKETTE AUS BEIDEN FELDERN (`loan-filter.ts:8`):
     * ein Begriff aus dem Rufnamen und einer aus dem Namen treffen zusammen.
     */
    expect(filtereAusleihen(OFFEN, "41/12 anna").map((a) => a.rufname)).toEqual(["41/12"]);
    expect(filtereAusleihen(OFFEN, "41/12 mueller")).toEqual([]);
  });

  it("ist akzent- und eszett-tolerant, weil sie dieselbe Normalisierung benutzt", () => {
    /*
     * ⛔ DIESELBE `normalisiereSuchtext` WIE DIE UEBERSICHT (`filter.ts:108`), nicht eine
     * zweite: der Alt-Bestand teilt sie ebenso (`loan-filter.ts:2` importiert sie aus
     * `device-filter.ts`). ⛔ OHNE UMLAUT-TESTDATEN SIEHT DAS KEIN TEST
     * (`docs/radio-portierung-analyse.md:1377-1378`).
     * ⚠️ DIE UE/AE-ERSATZSCHREIBUNG IST AUSDRUECKLICH NICHT GELEISTET (ebd. `:1366-1368`):
     * „Muelheim" findet „Mühlheim" nicht. Der zweite Ausdruck haelt genau das fest, damit
     * niemand sie spaeter fuer einen Fehler haelt.
     */
    expect(filtereAusleihen(OFFEN, "bjorn").map((a) => a.rufname)).toEqual(["41/13"]);
    expect(filtereAusleihen(OFFEN, "strasse").map((a) => a.rufname)).toEqual(["Wache 7"]);
    expect(filtereAusleihen(OFFEN, "muller").map((a) => a.rufname)).toEqual(["41/13"]);
    expect(filtereAusleihen(OFFEN, "mueller"), "ue ist KEIN kombinierendes Zeichen").toEqual([]);
  });

  it("liefert bei leerem Suchtext die Liste UNVERAENDERT und in ihrer Reihenfolge", () => {
    /*
     * ⛔ KEINE SORTIERUNG (anders als `filtereGeraete`, `filter.ts:180-190`): die Reihenfolge
     * kommt aus `offeneAusleihen` — neueste zuerst (`_db/leihen.ts:302`,
     * `loanRepo.ts:126-135`). Eine zweite Ordnung hier waere eine zweite Wahrheit, und die
     * Alt-Quelle sortiert an dieser Stelle ebenfalls nicht (`loan-filter.ts:6`).
     * ⛔ UND EINE NEUE LISTE, nie an Ort und Stelle: die Eingabe ist eine Prop aus einer
     * Server Component (A20).
     */
    expect(filtereAusleihen(OFFEN, "   ").map((a) => a.rufname)).toEqual([
      "41/12",
      "41/13",
      "Wache 7",
    ]);
    expect(filtereAusleihen(OFFEN, "")).not.toBe(OFFEN);
  });
});
