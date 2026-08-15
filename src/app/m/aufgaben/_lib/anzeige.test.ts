import { describe, expect, it } from "vitest";
import {
  EREIGNISSE,
  PRIORITAETEN,
  ROLLEN,
  STATUS_WERTE,
  type AufgabeRow,
  type PersonRow,
  type RoutineRow,
} from "../_db/schema";
import { fmtTagKurz } from "./datum";
import {
  ANLASS_ARTEN,
  ANLASS_TEXT,
  EREIGNIS_TEXT,
  FRIST_TEXT,
  PRIORITAET_FORM,
  PRIORITAET_TEXT,
  ROLLE_TEXT,
  STATUS_TEXT,
  STATUS_TON,
  WOCHENTAG_BIT,
  aufgabenInWoche,
  fmtDauer,
  fmtStunden,
  fmtWochentage,
  heuteOffen,
  istUeberfaellig,
  naechsterArbeitstag,
  namenMap,
  ohneAktivenTraeger,
  ohnePlatzInDerAchse,
  routineAmTag,
  tagesBudget,
  vorschlagOffen,
  wartetAufEinplanung,
} from "./anzeige";

const AUFGABE: AufgabeRow = {
  id: "x", titel: "T", beschreibung: "B", prioritaet: "mittel",
  erstellerId: "malte", zugewiesenAn: "alina", status: "verteilt",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "malte",
  istSelbst: false, planDatum: null, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  erstelltAm: new Date(0), aktualisiertAm: new Date(0),
};

const ALINA: PersonRow = {
  id: "alina", sub: "dev:alina@localtest.me", name: "Alina", initialen: "AL",
  rolle: "bufdi", sollMinutenTag: 468, aktivVon: "2026-08-01", aktivBis: null,
  erstelltAm: new Date(0),
};

const routine = (over: Partial<RoutineRow>): RoutineRow => ({
  id: "r", personId: "alina", titel: "R", wochentage: 0b11111,
  uhrzeit: "08:00", dauerMinuten: 45, aktiv: true, erstelltAm: new Date(0),
  ...over,
});

describe("Beschriftungen sind vollstaendig", () => {
  /*
   * ERSCHOEPFEND, NICHT STICHPROBENWEISE: ein fehlender Eintrag ergaebe
   * `undefined` als Beschriftung (im Browser eine leere Stelle) und `undefined`
   * als CSS-Klasse — der Chip bekaeme Polster und Rundung, aber KEINE FARBE.
   */
  it("hat fuer jeden Status Text und Ton", () => {
    for (const s of STATUS_WERTE) {
      expect(STATUS_TEXT[s], `Text ${s}`).toBeTruthy();
      expect(STATUS_TON[s], `Ton ${s}`).toBeTruthy();
    }
  });

  it("hat fuer jede Prioritaet Text und Form", () => {
    for (const p of PRIORITAETEN) {
      expect(PRIORITAET_TEXT[p], `Text ${p}`).toBeTruthy();
      expect(PRIORITAET_FORM[p], `Form ${p}`).toBeTruthy();
    }
  });

  /*
   * `achtung` loest sich in die GETRENNTE Ampel-Rot-Textfarbe auf, nicht in
   * Markenrot — `colorError === colorPrimary === #c8000f`, und ein rotes Chip
   * auf einer Datenflaeche liest sich als Primaeraktion.
   */
  it("gibt genau „zurueckgewiesen“ den Ton achtung", () => {
    expect(STATUS_WERTE.filter((s) => STATUS_TON[s] === "achtung")).toEqual(["zurueckgewiesen"]);
  });

  it("gibt genau „abgeschlossen“ den Ton ok", () => {
    expect(STATUS_WERTE.filter((s) => STATUS_TON[s] === "ok")).toEqual(["abgeschlossen"]);
  });

  /*
   * Die Prioritaetsskala traegt ihre Rangfolge in der FORM, absteigend gefuellt →
   * Kontur → nur Text. Waere „hoch" nicht die einzige gefuellte Stufe, verschwaende
   * die Rangfolge in Graustufen.
   */
  it("gibt genau „hoch“ die gefuellte Form", () => {
    expect(PRIORITAETEN.filter((p) => PRIORITAET_FORM[p] === "gefuellt")).toEqual(["hoch"]);
  });

  it("hat fuer jede Rolle eine Beschriftung (Aufgabe 14)", () => {
    for (const r of ROLLEN) {
      expect(ROLLE_TEXT[r], `Text ${r}`).toBeTruthy();
    }
  });

  /**
   * ERSCHOEPFEND WIE OBEN (Aufgabe 16, Spec §6 `verlauf`): ein fehlendes Ereignis waere im Journal
   * eine leere Zeile — genau die Stelle, an der die Leistungsdokumentation aussagekraeftig sein
   * soll (Spec §6). Jeder der zehn Werte aus `EREIGNISSE` braucht deshalb eine eigene, nicht-leere
   * Beschriftung, und die Zahl der Schluessel muss exakt uebereinstimmen — kein zusaetzlicher, aus
   * einem Tippfehler entstandener Eintrag bleibt sonst unbemerkt stehen.
   */
  it("hat fuer jedes Verlaufs-Ereignis eine eigene Beschriftung (Aufgabe 16)", () => {
    for (const e of EREIGNISSE) {
      expect(EREIGNIS_TEXT[e], `Text ${e}`).toBeTruthy();
    }
    expect(Object.keys(EREIGNIS_TEXT).sort()).toEqual([...EREIGNISSE].sort());
  });

  it("traegt fuer jedes Ereignis eine VERSCHIEDENE Beschriftung — keine zwei Werte mit demselben Text", () => {
    const texte = EREIGNISSE.map((e) => EREIGNIS_TEXT[e]);
    expect(new Set(texte).size).toBe(EREIGNISSE.length);
  });
});

