import { describe, it, expect } from "vitest";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import {
  baue,
  dekodiereSpec,
  erlaubteWerte,
  felddifferenz,
  hinweiseZu,
  kodiereSpec,
  ohneTexte,
  reduceSpec,
  setzeBeschriftung,
  ziehePruefaufgabe,
} from "./zustand";

const grund = (zusatz: Partial<SymbolSpec> = {}) => ({ kind: "formation", ...zusatz }) as SymbolSpec;

describe("reduceSpec", () => {
  /*
   * Leerer Text, leere Liste und `undefined` heissen „nicht gesetzt". Ein
   * `designation: ""` waere eine LEERE Beschriftung statt gar keiner, ein
   * `bodyMarks: []` eine leere Markenliste statt keiner — beides sagt etwas
   * anderes aus als das Weglassen und ergaebe eine Spec, die so in keinem Rezept
   * steht. `kanon.ts` normalisiert genau das nicht, es MUSS hier passieren.
   */
  it("entfernt ein Feld bei leerem Wert", () => {
    const mit = reduceSpec(grund(), { feld: "designation", wert: "RTW" });
    expect(mit.designation).toBe("RTW");
    expect("designation" in reduceSpec(mit, { feld: "designation", wert: "" })).toBe(false);
    expect("bodyMarks" in reduceSpec(mit, { feld: "bodyMarks", wert: [] })).toBe(false);
  });
});

describe("setzeBeschriftung", () => {
  it("setzt eine Zone und raeumt das leere labels-Objekt weg", () => {
    const mit = setzeBeschriftung(grund(), "center", "SEG");
    expect(mit.labels?.center).toBe("SEG");
    expect("labels" in setzeBeschriftung(mit, "center", "")).toBe(false);
  });

  /*
   * DIE ELF METRIKFELDER WERDEN DURCHGEREICHT (Spec §6.1). Sie sind
   * Quellenvermessungen, kein Nutzerregler — wer eine Rezept-Spec bearbeitet und
   * eine Zone leert, darf ihre Vermessung nicht verlieren, sonst aendert sich das
   * Bild an einer Stelle, die er nie angefasst hat.
   */
  it("laesst die Metrikfelder unberuehrt", () => {
    const mit = { ...grund(), labels: { center: "A", centerBoxMarginMm: 1.5 } } as SymbolSpec;
    const ohne = setzeBeschriftung(mit, "center", "");
    expect(ohne.labels?.centerBoxMarginMm).toBe(1.5);
  });
});

describe("baue", () => {
  it("liefert SVG und Bedeutung fuer eine tragende Zusammenstellung", () => {
    const e = baue(grund({ organization: "hilfsorganisation" }), 96, "tz-test");
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.svg).toMatch(/^<svg/);
      expect(e.svg).toContain("tz-test");
      expect(e.bedeutung).not.toMatch(/undefined/);
    }
  });

  /*
   * M10: `instanceof` genuegt. Die Wortlautpruefung /vermessen|nicht belegt/ aus
   * dem Referenz-Builder ist gegen 1.0.2 geschrieben und in 1.1.0 ueberfluessig.
   */
  it("macht aus einem Regelverstoss `regel` mit issues", () => {
    const e = baue(grund({ kind: "building", strength: "zug" } as never), 96, "tz-test");
    expect(e.ok).toBe(false);
    if (!e.ok && e.art === "regel") {
      expect(e.verstoesse.map((v) => v.rule)).toContain("strength-requires-unit");
    } else {
      throw new Error("erwartet wurde ein Regelverstoss");
    }
  });

  it("macht aus einer Vermessungsluecke `unvermessen` mit Bereich", () => {
    const e = baue(
      { kind: "vehicle-land", vehicleCategory: "amphibienfahrzeug" } as SymbolSpec,
      96,
      "tz-test",
    );
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.art).toBe("unvermessen");
    if (!e.ok && e.art === "unvermessen") expect(e.bereich).toBe("value");
  });

  /*
   * EIN NACKTES Error IST EIN PROGRAMMFEHLER UND FLIEGT WEITER. Wuerde es hier
   * gefangen, gaebe die Wertesperrung fuer jeden Kandidaten in jedem Feld „nicht
   * vermessen" aus und behauptete eine Datenluecke, die es nicht gibt.
   */
  it("wirft ein nacktes Error weiter", () => {
    expect(() => baue({ kind: "quatsch" } as never, 96, "tz-test")).toThrow(/quatsch/);
  });
});

