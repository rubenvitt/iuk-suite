import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ortZielPfad, ortcodeZielPfad } from "./ortZiel";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "./konstanten";
import { tokenZielPfad } from "./tokenZiel";

/**
 * DRK-312 — wohin ein gescanntes Ortsetikett fuehrt.
 */
const EINHEIT = { id: "rtw-1", typ: "fahrzeug" as const };
const TASCHE = { id: "tasche-san", typ: "fahrzeug" as const };
const LAGER = { id: "handlager", typ: "lager" as const };

describe("ortZielPfad — ohne gebundenes Kaertchen", () => {
  it("schickt eine Einheit auf ihren Check, mit ihr vorgewaehlt", () => {
    expect(ortZielPfad(EINHEIT, null)).toBe("/helfer/check?fz=rtw-1");
  });

  /** Taschen sind `typ: "fahrzeug"` (DRK-309) und landen deshalb genauso. */
  it("behandelt eine Tasche wie ein Fahrzeug — sie IST ein typ:fahrzeug", () => {
    expect(ortZielPfad(TASCHE, null)).toBe("/helfer/check?fz=tasche-san");
  });

  it("schickt den Handlager auf die Artikelliste", () => {
    expect(ortZielPfad(LAGER, null)).toBe("/helfer");
  });

  /**
   * ⚠️ DIE ID EINES LAGERS DARF NICHT IN DEN PFAD DURCHRUTSCHEN. Ein
   * `/helfer/check?fz=handlager` waere typkorrekt und saehe richtig aus — die
   * Fahrzeugwahl dort kennt den Handlager aber nicht, und die Seite faellt
   * still auf „nichts gewaehlt" zurueck. Der Fehler ist am Ergebnis nicht
   * abzulesen, nur am Pfad.
   */
  it("haengt die Id eines Lagers NIRGENDS an", () => {
    expect(ortZielPfad(LAGER, null)).not.toContain("handlager");
  });

  /**
   * `null` heisst „zu dieser Adresse gehoert heute kein Etikett" — unbekannte
   * Id, stillgelegte Einheit, Schrank. Die Artikelliste ist der Ort, an dem
   * jemand mit einem veralteten Kaertchen in der Hand weiterkommt; eine 404
   * waere eine Sackgasse.
   */
  it("faellt fuer einen Ort ohne Etikett auf die Artikelliste zurueck", () => {
    expect(ortZielPfad(null, null)).toBe("/helfer");
  });
});

/**
 * DER BEFUND, UM DESSENTWILLEN DIE FUNKTION DIE BINDUNG UEBERHAUPT KENNT
 * (Codex P1 zu PR #177, an `helfer/check/page.tsx` nachgeprueft).
 *
 * Die Check-Seite waehlt `gebunden ?? (fz ? … )` — die Bindung des Kaertchens
 * schlaegt den Suchparameter, und zwar mit Absicht (DRK-302: `?fz=` ist
 * Nutzereingabe und als Beleg wertlos). Ein `/o/<B>`, das blind auf `?fz=B`
 * zeigte, erzeugte damit den teuersten stillen Ausgang dieses Tickets: Adresse
 * sagt B, Bildschirm zeigt A, gezaehlt wird der Inhalt von B in das Buch von A.
 */