describe("namenMap — Aufgabe 14", () => {
  it("bildet id auf name ab", () => {
    const malte: PersonRow = { ...ALINA, id: "malte", name: "Malte" };
    expect(namenMap([ALINA, malte])).toEqual({ alina: "Alina", malte: "Malte" });
  });

  it("liefert ein leeres Objekt fuer eine leere Liste", () => {
    expect(namenMap([])).toEqual({});
  });
});

describe("vorschlagOffen", () => {
  it("ist wahr, wenn verteilt, ungeplant und ein Vorschlag anhaengt", () => {
    expect(vorschlagOffen({ ...AUFGABE, vorschlagDatum: "2026-08-13" })).toBe(true);
  });

  it("ist falsch ohne Vorschlag", () => {
    expect(vorschlagOffen(AUFGABE)).toBe(false);
  });

  /*
   * DER FALL, DER DIE ABLEITUNG RECHTFERTIGT: die Vorschlagsfelder BLEIBEN nach
   * dem Einplanen stehen (der Verlauf soll belegen koennen, ob angenommen oder
   * abgewichen wurde). Ohne `planDatum === null` stuende „Vorschlag offen" fuer
   * immer an jeder Aufgabe, die je einen hatte.
   */
  it("ist falsch, sobald die Aufgabe eingeplant ist", () => {
    expect(
      vorschlagOffen({ ...AUFGABE, vorschlagDatum: "2026-08-13", planDatum: "2026-08-14" }),
    ).toBe(false);
  });

  it("ist in jedem anderen Zustand als verteilt falsch", () => {
    for (const s of STATUS_WERTE.filter((x) => x !== "verteilt")) {
      expect(vorschlagOffen({ ...AUFGABE, status: s, vorschlagDatum: "2026-08-13" }), s).toBe(false);
    }
  });
});

describe("istUeberfaellig", () => {
  it("zaehlt die Frist, nicht den Zeitplan", () => {
    expect(
      istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-12", planDatum: "2026-08-14" }, "2026-08-13"),
    ).toBe(true);
    expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-14" }, "2026-08-13")).toBe(false);
  });

  it("ist am Fristtag selbst noch nicht ueberfaellig", () => {
    expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-13" }, "2026-08-13")).toBe(false);
  });

  it("ist fuer abgeschlossene Aufgaben nie wahr", () => {
    expect(
      istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-01", status: "abgeschlossen" }, "2026-08-13"),
    ).toBe(false);
  });

  it("ist fuer jeden unerledigten Zustand wahr", () => {
    for (const s of STATUS_WERTE.filter((x) => x !== "abgeschlossen")) {
      expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-01", status: s }, "2026-08-13"), s).toBe(true);
    }
  });
});

