import { describe, expect, expectTypeOf, it } from "vitest";
import type { VerwaltungscheckEingabe } from "../_actions/verwaltungscheck";
import { ENTNAHMEBOX_ID } from "./konstanten";
import type { VerwaltungscheckDaten } from "./lesepfade/verwaltungscheck";
import {
  ausgleichZeilen, baueNutzlast, fortschritt, leererZustand, sperrGruende,
  type VerwaltungscheckNutzlast, type ZaehlZustand,
} from "./verwaltungscheck";

/**
 * DIE REINE LOGIK DER ZÄHLSEITE — Spec 6.3, 6.4, 6.12. Die Insel zeigt, was
 * hier gerechnet wird; der Abschluss (`_actions/verwaltungscheck.ts`) bekommt,
 * was `baueNutzlast` baut. Ob der Server diese Form annimmt, prüft ein Fall in
 * `_actions/verwaltungscheck.test.ts` gegen die echte Action.
 */

const JETZT = new Date("2026-11-22T10:00:00Z");
const SENDUNG = "6f1c2b9e-1d2a-4c3b-9a8e-0f1e2d3c4b5a";

/** Kompresse in Fach 1 + 2 (3 + 2), Wärmedecke in Fach 2 (4 bis 6), Pflaster in Fach 3 (1). */
function daten(extra: Partial<VerwaltungscheckDaten> = {}): VerwaltungscheckDaten {
  return {
    fahrzeug: { id: "fz-1", name: "RTW 1", kennung: null, einheitenart: "fahrzeug", aktiv: true },
    positionen: [
      { id: "sp-1", fachLabel: "1", artikelId: "art-1", artikelName: "Kompresse", einheit: "Stk", soll: 3, sollMax: null },
      { id: "sp-2", fachLabel: "2", artikelId: "art-1", artikelName: "Kompresse", einheit: "Stk", soll: 2, sollMax: null },
      { id: "sp-3", fachLabel: "2", artikelId: "art-2", artikelName: "Wärmedecke", einheit: "Stk", soll: 4, sollMax: 6 },
      { id: "sp-4", fachLabel: "3", artikelId: "art-3", artikelName: "Pflaster", einheit: "Pkg", soll: 1, sollMax: null },
    ],
    buchstand: { "art-1": 5, "art-2": 6, "art-3": 1 },
    verfallFach: {},
    verfallArtikel: { "art-1": "2030-01", "art-2": "2029-05", "art-3": "2028-03" },
    chargenAnEinheit: {},
    plomben: [
      { id: "pl-2", bezeichnung: "Siegel Fach 2", fachLabel: "2", nummer: null, gesetzt: null },
      { id: "pl-frei", bezeichnung: "Siegel Tür", fachLabel: null, nummer: "77", gesetzt: "77 · gesetzt 01.11.2026, 10:00" },
    ],
    geraete: [
      { id: "g-1", name: "Absaugpumpe", typ: "medizin", barcode: null, selbsttest: false },
      { id: "g-2", name: "AED", typ: "medizin", barcode: null, selbsttest: true },
    ],
    flaschen: [{ id: "o-1", name: "O2 klein", nennfuelldruckBar: 200, wechselAbProzent: 25 }],
    geraeteWoanders: [],
    flaschenWoanders: [],
    ruecklaufZiele: [{ id: "sch-1", name: "Schrank 1" }],
    entnahmeboxAktiv: true,
    lagerorte: [],
    aufladenArtikel: [],
    schwellen: { rotTage: 28, gelbTage: 90 },
    ...extra,
  };
}

function zustand(extra: Partial<ZaehlZustand> = {}): ZaehlZustand {
  return { ...leererZustand(), ...extra };
}

describe("leererZustand", () => {
  it("hat nichts erfasst", () => {
    expect(leererZustand()).toEqual({
      ist: {}, verfall: {}, ausgleich: {}, plomben: {}, geraete: {}, druck: {}, kommentar: "",
    });
  });

  it("gibt jedes Mal ein neues Objekt", () => {
    const a = leererZustand();
    a.ist["sp-1"] = 3;
    expect(leererZustand().ist).toEqual({});
  });
});