describe("ortZielPfad — mit gebundenem Kaertchen", () => {
  it("laesst die Bindung gewinnen, wenn eine FREMDE Einheit gescannt wird", () => {
    // ⚠️ DIE VOLLE ZEICHENKETTE, und das `gescannt=` darin ist die zweite
    // Haelfte der Aussage (DRK-373): die Bindung gewinnt — und der uebergangene
    // Scan geht dabei nicht verloren, sonst kann die Check-Seite ihn nicht
    // benennen. Ein `toContain("fz=rtw-1")` hier waere gruen geblieben, wenn
    // der Parameter still verschwaende.
    expect(ortZielPfad({ id: "ktw-1", typ: "fahrzeug" }, "rtw-1"))
      .toBe("/helfer/check?fz=rtw-1&gescannt=ktw-1");
  });

  /**
   * ⚠️ DIE SCHARFE FORM DERSELBEN AUSSAGE, UND SIE HAT SICH MIT DRK-373
   * VERSCHOBEN — von „die gescannte Id kommt im Pfad GAR NICHT VOR" auf „es
   * gibt genau EIN `fz`, und das ist die gebundene Einheit".
   *
   * Hier stand `not.toContain("ktw-1")`, begruendet mit: ein `?fz=ktw-1` waere
   * die Adresse, die etwas anderes behauptet als der Bildschirm, und ein Test
   * auf „enthaelt rtw-1" allein bliebe fuer `?fz=ktw-1&fz=rtw-1` gruen. Der
   * ZWEITE Halbsatz ist die Zusage; der erste war nur ihre damals einfachste
   * Form. Seit DRK-373 reist die gescannte Id als `gescannt=` mit, damit die
   * Check-Seite der Person ueberhaupt sagen kann, dass ihr Scan nicht gilt —
   * und dann behauptet die Adresse nichts anderes als der Bildschirm, sondern
   * genau dasselbe: gezeigt wird A, gescannt wurde B.
   *
   * ⚠️ EIN `toContain`-VERBOT WAERE HIER NICHT NUR ZU STRENG, SONDERN DIE
   * AUGENBINDE: es machte den Hinweis unmoeglich und waere damit der Test, der
   * die Person wieder ohne Auskunft dastehen laesst. Was bleiben MUSS, ist die
   * Eindeutigkeit von `fz` — daran hing der teuerste stille Ausgang.
   */
  it("traegt genau EIN `fz`, und das ist die gebundene Einheit", () => {
    const pfad = ortZielPfad({ id: "ktw-1", typ: "fahrzeug" }, "rtw-1");
    const params = new URLSearchParams(pfad.slice(pfad.indexOf("?") + 1));
    expect(params.getAll("fz")).toEqual(["rtw-1"]);
  });

  /**
   * DIE ANDERE HAELFTE: die gescannte Einheit muss ueberhaupt ankommen, sonst
   * kann die Check-Seite sie nicht benennen (DRK-373, AK 2). `fahrzeuge.find()`
   * dort sucht ueber diese Id.
   */
  it("reicht die GESCANNTE Einheit als `gescannt` mit", () => {
    const pfad = ortZielPfad({ id: "ktw-1", typ: "fahrzeug" }, "rtw-1");
    const params = new URLSearchParams(pfad.slice(pfad.indexOf("?") + 1));
    expect(params.get("gescannt")).toBe("ktw-1");
  });

  /**
   * ⚠️ EINE ID DARF ZEICHEN TRAGEN, DIE EINE URL ZERLEGEN — der Bestand ist
   * importiert, nanoid ist nicht die einzige Quelle. Ein rohes
   * `&gescannt=a&b=c` machte aus einer Einheit zwei Parameter, und der Hinweis
   * benannte danach eine Einheit, die es nicht gibt (oder gar keine). Dieselbe
   * Begruendung wie das `encodeURIComponent` in `_ui/FahrzeugWahl.tsx`.
   */
  it("kodiert die gescannte Id, statt sie roh anzuhaengen", () => {
    const pfad = ortZielPfad({ id: "a&fz=ktw-9", typ: "fahrzeug" }, "rtw-1");
    const params = new URLSearchParams(pfad.slice(pfad.indexOf("?") + 1));
    expect(params.getAll("fz")).toEqual(["rtw-1"]);
    expect(params.get("gescannt")).toBe("a&fz=ktw-9");
  });

  /**
   * ⚠️ UND DIE ANDERE SEITE MUSS ES AUCH — Codex-Befund P2 zu PR #186, und die
   * Zeile darueber allein liess ihn durch.
   *
   * Dort wird die GESCANNTE Id geprueft; die GEBUNDENE kam aus `tokenZielPfad`
   * und stand dort ROH im `?fz=`. Gemessen an zwei Ids, die ein importierter
   * Bestand tragen kann:
   *
   *   „rtw#1"            → alles ab `#` ist Fragment, der Server sieht
   *                        `gescannt: null`
   *   „a&gescannt=ktw-9" → zwei `gescannt`, Next reicht ein Array, der
   *                        Vergleich auf der Check-Seite trifft nie
   *
   * Beide Male ist die Folge dieselbe und sie ist STILL: der Hinweis bleibt weg,
   * die Seite rendert klaglos, der Check laeuft auf der richtigen Einheit — nur
   * die Auskunft fehlt, also genau das, wogegen DRK-373 geschrieben ist.
   *
   * Der Test liest den Pfad so, wie ein BROWSER ihn liest (ueber `URL` gegen
   * einen Ankerhost), nicht mit `slice` ab dem ersten `?`: nur so faellt der
   * Fragment-Fall ueberhaupt auf — `slice` liefert „gescannt" auch dann noch,
   * wenn es hinter einem `#` steht und beim Server nie ankommt.
   */
  it("haelt `gescannt` auch fuer eine GEBUNDENE Id mit URL-Trennzeichen", () => {
    let geprueft = 0;
    for (const bindung of ["rtw#1", "a&gescannt=ktw-9", "a?b", "rtw 1", "a+b", "a%2Fb"]) {
      const pfad = ortZielPfad({ id: "ktw-1", typ: "fahrzeug" }, bindung);
      const gelesen = new URL(pfad, "http://lagerbuch.example.org").searchParams;
      expect(gelesen.get("gescannt"), bindung).toBe("ktw-1");
      expect(gelesen.getAll("gescannt"), bindung).toHaveLength(1);
      // Und die Bindung kommt unbeschadet an — sie waehlt die Einheit aus.
      expect(gelesen.getAll("fz"), bindung).toEqual([bindung]);
      geprueft += 1;
    }
    expect(geprueft).toBe(6);
  });

  it("aendert nichts, wenn die gescannte Einheit die gebundene IST", () => {
    expect(ortZielPfad(EINHEIT, "rtw-1")).toBe("/helfer/check?fz=rtw-1");
  });

  /**
   * ⚠️ UND DANN AUCH KEIN `gescannt` — DRK-373, AK 3: „wer das Etikett SEINER
   * gebundenen Einheit scannt, sieht keine solche Auskunft". Die Check-Seite
   * vergleicht zwar selbst noch einmal, aber ein bedingungsloses `gescannt=`
   * waere der Parameter, der bei der naechsten Aenderung dort zum Hinweis
   * fuehrt — auf dem Normalweg, den jeder Scan nimmt.
   */
  it("haengt fuer die eigene Einheit KEIN `gescannt` an", () => {
    expect(ortZielPfad(EINHEIT, "rtw-1")).not.toContain("gescannt");
  });

  /**
   * ⚠️ FUER EIN LAGER GILT DIE BINDUNG NICHT. `/helfer` ist die Artikelliste des
   * Handlagers und an keine Einheit gebunden — es gaebe hier nichts zu
   * verfaelschen. Zoege man die Bindung durch, landete jemand, der am REGAL
   * steht und das Regal-Etikett scannt, im Fahrzeug-Check: dieselbe
   * Verwechslung, nur andersherum.
   */
  it("schickt einen Lager-Scan trotz Bindung auf die Artikelliste", () => {
    expect(ortZielPfad(LAGER, "rtw-1")).toBe("/helfer");
  });

  /** Ohne Etikett bleibt es bei der Artikelliste, auch mit Bindung. */
  it("faellt ohne Etikett weiterhin auf die Artikelliste zurueck", () => {
    expect(ortZielPfad(null, "rtw-1")).toBe("/helfer");
  });
});