describe("wartetAufEinplanung — der Posteingang-Streifen der BuFDi-Woche", () => {
  it("verteilt, ohne planDatum: wahr, auch OHNE Zeitvorschlag", () => {
    expect(
      wartetAufEinplanung({ ...AUFGABE, status: "verteilt", planDatum: null, vorschlagDatum: null }),
    ).toBe(true);
  });

  it("verteilt, ohne planDatum, MIT Zeitvorschlag: ebenfalls wahr — dieselbe Bedingung wie ohne Vorschlag", () => {
    expect(
      wartetAufEinplanung({
        ...AUFGABE,
        status: "verteilt",
        planDatum: null,
        vorschlagDatum: "2026-08-14",
      }),
    ).toBe(true);
  });

  it("sobald planDatum gesetzt ist: falsch, auch wenn der Vorschlag stehen bleibt", () => {
    expect(
      wartetAufEinplanung({
        ...AUFGABE,
        status: "verteilt",
        planDatum: "2026-08-14",
        vorschlagDatum: "2026-08-10",
      }),
    ).toBe(false);
  });

  it("ist fuer jeden anderen Zustand falsch, auch ohne planDatum", () => {
    for (const s of STATUS_WERTE.filter((x) => x !== "verteilt")) {
      expect(wartetAufEinplanung({ ...AUFGABE, status: s, planDatum: null }), s).toBe(false);
    }
  });
});

describe("heuteOffen", () => {
  it("auf heute eingeplant und nicht abgeschlossen: wahr", () => {
    expect(heuteOffen({ ...AUFGABE, planDatum: "2026-08-13", status: "in_arbeit" }, "2026-08-13")).toBe(
      true,
    );
  });

  it("auf einen anderen Tag eingeplant: falsch", () => {
    expect(heuteOffen({ ...AUFGABE, planDatum: "2026-08-14", status: "in_arbeit" }, "2026-08-13")).toBe(
      false,
    );
  });

  it("ohne planDatum: falsch", () => {
    expect(heuteOffen({ ...AUFGABE, planDatum: null, status: "verteilt" }, "2026-08-13")).toBe(false);
  });

  it("auf heute eingeplant, aber abgeschlossen: falsch", () => {
    expect(heuteOffen({ ...AUFGABE, planDatum: "2026-08-13", status: "abgeschlossen" }, "2026-08-13")).toBe(
      false,
    );
  });
});

describe("aufgabenInWoche", () => {
  const TAGE = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"] as const;

  it("zaehlt nur Aufgaben mit planDatum in der uebergebenen Wochenliste", () => {
    const aufgaben = [
      { ...AUFGABE, planDatum: "2026-08-11" },
      { ...AUFGABE, planDatum: "2026-08-24" }, // andere Woche
      { ...AUFGABE, planDatum: null },
    ];
    expect(aufgabenInWoche(aufgaben, TAGE)).toBe(1);
  });

  it("zaehlt UNABHAENGIG vom Status — dieselbe Zusage wie tagesOrdnung/tagesBudget", () => {
    const aufgaben = [
      { ...AUFGABE, planDatum: "2026-08-10", status: "abgeschlossen" as const },
      { ...AUFGABE, planDatum: "2026-08-14", status: "zurueckgewiesen" as const },
    ];
    expect(aufgabenInWoche(aufgaben, TAGE)).toBe(2);
  });

  it("leere Liste: 0", () => {
    expect(aufgabenInWoche([], TAGE)).toBe(0);
  });
});

