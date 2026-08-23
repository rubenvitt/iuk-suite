// src/app/m/radio/_lib/filter.test.ts
import { describe, it, expect } from "vitest";
import { geraeteZustandAus, type GeraeteStatus } from "./status";
import {
  OHNE_STANDORT_ETIKETT,
  OHNE_STANDORT_SCHLUESSEL,
  STATUS_FILTER,
  STATUS_FILTER_ETIKETT,
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
 * (`briefs/KOPF.md:264-272`, die benannte Ausnahme).
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
     * aus (`radio-inventar/apps/frontend/src/api/devices.ts:144`).
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
     * samt Sonde in `_lib/status.test.ts:131-153`. Zwei Prueforte fuer eine Entscheidung
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
     * ⚠️ BILDSCHIRMTEXTE MIT UMLAUT — die eine benannte Ausnahme (`briefs/KOPF.md:264-272`).
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

    // Ohne Heimatlose gibt es die Gruppe nicht.
    expect(
      gruppiereNachStandort([zeile({ id: "z", rufname: "41/13", standort: "Zelt" })]).map(
        (g) => g.schluessel,
      ),
    ).toEqual(["Zelt"]);
  });
});
