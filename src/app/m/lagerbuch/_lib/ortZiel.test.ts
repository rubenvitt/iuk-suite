import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { kaertchenFuehrtInsHandlager, ortZielPfad } from "./ortZiel";
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
 * DRK-395 — welches Kaertchen auf die Handlager-Karte darf.
 */
describe("kaertchenFuehrtInsHandlager", () => {
  it("nimmt ein Kaertchen ohne Ziel", () => {
    expect(kaertchenFuehrtInsHandlager(null, null)).toBe(true);
    expect(kaertchenFuehrtInsHandlager(undefined, undefined)).toBe(true);
  });

  it("weist ein Kaertchen mit Fahrzeug- oder Artikelziel ab", () => {
    expect(kaertchenFuehrtInsHandlager("fahrzeug", "rtw-1")).toBe(false);
    expect(kaertchenFuehrtInsHandlager("artikel", "art-1")).toBe(false);
  });

  /**
   * ⚠️ DIE HALBFORM LANDET TATSAECHLICH AUF DER ARTIKELLISTE — `tokenZielPfad`
   * faellt ohne `zielId` in seinen Rueckfall. Sie DARF also auf die Karte, und
   * dieser Test haelt fest, dass hier nichts zusaetzlich gefiltert wird: die
   * Frage lautet „wo landet der Scan?", nicht „wie ist die Zeile gefuellt?".
   */
  it("richtet sich nach der LANDUNG, nicht nach der Form der Zeile", () => {
    expect(tokenZielPfad("artikel", null)).toBe("/helfer");
    expect(kaertchenFuehrtInsHandlager("artikel", null)).toBe(true);
  });

  /**
   * ⚠️ KEIN LITERAL `/helfer` IN DER FUNKTION. Ein hingeschriebener Pfad waere
   * eine zweite Wahrheit ueber die Landung — und sie faellt still aus: der
   * Filter liefe leer, der Ortskarten-Bogen boete kein Kaertchen mehr an, und
   * kein Tor meldete etwas.
   */
  it("vergleicht gegen tokenZielPfad, statt den Pfad hinzuschreiben", () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/ortZiel.ts", "utf8");
    const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain('"/helfer"');
  });
});