describe("routineAmTag", () => {
  it("liest die Bitmaske", () => {
    // Mo, Mi, Fr = Bits 0, 2, 4
    const r = routine({ wochentage: 0b10101 });
    expect(routineAmTag(r, 0)).toBe(true);
    expect(routineAmTag(r, 1)).toBe(false);
    expect(routineAmTag(r, 2)).toBe(true);
    expect(routineAmTag(r, 4)).toBe(true);
  });

  it("gilt nie, wenn die Routine ruht", () => {
    expect(routineAmTag(routine({ wochentage: 0b11111, aktiv: false }), 0)).toBe(false);
  });

  it("bildet die fuenf Wochentage auf Bits ab", () => {
    expect([...WOCHENTAG_BIT]).toEqual([1, 2, 4, 8, 16]);
  });

  /*
   * Ein Index ausserhalb Mo–Fr darf nicht still `true` ergeben. Ohne die
   * Undefined-Pruefung waere `r.wochentage & undefined` = 0 — hier zufaellig
   * richtig, aber `NaN`-Arithmetik ist keine Zusicherung.
   */
  it("gilt an einem Index ausserhalb der Woche nicht", () => {
    expect(routineAmTag(routine({ wochentage: 0b11111 }), 5)).toBe(false);
  });
});

describe("fmtWochentage", () => {
  /*
   * DIE BITMASKE GEHT IN BEIDE RICHTUNGEN RICHTIG (Brief) — GENAU DIE STELLE, AN DER EIN OFF-BY-ONE
   * STILL FALSCH WAERE: eine Routine erschiene dann am falschen Tag im Wochenplan, und niemand saehe
   * es auszer der betroffenen Person. Diese Tests pruefen jedes Bit EINZELN gegen seinen erwarteten
   * Wochentag, nicht nur eine Gesamtmaske gegen eine Gesamtzeichenkette — sonst koennten sich zwei
   * vertauschte Bits gegenseitig aufheben und der Test bliebe gruen.
   */
  it("liest Bit 0 als Montag", () => {
    expect(fmtWochentage(0b00001)).toBe("Mo");
  });

  it("liest Bit 1 als Dienstag", () => {
    expect(fmtWochentage(0b00010)).toBe("Di");
  });

  it("liest Bit 2 als Mittwoch", () => {
    expect(fmtWochentage(0b00100)).toBe("Mi");
  });

  it("liest Bit 3 als Donnerstag", () => {
    expect(fmtWochentage(0b01000)).toBe("Do");
  });

  it("liest Bit 4 als Freitag", () => {
    expect(fmtWochentage(0b10000)).toBe("Fr");
  });

  it("reiht mehrere Tage aufsteigend, nicht in Setzreihenfolge", () => {
    expect(fmtWochentage(0b10101)).toBe("Mo, Mi, Fr");
  });

  it("nennt alle fuenf Tage bei voller Maske", () => {
    expect(fmtWochentage(0b11111)).toBe("Mo, Di, Mi, Do, Fr");
  });

  it("ergibt einen leeren Text ohne gesetztes Bit", () => {
    expect(fmtWochentage(0)).toBe("");
  });
});

