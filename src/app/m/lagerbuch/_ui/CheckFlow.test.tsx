// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  mount,
  unmount,
  query,
  queryAll,
  exists,
  click,
  clickElement,
  fill,
} from "@/app/m/qr/_lib/test-dom";

const abschluss = vi.fn();
vi.mock("../_actions/check", () => ({ checkAbschluss: (...a: unknown[]) => abschluss(...a) }));
const erneuere = vi.fn();
vi.mock("../_actions/sitzung", () => ({ erneuereSitzung: (...a: unknown[]) => erneuere(...a) }));

import { CheckFlow, type CheckPos, type CheckGeraet, type CheckFlasche } from "./CheckFlow";

const QUELLE = "src/app/m/lagerbuch/_ui/CheckFlow.tsx";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). Die vier Bauform-Scans unten lesen sonst den Rohtext
 * INKLUSIVE Kommentaren — und `CheckFlow.tsx` traegt in seinem Kopfkommentar
 * woertlich `preselect` (das ist die BEGRUENDUNG, warum die Prop entfaellt),
 * `checkNutzlast` und `antd`. Ohne diesen Filter waeren die drei Negativ-Scans
 * auf ihrer EIGENEN Begruendung rot. `bauform.test.ts` exportiert die Funktion
 * nicht, und dies ist ein anderer Testkoerper — deshalb die lokale Kopie statt
 * eines Re-Exports, wie schon in `_lib/pwaIcons.test.ts`,
 * `_lib/schreibpfade/tokenEinloesung.test.ts` und `_ui/Entnahme.test.tsx`.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

const STYLESHEET = "src/app/m/lagerbuch/_ui/helfer.module.css";
const CSS = readFileSync(STYLESHEET, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Die Deklarationen EINES Selektors aus `helfer.module.css`, als Map.
 *
 * Zeichengleiche Kopie aus `_ui/Entnahme.test.tsx:70-88` (T78, Review-Befund 1)
 * — dieselbe Lage, dieselbe Begruendung: gelesen statt behauptet, damit der
 * Riegel unten pruefen kann, dass jede Eigenschaft, mit der `.chip` einen ganzen
 * SATZ unlesbar macht, am Warnhinweis ueberschrieben ist, und zwar mit einem
 * ANDEREN Wert als dem im Stylesheet. Aendert T64 `.chip`, aendert sich die
 * Vergleichsgrundlage mit. Die Funktion wird dort nicht exportiert (N-5), also
 * eine lokale Kopie statt eines Re-Exports.
 */
function regeln(selektor: string): Map<string, string> {
  const treffer = [...CSS.matchAll(new RegExp(`^\\${selektor}\\s*\\{([^}]*)\\}`, "gm"))];
  if (treffer.length !== 1) {
    throw new Error(`${selektor} steht ${treffer.length}× in ${STYLESHEET} — erwartet: genau 1×`);
  }
  return new Map(
    treffer[0][1]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
      }),
  );
}

const FZ = { id: "fz-1", name: "RTW 1", kennung: "HH-DR 1234" };
const WARN = { rotTage: 31, gelbTage: 56 };

const POS = (over: Partial<CheckPos> = {}): CheckPos => ({
  id: "sp-1",
  fachLabel: "Fach 1",
  artikelId: "art-1",
  artikelName: "Kompresse",
  einheit: "Stk",
  handlagerFach: "A-01",
  soll: 5,
  fahrzeugBestand: 5,
  handlagerBestand: 20,
  ...over,
});
const GERAET: CheckGeraet = { id: "g-1", typ: "medizin", name: "Absaugpumpe" };
const FLASCHE: CheckFlasche = {
  id: "o-1",
  name: "O2 klein",
  nennfuelldruckBar: 200,
  letzterDruck: 190,
};

const WEITER = "[data-rolle='weiter']";
const ABSCHLIESSEN = "[data-rolle='abschliessen']";
const ZURUECK = "[data-rolle='zurueck-zaehlen']";

/**
 * ⚠️ `clickElement` und NICHT `el.click()` (Befund 32, zweite Haelfte): ein
 * rohes `.click()` laeuft ohne das `act`-Flushen des Harness, die
 * Zustandsaenderung kommt nie im Baum an, und der Test misst den Ausgangswert.
 */
const minus = (n: number) =>
  clickElement(queryAll("button[aria-label$='verringern']")[n]);

const WERT_NULL = {
  checkId: "c1",
  nachgefuellt: 0,
  nachfuellBestaetigt: 0,
  offen: 0,
  geraeteAuffaellig: 0,
  flaschenAuffaellig: 0,
  flaschenNichtBewertbar: 0,
  verfallAuffaellig: 0,
};

beforeEach(() => {
  abschluss.mockReset();
  erneuere.mockReset();
  abschluss.mockResolvedValue({ ok: true, wert: WERT_NULL });
});
afterEach(async () => {
  await unmount();
});