describe("ausgleichZeilen", () => {
  it("zeigt nur ganz gezählte Artikel", () => {
    // Kompresse nur in Fach 1 gezählt (weit unter Soll) — keine Zeile.
    const z = zustand({ ist: { "sp-1": 0, "sp-4": 0 } });
    expect(ausgleichZeilen(daten(), z, JETZT).map((r) => r.artikelId)).toEqual(["art-3"]);
  });

  it("zeigt eine Fehlmenge über die Summe der Fächer", () => {
    const z = zustand({ ist: { "sp-1": 2, "sp-2": 1 } });
    expect(ausgleichZeilen(daten(), z, JETZT)).toEqual([{
      artikelId: "art-1", artikelName: "Kompresse", einheit: "Stk",
      sollSumme: 5, obergrenze: 5, ist: 3, buchstand: 5,
      fehlmenge: 2, ueberschuss: 0, abgelaufen: false, plusOhneHerkunft: false, nachAusgleich: 3,
    }]);
  });

  it("lässt einen Artikel innerhalb von Soll bis „OK bis“ weg", () => {
    const z = zustand({ ist: { "sp-3": 6, "sp-4": 1 } });
    expect(ausgleichZeilen(daten(), z, JETZT)).toEqual([]);
  });

  it("zeigt Überschuss erst über der Obergrenze", () => {
    const z = zustand({ ist: { "sp-3": 8 } });
    const [zeile] = ausgleichZeilen(daten({ buchstand: { "art-2": 8 } }), z, JETZT);
    expect(zeile).toMatchObject({ artikelId: "art-2", sollSumme: 4, obergrenze: 6, ueberschuss: 2, fehlmenge: 0 });
  });

  it("zeigt einen Artikel, dessen Fach vor der Eingabe abgelaufen ist — auch wenn die Menge stimmt", () => {
    const d = daten({ verfallFach: { "sp-2": "2026-08" } });
    const z = zustand({ ist: { "sp-1": 3, "sp-2": 2 } });
    expect(ausgleichZeilen(d, z, JETZT)).toMatchObject([{ artikelId: "art-1", abgelaufen: true, fehlmenge: 0 }]);
  });

  it("nimmt den Verfall des Artikels, wo das Fach keinen eigenen hat", () => {
    const d = daten({ verfallArtikel: { "art-3": "2026-10" } });
    const z = zustand({ ist: { "sp-4": 1 } });
    expect(ausgleichZeilen(d, z, JETZT)).toMatchObject([{ artikelId: "art-3", abgelaufen: true }]);
  });

  it("zeigt einen Artikel, dessen eingegebener Verfall abgelaufen ist", () => {
    const z = zustand({ ist: { "sp-4": 1 }, verfall: { "sp-4": "2026-01" } });
    expect(ausgleichZeilen(daten(), z, JETZT)).toMatchObject([{ artikelId: "art-3", abgelaufen: true }]);
  });

  it("bleibt bei einem ungültigen Monat ruhig", () => {
    const z = zustand({ ist: { "sp-4": 1 }, verfall: { "sp-4": "2026-1" } });
    expect(ausgleichZeilen(daten(), z, JETZT)).toEqual([]);
  });

  it("zeigt einen Artikel mit erfasstem Ausgleich, auch ohne Abweichung", () => {
    const z = zustand({
      ist: { "sp-4": 1 },
      ausgleich: { "art-3": { aussondern: { menge: 1 } } },
    });
    expect(ausgleichZeilen(daten(), z, JETZT)).toMatchObject([{ artikelId: "art-3", nachAusgleich: 0 }]);
  });

  it("rechnet „nach dem Ausgleich“ als Ist − Aussondern − Zurücklegen + Auffüllen", () => {
    const z = zustand({
      ist: { "sp-1": 4, "sp-2": 4 },
      ausgleich: {
        "art-1": {
          aussondern: { menge: 2 },
          zuruecklegen: { menge: 1, zielLagerortId: "sch-1", chargeId: "ch-1" },
          auffuellen: { menge: 3, herkunft: { art: "handlager" } },
        },
      },
    });
    expect(ausgleichZeilen(daten(), z, JETZT)[0]!.nachAusgleich).toBe(8 - 2 - 1 + 3);
  });

  it("zählt mitgezählt Aufgefülltes nicht noch einmal dazu", () => {
    const z = zustand({
      ist: { "sp-1": 3, "sp-2": 2 },
      ausgleich: { "art-1": { auffuellen: { menge: 2, herkunft: { art: "handlager" }, mitgezaehlt: true } } },
    });
    expect(ausgleichZeilen(daten(), z, JETZT)[0]!.nachAusgleich).toBe(5);
  });

  it("markiert ein Plus ohne Herkunft — und zeigt die Zeile, damit es eine bekommen kann", () => {
    // Erstbestückung: eingeräumt, dann gezählt, Ist = Soll, das Lagerbuch kennt nichts davon.
    const z = zustand({ ist: { "sp-4": 1 } });
    const d = daten({ buchstand: {} });
    expect(ausgleichZeilen(d, z, JETZT)).toMatchObject([
      { artikelId: "art-3", buchstand: 0, fehlmenge: 0, ueberschuss: 0, plusOhneHerkunft: true },
    ]);
  });

  it("nimmt die Markierung weg, sobald ein Auffüllen die Herkunft nennt", () => {
    const z = zustand({
      ist: { "sp-4": 1 },
      ausgleich: { "art-3": { auffuellen: { menge: 1, herkunft: { art: "handlager" }, mitgezaehlt: true } } },
    });
    expect(ausgleichZeilen(daten({ buchstand: {} }), z, JETZT)[0]!.plusOhneHerkunft).toBe(false);
  });
});