describe("tagesBudget", () => {
  const MO = "2026-08-10";

  it("summiert eingeplante Aufgaben des Tages", () => {
    const b = tagesBudget(
      [
        { ...AUFGABE, id: "a", planDatum: MO, dauerMinuten: 120 },
        { ...AUFGABE, id: "b", planDatum: MO, dauerMinuten: 60 },
      ],
      [], ALINA, MO,
    );
    expect(b.verplantMinuten).toBe(180);
    expect(b.sollMinuten).toBe(468);
    expect(b.ueberbucht).toBe(false);
  });

  it("zaehlt Aufgaben anderer Tage und anderer Personen nicht mit", () => {
    const b = tagesBudget(
      [
        { ...AUFGABE, id: "a", planDatum: MO, dauerMinuten: 120 },
        { ...AUFGABE, id: "b", planDatum: "2026-08-11", dauerMinuten: 999 },
        { ...AUFGABE, id: "c", planDatum: MO, zugewiesenAn: "bendix", dauerMinuten: 999 },
        { ...AUFGABE, id: "d", planDatum: null, dauerMinuten: 999 },
      ],
      [], ALINA, MO,
    );
    expect(b.verplantMinuten).toBe(120);
  });

  /*
   * ROUTINEN BELEGEN BUDGET, ERZEUGEN ABER KEINE AUFGABEN. Genau deshalb muessen
   * sie HIER mitgerechnet werden — sonst zeigte der Tag Luft, die es nicht gibt,
   * und der Zeitvorschlag der Koordination liefe genau dorthin.
   */
  it("rechnet aktive Routinen des Wochentags mit ein", () => {
    const b = tagesBudget(
      [{ ...AUFGABE, planDatum: MO, dauerMinuten: 60 }],
      [
        routine({ id: "r1", wochentage: 0b00001, dauerMinuten: 45 }),
        routine({ id: "r2", wochentage: 0b00001, dauerMinuten: 300, aktiv: false }),
        routine({ id: "r3", wochentage: 0b00010, dauerMinuten: 300 }),
        routine({ id: "r4", wochentage: 0b00001, dauerMinuten: 300, personId: "bendix" }),
      ],
      ALINA, MO,
    );
    expect(b.verplantMinuten).toBe(105);
  });

  it("meldet Ueberbuchung erst oberhalb des Solls", () => {
    expect(tagesBudget([{ ...AUFGABE, planDatum: MO, dauerMinuten: 468 }], [], ALINA, MO).ueberbucht).toBe(false);
    expect(tagesBudget([{ ...AUFGABE, planDatum: MO, dauerMinuten: 469 }], [], ALINA, MO).ueberbucht).toBe(true);
  });

  it("nimmt am Wochenende die Aufgaben, aber keine Routinen", () => {
    const b = tagesBudget(
      [{ ...AUFGABE, planDatum: "2026-08-15", dauerMinuten: 60 }],
      [routine({ wochentage: 0b11111, dauerMinuten: 60 })],
      ALINA, "2026-08-15",
    );
    expect(b.verplantMinuten).toBe(60);
  });
});

describe("Formatierung", () => {
  it("schreibt Dauern unter einer Stunde in Minuten", () => {
    expect(fmtDauer(45)).toBe("45 Min.");
  });

  it("schreibt ganze Stunden ohne Komma", () => {
    expect(fmtDauer(60)).toBe("1 Std.");
    expect(fmtDauer(120)).toBe("2 Std.");
  });

  it("schreibt Bruchteile mit deutschem Komma", () => {
    expect(fmtDauer(90)).toBe("1,5 Std.");
    expect(fmtDauer(105)).toBe("1,75 Std.");
  });

  it("schreibt Stundenzahlen ohne Nullen am Ende", () => {
    expect(fmtStunden(468)).toBe("7,8");
    expect(fmtStunden(120)).toBe("2");
    expect(fmtStunden(165)).toBe("2,75");
    expect(fmtStunden(0)).toBe("0");
  });

  /** Runde Zehnerwerte verlieren den gesamten Nachkommaanteil samt Komma, nicht nur Nullen. */
  it("schreibt runde Zehnerwerte ohne Komma", () => {
    expect(fmtStunden(600)).toBe("10");
  });

  /** Eine halbe Stunde behaelt genau eine Nachkommastelle. */
  it("schreibt eine halbe Stunde als 0,5", () => {
    expect(fmtStunden(30)).toBe("0,5");
  });
});

/*
 * DIE DREI NEUEN PRAEDIKATE (Oberflaechen-Spec 2026-08-16 §4.5) — rein, mit `heute`/`tage`/
 * `aktiveIds` als Argument, nie mit `new Date()` oder einem `db`-Zugriff.
 */