describe("CheckFlow — die adaptive Schrittfolge (1:1, §7.9.2)", () => {
  it("Artikel + Geraete + Flaschen ergeben VIER Schritte", async () => {
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
      />,
    );
    expect(queryAll("[data-rolle='schritt']").map((e) => e.textContent?.trim())).toEqual([
      "1 Zählen",
      "2 Nachfüllen",
      "3 Geräte",
      "4 Sauerstoff",
    ]);
  });

  it("Fahrzeug OHNE Geraete hat DREI Schritte", async () => {
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
      />,
    );
    expect(queryAll("[data-rolle='schritt']").map((e) => e.textContent?.trim())).toEqual([
      "1 Zählen",
      "2 Nachfüllen",
      "3 Sauerstoff",
    ]);
  });

  it("Fahrzeug OHNE Artikel hat ZWEI Schritte", async () => {
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
      />,
    );
    expect(queryAll("[data-rolle='schritt']").map((e) => e.textContent?.trim())).toEqual([
      "1 Geräte",
      "2 Sauerstoff",
    ]);
  });

  it("Fahrzeug OHNE ALLES zeigt den LeerZustand — mit benanntem Rueckweg", async () => {
    await mount(
      <CheckFlow fahrzeug={FZ} soll={[]} geraete={[]} flaschen={[]} verfall={{}} warn={WARN} />,
    );
    expect(exists("[data-rolle='leer-titel']")).toBe(true);
    expect(query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href")).toBe(
      "/helfer/check",
    );
  });

  it("der Commit sitzt im LETZTEN Schritt — und NUR dort", async () => {
    // Zwei Seiten, sonst traegt die Zusicherung `istLetzter` nicht: mit einem
    // fest verdrahteten `true` bliebe die erste Haelfte gruen, mit `false` die
    // zweite.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
      />,
    );
    // Geraete ist hier NICHT der letzte Schritt.
    expect(exists(ABSCHLIESSEN)).toBe(false);
    expect(exists(WEITER)).toBe(true);
    await click(WEITER);
    // Sauerstoff IST der letzte.
    expect(exists(ABSCHLIESSEN)).toBe(true);
    expect(exists(WEITER)).toBe(false);
  });
});

describe("CheckFlow — der Zaehlschritt", () => {
  it("jede Position ist auf SOLL vorbelegt — nicht auf 0 und nicht auf dem Fahrzeugbestand", async () => {
    // „voll annehmen, Gezaehltes runterkorrigieren" (:97) — der Regelfall ist
    // „alles da". Der RECORDED Fahrzeugbestand ist ausdruecklich KEIN
    // Per-Position-Default (:94-96): er ist pro Artikel, nicht pro Fach.
    // Deshalb sind Soll (7) und Fahrzeugbestand (5) hier verschieden.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS({ soll: 7, fahrzeugBestand: 5 })]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    expect(query("[data-rolle='stepanzeige']").textContent).toBe("7");
  });

  it("der Stepper hat KEIN Zahlenfeld (`noText`)", async () => {
    // Stepper.tsx:41-47: „damit unterwegs am Handy nicht versehentlich ins
    // Zahlenfeld getippt wird" — hier ist ein Fehlgriff eine falsche
    // Bestandsbuchung.
    //
    // ⚠️ Geprueft wird ueber die ANZAHL der Eingabefelder, nicht ueber
    // `input[aria-label]` (Befund 33): das Verfallsfeld traegt genau so eins
    // und liegt im selben Teilbaum. Ohne `noText` stuenden hier ZWEI Felder,
    // und `stepanzeige` gaebe es gar nicht.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    const felder = queryAll<HTMLInputElement>("[data-rolle='zaehlliste'] input");
    expect(felder.length).toBe(1);
    expect(felder[0].type).toBe("month");
    expect(exists("[data-rolle='zaehlliste'] [data-rolle='stepanzeige']")).toBe(true);
  });

  it("das Verfallsfeld erscheint NUR in der ERSTEN Zeile je Artikel", async () => {
    // Zwei Felder fuer EINE Angabe waeren nicht auseinanderzuhalten (:100-109).
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ id: "sp-1", fachLabel: "Fach 1" }), POS({ id: "sp-2", fachLabel: "Fach 2" })]}
      />,
    );
    // Beide Zeilen sind da …
    expect(queryAll("[data-rolle='zaehlliste'] [data-rolle='stepanzeige']").length).toBe(2);
    // … und nur EINE traegt das Feld.
    expect(queryAll("[data-rolle='zaehlliste'] input[type='month']").length).toBe(1);
  });

  it("die Hinweiszeile bei Wiederholzeilen ist WEG — der Chip steht in JEDER Zeile", async () => {
    // Heute eine ganze Zeile fuer einen Hinweis (:290). Der Statuschip traegt
    // die Angabe bereits und ist in JEDER Zeile desselben Artikels sichtbar —
    // das ist die Bedingung, unter der der Wegfall vertretbar ist, und genau
    // sie wird hier zugesichert.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        soll={[POS({ id: "sp-1" }), POS({ id: "sp-2", fachLabel: "Fach 2" })]}
      />,
    );
    expect(query("[data-rolle='zaehlliste']").textContent).not.toContain("Verfall bei");
    const chips = queryAll("[data-rolle='zaehlliste'] [data-rolle='helfer-chip']").map(
      (e) => e.textContent ?? "",
    );
    expect(chips.length).toBe(2);
    expect(chips[0]).toContain("09/26");
    expect(chips[1]).toBe(chips[0]);
  });

  it("die Live-Vorschau zaehlt ablaufende Artikel mit", async () => {
    // §12.1 Punkt 1: das Feld und die Vorschau sind die EINZIGE Absicherung
    // ihrer Fachlichkeit. Die Zaehlung selbst liegt in `zaehleAblaufende`
    // (Teil 3, T43); hier wird geprueft, dass sie ANKOMMT.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2020-01" }}
        warn={WARN}
      />,
    );
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("1 laufen ab");
  });

  it("`Soll` runterzaehlen zeigt „nachfuellen N\"", async () => {
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS({ soll: 5 })]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    for (let i = 0; i < 2; i++) await minus(0);
    expect(query("[data-rolle='zaehlliste']").textContent).toContain("nachfüllen 2");
  });
});