describe("sperrGruende", () => {
  it("sperrt, solange nichts erfasst ist", () => {
    expect(sperrGruende(daten(), leererZustand(), JETZT)).toEqual([
      { art: "leer", text: "Es ist noch nichts erfasst." },
    ]);
  });

  it("zählt einen Kommentar, eine leere Plombennummer oder ein halb beantwortetes Gerät nicht als erfasst", () => {
    const z = zustand({
      kommentar: "Nur ein Gedanke",
      plomben: { "pl-2": "  " },
      geraete: { "g-2": { vorhanden: true, zustand: "In Ordnung" } },   // Selbsttest fehlt
    });
    expect(sperrGruende(daten(), z, JETZT).map((g) => g.art)).toEqual(["leer"]);
  });

  it("lässt einen Abschluss nur mit Sauerstoff zu", () => {
    expect(sperrGruende(daten(), zustand({ druck: { "o-1": 150 } }), JETZT)).toEqual([]);
  });

  it("nennt einen angefangenen Artikel mit den fehlenden Fächern", () => {
    const d = daten({
      positionen: [
        ...daten().positionen,
        { id: "sp-5", fachLabel: "4", artikelId: "art-1", artikelName: "Kompresse", einheit: "Stk", soll: 1, sollMax: null },
      ],
    });
    const z = zustand({ ist: { "sp-1": 3 } });
    expect(sperrGruende(d, z, JETZT)).toEqual([
      { art: "teilartikel", text: "Kompresse: auch in Fach 2, Fach 4 zählen" },
    ]);
  });

  it("sperrt eine neue Plombennummer, solange ihr Fach nicht ganz gezählt ist", () => {
    // Fach 2 trägt Kompresse UND Wärmedecke — nur die Wärmedecke ist gezählt.
    const z = zustand({ ist: { "sp-3": 4 }, plomben: { "pl-2": "12345" } });
    expect(sperrGruende(daten(), z, JETZT)).toEqual([
      { art: "plombe", text: "Plombe „Siegel Fach 2“: erst das ganze Fach 2 zählen." },
    ]);
  });

  it("lässt eine Plombe ohne Fach frei und eine mit ganz gezähltem Fach zu", () => {
    const z = zustand({
      ist: { "sp-1": 3, "sp-2": 2, "sp-3": 4 },
      plomben: { "pl-2": "12345", "pl-frei": "88" },
    });
    expect(sperrGruende(daten(), z, JETZT)).toEqual([]);
  });

  it("sperrt Aussondern, solange in einem Fach des Artikels danach noch ein abgelaufener Verfall steht", () => {
    const d = daten({ verfallFach: { "sp-2": "2026-08" } });
    const z = zustand({
      ist: { "sp-1": 3, "sp-2": 2 },
      ausgleich: { "art-1": { aussondern: { menge: 2 } } },
    });
    expect(sperrGruende(d, z, JETZT)).toEqual([
      { art: "abgelaufen", text: "Kompresse: neuen Verfall eintragen oder leeren" },
    ]);
  });

  it("gibt Aussondern frei, sobald der Verfall nachgetragen oder geleert ist", () => {
    const d = daten({ verfallFach: { "sp-2": "2026-08" } });
    const basis = { ist: { "sp-1": 3, "sp-2": 2 }, ausgleich: { "art-1": { aussondern: { menge: 2 } } } };
    expect(sperrGruende(d, zustand({ ...basis, verfall: { "sp-2": "2028-04" } }), JETZT)).toEqual([]);
    expect(sperrGruende(d, zustand({ ...basis, verfall: { "sp-2": null } }), JETZT)).toEqual([]);
  });

  it("sperrt einen abgelaufenen Verfall ohne Aussondern nicht", () => {
    const d = daten({ verfallFach: { "sp-2": "2026-08" } });
    expect(sperrGruende(d, zustand({ ist: { "sp-1": 3, "sp-2": 2 } }), JETZT)).toEqual([]);
  });

  it("sperrt Aussondern über das Gezählte", () => {
    const z = zustand({ ist: { "sp-1": 1, "sp-2": 1 }, ausgleich: { "art-1": { aussondern: { menge: 3 } } } });
    expect(sperrGruende(daten(), z, JETZT)).toEqual([
      { art: "menge", text: "Kompresse: höchstens 2 aussondern" },
    ]);
  });

  it("sperrt Zurücklegen über das, was nach dem Aussondern bleibt", () => {
    const z = zustand({
      ist: { "sp-1": 4, "sp-2": 4 },
      ausgleich: { "art-1": {
        aussondern: { menge: 3 },
        zuruecklegen: { menge: 6, zielLagerortId: "sch-1", chargeId: "ch-1" },
      } },
    });
    expect(sperrGruende(daten(), z, JETZT)).toEqual([
      { art: "menge", text: "Kompresse: höchstens 5 zurücklegen" },
    ]);
    const passt = zustand({ ...z, ausgleich: { "art-1": { ...z.ausgleich["art-1"], zuruecklegen: {
      menge: 5, zielLagerortId: "sch-1", chargeId: "ch-1",
    } } } });
    expect(sperrGruende(daten(), passt, JETZT)).toEqual([]);
  });

  it("rechnet mitgezählt Aufgefülltes aus dem Ist heraus, bevor ausgesondert wird", () => {
    // Der Server bucht die Korrektur auf Ist − mitgezählt und sondert DANACH aus.
    const z = zustand({
      ist: { "sp-1": 3, "sp-2": 2 },
      ausgleich: { "art-1": {
        aussondern: { menge: 4 },
        zuruecklegen: { menge: 2, zielLagerortId: ENTNAHMEBOX_ID },
        auffuellen: { menge: 2, herkunft: { art: "handlager" }, mitgezaehlt: true },
      } },
    });
    expect(sperrGruende(daten(), z, JETZT)).toEqual([
      { art: "menge", text: "Kompresse: höchstens 3 aussondern" },
    ]);
    const z2 = zustand({ ...z, ausgleich: { "art-1": { ...z.ausgleich["art-1"], aussondern: { menge: 2 } } } });
    expect(sperrGruende(daten(), z2, JETZT)).toEqual([
      { art: "menge", text: "Kompresse: höchstens 1 zurücklegen" },
    ]);
  });

  it("sperrt mitgezählt Aufgefülltes über das Gezählte", () => {
    const z = zustand({
      ist: { "sp-4": 1 },
      ausgleich: { "art-3": { auffuellen: { menge: 2, herkunft: { art: "handlager" }, mitgezaehlt: true } } },
    });
    expect(sperrGruende(daten(), z, JETZT)).toEqual([
      { art: "menge", text: "Pflaster: höchstens 1 mitgezählt auffüllen" },
    ]);
  });

  it("lässt Auffüllen ohne „mitgezählt“ über das Gezählte zu", () => {
    const z = zustand({
      ist: { "sp-4": 0 },
      ausgleich: { "art-3": { auffuellen: { menge: 5, herkunft: { art: "handlager" } } } },
    });
    expect(sperrGruende(daten(), z, JETZT)).toEqual([]);
  });

  it("sperrt einen Druck über dem Nennfülldruck", () => {
    expect(sperrGruende(daten(), zustand({ druck: { "o-1": 230 } }), JETZT)).toEqual([
      { art: "druck", text: "O2 klein: Druck über dem Nennfülldruck — am Manometer nachsehen" },
    ]);
    expect(sperrGruende(daten(), zustand({ druck: { "o-1": 220 } }), JETZT)).toEqual([]);
  });
});