describe("ohneAktivenTraeger", () => {
  const AKTIV = new Set(["alina"]);

  /*
   * DER TOEDLICHSTE FALL DES SKEPTIKERS (§9/S1): eine Person faellt aus, ihre offenen Aufgaben
   * stehen in keinem Posteingang (`verteilt`/`in_arbeit` sind nicht `eingegangen`) und
   * verschwinden mit ihrer Spalte aus jeder Achse — auffindbar nur ueber `/a/<id>`, das man erst
   * kennen muss. Genau die drei Zustaende sind deshalb erschoepfend aufgezaehlt.
   */
  it.each(["verteilt", "in_arbeit", "freigabe_offen"] as const)(
    "ist wahr fuer Status %s bei einer nicht mehr aktiven Person",
    (status) => {
      expect(ohneAktivenTraeger({ ...AUFGABE, status, zugewiesenAn: "doerte" }, AKTIV)).toBe(true);
    },
  );

  it("ist falsch, solange die Person in der aktiven Menge steht", () => {
    expect(ohneAktivenTraeger({ ...AUFGABE, status: "verteilt", zugewiesenAn: "alina" }, AKTIV)).toBe(
      false,
    );
  });

  /*
   * `abgeschlossen` SCHLIESST AUS — und das ist der Grund, aus dem der Fall im lokalen Seed
   * NICHT vorkommt (§4.5): Doertes einzige Aufgabe ist abgeschlossen. Eine abgeschlossene Aufgabe
   * bei einer ausgeschiedenen Person ist kein Anlass, sondern der Normalfall eines Abschieds.
   */
  it("ist falsch fuer eine abgeschlossene Aufgabe — auch bei ausgeschiedener Person", () => {
    expect(
      ohneAktivenTraeger({ ...AUFGABE, status: "abgeschlossen", zugewiesenAn: "doerte" }, AKTIV),
    ).toBe(false);
  });

  it("ist falsch fuer `eingegangen` — der Posteingang hat gar keinen Traeger", () => {
    expect(
      ohneAktivenTraeger({ ...AUFGABE, status: "eingegangen", zugewiesenAn: null }, AKTIV),
    ).toBe(false);
  });

  it("ist falsch fuer `zurueckgewiesen` — das ist eine eigene Sprosse (Rang 6)", () => {
    expect(
      ohneAktivenTraeger({ ...AUFGABE, status: "zurueckgewiesen", zugewiesenAn: "doerte" }, AKTIV),
    ).toBe(false);
  });
});

describe("ohnePlatzInDerAchse", () => {
  const TAGE = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"];

  it("ist wahr fuer ein `planDatum` ausserhalb der fuenf Tage", () => {
    expect(
      ohnePlatzInDerAchse({ ...AUFGABE, status: "in_arbeit", planDatum: "2026-08-14" }, TAGE),
    ).toBe(true);
  });

  it("ist falsch fuer ein `planDatum` innerhalb der fuenf Tage", () => {
    expect(
      ohnePlatzInDerAchse({ ...AUFGABE, status: "in_arbeit", planDatum: "2026-08-19" }, TAGE),
    ).toBe(false);
  });

  /*
   * DER ZWEITE ZWEIG IST DER GRUND FUER DEN NAMEN (§4.5, §12.4): eine Zeile OHNE jeden Termin
   * liegt nicht „ausserhalb der Woche" — sie hat gar keine Woche. Ohne diesen Zweig haette die
   * BuFDi-Flaeche ein Loch, weil `in_arbeit` (Rang 3) nach §3.4 als „steht schon in der Achse"
   * von einer eigenen Zone ausgenommen ist.
   */
  it.each(["in_arbeit", "freigabe_offen"] as const)(
    "ist wahr fuer Status %s ganz ohne planDatum",
    (status) => {
      expect(ohnePlatzInDerAchse({ ...AUFGABE, status, planDatum: null }, TAGE)).toBe(true);
    },
  );

  /*
   * `verteilt` OHNE planDatum STEHT BEWUSST NICHT DARIN: das ist `wartetAufEinplanung` und damit
   * ein eigener Anlass (Rang 6). Stuende es hier, zaehlte dieselbe Zeile zweimal — einmal in der
   * Zone „Einzuplanen", einmal in der Fusszeile der Achse.
   */
  it("ist falsch fuer `verteilt` ohne planDatum — das ist `wartetAufEinplanung`", () => {
    expect(ohnePlatzInDerAchse({ ...AUFGABE, status: "verteilt", planDatum: null }, TAGE)).toBe(
      false,
    );
  });

  it("ist falsch fuer eine abgeschlossene Aufgabe, auch ausserhalb der Woche", () => {
    expect(
      ohnePlatzInDerAchse({ ...AUFGABE, status: "abgeschlossen", planDatum: "2026-08-14" }, TAGE),
    ).toBe(false);
  });
});