describe("CheckFlow — Nachfuellen", () => {
  it("schlaegt greedy vor, gedeckelt an der Handlager-Verfuegbarkeit", async () => {
    // Der Vorschlag verspricht nie mehr, als der Handlager hergibt (:222-238).
    // Luecke 5, Handlager 2 → Vorschlag 2.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ soll: 5, handlagerBestand: 2 })]}
      />,
    );
    for (let i = 0; i < 5; i++) await minus(0); // Ist = 0
    await click(WEITER);
    expect(query("[data-rolle='nf-liste'] [data-rolle='stepanzeige']").textContent).toBe("2");
  });

  it("der Helfer kann nicht MEHR eintragen, als die Luecke gross ist (`max={luecke}`)", async () => {
    // Die Buchung folgt der Wirklichkeit, nicht dem Vorschlag (:445, :461) —
    // aber ueber die Luecke hinaus ist sie keine Nachfuellung mehr.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ soll: 5, handlagerBestand: 20 })]}
      />,
    );
    for (let i = 0; i < 2; i++) await minus(0); // Ist = 3, Luecke = 2
    await click(WEITER);
    const anzeige = () => query("[data-rolle='nf-liste'] [data-rolle='stepanzeige']").textContent;
    expect(anzeige()).toBe("2");
    await clickElement(queryAll("[data-rolle='nf-liste'] button[aria-label$='erhöhen']")[0]);
    expect(anzeige()).toBe("2");
  });

  it("warnt erst, wenn MEHR verlangt wird, als der Handlager hergibt", async () => {
    // ⚠️ Befund 32: der greedy Vorschlag KANN die Warnung nicht ausloesen — er
    // deckelt selbst an der Verfuegbarkeit. Erreichbar ist sie nur, wenn der
    // Helfer von Hand hochstellt. Beide Seiten stehen hier, sonst traegt weder
    // der Deckel noch die Warnung.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[
          POS({ id: "sp-1", soll: 5, handlagerBestand: 2 }),
          POS({ id: "sp-2", fachLabel: "Fach 2", soll: 5, handlagerBestand: 2 }),
        ]}
      />,
    );
    for (const el of queryAll("button[aria-label$='verringern']")) {
      for (let i = 0; i < 5; i++) await clickElement(el);
    }
    await click(WEITER);
    // Greedy: nf[sp-1] = 2, nf[sp-2] = 0 — zusammen genau die verfuegbaren 2.
    const anzeigen = () =>
      queryAll("[data-rolle='nf-liste'] [data-rolle='stepanzeige']").map((e) => e.textContent);
    expect(anzeigen()).toEqual(["2", "0"]);
    expect(exists("[data-rolle='nf-knappheit']")).toBe(false);

    // Von Hand auf 3 hochgestellt → verlangt 5, verfuegbar 2.
    const plus = queryAll("[data-rolle='nf-liste'] button[aria-label$='erhöhen']")[1];
    for (let i = 0; i < 3; i++) await clickElement(plus);
    expect(anzeigen()).toEqual(["2", "3"]);
    expect(exists("[data-rolle='nf-knappheit']")).toBe(true);
  });

  /**
   * ⚠️ WARUM ES DIESEN TEST GIBT (Review-Befund 1). `.chip` ist ein KURZstatus:
   * `white-space: nowrap`, `border-radius: 99px`, `padding: 2.5px 9px`,
   * `font-size: 12px` (`helfer.module.css:227-230`), und die umgebende `.karte`
   * traegt `overflow: hidden` (`:186`). In diesen Chip laeuft hier ein Satz von
   * 83 Zeichen: bei 390px Geraetebreite bleiben 334px Karteninnenraum, der Satz
   * braucht bei 12px/600 rund 500px. Ohne Umbruchmoeglichkeit schneidet
   * `overflow: hidden` den Ueberhang OHNE Ellipse ab — die Helferin liest
   * „Handlager reicht nicht fuer alle Positio…" und bekommt die eigentliche
   * Ansage („es wird nur gebucht, was verfuegbar ist") nie zu sehen. Es ist der
   * EINZIGE Hinweis VOR dem Abschluss, dass die Buchung serverseitig gekappt
   * wird.
   *
   * ⚠️ WARUM ER DEN STIL LIEST UND NICHT DAS AUSSEHEN. jsdom wendet KEIN CSS an
   * (gemessen und festgehalten in `HelferChip.tsx:22-28`), und der CSS-Scan in
   * `_lib/bauform.test.ts` sucht ausschliesslich nach `--ant-`. `exists()` misst
   * nicht, ob Text SICHTBAR ist. Ein INLINE-Stil steht dagegen im DOM und ist
   * damit das Einzige, was ein Tor dieses Projekts von dieser Regel ueberhaupt
   * sehen kann.
   */
  it("der Knappheitssatz umbricht — sonst schneidet `overflow: hidden` ihn ab", async () => {
    const chip = regeln(".chip");
    // Die Voraussetzung des Befunds, aus dem Stylesheet GELESEN statt behauptet:
    // faellt `nowrap` in T64 je weg, geht diese Zeile rot und der naechste Leser
    // weiss, dass die Ueberschreibung neu zu bewerten ist.
    expect(chip.get("white-space")).toBe("nowrap");

    await mount(
      <CheckFlow
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[
          POS({ id: "sp-1", soll: 5, handlagerBestand: 2 }),
          POS({ id: "sp-2", fachLabel: "Fach 2", soll: 5, handlagerBestand: 2 }),
        ]}
      />,
    );
    for (const el of queryAll("button[aria-label$='verringern']")) {
      for (let i = 0; i < 5; i++) await clickElement(el);
    }
    await click(WEITER);
    const plus = queryAll("[data-rolle='nf-liste'] button[aria-label$='erhöhen']")[1];
    for (let i = 0; i < 3; i++) await clickElement(plus);

    const w = query("[data-rolle='nf-knappheit'] [data-rolle='helfer-chip']");
    expect(w.textContent).toContain("es wird nur gebucht, was verfügbar ist");

    // Der Umbruch selbst — ohne ihn hilft keine Geometrie.
    expect(w.style.whiteSpace).toBe("normal");
    // `inline-flex` mit Umbruch bliebe schrumpfbreit und liefe wieder ueber.
    expect(w.style.display).toBe("block");

    // Und die Geometrie MUSS mit: `border-radius: 99px` mit `padding: 2.5px 9px`
    // ueber zwei Zeilen ist ein zerlaufendes Oval — man tauschte Abschneiden
    // gegen Unlesbarkeit. Die Liste ist genau die Schnittmenge aus „steht in
    // `.chip`" und „macht einen SATZ unlesbar".
    for (const eig of ["display", "white-space", "border-radius", "padding", "font-size"]) {
      expect(chip.has(eig)).toBe(true);
      expect(w.style.getPropertyValue(eig)).not.toBe("");
      expect(w.style.getPropertyValue(eig)).not.toBe(chip.get(eig));
    }

    // Der Ton bleibt, wo er war: die Ueberschreibung tauscht die FORM, nicht die
    // Farbe. `gelb` ist die Warnstufe (§6.6.2) — ohne die Klassen waere es ein
    // Absatz ohne Ampelwert.
    expect(w.className).toMatch(/chip/);
    expect(w.className).toMatch(/gelb/);
  });
});