describe("erlaubteWerte", () => {
  it("sperrt einen nirgends vermessenen Wert als `wert`", () => {
    const befunde = erlaubteWerte({ kind: "vehicle-land" } as SymbolSpec, "vehicleCategory", [
      "kfz-kategorie-1",
      "amphibienfahrzeug",
    ]);
    expect(befunde.find((b) => b.wert === "kfz-kategorie-1")?.frei).toBe(true);
    const amphi = befunde.find((b) => b.wert === "amphibienfahrzeug");
    expect(amphi?.frei).toBe(false);
    expect(amphi?.sperre).toBe("wert");
  });

  it("sperrt eine nicht tragende Kombination als `kombination` mit Grund", () => {
    const befunde = erlaubteWerte({ kind: "building" } as SymbolSpec, "strength", ["trupp"]);
    expect(befunde[0].frei).toBe(false);
    expect(befunde[0].sperre).toBe("kombination");
    expect(befunde[0].grund).toContain("Einheiten");
  });

  /*
   * DER GERADE GESETZTE WERT WIRD NIE GESPERRT. Ihn zu sperren hiesse, die eigene
   * Auswahl unbedienbar zu machen, sobald die Spec aus einem ANDEREN Grund nicht
   * traegt — und ein gesperrter Eintrag, der zugleich der ausgewaehlte ist, wird
   * von Browsern verschieden dargestellt. Verloren geht nichts: warum die Spec
   * nicht traegt, steht vollstaendig unter der Vorschau.
   */
  it("sperrt den gerade gesetzten Wert nie", () => {
    const spec = { kind: "building", strength: "trupp" } as SymbolSpec;
    expect(erlaubteWerte(spec, "strength", ["trupp"])[0].frei).toBe(true);
  });

  /*
   * ⛔ DIE FALLE, DIE SONST NIEMAND SIEHT: eine zu lange Beschriftung laesst JEDEN
   * Probelauf mit `label-too-wide` scheitern — jede Achse waere gesperrt, und die
   * Oberflaeche behauptete, gar nichts passe mehr zusammen. Deshalb probt die
   * Sperrung gegen `ohneTexte(spec)`; der Textverstoss erscheint am Textfeld.
   */
  it("laesst eine zu lange Beschriftung keine andere Achse sperren", () => {
    const zuLang = setzeBeschriftung(
      grund({ organization: "hilfsorganisation" }),
      "center",
      "VIEL ZU LANGER TEXT HIER",
    );
    const befunde = erlaubteWerte(ohneTexte(zuLang), "strength", ["gruppe"]);
    expect(befunde[0].frei).toBe(true);
  });
});

describe("URL-Zustand", () => {
  /*
   * base64url UEBER UTF-8: `btoa` nimmt nur Latin-1, und `designation` traegt
   * Umlaute. Ohne den Umweg ueber `TextEncoder` wirft `btoa` bei „Lösch" ein
   * InvalidCharacterError — und zwar erst beim Teilen, nicht beim Bauen.
   */
  it("traegt Umlaute durch die Adresszeile", () => {
    const spec = grund({ designation: "Löschzug Süd" });
    expect(dekodiereSpec(kodiereSpec(spec))).toEqual(spec);
  });

  it("kodiert ohne Fuellzeichen und ohne + oder /", () => {
    expect(kodiereSpec(grund({ designation: "ÄÖÜ~~~" }))).not.toMatch(/[+/=]/);
  });

  /*
   * DIESELBE ZEICHENKETTE WIE AUF DEM SERVER. `(shell)/meine/page.tsx` baut den
   * Link mit `Buffer.from(json).toString("base64url")` — der Browser kennt kein
   * `Buffer`, der Server kein `btoa` mit UTF-8. Zwei Wege, ein Ergebnis: dieser
   * Test ist die einzige Stelle, an der beide nebeneinander laufen.
   */
  it("stimmt mit der Server-Kodierung ueberein", () => {
    const spec = grund({ designation: "Löschzug Süd" });
    const serverseitig = Buffer.from(JSON.stringify(spec), "utf8").toString("base64url");
    expect(kodiereSpec(spec)).toBe(serverseitig);
  });

  /*
   * UNLESBAR HEISST `null`, NICHT WURF. Der Referenz-Builder wirft dort mit
   * Klartext — richtig fuer ein Entwicklerwerkzeug. Hier kommt der Parameter aus
   * einem geteilten Link, und eine leere Seite an der Einsatzstelle ist der
   * schlechteste Ausgang. Die Insel faengt `null` ab und beginnt leer.
   */
  it("gibt bei Unsinn null zurueck, statt zu werfen", () => {
    expect(dekodiereSpec("%%%kein-base64%%%")).toBeNull();
    expect(dekodiereSpec(kodiereSpec({ ohneKind: true } as never))).toBeNull();
  });
});