describe("naechsterArbeitstag", () => {
  it("vom Freitag auf den Montag", () => {
    expect(naechsterArbeitstag("2026-08-21")).toBe("2026-08-24");
  });

  it("vom Samstag auf den Montag", () => {
    expect(naechsterArbeitstag("2026-08-22")).toBe("2026-08-24");
  });

  /** Der Sonntagsfall aus §5.4, nachgerechnet: `naechsterArbeitstag(23.08.)` ist Mo 24.08. */
  it("vom Sonntag auf den Montag (Spec §5.4)", () => {
    expect(naechsterArbeitstag("2026-08-23")).toBe("2026-08-24");
  });

  it("vom Montag auf den Dienstag — es ist der NAECHSTE, nie der heutige", () => {
    expect(naechsterArbeitstag("2026-08-17")).toBe("2026-08-18");
  });
});

describe("FRIST_TEXT — die eine Wortquelle fuer Dringlichkeit (§6.2, §6.6)", () => {
  it("schreibt „Ueberfaellig“ mit der Zahl, nie nackt", () => {
    expect(FRIST_TEXT.ueberfaellig(3)).toBe("Überfällig seit 3 Tagen");
  });

  /** Die Singulargrenze: EIN Tag ist „Tag", nicht „Tagen". */
  it("beugt bei genau einem Tag in den Singular", () => {
    expect(FRIST_TEXT.ueberfaellig(1)).toBe("Überfällig seit 1 Tag");
  });

  it("kennt die heutige Frist als eigenen Satz", () => {
    expect(FRIST_TEXT.heute).toBe("Frist heute");
  });

  it("setzt das Datum in der Kurzform, nie in ISO", () => {
    expect(FRIST_TEXT.frist(fmtTagKurz("2026-08-20"))).toBe("Frist: Do, 20.08.");
  });
});