describe("CheckFlow — die Nutzlast (§12.1 Punkt 1)", () => {
  it("sendet genau das Gezaehlte — Ist, Nachfuellmenge, Geraet und Druck", async () => {
    // ⚠️ Ohne diese Zusicherung ist KEINE der acht 1:1-Zeilen der Brief-Tabelle
    // gedeckt: `?? p.soll`, das greedy Ergebnis, `GERAET_VORBELEGUNG` und der
    // Nennfuelldruck-Default erreichen die Leitung nur ueber `zaehlung()`, und
    // die Rueckmeldung ist gemockt.
    //
    // `toStrictEqual` und nicht `toEqual` (N-4, empirisch belegt): `bemerkung`
    // wird in `checkNutzlast` BEDINGT gespreizt — `toEqual` behandelte einen
    // Schluessel mit Wert `undefined` wie einen fehlenden.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS({ soll: 5 })]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
      />,
    );
    for (let i = 0; i < 2; i++) await minus(0); // Ist = 3
    // Angetippt und wieder auf den Ausgangswert gestellt: NUR Geaendertes wird
    // gesendet (:152-155) — hier also NICHTS.
    await fill("[data-rolle='zaehlliste'] input[type='month']", "2027-03");
    await fill("[data-rolle='zaehlliste'] input[type='month']", "2026-09");
    await click(WEITER); // greedy: Luecke 2, Handlager 20 → 2
    await click(WEITER);
    await click("[data-rolle='geraet-fehlt']");
    await click(WEITER);
    await minus(0); // Druck 200 → 199
    await click(ABSCHLIESSEN);

    expect(abschluss).toHaveBeenCalledTimes(1);
    expect(abschluss.mock.calls[0][0]).toStrictEqual({
      fahrzeugId: "fz-1",
      positionen: [{ sollPositionId: "sp-1", ist: 3, nachfuellMenge: 2 }],
      geraete: [{ geraetId: "g-1", vorhanden: false, zustand: "In Ordnung" }],
      flaschen: [{ flascheId: "o-1", druckBar: 199 }],
      verfaelle: [],
    });
  });

  it("ein GEAENDERTER Verfall wird gesendet", async () => {
    // Die Gegenprobe zum Filter oben: ohne sie bliebe „nur Geaendertes" auch
    // dann gruen, wenn gar nichts mehr gesendet wuerde.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
      />,
    );
    await fill("[data-rolle='zaehlliste'] input[type='month']", "2027-03");
    await click(WEITER);
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].verfaelle).toStrictEqual([
      { artikelId: "art-1", verfall: "2027-03" },
    ]);
  });

  it("ein GELEERTES Feld loescht die Angabe — es ist nicht „unangetastet\"", async () => {
    // Der Zaehlschritt sagt es der Helferin woertlich: „Leeren heißt ‚keine
    // Angabe‘". `checkNutzlast` unterscheidet drei Faelle — fehlender Eintrag =
    // unangetastet, `""`/`null` = LOESCHEN. Ohne diesen Test deckten die beiden
    // Tests oben nur zwei davon ab, und ein Filter, der die geleerte Angabe
    // mit wegwirft, bliebe gruen.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
      />,
    );
    await fill("[data-rolle='zaehlliste'] input[type='month']", "");
    await click(WEITER);
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].verfaelle).toStrictEqual([
      { artikelId: "art-1", verfall: null },
    ]);
  });
});