describe("ortZielPfad — Form und Herkunft des Pfades", () => {
  /**
   * DIE EIGENTLICHE ZUSAGE DIESER DATEI: Etikett und Kaertchen beantworten
   * dieselbe Frage mit derselben Funktion. Liefe das auseinander, zeigte ein
   * gescanntes Etikett woanders hin als ein Kaertchen, das auf dieselbe Einheit
   * gebunden ist — und niemand faende den Unterschied, ohne beide nebeneinander
   * auszuprobieren.
   */
  it("gibt fuer eine Einheit ZEICHENGLEICH dasselbe wie das gebundene Kaertchen", () => {
    for (const id of ["rtw-1", "ktw-1", "tasche-san"]) {
      expect(ortZielPfad({ id, typ: "fahrzeug" }, null)).toBe(tokenZielPfad("fahrzeug", id));
    }
  });

  /**
   * ⚠️ DER RUECKGABEWERT LANDET IN EINEM `redirect()` UND DAMIT BEIM BROWSER.
   * Ein innerer Pfad (`/m/lagerbuch/...`) wuerde von `decideRoute` ein zweites
   * Mal praefixiert (Falle 49), ein absoluter oeffnete einen Open Redirect.
   */
  it("liefert ausschliesslich lokale, aeussere Pfade", () => {
    for (const [ort, bindung] of [
      [EINHEIT, null], [LAGER, null], [null, "rtw-1"], [EINHEIT, "ktw-1"],
    ] as const) {
      const pfad = ortZielPfad(ort, bindung);
      expect(pfad).toMatch(/^\/helfer/);
      expect(pfad).not.toMatch(/^\/m\/lagerbuch/);
      expect(pfad).not.toMatch(/^https?:/);
    }
  });

  /**
   * ⚠️ DER SCAN IST DER TEIL, DEN DIE WERTETESTS OBEN NICHT HALTEN: sie blieben
   * alle gruen, wenn jemand `/helfer/check?fz=` hier direkt hinschriebe. Genau
   * das waere die zweite Wahrheit, gegen die die Datei gebaut ist — sie faellt
   * erst auf, wenn die Check-Strecke umzieht und nur eine der beiden Stellen
   * mitwandert.
   */
  it("baut den Pfad NICHT selbst, sondern ueber tokenZielPfad", () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/ortZiel.ts", "utf8");
    const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/\btokenZielPfad\s*\(/);
    expect(code).not.toContain("/helfer/check");
  });

  /**
   * ⚠️ DER PARAMETERNAME WIRD HIER GESCHRIEBEN UND ZWEI DATEIEN WEITER GELESEN
   * — DRK-373, und zwischen den beiden haelt ihn NICHTS zusammen.
   *
   * Eine geteilte Konstante kann es nicht: `searchParams` ist ein TYP mit
   * literalen Schluesseln (`{ fz?: string; gescannt?: string }`), und ein
   * berechneter Name laesst sich darin nicht deklarieren. Wer den Parameter
   * also auf einer Seite umbenennt, bekommt von `typecheck`, `lint` und `build`
   * kein Wort: die Check-Seite liest still `undefined`, der Hinweis bleibt weg,
   * und die Lage ist wieder genau die, gegen die dieses Ticket geschrieben ist
   * — nur diesmal mit gruenen Tests daneben, weil die Wertetests oben den
   * SCHREIBER pruefen und die Seitentests den LESER, jeder fuer sich.
   *
   * Der Test liest deshalb, was `ortZielPfad` WIRKLICH erzeugt (keine
   * hingeschriebene Zeichenkette — sonst prueft er sich selbst), und verlangt
   * denselben Namen im `searchParams`-Typ der Check-Seite.
   */
  it("schreibt den Parameter, den die Check-Seite auch liest", () => {
    const pfad = ortZielPfad({ id: "ktw-1", typ: "fahrzeug" }, "rtw-1");
    const namen = [...new URLSearchParams(pfad.slice(pfad.indexOf("?") + 1)).keys()]
      .filter((n) => n !== "fz");
    expect(namen, "ortZielPfad haengt keinen zweiten Parameter an").toHaveLength(1);

    const seite = readFileSync("src/app/m/lagerbuch/helfer/check/page.tsx", "utf8");
    const typzeile = seite.match(/searchParams:\s*Promise<\{[^}]*\}>/)?.[0];
    expect(typzeile, "kein `searchParams`-Typ in der Check-Seite gefunden").toBeTruthy();
    expect(typzeile, `Check-Seite liest \`${namen[0]}\` nicht`).toContain(namen[0]!);
  });
});