describe("fortschritt", () => {
  it("zählt Positionen, Abweichungen, Geräte und Flaschen", () => {
    const z = zustand({
      // sp-1 unter Soll, sp-2 stimmt, sp-3 im Bereich bis 6, sp-4 darüber.
      ist: { "sp-1": 1, "sp-2": 2, "sp-3": 6, "sp-4": 3 },
      geraete: {
        "g-1": { vorhanden: true, zustand: "Defekt" },
        "g-2": { vorhanden: true, zustand: "In Ordnung" },   // Selbsttest fehlt noch
      },
      druck: { "o-1": 0 },
    });
    expect(fortschritt(daten(), z)).toEqual({
      positionenGezaehlt: 4, positionenGesamt: 4, abweichungen: 2,
      geraeteBeantwortet: 1, geraeteGesamt: 2, flaschenAbgelesen: 1, flaschenGesamt: 1,
    });
  });

  it("zählt ein fehlendes Gerät mit Selbsttest-Frage als beantwortet", () => {
    const z = zustand({ geraete: { "g-2": { vorhanden: false } } });
    expect(fortschritt(daten(), z).geraeteBeantwortet).toBe(1);
  });

  it("zählt Einträge zu fremden Positionen nicht", () => {
    const z = zustand({ ist: { "sp-weg": 3 } });
    expect(fortschritt(daten(), z)).toMatchObject({ positionenGezaehlt: 0, abweichungen: 0 });
  });
});