describe("CheckFlow — der Geraeteschritt (Befund 35)", () => {
  it("die Auswahl steht NICHT allein auf der Farbe — Haken UND `aria-pressed` tragen sie", async () => {
    // §2 Punkt 21 und T70: „Bedeutung nie allein ueber Farbe", „jeder Status
    // traegt zusaetzlich Text". Der Chiptext ist im gewaehlten wie im
    // ungewaehlten Fall derselbe; ohne `aria-pressed` waere die Auswahl fuer
    // eine Bildschirmleserin gar nicht vorhanden.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    const gedrueckt = (rolle: string) =>
      query(`[data-rolle='${rolle}']`).getAttribute("aria-pressed");
    expect(gedrueckt("geraet-vorhanden")).toBe("true");
    expect(gedrueckt("geraet-fehlt")).toBe("false");

    // ⚠️ DIE SEHENDE HAELFTE der Befund-35-Reparatur (Review-Befund 4). Ohne
    // den Haken unterscheidet sich der gewaehlte Chip vom ungewaehlten NUR
    // durch die Farbe — der Chiptext ist in beiden Faellen derselbe, und ein
    // `<svg>` traegt keinen Text, faellt also durch jede `textContent`-Zusicherung
    // hindurch. `aria-pressed` allein deckt nur die Bildschirmleserin ab.
    const haken = (rolle: string) => queryAll(`[data-rolle='${rolle}'] svg`).length;
    expect(haken("geraet-vorhanden")).toBe(1);
    expect(haken("geraet-fehlt")).toBe(0);

    // Vorbelegung „vorhanden · In Ordnung" (:325, :132).
    const zustaende = queryAll("[data-rolle='geraet-zustand']");
    expect(zustaende.length).toBe(3);
    expect(zustaende.map((e) => e.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    // Genau EINER der drei traegt den Haken — der gewaehlte.
    expect(haken("geraet-zustand")).toBe(1);

    await click("[data-rolle='geraet-fehlt']");
    expect(gedrueckt("geraet-vorhanden")).toBe("false");
    expect(gedrueckt("geraet-fehlt")).toBe("true");
    // Der Haken wandert mit dem Zustand mit — sonst zeigte er dauerhaft auf
    // „vorhanden" und waere schlimmer als keiner.
    expect(haken("geraet-vorhanden")).toBe(0);
    expect(haken("geraet-fehlt")).toBe(1);
    // Ein fehlendes Geraet hat keinen Zustand.
    expect(queryAll("[data-rolle='geraet-zustand']").length).toBe(0);
  });

  /**
   * ⚠️ WARUM ES DIESEN TEST GIBT (Review-Befund 2). Die fuenf Auswahlknoepfe
   * tragen keine `className`, und weder `helfer.module.css` noch
   * `src/app/globals.css` enthaelt einen `button`-Reset — sie rendern also mit
   * UA-Vorgabe um eine `.chip`-Pille von rund 21px Hoehe; das Tippziel liegt bei
   * ~25px. „Tap-Mass 56px" ist eine Querschnittsregel dieses Plans, und
   * `core/theme/tokens.ts:33` begruendet sie woertlich („Bedienung mit
   * Handschuhen … eine Einsatzanforderung, keine Stilfrage", zitiert in
   * `_ui/Stepper.tsx:10-11`). Diese fuenf Knoepfe SIND der Geraeteschritt, und
   * ein Fehlgriff schreibt „fehlt" oder „Defekt" ins Journal.
   *
   * ⚠️ GEPRUEFT WIRD `>= 44`, NICHT `=== "44px"`: die Regel ist das Tippmass,
   * nicht der Literalwert. Eine spaetere Anhebung auf 56 laesst den Test gruen,
   * ein Wegfall macht ihn rot.
   *
   * ⚠️ jsdom wendet kein CSS an (`HelferChip.tsx:22-28`); der Inline-Stil im DOM
   * ist das Einzige, was ein Tor dieses Projekts hiervon sehen kann.
   */
  it("die fuenf Auswahlknoepfe sind mit Handschuhen treffbar (Tippmass)", async () => {
    await mount(
      <CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]} verfall={{}} warn={WARN} />,
    );
    const knoepfe = queryAll(
      "[data-rolle='geraet-vorhanden'], [data-rolle='geraet-fehlt'], [data-rolle='geraet-zustand']",
    );
    // Ohne diese Zahl liefe die Schleife bei leerem Trefferarray durch, ohne
    // eine einzige Zusicherung auszufuehren (Regel 2).
    expect(knoepfe.length).toBe(5);
    for (const k of knoepfe) {
      expect(Number.parseInt(k.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      // Das UA-Chrome um jede Pille muss mit weg, sonst sitzt der vergroesserte
      // Knopf als grauer Kasten um den Chip.
      expect(k.style.border).toBe("0px");
      expect(k.style.background).toBe("none");
      // `inline-flex` + `center`: die Hoehe entsteht sonst nur unter dem Chip
      // statt um ihn herum, und das Tippziel liegt neben dem, was man sieht.
      expect(k.style.display).toBe("inline-flex");
      expect(k.style.alignItems).toBe("center");
    }
  });
});

describe("CheckFlow — der Sauerstoffschritt (§5.12, Uebergabe Teil 3 Punkt 4)", () => {
  const O2 = (over: Partial<CheckFlasche>): CheckFlasche => ({ ...FLASCHE, ...over });
  /**
   * Der Ampelkreis der ersten Flaschenzeile. Er traegt keine `data-rolle` — der
   * Klassen-Teilstring ist der stabile Zugriff, weil ein CSS-Modul unter Vitest
   * ein Proxy ist, der `_pruefKreis_ef45c4`-artige Namen liefert
   * (`HelferChip.tsx:22-28`). `pruefKreisOk` ist KEIN Teilstring von
   * `pruefKreis` oder `pruefKreisFehl`, die Abgleiche unten sind also trennscharf.
   */
  const kreis = () => queryAll("[data-rolle='o2-liste'] [class*='pruefKreis']")[0]!;

  it("OHNE Nennfuelldruck ist der Fuellstand NICHT BEWERTBAR, nicht „niedrig\"", async () => {
    // ⚠️ Befund 30: ohne diesen Test bliebe ein nacktes `o2Status(...)` gruen —
    // 0 bar Nennfuelldruck ergaeben 0 %, Ampel rot, und die Helferin liefe los,
    // um eine VOLLE Flasche zu tauschen.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[O2({ nennfuelldruckBar: 0 })]}
        verfall={{}}
        warn={WARN}
      />,
    );
    const t = query("[data-rolle='o2-liste']").textContent ?? "";
    expect(t).toContain("Nennfülldruck nicht hinterlegt");
    expect(t).toContain("nicht bewertbar");
    expect(t).not.toContain("niedrig");
    expect(t).not.toContain("%");

    // ⚠️ UND DER PRUEFKREIS DARF DABEI NICHT GRUEN SEIN (Review-Befund 3).
    // `.pruefKreisOk` ist eine GEFUELLTE GRUENE Flaeche
    // (`helfer.module.css:275`, `background: var(--lb-ampel-ok-text)`). Ein
    // zweiwertiges `st?.niedrig ? Fehl : Ok` faellt im Null-Fall darauf zurueck,
    // und die Zeile saegte gleichzeitig „geprueft und in Ordnung" (Farbe) und
    // „nicht bewertbar" (Text). `HelferChip.tsx:29-31`: „⚠️ `grau` IST KEIN
    // AMPELWERT … und darf NIE als gruen dargestellt werden." Der Kreis ist der
    // einzige Marker, der beim Scrollen OHNE Lesen wirkt — die Zusicherungen
    // oben pruefen nur `textContent` und sehen die Klasse nicht.
    expect(kreis().className).not.toMatch(/pruefKreisOk/);
    expect(kreis().className).not.toMatch(/pruefKreisFehl/);
    // Der nackte `.pruefKreis` bleibt — er ist die neutrale dritte Stufe
    // (`background: var(--lb-karte)`, grauer Rand), nicht das Weglassen.
    expect(kreis().className).toMatch(/pruefKreis/);
  });

  it("MIT Nennfuelldruck steht der Prozentwert da", async () => {
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[O2({ nennfuelldruckBar: 200 })]}
        verfall={{}}
        warn={WARN}
      />,
    );
    const t = query("[data-rolle='o2-liste']").textContent ?? "";
    expect(t).toContain("100%");
    expect(t).not.toContain("nicht bewertbar");

    // Die GEGENSEITE zu Befund 3, und ohne sie traegt der Fix nicht: ein
    // ersatzlos gestrichenes `s.pruefKreisOk` liesse die Nicht-bewertbar-Zusage
    // oben gruen. Erst beide Seiten nageln die Dreiwertigkeit fest — eine
    // beurteilte, volle Flasche IST gruen.
    expect(kreis().className).toMatch(/pruefKreisOk/);
  });

  it("`letzterDruck` wird angezeigt — und der Null-Fall als „noch nicht gemessen\"", async () => {
    // Uebergabe Teil 3, Punkt 4: `druckBar` ist seit Teil 3 nullbar, weil eine
    // FEHLENDE Messung vorher als „0 bar" gelesen wurde → Ampel rot →
    // Fehlalarm. „Nennfuelldruck nicht hinterlegt" ist eine ANDERE Aussage
    // (kein Sollwert vs. keine Messung) und ersetzt sie nicht.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[
          O2({ id: "o-1", name: "O2 klein", nennfuelldruckBar: 200, letzterDruck: 190 }),
          O2({ id: "o-2", name: "O2 groß", nennfuelldruckBar: 300, letzterDruck: null }),
        ]}
        verfall={{}}
        warn={WARN}
      />,
    );
    const t = query("[data-rolle='o2-liste']").textContent ?? "";
    expect(t).toContain("zuletzt gemessen: 190 bar");
    expect(t).toContain("noch nicht gemessen");
  });

  it("die Vorbelegung ist der NENNFUELLDRUCK, nicht der letzte Messwert", async () => {
    // „voll annehmen, Abgelesenes runterstellen" (:136-137, :384). Der letzte
    // Messwert (190) wird ANGEZEIGT, aber er ist kein Default: sonst
    // schriebe ein Check den vorigen Wert fort, ohne dass jemand hinsieht.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[O2({ nennfuelldruckBar: 200, letzterDruck: 190 })]}
        verfall={{}}
        warn={WARN}
      />,
    );
    expect(query<HTMLInputElement>("input[aria-label='Druck O2 klein']").value).toBe("200");
  });
});