/**
 * DRK-417 — DIE ENTNAHMEBOX HAT EIN ZIEL, DAS VON IHR HANDELT.
 *
 * ⚠️ SIE IST EIN `typ: "lager"` WIE DER HANDLAGER, und genau darin liegt der
 * Fehlgriff, den diese Zusicherungen abfangen: ohne eigenen Zweig fiele sie in
 * „sonst" und landete auf `/helfer` — eine Karte, die an der Kiste klebt und
 * den Bestand des REGALS zeigt.
 */
describe("ortZielPfad — die Entnahmebox (DRK-417)", () => {
  const BOX = { id: ENTNAHMEBOX_ID, typ: "lager" as const };

  it("schickt die Box auf den Ablegeschirm, nicht auf die Artikelliste", () => {
    expect(ortZielPfad(BOX, null)).toBe("/helfer/box");
  });

  /**
   * ⚠️ EIN GEBUNDENES KAERTCHEN AENDERT DARAN NICHTS. `/helfer/box` fragt die
   * Einheit selbst ab und gibt der Bindung dort den Vorrang (DRK-302); sie hier
   * vorwegzunehmen hiesse, dieselbe Entscheidung zweimal zu treffen — und die
   * zweite Fassung liefe beim naechsten Griff aus der ersten heraus.
   */
  it("bleibt dabei, auch wenn das Kaertchen an eine Einheit gebunden ist", () => {
    expect(ortZielPfad(BOX, "rtw-1")).toBe("/helfer/box");
  });

  /**
   * ⚠️ UND JEDES ANDERE LAGER BLEIBT AUF DER ARTIKELLISTE. Die Ausnahme gilt
   * der Box, nicht dem TYP — wer sie ueber `typ === "lager"` baute, schickte
   * „Lager Keller" ebenfalls an die Kiste.
   */
  it("gilt fuer die Box, nicht fuer jedes Lager", () => {
    expect(ortZielPfad({ id: "keller", typ: "lager" }, null)).toBe("/helfer");
  });
});