describe("baueNutzlast", () => {
  it("schickt bei leerem Zustand leere Listen und keinen Kommentar", () => {
    expect(baueNutzlast(daten(), leererZustand(), SENDUNG)).toEqual({
      fahrzeugId: "fz-1", sendungId: SENDUNG,
      positionen: [], verfaelle: [], ausgleich: [], plomben: [], geraete: [], flaschen: [],
    });
  });

  it("schickt nur gezählte Positionen — eine gezählte 0 eingeschlossen", () => {
    const z = zustand({ ist: { "sp-1": 0, "sp-3": 5, "sp-weg": 9 } });
    expect(baueNutzlast(daten(), z, SENDUNG).positionen).toEqual([
      { sollPositionId: "sp-1", ist: 0 },
      { sollPositionId: "sp-3", ist: 5 },
    ]);
  });

  it("schickt den Verfall nur bei Änderung gegenüber Fach, sonst Artikel", () => {
    const d = daten({ verfallFach: { "sp-1": "2027-02" } });
    const z = zustand({
      ist: { "sp-1": 3, "sp-2": 2, "sp-3": 4, "sp-4": 1 },
      verfall: {
        "sp-1": "2027-02",   // wie das Fach → nicht senden
        "sp-2": "2030-01",   // wie der Artikel (Fach ohne eigenen) → nicht senden
        "sp-3": "2031-07",   // geändert
        "sp-4": null,        // geleert
      },
    });
    expect(baueNutzlast(d, z, SENDUNG).verfaelle).toEqual([
      { sollPositionId: "sp-3", verfall: "2031-07" },
      { sollPositionId: "sp-4", verfall: null },
    ]);
  });

  it("schickt den Verfall nur für gezählte Positionen", () => {
    const z = zustand({ ist: { "sp-4": 1 }, verfall: { "sp-3": "2031-07", "sp-4": "2031-08" } });
    expect(baueNutzlast(daten(), z, SENDUNG).verfaelle).toEqual([{ sollPositionId: "sp-4", verfall: "2031-08" }]);
  });

  it("schickt ein Leeren nur, wo vorher ein Verfall stand, und lässt ungültige Monate weg", () => {
    const d = daten({ verfallArtikel: {} });
    const z = zustand({ ist: { "sp-1": 3, "sp-2": 2 }, verfall: { "sp-1": null, "sp-2": "2027-13" } });
    expect(baueNutzlast(d, z, SENDUNG).verfaelle).toEqual([]);
  });

  it("schickt den Ausgleich nur ganz gezählter Artikel und reicht „mitgezählt“ durch", () => {
    const z = zustand({
      ist: { "sp-1": 3, "sp-2": 4, "sp-4": 1 },
      ausgleich: {
        "art-1": {
          aussondern: { menge: 1, grund: "  " },
          zuruecklegen: { menge: 1, zielLagerortId: "sch-1", chargeId: "ch-1" },
          auffuellen: { menge: 2, herkunft: { art: "neu", charge: { art: "neu", verfall: "2031-01" } }, mitgezaehlt: true },
        },
        "art-2": { aussondern: { menge: 1 } },   // Wärmedecke nicht gezählt
        "art-3": {},                             // nichts erfasst
      },
    });
    expect(baueNutzlast(daten(), z, SENDUNG).ausgleich).toEqual([{
      artikelId: "art-1",
      aussondern: { menge: 1 },
      zuruecklegen: { menge: 1, zielLagerortId: "sch-1", chargeId: "ch-1" },
      auffuellen: { menge: 2, herkunft: { art: "neu", charge: { art: "neu", verfall: "2031-01" } }, mitgezaehlt: true },
    }]);
  });

  it("reicht Grund, Box ohne Charge, Herkunft vom Ort und Chargennummer unverändert durch", () => {
    const z = zustand({
      ist: { "sp-1": 3, "sp-2": 2, "sp-4": 1 },
      ausgleich: {
        "art-1": {
          aussondern: { menge: 1, grund: "Verpackung offen" },
          zuruecklegen: { menge: 1, zielLagerortId: ENTNAHMEBOX_ID },
          auffuellen: { menge: 2, herkunft: { art: "ort", vonLagerortId: "fz-2", chargeId: "ch-9" } },
        },
        "art-3": {
          auffuellen: { menge: 1, herkunft: { art: "neu", charge: { art: "neu", chargenNr: "X1", verfall: "2031-01" } }, mitgezaehlt: false },
        },
      },
    });
    expect(baueNutzlast(daten(), z, SENDUNG).ausgleich).toEqual([
      {
        artikelId: "art-1",
        aussondern: { menge: 1, grund: "Verpackung offen" },
        zuruecklegen: { menge: 1, zielLagerortId: ENTNAHMEBOX_ID },
        auffuellen: { menge: 2, herkunft: { art: "ort", vonLagerortId: "fz-2", chargeId: "ch-9" } },
      },
      {
        artikelId: "art-3",
        auffuellen: { menge: 1, herkunft: { art: "neu", charge: { art: "neu", chargenNr: "X1", verfall: "2031-01" } } },
      },
    ]);
  });

  it("schickt nur nicht-leere Plombennummern, getrimmt", () => {
    const z = zustand({ plomben: { "pl-2": " 123 ", "pl-frei": "", "pl-weg": "5" } });
    expect(baueNutzlast(daten(), z, SENDUNG).plomben).toEqual([{ plombeId: "pl-2", nummer: "123" }]);
  });

  it("schickt nur beantwortete Geräte, den Selbsttest nur dort, wo er gefragt ist", () => {
    const z = zustand({
      geraete: {
        "g-1": { vorhanden: true, zustand: "Gebrauchsspuren", bemerkung: "Kratzer", selbsttest: true },
        "g-2": { vorhanden: true, zustand: "In Ordnung" },   // Selbsttest fehlt → nicht beantwortet
      },
    });
    expect(baueNutzlast(daten(), z, SENDUNG).geraete).toEqual([
      { geraetId: "g-1", vorhanden: true, zustand: "Gebrauchsspuren", bemerkung: "Kratzer" },
    ]);
    const z2 = zustand({
      geraete: { "g-1": { vorhanden: false, zustand: "Defekt" }, "g-2": { vorhanden: true, zustand: "Defekt", selbsttest: false } },
    });
    expect(baueNutzlast(daten(), z2, SENDUNG).geraete).toEqual([
      { geraetId: "g-1", vorhanden: false },
      { geraetId: "g-2", vorhanden: true, zustand: "Defekt", selbsttest: false },
    ]);
  });

  it("schickt nur abgelesene Flaschen — 0 bar ist abgelesen", () => {
    const d = daten({ flaschen: [...daten().flaschen, { id: "o-2", name: "O2 groß", nennfuelldruckBar: 300, wechselAbProzent: 25 }] });
    expect(baueNutzlast(d, zustand({ druck: { "o-1": 0 } }), SENDUNG).flaschen).toEqual([{ flascheId: "o-1", druckBar: 0 }]);
  });

  it("schickt den Kommentar getrimmt und nur, wenn etwas drinsteht", () => {
    expect(baueNutzlast(daten(), zustand({ kommentar: "  Fach 2 klemmt " }), SENDUNG).kommentar).toBe("Fach 2 klemmt");
    expect("kommentar" in baueNutzlast(daten(), zustand({ kommentar: "   " }), SENDUNG)).toBe(false);
  });

  it("hat die Form, die der Abschluss annimmt", () => {
    expectTypeOf<VerwaltungscheckNutzlast>().toExtend<VerwaltungscheckEingabe>();
    // Und umgekehrt: jedes Feld, das der Server liest, kennt auch der Typ hier.
    expectTypeOf<keyof VerwaltungscheckEingabe>().toEqualTypeOf<keyof VerwaltungscheckNutzlast>();
  });
});