describe("CheckFlow — der Abschluss und seine Rueckmeldung (§7.9.4)", () => {
  it("sendet die Nutzlast und zeigt die Kennzahlen", async () => {
    // ⚠️ Befund 28: der Plan montiert hier mit `soll={[]}` und erwartet den
    // Chip „3 aus Handlager geholt" — den derselbe Task hinter `hatArtikel`
    // unterdrueckt. Die Fixture bekommt deshalb eine Position; der Commit liegt
    // damit im Geraeteschritt und wird ueber zwei „Weiter" erreicht.
    abschluss.mockResolvedValue({
      ok: true,
      wert: {
        checkId: "c1",
        nachgefuellt: 3,
        nachfuellBestaetigt: 3,
        offen: 2,
        geraeteAuffaellig: 1,
        flaschenAuffaellig: 1,
        flaschenNichtBewertbar: 0,
        verfallAuffaellig: 2,
      },
    });
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(WEITER);
    await click(WEITER);
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-ergebnis']").textContent ?? "";
    expect(t).toContain("3 aus Handlager geholt");
    expect(t).toContain("2 fehlt weiterhin");
    expect(t).toContain("1 Gerät(e) auffällig");
    expect(t).toContain("1 Flasche(n) niedrig");
    expect(t).toContain("2 laufen ab");
    // Gegenprobe zum Satz unten: gebucht === bestaetigt sagt NICHTS.
    expect(t).not.toContain("konnten nur");
  });

  it("ohne Artikel nennt die Karte KEINE Handlager-Zahl", async () => {
    // Die Gegenseite von `hatArtikel`: ein Chip „0 aus Handlager geholt" waere
    // eine Aussage ueber Arbeit, die nie stattgefunden hat.
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-ergebnis']").textContent ?? "";
    expect(t).not.toContain("aus Handlager geholt");
    expect(t).toContain("Alles in Ordnung");
  });

  it("sagt AUSDRUECKLICH, wenn weniger gebucht wurde als bestaetigt (NEU)", async () => {
    // `umlagerung` kappt still an der Verfuegbarkeit, und der Helfer hat die
    // Teile IN DER HAND. Ohne den Satz legt er sie ins Fahrzeug und das Journal
    // weiss es nicht.
    abschluss.mockResolvedValue({
      ok: true,
      wert: {
        checkId: "c1",
        nachgefuellt: 2,
        nachfuellBestaetigt: 5,
        offen: 3,
        geraeteAuffaellig: 0,
        flaschenAuffaellig: 0,
        flaschenNichtBewertbar: 0,
        verfallAuffaellig: 0,
      },
    });
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    expect(query("[data-rolle='check-ergebnis']").textContent).toContain(
      "Von 5 bestätigten Teilen konnten nur 2 gebucht werden.",
    );
  });

  it("nennt nicht bewertbare Flaschen (NEU, §5.12)", async () => {
    abschluss.mockResolvedValue({
      ok: true,
      wert: { ...WERT_NULL, flaschenNichtBewertbar: 2 },
    });
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-ergebnis']").textContent ?? "";
    expect(t).toContain("2 Flasche(n) nicht bewertbar");
    // „nicht bewertbar" ist NICHT „alles in Ordnung".
    expect(t).not.toContain("Alles in Ordnung");
  });

  it("bietet ZWEI Links statt eines Zustandsresets (§7.9.1)", async () => {
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    expect(query<HTMLAnchorElement>("[data-rolle='nochmal']").getAttribute("href")).toBe(
      "/helfer/check?fz=fz-1",
    );
    expect(query<HTMLAnchorElement>("[data-rolle='anderes']").getAttribute("href")).toBe(
      "/helfer/check",
    );
  });

  it("kodiert die Fahrzeug-ID im „Nochmal\"-Link (Befund 31)", async () => {
    // T80 baut dieselbe URL mit `encodeURIComponent` und begruendet das damit,
    // dass ein importierter Alt-Bestand andere IDs tragen kann; ein rohes
    // `?fz=a b` erzeugt eine kaputte URL. Beide Tasks laufen in derselben
    // Welle und erzeugen dieselbe URL-Form.
    await mount(
      <CheckFlow
        fahrzeug={{ id: "fz 1/a", name: "RTW 1", kennung: null }}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    // Literal ausgeschrieben, NICHT aus `encodeURIComponent` gebaut: eine
    // Zusicherung gegen die eigene Rechnung kann konstruktiv nie fehlschlagen.
    expect(query<HTMLAnchorElement>("[data-rolle='nochmal']").getAttribute("href")).toBe(
      "/helfer/check?fz=fz%201%2Fa",
    );
  });
});

/**
 * Der volle Vier-Schritte-Durchlauf, der ALLE SECHS Client-Zustaende von ihrer
 * Vorbelegung wegbewegt (Befund 34). Beide Fehlerwege benutzen ihn — der
 * `sitzung`-Weg prueft den FRUEHEN RETURN aus `!r.ok`, der Netz-Weg den
 * `catch`. Ohne beide traege nur einer der zwei Zweige die Zusage.
 */
const VOLLES_FAHRZEUG = (
  <CheckFlow
    fahrzeug={FZ}
    soll={[POS({ soll: 5 })]}
    geraete={[GERAET]}
    flaschen={[FLASCHE]}
    verfall={{}}
    warn={WARN}
  />
);

async function alleSechsSetzen(): Promise<void> {
  await mount(VOLLES_FAHRZEUG);
  for (let i = 0; i < 2; i++) await minus(0); // 1 `ist` = 3
  await fill("[data-rolle='zaehlliste'] input[type='month']", "2027-03"); // 2 `verfallState`
  await click(WEITER); // 3 `nachfuell` = 2 (greedy)
  await click(WEITER);
  await click("[data-rolle='geraet-fehlt']"); // 4 `geraeteState`
  await click(WEITER);
  await minus(0); // 5 `druck` = 199
  // 6 `phase` steht auf „sauerstoff".
}

async function pruefeAlleSechs(): Promise<void> {
  // 6 — die Phase: der Sauerstoffschritt steht noch, es wurde nicht auf
  // „zaehlen" zurueckgesprungen.
  expect(exists("[data-rolle='o2-liste']")).toBe(true);
  // 5 — der abgelesene Druck.
  expect(query<HTMLInputElement>("input[aria-label='Druck O2 klein']").value).toBe("199");
  await click(ZURUECK);
  // 4 — das als fehlend markierte Geraet.
  expect(query("[data-rolle='geraet-fehlt']").getAttribute("aria-pressed")).toBe("true");
  await click(ZURUECK);
  // 3 — die geholte Menge.
  expect(query("[data-rolle='nf-liste'] [data-rolle='stepanzeige']").textContent).toBe("2");
  await click(ZURUECK);
  // 1 — die gezaehlte Menge.
  expect(query("[data-rolle='zaehlliste'] [data-rolle='stepanzeige']").textContent).toBe("3");
  // 2 — der gemeldete Verfall, im Feld UND im Chip.
  expect(
    query<HTMLInputElement>("[data-rolle='zaehlliste'] input[type='month']").value,
  ).toBe("2027-03");
  const chips = queryAll("[data-rolle='zaehlliste'] [data-rolle='helfer-chip']").map(
    (e) => e.textContent ?? "",
  );
  expect(chips.length).toBeGreaterThanOrEqual(2);
  expect(chips.some((t) => t.includes("03/27"))).toBe(true);
}

describe("CheckFlow — die Inline-Erneuerung (§7.4.4)", () => {
  it("`grund:\"sitzung\"` zeigt das Feld UND haelt ALLE SECHS Zustaende", async () => {
    abschluss.mockResolvedValue({
      ok: false,
      grund: "sitzung",
      text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
    });
    await alleSechsSetzen();
    await click(ABSCHLIESSEN);
    expect(exists("[data-rolle='erneuern']")).toBe(true);
    await pruefeAlleSechs();
  });

  it("`grund:\"gesperrt\"` zeigt das Feld NICHT", async () => {
    // Ein erneutes Einloesen desselben Codes scheitert genauso, und ein Feld
    // anzubieten, das nicht helfen kann, ist schlimmer als keins.
    abschluss.mockResolvedValue({
      ok: false,
      grund: "gesperrt",
      text: "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
    });
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    expect(exists("[data-rolle='erneuern']")).toBe(false);
    expect(query("[data-rolle='check-fehler']").textContent).toContain("gesperrt");
  });

  it("`grund:\"eingabe\"` zeigt den Text, aber KEIN Erneuerungsfeld (B4)", async () => {
    // Betreiberentscheidung B4 vom 06.08.2026: der fuenfte Grund. Eine
    // unvollstaendige Nutzlast wird nicht dadurch vollstaendig, dass jemand die
    // Sitzung erneuert — `darfErneuern("eingabe")` ist false. Dieser Test ist
    // der einzige, der ein naives `grund !== "gesperrt" && grund !== "netz"`
    // von `darfErneuern` unterscheidet.
    abschluss.mockResolvedValue({
      ok: false,
      grund: "eingabe",
      text: "Die Angaben waren unvollständig. Bitte die Seite neu laden und erneut zählen.",
    });
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    expect(query("[data-rolle='check-fehler']").textContent).toContain("unvollständig");
    expect(exists("[data-rolle='erneuern']")).toBe(false);
  });

  it("nach erfolgreicher Erneuerung verschwindet das Feld und der Knopf steht wieder", async () => {
    abschluss.mockResolvedValue({ ok: false, grund: "sitzung", text: "abgelaufen" });
    erneuere.mockResolvedValue({ ok: true, wert: null });
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    await fill("[data-rolle='erneuern-code']", "482-137");
    await click("[data-rolle='erneuern-weiter']");
    expect(erneuere).toHaveBeenCalledWith("482-137");
    expect(exists("[data-rolle='erneuern']")).toBe(false);
    expect(exists(ABSCHLIESSEN)).toBe(true);
  });

  it("eine gescheiterte Erneuerung zeigt ihren Text und LAESST das Feld stehen", async () => {
    abschluss.mockResolvedValue({ ok: false, grund: "sitzung", text: "abgelaufen" });
    erneuere.mockResolvedValue({
      ok: false,
      grund: "gesperrt",
      text: "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
    });
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    await fill("[data-rolle='erneuern-code']", "000-000");
    await click("[data-rolle='erneuern-weiter']");
    expect(exists("[data-rolle='erneuern']")).toBe(true);
    expect(query("[data-rolle='erneuern-fehler']").textContent).toContain("unbekannt");
  });

  it("eine geworfene Erneuerung zeigt den Netztext, NICHT `e.message`", async () => {
    abschluss.mockResolvedValue({ ok: false, grund: "sitzung", text: "abgelaufen" });
    erneuere.mockRejectedValue(new Error("fetch failed"));
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    await fill("[data-rolle='erneuern-code']", "482-137");
    await click("[data-rolle='erneuern-weiter']");
    const t = query("[data-rolle='erneuern-fehler']").textContent ?? "";
    expect(t).toContain("Keine Verbindung");
    expect(t).not.toContain("fetch failed");
  });
});

describe("CheckFlow — Netz (Falle 62, Falle 66)", () => {
  it("ein geworfener Fehler zeigt den deutschen Netztext, NICHT `e.message`", async () => {
    // `CheckFlow.tsx:158-159` faengt zwar, zeigt aber `e.message` — in
    // Produktion der englische Server-Components-Satz mit `digest`.
    abschluss.mockRejectedValue(new Error("fetch failed"));
    await mount(
      <CheckFlow
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
      />,
    );
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-fehler']").textContent ?? "";
    expect(t).toBe(
      "Keine Verbindung. Der Check wurde nicht gespeichert — nichts ist verloren, " +
        "bitte erneut auf Abschließen tippen.",
    );
    expect(t).not.toContain("fetch failed");
    // `"netz"` erlaubt keine Erneuerung — die Sitzung ist ja in Ordnung.
    expect(exists("[data-rolle='erneuern']")).toBe(false);
  });

  it("ALLE SECHS Client-Zustaende bleiben stehen", async () => {
    // Die tragende Zusage von §7.4.4 und §7.10.3: eine abgebrochene Verbindung
    // darf eine halbe Stunde Zaehlarbeit nicht loeschen. ⚠️ Befund 34: der Plan
    // sichert hier genau EINEN der sechs zu.
    abschluss.mockRejectedValue(new Error("offline"));
    await alleSechsSetzen();
    await click(ABSCHLIESSEN);
    expect(query("[data-rolle='check-fehler']").textContent).toContain("Keine Verbindung");
    await pruefeAlleSechs();
  });
});

describe("CheckFlow — Bauform", () => {
  it("kennt genau EIN Fahrzeug — keine Woerterbuecher, keine `preselect`-Prop", () => {
    // §7.9.1: heute wandert die Soll-Bestueckung der GESAMTEN Organisation in
    // den RSC-Payload — auf ein privates Telefon, in einer Sitzung ohne Konto.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/preselect|Record<string, Pos\[\]>|fahrzeuge:/);
    expect(q).toMatch(/fahrzeug: \{ id: string/);
  });

  it("baut die Nutzlast NICHT selbst, sondern ueber `checkNutzlast` (Teil 3, T43)", () => {
    // Die FACHLICHKEIT haelt der Nutzlast-Test oben; dieser Scan haelt nur,
    // dass die Berechnung nicht ein zweites Mal hier entsteht.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/from "\.\.\/_lib\/checkNutzlast"/);
    expect(q).toMatch(/checkNutzlast\(/);
  });

  it("benutzt KEIN `router.push` und KEIN `usePathname`", () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/router\.(push|replace)|usePathname|useSearchParams/);
  });

  it("ist eine Client-Insel ohne antd und ohne `--ant-*`", () => {
    const roh = readFileSync(QUELLE, "utf8");
    const q = ohneKommentare(roh);
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
    // Eine nicht aufloesbare CSS-Variable ist gueltiges CSS und faellt still auf
    // `transparent` zurueck — deshalb auch im ROHtext keine Ausnahme.
    expect(roh).not.toContain("--ant-");
  });
});