/**
 * DIE LANDUNG NACH DEM EINGELOESTEN ORTSCODE — DRK-417, der Weg ueber
 * `/t/<code>`.
 *
 * ⚠️ DIE ERSTEN DREI ZUSICHERUNGEN SIND KEINE WIEDERHOLUNG DER OBEREN, SONDERN
 * DIE ZUSAGE „fuer jeden anderen Code aendert sich nichts". Sie vergleichen
 * gegen `tokenZielPfad` — also gegen die Rechnung, die vor diesem Ticket allein
 * zustaendig war. Eine hingeschriebene Zeichenkette pruefte hier die eigene
 * Erwartung statt der Gleichheit.
 */
describe("ortcodeZielPfad — wohin ein eingeloester Ortscode fuehrt", () => {
  it("Handlager: dieselbe Adresse wie vorher", () => {
    expect(ortcodeZielPfad(HANDLAGER_ID, null, null)).toBe(tokenZielPfad(null, null));
  });

  it("Einheit: dieselbe Adresse wie vorher, mit ihr vorgewaehlt", () => {
    expect(ortcodeZielPfad("rtw-1", "fahrzeug", "rtw-1"))
      .toBe(tokenZielPfad("fahrzeug", "rtw-1"));
  });

  /**
   * ⚠️ DER ALTBESTAND GEHT WEITER UEBER `tokenZielPfad`, UND ZWAR VOR JEDER
   * REICHWEITENRECHNUNG. Ein Kaertchen ohne `ort_id` kann auf einen ARTIKEL
   * zeigen, und diese Landung hat in keiner Reichweite eine Entsprechung —
   * `startPfad` schickte es auf die Artikelliste, also einen Klick vor sein
   * Ziel. „Altbestand bleibt gueltig" gilt auch fuer seine Landung.
   */
  it("Altbestand mit Artikelziel: unveraendert auf den Artikel", () => {
    expect(ortcodeZielPfad(null, "artikel", "art-9")).toBe("/a/art-9");
    expect(ortcodeZielPfad(undefined, "artikel", "art-9")).toBe("/a/art-9");
  });

  it("Altbestand ohne Ziel: unveraendert auf die Artikelliste", () => {
    expect(ortcodeZielPfad(null, null, null)).toBe("/helfer");
  });

  /**
   * DIE EINE ZEILE, DIE SICH AENDERT — und der Grund fuer die ganze Funktion.
   *
   * ⚠️ `tokenZielPfad` HAETTE HIER `/helfer` GELIEFERT, weil der Code der Box
   * `zielTyp: null` traegt (`_lib/schreibpfade/ortCodes.ts`, `zielFuer`). Die
   * Gegenprobe steht ausdruecklich daneben: ohne sie liesse sich nicht sagen,
   * ob die Zusicherung die neue Rechnung misst oder zufaellig dasselbe trifft.
   */
  it("Entnahmebox: auf den Ablegeschirm — und NICHT dorthin, wo die Zielart zeigt", () => {
    expect(ortcodeZielPfad(ENTNAHMEBOX_ID, null, null)).toBe("/helfer/box");
    expect(tokenZielPfad(null, null)).toBe("/helfer");
  });
});