describe("ANLASS_TEXT — jeder AnlassArt ein Schluessel (§3.5)", () => {
  /*
   * ERSCHOEPFEND UEBER DIE UNION, nicht stichprobenweise: ein fehlender Schluessel ergaebe
   * `undefined` als Kicker und als Zonenueberschrift — im Browser eine leere Stelle, und kein Test,
   * der nur eine Auswahl prueft, saehe es. `ANLASS_ARTEN` ist die Laufzeitliste zur Union; weicht
   * sie ab, faellt `Record<AnlassArt, …>` bereits im Typcheck.
   */
  it("hat fuer jede Art einen Eintrag", () => {
    for (const art of ANLASS_ARTEN) {
      expect(ANLASS_TEXT[art], `kein Eintrag fuer "${art}"`).toBeDefined();
    }
    expect(Object.keys(ANLASS_TEXT).sort()).toEqual([...ANLASS_ARTEN].sort());
  });

  it("traegt genau bei den drei Negativsaetzen keinen Kicker — sie sind nie die Karte", () => {
    const ohneKicker = ANLASS_ARTEN.filter((art) => ANLASS_TEXT[art].kicker === null);
    expect(ohneKicker.sort()).toEqual(["auftragNegativ", "bufdiNegativ", "koordNegativ"]);
  });

  /** §3.5, durchgerechnetes Beispiel: `koordFreigabeOffen` traegt alle vier Angaben. */
  it("belegt `koordFreigabeOffen` wie §3.5 es ausschreibt", () => {
    const eintrag = ANLASS_TEXT.koordFreigabeOffen;
    expect(eintrag.kicker?.(null)).toBe("WARTET AUF FREIGABE");
    expect(eintrag.zone?.(2)).toBe("Freigabe offen (2)");
    expect(eintrag.zonenId).toBe("freigabe");
    expect(eintrag.deckelziel?.("alina")).toBe("/freigaben");
  });

  it("setzt den Pruefernamen in den Kicker von `bufdiZurueckgewiesen`", () => {
    expect(ANLASS_TEXT.bufdiZurueckgewiesen.kicker?.("Malte")).toBe("ZURÜCKGEWIESEN VON MALTE");
  });

  it("baut das Deckelziel der BuFDi-Einplanzone aus der eigenen Person", () => {
    expect(ANLASS_TEXT.bufdiWartetAufEinplanung.deckelziel?.("alina")).toBe("/plan/alina");
  });

  /*
   * DIE ZONEN OHNE SAMMELZIEL BLEIBEN UNGEDECKELT (Regel D, §3.4/§9-S1) — ein Deckel ohne Ausgang
   * machte ab der sechsten Zeile Aufgaben nur noch ueber `/a/<id>` erreichbar, also genau den
   * Defekt, den S1 schliesst. Die Liste ist erschoepfend statt beispielhaft, damit ein spaeter
   * ergaenztes Ziel hier auffaellt.
   */
  it("laesst genau die zielfreien Zonen ohne Deckelziel", () => {
    const mitZoneOhneZiel = ANLASS_ARTEN.filter(
      (art) => ANLASS_TEXT[art].zone !== null && ANLASS_TEXT[art].deckelziel === null,
    );
    expect(mitZoneOhneZiel.sort()).toEqual(
      [
        "bufdiUeberfaellig",
        "bufdiZurueckgewiesen",
        "koordOhneTraeger",
        "koordUeberfaelligInArbeit",
        "koordUeberfaelligVerteilt",
        "koordZurueckgewiesen",
      ].sort(),
    );
  });

  /*
   * ZWEI BENACHBARTE SPROSSEN, ZWEI VERSCHIEDENE UEBERSCHRIFTEN (§3.5, erste Anmerkung): Rang 2/3
   * und 5a/5b koennen GLEICHZEITIG Zonen sein, und zwei Zonen mit derselben Ueberschrift auf einer
   * Seite waeren ein Anzeigefehler, den kein Riegel faende. Der Test ist die Gegenprobe dazu.
   */
  it.each(["koord", "bufdi", "auftrag"] as const)(
    "gibt innerhalb der %s-Leiter keinen zwei Anlaessen dieselbe Zonenueberschrift",
    (leiter) => {
      const ueberschriften = ANLASS_ARTEN.filter((art) => art.startsWith(leiter))
        .map((art) => ANLASS_TEXT[art].zone?.(1))
        .filter((t): t is string => t !== undefined && t !== null);
      expect(new Set(ueberschriften).size).toBe(ueberschriften.length);
    },
  );

  /*
   * JE LEITER, NICHT MODULWEIT — und das ist eine Feststellung, keine Abschwaechung: „Zurückgewiesen
   * (N)" traegt sowohl `koordZurueckgewiesen` als auch `bufdiZurueckgewiesen`, aber die beiden
   * Leitern rendern nie auf derselben Seite (`page.tsx` verzweigt ueber genau eine Rolle). Der
   * Fehler, den §3.5 fuerchtet, sind ZWEI ZONEN AUF EINER SEITE mit gleicher Ueberschrift — und der
   * kann nur innerhalb einer Leiter entstehen.
   */
  it("belegt die Gegenprobe: die beiden Zurueckgewiesen-Zonen sind wortgleich, aber aus zwei Leitern", () => {
    expect(ANLASS_TEXT.koordZurueckgewiesen.zone?.(1)).toBe(ANLASS_TEXT.bufdiZurueckgewiesen.zone?.(1));
  });

  it("traegt die sechs festen Saetze aus §4.2 und keinen erfundenen siebten", () => {
    const mitSatz = ANLASS_ARTEN.filter((art) => ANLASS_TEXT[art].satz !== null);
    expect(mitSatz.sort()).toEqual(
      [
        "auftragNegativ",
        "auftragRuhe",
        "bufdiNegativ",
        "bufdiRuhe",
        "koordNegativ",
        "koordRuhe",
      ].sort(),
    );
    expect(ANLASS_TEXT.koordNegativ.satz).toBe("Sonst liegt nichts an.");
    expect(ANLASS_TEXT.bufdiNegativ.satz).toBe("Sonst ist für heute nichts offen.");
    expect(ANLASS_TEXT.auftragNegativ.satz).toBe("Nichts wartet auf deine Freigabe.");
  });
});