describe("Bauuebung", () => {
  const pool = [
    {
      id: "rezept:A.1",
      titel: "Erstes",
      bedeutung: "Bedeutung eins",
      specKanon: "k1",
      spec: grund(),
      svg: "<svg/>",
    },
    {
      id: "rezept:A.2",
      titel: "Zweites",
      bedeutung: "Bedeutung zwei",
      specKanon: "k2",
      spec: grund({ organization: "feuerwehr" }),
      svg: "<svg/>",
    },
  ];

  /** Der Wuerfel kommt als Parameter herein — sonst ist eine Uebung nicht pruefbar. */
  it("zieht deterministisch, wenn der Wuerfel es ist", () => {
    expect(ziehePruefaufgabe(pool, () => 0)?.id).toBe("rezept:A.1");
    expect(ziehePruefaufgabe(pool, () => 0.99)?.id).toBe("rezept:A.2");
    expect(ziehePruefaufgabe([], () => 0)).toBeNull();
  });

  /*
   * KORREKTUR 7 DES AUFTRAGS (Spec §6.5): die Uebung zieht aus den 232 ODER aus
   * dem zuletzt auf `/lernen` gewaehlten Lernset. Aufgabe 8 liefert `idsAusSet`
   * und den `?set=`-Parameter; die Einschraenkung steht deshalb schon hier und
   * bleibt bis dahin `undefined` — nachgezogen wird die Verdrahtung, nicht die
   * Bauform.
   *
   * Eine LEERE Einschraenkung ist ausdruecklich kein „alles": ein Lernset ohne
   * Zeichen hat keine Aufgabe, und eine stattdessen gezogene beliebige waere die
   * falsche Auskunft.
   */
  it("zieht nur aus einer gegebenen ID-Liste", () => {
    expect(ziehePruefaufgabe(pool, () => 0, ["rezept:A.2"])?.id).toBe("rezept:A.2");
    expect(ziehePruefaufgabe(pool, () => 0, [])).toBeNull();
    expect(ziehePruefaufgabe(pool, () => 0, undefined)?.id).toBe("rezept:A.1");
  });

  const benenne = (_feld: string, wert: string) => `„${wert}“`;

  it("nennt Uebereinstimmung, wenn der kanonische Schluessel gleich ist", () => {
    const urteil = felddifferenz(
      grund({ organization: "feuerwehr" }),
      grund({ organization: "feuerwehr" }),
      benenne,
    );
    expect(urteil.gleich).toBe(true);
  });

  /*
   * BEWERTET WIRD UEBER DEN KANONISCHEN SCHLUESSEL, nicht ueber das Bild und nicht
   * ueber `matchFingerprint` (M15: eine Spec mit FALSCHER Organisation und ganz
   * fehlender Faehigkeit besteht dort mit {"ok":true,"problems":[]}). Ein
   * SVG-Vergleich waere ebenso falsch — er wertete eine sachlich richtige Antwort
   * mit anderer capabilities-Reihenfolge als falsch, weil die Reihenfolge die
   * z-Ordnung aendert.
   */
  it("nennt die Felddifferenz statt nur `falsch`", () => {
    const urteil = felddifferenz(
      grund({ organization: "feuerwehr" }),
      grund({ organization: "feuerwehr", capabilities: ["fire-fighting"] } as never),
      benenne,
    );
    expect(urteil.gleich).toBe(false);
    expect(urteil.satz).toContain("fire-fighting");
    expect(urteil.satz).toMatch(/fehlt/i);
  });

  it("nennt einen abweichenden Wert mit beiden Seiten", () => {
    const urteil = felddifferenz(
      grund({ organization: "thw" }),
      grund({ organization: "feuerwehr" }),
      benenne,
    );
    expect(urteil.satz).toContain("thw");
    expect(urteil.satz).toContain("feuerwehr");
  });
});

describe("hinweise", () => {
  /*
   * KORREKTUR 4 UND 5 DES AUFTRAGS (Spec §6.3): jeder Regelverstoss haengt an der
   * Achse, an der er entsteht, und traegt die originale Paketmeldung mit — der
   * eigene Satz erklaert, die Paketmeldung belegt.
   */
  it("ordnet jeden Verstoss seiner Achse zu und behaelt die Paketmeldung", () => {
    const ergebnis = baue(
      grund({ organization: "thw", designation: "LANGERTEXTHIERUNTEN" }),
      96,
      "tz-test",
    );
    expect(ergebnis.ok).toBe(false);
    const karte = hinweiseZu(ergebnis);
    expect([...karte.keys()]).toEqual(["fussstreifen"]);
    const [hinweis] = karte.get("fussstreifen") ?? [];
    expect(hinweis.titel).toMatch(/zu breit/);
    expect(hinweis.meldung).toContain("LANGERTEXTHIERUNTEN");
  });

  /*
   * Eine Vermessungsluecke hat KEINE Regel-ID — sie kann also keiner Achse
   * zugeordnet werden. Sie landet an der Beschriftung, der einzigen Achse, die
   * immer gerendert wird, und nennt die Paketmeldung.
   */
  it("legt eine Vermessungsluecke an die Beschriftung", () => {
    const ergebnis = baue(
      { kind: "vehicle-land", vehicleCategory: "amphibienfahrzeug" } as SymbolSpec,
      96,
      "tz-test",
    );
    const karte = hinweiseZu(ergebnis);
    expect([...karte.keys()]).toEqual(["beschriftung"]);
    expect((karte.get("beschriftung") ?? [])[0].meldung).toMatch(/amphibienfahrzeug/);
  });

  it("schweigt, wenn die Zusammenstellung traegt", () => {
    const ergebnis = baue(grund({ organization: "thw" }), 96, "tz-test");
    expect(hinweiseZu(ergebnis).size).toBe(0);
  });
});
