// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, onTestFinished, vi } from "vitest";
import { vergissFluechtig } from "@/core/entwurf/ablage";
import { readFileSync } from "node:fs";
import { act } from "react";
import {
  mount,
  unmount,
  query,
  queryAll,
  exists,
  click,
  clickElement,
  fill,
  fillElement,
} from "@/app/m/qr/_lib/test-dom";

const abschluss = vi.fn();
vi.mock("../_actions/check", () => ({ checkAbschluss: (...a: unknown[]) => abschluss(...a) }));
const erneuere = vi.fn();
vi.mock("../_actions/sitzung", () => ({ erneuereSitzung: (...a: unknown[]) => erneuere(...a) }));

import {
  CheckFlow, type CheckPos, type CheckGeraet, type CheckFlasche, type CheckPlombe,
} from "./CheckFlow";

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
  const escaped = selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const treffer = [...CSS.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
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

const FZ = {
  id: "fz-1", name: "RTW 1", kennung: "HH-DR 1234",
  einheitenart: "fahrzeug" as const,
};

/** DRK-309: dieselbe Strecke, nur fuer eine TASCHE. */
const TASCHE = {
  id: "ta-1", name: "Sanitätstasche 1", kennung: null,
  einheitenart: "tasche" as const,
};

/** DRK-309: der Zwischenstand aus Migration 0010 — Art noch nicht zugeordnet. */
const OHNE_ART = {
  id: "ohne-1", name: "Rucksack Betreuung", kennung: null,
  einheitenart: null,
};
const WARN = { rotTage: 31, gelbTage: 56 };

const POS = (over: Partial<CheckPos> = {}): CheckPos => ({
  id: "sp-1",
  fachLabel: "Fach 1",
  artikelId: "art-1",
  artikelName: "Kompresse",
  einheit: "Stk",
  handlagerFach: "A-01",
  soll: 5,
  sollMax: null,
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
  wechselAbProzent: 25,
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
const plus = (n: number) => clickElement(queryAll("button[aria-label$='erhöhen']")[n]);

/**
 * Bestaetigt JEDE Zeile der Zaehlliste mit einem „−" und loest damit den Riegel
 * aus DRK-304 (unberuehrte Position sperrt „Weiter"). Der Wert bleibt 0 — das
 * ist fuer jeden Test gedacht, dem die gezaehlte MENGE gleichgueltig ist und der
 * nur an den Schritt dahinter will.
 */
const alleBestaetigen = async () => {
  for (const el of queryAll("[data-rolle='zaehlliste'] button[aria-label$='verringern']")) {
    await clickElement(el);
  }
};

/**
 * IDA-377: Geraete starten UNBEANTWORTET und sperren den Schritt. Fuer jeden
 * Test, der nur durch den Geraeteschritt will: ein Tipp auf „Alle in Ordnung"
 * — derselbe bewusste Tipp wie bei der Helferin.
 */
const alleGeraeteOk = () => click("[data-rolle='geraete-alle-ok']");

/** IDA-377: der Druck startet LEER — jede Flasche der Liste wird abgelesen. */
const druckAblesen = async (wert: number) => {
  for (const el of queryAll<HTMLInputElement>("[data-rolle='o2-liste'] input[type='text']")) {
    await fillElement(el, String(wert));
  }
};

/** IDA-377: das „geholt"-Feld ist tippbar; die Menge steht im `input`, nicht mehr in `stepanzeige`. */
const NF_FELD = "[data-rolle='nf-liste'] input[type='text']";
const geholt = () => queryAll<HTMLInputElement>(NF_FELD).map((e) => e.value);

/**
 * Die Zahlenfelder der Zaehlliste — seit IDA-233 tippbar. `type='text'` und
 * NICHT `inputmode`: das Verfallsfeld traegt ebenfalls `inputMode="numeric"`
 * (Rueckfall fuer Browser ohne Monatsauswahl) und liegt im selben Teilbaum.
 */
const ZAHLFELD = "[data-rolle='zaehlliste'] input[type='text']";
const zahlfelder = () => queryAll<HTMLInputElement>(ZAHLFELD);
const gesperrt = () => query(WEITER).getAttribute("aria-disabled") === "true";

/**
 * Klappt JEDES Verfallsfeld der Zaehlliste auf. Seit IDA-233 liegt es hinter
 * dem Knopf „Verfall angeben" bzw. dem Ampelchip; Tests, die das Feld selbst
 * fuellen oder lesen, muessen es erst oeffnen wie die Helferin auch.
 */
const verfallAufklappen = async () => {
  for (const el of queryAll("[data-rolle='verfall-knopf'][aria-expanded='false']")) {
    await clickElement(el);
  }
};

/** Enter im Feld, im `act` des Harness (React spuelt sonst nicht aus). */
const enter = async (el: HTMLElement) => {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
};

/** Verlaesst ein Feld so, wie React es sieht (`onBlur` = natives `focusout`). */
const verlassen = async (el: HTMLElement) => {
  await act(async () => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
};

const WERT_NULL = {
  checkId: "c1",
  nachgefuellt: 0,
  nachfuellBestaetigt: 0,
  inBox: 0,
  offen: 0,
  geraeteAuffaellig: 0,
  // IDA-377: wie viele davon der Check selbst als Mangel angelegt hat.
  geraeteGemeldet: 0,
  flaschenAuffaellig: 0,
  flaschenNichtBewertbar: 0,
  verfallAuffaellig: 0,
  plombenOffen: 0,
  plombenGesetzt: 0,
};

/** IDA-222: die Faelle hier sind Vollchecks ohne Plomben — wie jeder Check davor. */
const VOLL: {
  art: "voll"; stichprobe: null; versiegelt: Record<string, string[]>; plomben: CheckPlombe[];
  entnahmebox: { name: string } | null;
} = { art: "voll", stichprobe: null, versiegelt: {}, plomben: [], entnahmebox: null };

beforeEach(() => {
  // IDA-358: der Check legt seinen Stand auf dem Geraet ab — jeder Fall beginnt leer.
  localStorage.clear();
  vergissFluechtig();
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(queryAll("[data-rolle='schritt']").map((e) => e.textContent?.trim())).toEqual([
      "1 Geräte",
      "2 Sauerstoff",
    ]);
  });

  it("Fahrzeug OHNE ALLES zeigt den LeerZustand — mit benanntem Rueckweg", async () => {
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ} soll={[]} geraete={[]} flaschen={[]} verfall={{}} warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(exists("[data-rolle='leer-titel']")).toBe(true);
    expect(query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href")).toBe(
      "/helfer/check",
    );
  });

  it("Fahrzeug ohne alles, keine andere Einheit: der Rueckweg fuehrt zur Entnahme", async () => {
    /*
     * DRK-302, DRK-376. `weg` ist Pflicht-Prop (§11.7) — es gibt also keinen
     * Ausgang „kein Weg". Gibt die Wahl dieselbe Einheit zurueck (gebundenes
     * Kaertchen ODER genau eine aktive Einheit), fuehrte „Andere Einheit" in
     * eine Wahl, die die Check-Seite sofort wieder auf DIESE Einheit aufloest:
     * ein Knopf, der sichtbar nichts tut — und hier die einzige Handlung des
     * Schirms. Die Entnahme ist der Ort, an dem es fuer diese Sitzung wirklich
     * weitergeht.
     *
     * ⚠️ WELCHER DER BEIDEN GRUENDE GILT, SIEHT DIESE INSEL NICHT und soll sie
     * nicht sehen: die Rechnung gehoert der Seite (`helfer/check/page.tsx`),
     * die beide Gruende kennt, ohne dem Flow mehr in den Payload zu legen, als
     * er zeigt. Geprueft wird sie in `helfer/check/page.test.tsx`.
     */
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ} soll={[]} geraete={[]} flaschen={[]} verfall={{}} warn={WARN}
        andereEinheitErreichbar={false}
        letzterCheckText={null}
      />,
    );
    expect(query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href")).toBe(
      "/helfer",
    );
  });

  it("der Commit sitzt im LETZTEN Schritt — und NUR dort", async () => {
    // Zwei Seiten, sonst traegt die Zusicherung `istLetzter` nicht: mit einem
    // fest verdrahteten `true` bliebe die erste Haelfte gruen, mit `false` die
    // zweite.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    // Geraete ist hier NICHT der letzte Schritt.
    expect(exists(ABSCHLIESSEN)).toBe(false);
    expect(exists(WEITER)).toBe(true);
    await alleGeraeteOk(); // IDA-377: unbeantwortet sperrt „Weiter"
    await click(WEITER);
    // Sauerstoff IST der letzte.
    expect(exists(ABSCHLIESSEN)).toBe(true);
    expect(exists(WEITER)).toBe(false);
  });
});

describe("CheckFlow — der Zaehlschritt", () => {
  it("jede Position startet UNGEZAEHLT — weder auf Soll noch auf dem Fahrzeugbestand (DRK-304)", async () => {
    /*
     * DIE UMKEHR VON „voll annehmen, Gezaehltes runterkorrigieren" (DRK-304).
     * Die alte Vorbelegung WAR die Aktion „Alles auf Soll": wer durchklickte,
     * bezeugte einen vollen Wagen, ohne ein Fach gesehen zu haben.
     *
     * Soll (7) und Fahrzeugbestand (5) sind hier VERSCHIEDEN und beide nicht 0
     * — sonst bliebe die Zeile auch dann gruen, wenn eine der beiden alten
     * Vorbelegungen zurueckkaeme.
     *
     * ⚠️ SEIT IDA-233 STEHT IM FELD NICHTS, NICHT „0". Das Feld ist tippbar,
     * und eine sichtbare 0 darin saehe aus wie eine Aussage. Gerechnet wird
     * weiter ab 0: das erste „+" ergibt 1, das erste „−" die gezaehlte 0.
     */
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS({ soll: 7, fahrzeugBestand: 5 })]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(zahlfelder()[0].value).toBe("");
    expect(query("[data-rolle='zaehlliste']").textContent).toContain("nicht gezählt");
    await minus(0);
    expect(zahlfelder()[0].value).toBe("0");
  });

  it("eine unberuehrte Position sperrt „Weiter\" — und zaehlt sich im Text mit", async () => {
    /*
     * DER RIEGEL, OHNE DEN DRK-304 EIN DATENVERLUSTPFAD WAERE. Mit 0 als
     * Startwert ist „durchklicken" nicht mehr harmlos: `check.ts` rechnet aus
     * der Summe der gezaehlten Ist je Artikel eine Korrekturbuchung auf den
     * Fahrzeugbestand — in ein Journal ohne UPDATE und ohne DELETE. Das Ticket
     * verbietet genau das („keine automatische Deutung von 0 als bestaetigter
     * Leerbestand").
     *
     * Zwei Positionen, damit die Zahl im Text etwas aussagt: mit einer einzigen
     * bliebe „1 von 1" auch dann gruen, wenn gar nicht gezaehlt wuerde.
     */
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ id: "sp-1" }), POS({ id: "sp-2", fachLabel: "Fach 2" })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(gesperrt()).toBe(true);
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("2 von 2");

    // Die ERSTE Position hochgezaehlt — der Riegel haelt weiter, die Zahl faellt.
    await plus(0);
    expect(gesperrt()).toBe(true);
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("1 von 2");

    /*
     * Die ZWEITE mit „−" bestaetigt. Das ist der Weg fuer ein WIRKLICH leeres
     * Fach: der Stepper ruft `setWert` auch dann, wenn er bei `min` schon
     * steht (`Stepper.tsx`) — die 0 wird dadurch eine Aussage statt einer
     * Vorbelegung. Ohne diesen Weg gaebe es fuer ein leeres Fach keinen
     * Ausgang aus dem Riegel.
     */
    await minus(1);
    expect(zahlfelder().map((f) => f.value)).toEqual(["1", "0"]);
    expect(gesperrt()).toBe(false);
  });

  it("der gesperrte Weiter-Knopf FUEHRT zur ersten offenen Zeile, statt nichts zu tun (IDA-233)", async () => {
    /*
     * Vorher nahm ein natives `disabled` den Tipp schweigend entgegen; wer am
     * Ende einer langen Liste stand, erfuhr nicht, WELCHE Zeile fehlt. Jetzt
     * springt derselbe Tipp dorthin — und bleibt dabei im Zaehlschritt: das
     * ist die Haelfte, ohne die der Riegel aus DRK-304 still gefallen waere.
     *
     * Die erste offene ist hier die ZWEITE Zeile, nicht die erste — sonst
     * bliebe der Test gruen, wenn der Knopf blind auf die erste Zeile zeigte.
     */
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ id: "sp-1" }), POS({ id: "sp-2", fachLabel: "Fach 2", artikelId: "art-2" })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await plus(0);
    await click(WEITER);
    expect(exists("[data-rolle='zaehlliste']"), "der Riegel muss halten").toBe(true);
    expect(exists("[data-rolle='nf-liste']")).toBe(false);
    expect(document.activeElement).toBe(zahlfelder()[1]);
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("erste offene Zeile");
  });

  it("der Riegel steht in `zurNachfuellung` SELBST, nicht nur am Knopf (DRK-304)", () => {
    /*
     * Das `disabled` sichert genau EINEN Pfad. Ein zweiter — eine Enter-Taste,
     * ein Kuerzel, ein spaeter angehaengter „ueberspringen"-Weg — umginge ihn,
     * ohne dass ein Tor etwas meldet: `zurNachfuellung` rechnet mit `istWert(p)`
     * und saehe jede unberuehrte Position als volle Luecke. Der Wechsel in den
     * Nachfuellschritt muss deshalb an der FUNKTION scheitern, nicht am Knopf.
     *
     * ⚠️ WARUM EIN QUELLTEXT-SCAN UND KEIN DOM-TEST. Der naheliegende Weg waere,
     * das Attribut im Test zu entfernen und dann zu klicken. DAS MISST NICHTS,
     * und zwar gemessen, nicht vermutet: React filtert Maus-Ereignisse anhand
     * seiner EIGENEN Props, nicht anhand des DOM
     * (`react-dom-client.development.js:3292`, `props.disabled` in der
     * `onClick`-Verzweigung). Nach `el.disabled = false` steht das Attribut auf
     * `null`, der Klick wird zugestellt — und der Handler laeuft trotzdem nicht.
     * Ein so gebauter Test ist gruen, OB DER WAECHTER DA IST ODER NICHT
     * (nachgestellt: mit entferntem `if` blieben alle 52 Tests gruen).
     *
     * Der Scan prueft die ERSTE Anweisung der Funktion — ein Waechter weiter
     * unten liesse die greedy Rechnung schon laufen.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle).toMatch(/const zurNachfuellung = \(\) => \{\s*if \(ungezaehlt > 0\) return;/);
  });

  it("eine noch nicht gezaehlte Zeile sagt das — und auch gezaehlt nennt sie keine Luecke", async () => {
    /*
     * Die Luecke einer unberuehrten Position ist UNBEKANNT, nicht „voll".
     * Seit IDA-219 nennt der Zaehlschritt sie auch NACH dem Zaehlen nicht:
     * gezaehlt wird blind, die Luecke steht erst im Schritt „Nachfuellen".
     */
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS({ soll: 5 })]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(query("[data-rolle='zaehlliste']").textContent).toContain("nicht gezählt");
    expect(query("[data-rolle='zaehlliste']").textContent).not.toContain("nachfüllen");

    await minus(0);
    expect(query("[data-rolle='zaehlliste']").textContent).not.toContain("nicht gezählt");
    expect(query("[data-rolle='zaehlliste']").textContent).not.toContain("nachfüllen");
  });

  it("der gesperrte Weiter-Knopf SIEHT gesperrt aus (DRK-304)", async () => {
    /*
     * Ein Riegel, den man nicht sieht, ist keiner: `.knopf[disabled]` erreicht
     * `.abschlussGo` nicht (andere Klasse), und der Button-Reset gibt ihr
     * `cursor: pointer`. Ohne eigene Regel trug der gesperrte Knopf das volle
     * Rot der Primaeraktion, nahm den Tipp entgegen und tat nichts — bei JEDEM
     * frisch geoeffneten Check.
     *
     * ⚠️ DIE REGEL WIRD GELESEN, NICHT DAS AUSSEHEN (jsdom rechnet kein CSS),
     * und BEIDE Haelften muessen stehen: das gerenderte `disabled` am richtigen
     * Knopf UND die Deklaration, die daran haengt. Je allein waere gruen,
     * waehrend die andere fehlt.
     */
    const gesperrtRegel = regeln(".abschlussGo[disabled]");
    expect(gesperrtRegel.get("opacity")).toBe(".45");
    expect(gesperrtRegel.get("cursor")).toBe("default");
    // Dieselbe Sprache wie beim etablierten Knopf — nicht zufaellig dieselbe Zahl.
    expect(gesperrtRegel).toEqual(regeln(".knopf[disabled]"));
    /*
     * SEIT IDA-233 traegt der Zaehlschritt `aria-disabled` statt `disabled`
     * (sein Tipp fuehrt zur offenen Zeile). Dasselbe Aussehen, eigene Regel —
     * ohne sie stuende der gesperrte Knopf wieder in vollem Rot da.
     */
    expect(regeln('.abschlussGo[aria-disabled="true"]').get("opacity")).toBe(
      gesperrtRegel.get("opacity"),
    );

    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const weiter = query<HTMLButtonElement>(WEITER);
    expect(gesperrt()).toBe(true);
    expect(weiter.className).toMatch(/abschlussGo/);

    // Und wieder frei, sobald gezaehlt ist — sonst bewiese der Test nur, dass
    // der Knopf IMMER gesperrt ist.
    await minus(0);
    expect(query(WEITER).hasAttribute("aria-disabled")).toBe(false);
  });

  it("der Weiter-Knopf des Zaehlschritts SCHWEBT NICHT mehr (DRK-304)", async () => {
    /*
     * ⚠️ DIE REGEL WIRD GELESEN, NICHT DAS AUSSEHEN — jsdom rechnet keine
     * Layoutboxen (Fallen 13/14/16), ein `position: sticky` ist dort von
     * `static` nicht zu unterscheiden. Derselbe Griff wie beim Knappheitssatz
     * weiter unten: das gerenderte Klassenpaar UND die Deklaration aus dem
     * Stylesheet.
     *
     * `.abschluss.abschlussRuhend` und nicht zwei einzelne Klassen: bei
     * Gleichstand entschiede die Reihenfolge im Stylesheet, und die ist keine
     * Zusage (Falle 5).
     */
    expect(regeln(".abschluss").get("position")).toBe("sticky");
    expect(regeln(".abschluss.abschlussRuhend").get("position")).toBe("static");

    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    // Der Zaehlschritt: die Leiste steht am Listenende.
    expect(query(WEITER).closest("[data-rolle='abschlussleiste']")!.className).toMatch(
      /abschlussRuhend/,
    );

    // Die uebrigen Schritte behalten ihre schwebende Leiste — das Ticket
    // nennt nur den Zaehlschritt (Rueckfrage im Board gestellt).
    await plus(0);
    await click(WEITER); // → Nachfuellen
    expect(query(WEITER).closest("[data-rolle='abschlussleiste']")!.className).not.toMatch(
      /abschlussRuhend/,
    );
  });

  it("was mitfaehrt, ist der Zaehlstand — OHNE „Weiter\" (IDA-233)", async () => {
    /*
     * Die Grenze zu DRK-304: der Stand klebt unten, die Fachkoepfe oben, aber
     * nichts davon fuehrt aus dem Schritt hinaus. Ein mitfahrendes Weiter waere
     * erreichbar, BEVOR die Liste gelesen wurde. Gelesen wird die REGEL (jsdom
     * rechnet keine Layoutboxen) und das gerenderte Markup.
     */
    expect(regeln(".zaehlStand").get("position")).toBe("sticky");
    expect(regeln(".fachKopf").get("position")).toBe("sticky");
    // Ohne eigene Flaeche liefen die Zeilen sichtbar unter dem Text durch.
    expect(regeln(".fachKopf").get("background")).toBe("var(--lb-papier)");

    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[
          POS({ id: "sp-1" }),
          POS({ id: "sp-2", artikelId: "art-2" }),
          POS({ id: "sp-3", fachLabel: "Fach 2", artikelId: "art-3" }),
        ]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const stand = () => query("[data-rolle='zaehl-stand']");
    expect(stand().querySelector(WEITER)).toBeNull();
    expect(stand().textContent).toContain("0 von 3 gezählt");
    const koepfe = () => queryAll("[data-rolle='fach-kopf']").map((k) => k.textContent);
    expect(koepfe()).toEqual(["Fach 10/2", "Fach 20/1"]);

    await plus(0);
    expect(stand().textContent).toContain("1 von 3 gezählt");
    expect(koepfe()).toEqual(["Fach 11/2", "Fach 20/1"]);
  });

  it("„Nächste offene\" springt in Anzeigereihenfolge und setzt den Fokus ins Feld (IDA-233)", async () => {
    /*
     * `soll` steht hier ABSICHTLICH nicht in Anzeigereihenfolge: die Liste ist
     * Fach fuer Fach gruppiert (`zaehlFolge`), und „die erste offene" ist die,
     * die OBEN steht — nicht die erste im Prop. Mit sortiertem Prop bliebe der
     * Test gruen, wenn der Sprung der falschen Reihenfolge folgte.
     */
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[
          POS({ id: "sp-a", fachLabel: "Fach A", artikelName: "Erste" }),
          POS({ id: "sp-b", fachLabel: "Fach B", artikelId: "art-b", artikelName: "Dritte" }),
          POS({ id: "sp-c", fachLabel: "Fach A", artikelId: "art-c", artikelName: "Zweite" }),
        ]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const feld = (name: string) => query<HTMLInputElement>(`${ZAHLFELD}[aria-label='${name}']`);
    await plus(0); // „Erste" gezaehlt
    await click("[data-rolle='naechste-offene']");
    expect(document.activeElement).toBe(feld("Zweite"));

    await fill(`${ZAHLFELD}[aria-label='Zweite']`, "4");
    await click("[data-rolle='naechste-offene']");
    expect(document.activeElement).toBe(feld("Dritte"));

    // Alles gezaehlt: der Knopf fuehrt zum Abschluss, ohne „Weiter" zu heissen.
    await fill(`${ZAHLFELD}[aria-label='Dritte']`, "0");
    expect(exists("[data-rolle='naechste-offene']")).toBe(false);
    await click("[data-rolle='zum-ende']");
    expect(document.activeElement).toBe(query(WEITER));
    expect(query("[data-rolle='zum-ende']").textContent).not.toMatch(/weiter/i);
  });

  it("Enter im Zahlenfeld geht in die naechste Zeile, nach der letzten an den Abschluss", async () => {
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ id: "sp-1" }), POS({ id: "sp-2", fachLabel: "Fach 2", artikelId: "art-2" })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(zahlfelder()[0].getAttribute("enterkeyhint")).toBe("next");
    await enter(zahlfelder()[0]);
    expect(document.activeElement).toBe(zahlfelder()[1]);
    await enter(zahlfelder()[1]);
    expect(document.activeElement).toBe(query(WEITER));
    // Enter ZAEHLT nicht: beide Zeilen sind weiter offen.
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("2 von 2");
  });

  it("ein Schrittwechsel beginnt OBEN — der Scrollkasten springt zurueck (IDA-233)", async () => {
    /*
     * Gescrollt wird im Helferweg nicht das Fenster, sondern `.inhalt` des
     * Rahmens. Vorher behielt dieser Kasten beim Wechsel seine Position: wer
     * am Ende einer langen Zaehlliste „Weiter" tippte, stand mitten im
     * Nachfuellschritt. jsdom rechnet kein Layout — der Kasten bekommt hier
     * sein `overflow-y` inline und eine Inhaltshoehe von Hand.
     */
    await mount(
      <div style={{ overflowY: "auto" }} data-rolle="scroller">
        <CheckFlow
          kontoZugang={false} {...VOLL}
          fahrzeug={FZ}
          soll={[POS()]}
          geraete={[]}
          flaschen={[]}
          verfall={{}}
          warn={WARN}
          andereEinheitErreichbar
          letzterCheckText={null}
        />
      </div>,
    );
    const kasten = query("[data-rolle='scroller']");
    Object.defineProperty(kasten, "scrollHeight", { configurable: true, value: 5000 });
    kasten.scrollTop = 1200;
    await minus(0); // innerhalb des Schritts: KEIN Sprung, sonst verloere man die Zeile
    expect(kasten.scrollTop).toBe(1200);
    await click(WEITER); // → Nachfuellen
    expect(kasten.scrollTop).toBe(0);
    kasten.scrollTop = 800;
    await click(ZURUECK); // → Zaehlen
    expect(kasten.scrollTop).toBe(0);
  });

  it("die Menge ist TIPPBAR — und ein Tipp INS Feld zaehlt nicht (IDA-233)", async () => {
    /*
     * BIS IDA-233 STAND HIER `noText` („damit unterwegs am Handy nicht
     * versehentlich ins Zahlenfeld getippt wird", `Stepper.tsx`). Der Preis
     * war gemessen: 24 gefundene Teile = 24 Taps, an jeder Zeile von 0 an.
     *
     * Der Fehlgriff, gegen den `noText` schuetzte, ist jetzt am Feld selbst
     * entschaerft, und genau das sichert dieser Test: Fokus und Verlassen
     * OHNE Ziffer lassen die Zeile ungezaehlt (DRK-304) — sonst waere jeder
     * versehentliche Tipp eine stille Leerbuchung. Erst eine Ziffer, auch die
     * 0, ist eine Zaehlung.
     *
     * ⚠️ Geprueft wird ueber `type='text'`, nicht ueber `input[aria-label]`
     * (Befund 33): das Verfallsfeld traegt auch eins.
     */
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS({ soll: 30 })]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(zahlfelder()).toHaveLength(1);
    const feld = zahlfelder()[0];
    expect(feld.getAttribute("inputmode")).toBe("numeric");

    await act(async () => feld.focus());
    await verlassen(feld);
    expect(gesperrt(), "ein Tipp ins Feld ist keine Zaehlung").toBe(true);
    expect(query("[data-rolle='zaehlliste']").textContent).toContain("nicht gezählt");
    expect(feld.value).toBe("");

    // Loeschen-und-neu-tippen zaehlt ebenso wenig (Stepper: leeres Feld committet nicht).
    await fill(ZAHLFELD, "");
    expect(gesperrt()).toBe(true);

    await fill(ZAHLFELD, "24");
    expect(gesperrt()).toBe(false);
    expect(zahlfelder()[0].value).toBe("24");
    expect(query("[data-rolle='zaehlliste']").textContent).not.toContain("nicht gezählt");

    // Und `+/−` rechnen auf dem getippten Wert weiter.
    await plus(0);
    expect(zahlfelder()[0].value).toBe("25");
  });

  it("eine getippte 0 ist eine Zaehlung — der zweite Weg fuer ein leeres Fach", async () => {
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await fill(ZAHLFELD, "0");
    expect(gesperrt()).toBe(false);
    expect(zahlfelder()[0].value).toBe("0");
    // … und sie kommt als 0 an, nicht als „unangetastet": der Nachfuellschritt
    // zeigt die volle Luecke (Soll 5).
    await click(WEITER);
    expect(query("[data-rolle='nf-liste']").textContent).toContain("Lücke 5");
  });

  it("der Verfallsknopf steht in JEDER Zeile, der Wert ist einer je Artikel (IDA-305)", async () => {
    // Nur in der ersten Zeile stand er bei 215 Positionen Faecher weiter oben,
    // und in der Modultasche, in der man die Packung hielt, fehlte er.
    // Uhr fest vor 2027-03: danach zeigte der Chip „abgelaufen" statt „03/27".
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ id: "sp-1", fachLabel: "Fach 1" }), POS({ id: "sp-2", fachLabel: "Fach 2" })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    // Beide Zeilen sind da …
    expect(queryAll("[data-rolle='zaehlzeile']").length).toBe(2);
    expect(zahlfelder()).toHaveLength(2);
    // … beide tragen den Knopf, und er nennt das Fach mit.
    const knoepfe = queryAll("[data-rolle='verfall-knopf']");
    expect(knoepfe.map((k) => k.getAttribute("aria-label"))).toEqual([
      "Kompresse (Fach 1): Verfall angeben",
      "Kompresse (Fach 2): Verfall angeben",
    ]);
    // Aufklappen ist je ZEILE: der zweite Knopf oeffnet nur sein Feld.
    await clickElement(knoepfe[1]);
    expect(queryAll("[data-rolle='zaehlliste'] input[type='month']").length).toBe(1);
    expect(query("[data-rolle='verfall-hinweis']").textContent).toContain("frühestes Datum");
    const hinweis = query("[data-rolle='verfall-hinweis']");
    expect(query("[data-rolle='zaehlliste'] input[type='month']").getAttribute("aria-describedby")).toBe(hinweis.id);
    // Der Wert ist EINER je Artikel: in Fach 2 getippt, steht er auch in Fach 1.
    await fill("[data-rolle='zaehlliste'] input[type='month']", "2027-03");
    expect(knoepfe[0].getAttribute("aria-label")).toMatch(/^Kompresse \(Fach 1\): Verfall .*03\/27/);
  });

  it("das Verfallsfeld ist ZUGEKLAPPT — eine vorhandene Angabe bleibt sichtbar (IDA-233)", async () => {
    /*
     * Das Feld ist freiwillig und wird selten geaendert; offen belegte es in
     * jeder ersten Artikelzeile eine eigene 56er-Zeile. Zugeklappt darf aber
     * keine ANGABE verschwinden: der Knopf traegt dann den Ampelchip, und das
     * Aufklappen zeigt denselben Wert im Feld. Uhr fest, aus demselben Grund
     * wie im Wiederholzeilen-Test unten.
     */
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        soll={[POS(), POS({ id: "sp-2", artikelId: "art-2", artikelName: "Mullbinde" })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(exists("[data-rolle='zaehlliste'] input[type='month']")).toBe(false);
    const [mitAngabe, ohneAngabe] = queryAll("[data-rolle='verfall-knopf']");
    expect(mitAngabe.textContent).toContain("09/26");
    expect(mitAngabe.getAttribute("aria-label")).toMatch(/^Kompresse: Verfall .*09\/26/);
    expect(ohneAngabe.textContent).toBe("Verfall angeben");
    expect(ohneAngabe.getAttribute("aria-label")).toBe("Mullbinde: Verfall angeben");

    await clickElement(mitAngabe);
    expect(mitAngabe.getAttribute("aria-expanded")).toBe("true");
    const feld = query<HTMLInputElement>("[data-rolle='zaehlliste'] input[type='month']");
    expect(feld.value).toBe("2026-09");
    // Der Fokus folgt dem Aufklappen — ein zweiter Tipp ins Feld entfaellt.
    expect(document.activeElement).toBe(feld);

    // Zuklappen verwirft NICHTS: der geaenderte Wert steht danach im Chip.
    await fill("[data-rolle='zaehlliste'] input[type='month']", "2027-03");
    await clickElement(mitAngabe);
    expect(exists("[data-rolle='zaehlliste'] input[type='month']")).toBe(false);
    expect(query("[data-rolle='verfall-knopf']").textContent).toContain("03/27");
  });

  it("die Hinweiszeile bei Wiederholzeilen ist WEG — der Chip steht in JEDER Zeile", async () => {
    // Heute eine ganze Zeile fuer einen Hinweis (:290). Der Statuschip traegt
    // die Angabe bereits und ist in JEDER Zeile desselben Artikels sichtbar —
    // das ist die Bedingung, unter der der Wegfall vertretbar ist, und genau
    // sie wird hier zugesichert.
    //
    // Die Uhr steht fest vor dem Verfallsmonat 2026-09: ab Oktober 2026 zeigte
    // der Chip „abgelaufen" statt „09/26", und der Test fiel am Kalender, nicht
    // am Code. Nur `Date` wird gefälscht, antds Timer laufen weiter.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        soll={[POS({ id: "sp-1" }), POS({ id: "sp-2", fachLabel: "Fach 2" })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(query("[data-rolle='zaehlliste']").textContent).not.toContain("Verfall bei");
    const chips = queryAll("[data-rolle='zaehlliste'] [data-rolle='helfer-chip']").map(
      (e) => e.textContent ?? "",
    );
    /*
     * ZWEI Chips je Zeile seit DRK-304: der Zaehlstand und der Verfall. Die
     * Zusicherung dieses Tests ist unveraendert — der Verfallschip steht in
     * JEDER Zeile desselben Artikels, und nur deshalb darf die Hinweiszeile
     * bei Wiederholzeilen fehlen.
     *
     * ⚠️ GEZAEHLT WIRD NACH INHALT, NICHT NACH INDEX. Ein `chips[1]` haengt an
     * der Reihenfolge der JSX-Zweige: wer den Zaehlstand hinter den Verfall
     * schoebe, liesse den Test gruen auf dem falschen Chip laufen — und damit
     * genau die Aussage ungeprueft, um die es hier geht.
     */
    expect(chips).toHaveLength(4);
    expect(chips.filter((c) => c.includes("09/26"))).toHaveLength(2);
    expect(chips.filter((c) => c.includes("nicht gezählt"))).toHaveLength(2);
  });

  it("die Live-Vorschau zaehlt ablaufende Artikel mit", async () => {
    // §12.1 Punkt 1: das Feld und die Vorschau sind die EINZIGE Absicherung
    // ihrer Fachlichkeit. Die Zaehlung selbst liegt in `zaehleAblaufende`
    // (Teil 3, T43); hier wird geprueft, dass sie ANKOMMT.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2020-01" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("1 laufen ab");
  });

  it("der Zaehlschritt verraet das Soll nicht — die Luecke steht erst beim Nachfuellen (IDA-219)", async () => {
    /*
     * Wer beim Zaehlen das Soll sieht (als Zahl, als „nachfuellen N", als
     * „Ueberbestand", als Rot/Gruen am Kreis oder als „unter Soll" in der
     * Leiste), zaehlt aufs Soll hin statt zu zaehlen. Jede dieser vier
     * Hintertueren ist hier einzeln abgeriegelt.
     */
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS({ soll: 5 })]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    for (let i = 0; i < 3; i++) await plus(0); // 0 → 3, Luecke 2
    const liste = query("[data-rolle='zaehlliste']");
    expect(liste.textContent).not.toMatch(/Soll|nachfüllen|Überbestand/);
    expect(liste.querySelector("[class*='pruefKreisFehl']")).toBeNull();
    expect(liste.querySelector("[class*='pruefKreisOk']")).not.toBeNull();
    expect(query("[data-rolle='zaehl-summe']").textContent).not.toMatch(/Soll/);
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("Alles gezählt");

    for (let i = 0; i < 4; i++) await plus(0); // 3 → 7, ueber Soll
    expect(liste.textContent).not.toMatch(/Soll|Überbestand/);

    // Erst der naechste Schritt nennt, was fehlt.
    for (let i = 0; i < 4; i++) await minus(0); // 7 → 3
    await clickElement(query("[data-rolle='weiter']"));
    expect(query("[data-rolle='nf-liste']").textContent).toContain("Lücke 2");
  });
});

/**
 * DRK-309 — DIE STRECKE SPRICHT VON DEM, WAS DIE HELFERIN IN DER HAND HAELT.
 *
 * ⚠️ WARUM DAS EINE ZUSICHERUNG WERT IST UND NICHT NUR EINE FORMULIERUNG. Diese
 * Strecke ist die einzige Flaeche des Moduls, die eine Person OHNE Konto auf
 * einem privaten Telefon bedient — sie kann nichts nachschlagen und nichts
 * umschalten. „Aus dem Handlager aufs Fahrzeug legen" ueber einer Sanitaets-
 * tasche ist dort nicht ungenau, sondern eine Anweisung, die auf den falschen
 * Gegenstand zeigt.
 *
 * ⚠️ UND DIE PRAEPOSITION IST DER GRUND FUER DREI BAUSTEINE STATT EINEM: „aufs
 * Fahrzeug" und „in die Tasche" unterscheiden sich nicht nur im Nomen. Ein
 * Zusammenkleben aus dem Label ergaebe „auf die Tasche".
 */
describe("CheckFlow — die Art der Einheit (DRK-309)", () => {
  async function nachfuellschritt(fahrzeug: typeof FZ | typeof TASCHE | typeof OHNE_ART) {
    await mount(
      <CheckFlow
        fahrzeug={fahrzeug}
        kontoZugang={false} {...VOLL}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ soll: 5, handlagerBestand: 20 })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    for (let i = 0; i < 5; i++) await minus(0);
    await click(WEITER);
  }

  it("sagt einer Tasche „in die Tasche“ und einem Fahrzeug „aufs Fahrzeug“", async () => {
    await nachfuellschritt(FZ);
    expect(document.body.textContent).toContain("Aus dem Handlager aufs Fahrzeug legen");
    await unmount();

    await nachfuellschritt(TASCHE);
    const tasche = document.body.textContent ?? "";
    expect(tasche).toContain("Aus dem Handlager in die Tasche legen");
    expect(tasche).not.toContain("aufs Fahrzeug");
  });

  it("faellt beim Zwischenstand auf das neutrale Wort zurueck, nie auf Fahrzeug", async () => {
    // Migration 0010 backfillt bewusst nicht. Auf „Fahrzeug" zu raten, weil das
    // der haeufigere Fall ist, machte aus einer offenen Frage still eine
    // Antwort — und zwar auf der Flaeche, auf der sie niemand pruefen kann.
    await nachfuellschritt(OHNE_ART);
    const offen = document.body.textContent ?? "";
    expect(offen).toContain("Aus dem Handlager in die Einheit legen");
    expect(offen).not.toContain("Fahrzeug");
  });

  it("bietet den Ausweg NEUTRAL an — die Liste dahinter fuehrt beide Arten", async () => {
    // Der Ausweg steht im LEERZUSTAND (nichts zu pruefen) und auf dem
    // Abschlussschirm; hier der erste, weil er ohne Zaehlarbeit erreichbar ist.
    await mount(
      <CheckFlow
        fahrzeug={TASCHE}
        kontoZugang={false} {...VOLL}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Andere Einheit");
    expect(text).not.toContain("Anderes Fahrzeug");
    // Und der Leerzustand nennt die Art der Einheit, die er meint.
    expect(text).toContain("Für diese Tasche ist weder ein Soll");
  });
});

describe("CheckFlow — Nachfuellen", () => {
  it("startet bei 0 — der greedy Vorschlag gilt erst mit „Alles geholt“, gedeckelt am Handlager (IDA-377)", async () => {
    // IDA-377: bis hier stand der Vorschlag als Vorbelegung da, und die
    // Nachfuellung war bestaetigt, bevor jemand im Handlager war. Der Vorschlag
    // verspricht weiterhin nie mehr, als der Handlager hergibt (:222-238).
    // Luecke 5, Handlager 2 → Vorschlag 2.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ soll: 5, handlagerBestand: 2 })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    // Schon das ERSTE „−" macht die 0 zu einer Aussage (DRK-304) und loest
    // den Riegel; die weiteren klemmen bei `min` und aendern nichts.
    for (let i = 0; i < 5; i++) await minus(0); // Ist = 0
    await click(WEITER);
    expect(geholt()).toEqual(["0"]);
    expect(query("[data-rolle='nf-alles']").textContent).toBe("Alles geholt");
    await click("[data-rolle='nf-alles']");
    expect(geholt()).toEqual(["2"]);
    // Steht alles auf dem Vorschlag, gibt es nichts mehr zu uebernehmen.
    expect(exists("[data-rolle='nf-alles']")).toBe(false);
  });

  it("das „geholt“-Feld ist TIPPBAR (IDA-377)", async () => {
    // Der Vorschlag ist keine Vorbelegung mehr; wer 12 geholt hat, tippt 12
    // statt zwoelfmal „+".
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ soll: 20, handlagerBestand: 20 })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await minus(0); // Ist = 0, Luecke 20
    await click(WEITER);
    expect(query<HTMLInputElement>("input[aria-label='geholt Kompresse']").value).toBe("0");
    await fill("input[aria-label='geholt Kompresse']", "12");
    expect(geholt()).toEqual(["12"]);
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].positionen).toEqual([
      { sollPositionId: "sp-1", ist: 0, nachfuellMenge: 12, boxMenge: 0 },
    ]);
  });

  it("ein eingetragenes „geholt“ uebersteht Zurueck und Weiter — gekappt an der neuen Luecke (IDA-377)", async () => {
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ soll: 5, handlagerBestand: 20 })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await minus(0); // Ist = 0, Luecke 5
    await click(WEITER);
    await fill(NF_FELD, "4");
    await click(ZURUECK);
    await click(WEITER);
    // Kein Rueckfall auf 0 und kein Sprung auf den Vorschlag.
    expect(geholt()).toEqual(["4"]);
    await click(ZURUECK);
    for (let i = 0; i < 3; i++) await plus(0); // Ist = 3, Luecke 2
    await click(WEITER);
    expect(geholt()).toEqual(["2"]);
  });

  it("der Helfer kann nicht MEHR eintragen, als die Luecke gross ist (`max={luecke}`)", async () => {
    // Die Buchung folgt der Wirklichkeit, nicht dem Vorschlag (:445, :461) —
    // aber ueber die Luecke hinaus ist sie keine Nachfuellung mehr.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[POS({ soll: 5, handlagerBestand: 20 })]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    for (let i = 0; i < 3; i++) await plus(0); // Ist = 3, Luecke = 2
    await click(WEITER);
    const hoch = () => clickElement(queryAll("[data-rolle='nf-liste'] button[aria-label$='erhöhen']")[0]);
    for (let i = 0; i < 3; i++) await hoch();
    expect(geholt()).toEqual(["2"]);
    // IDA-377: das Feld ist tippbar — auch getippt klemmt es an der Luecke.
    await fill(NF_FELD, "9");
    expect(geholt()).toEqual(["2"]);
  });

  it("warnt erst, wenn MEHR verlangt wird, als der Handlager hergibt", async () => {
    // ⚠️ Befund 32: der greedy Vorschlag KANN die Warnung nicht ausloesen — er
    // deckelt selbst an der Verfuegbarkeit. Erreichbar ist sie nur, wenn der
    // Helfer von Hand hochstellt. Beide Seiten stehen hier, sonst traegt weder
    // der Deckel noch die Warnung.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[
          POS({ id: "sp-1", soll: 5, handlagerBestand: 2 }),
          POS({ id: "sp-2", fachLabel: "Fach 2", soll: 5, handlagerBestand: 2 }),
        ]}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    for (const el of queryAll("button[aria-label$='verringern']")) {
      for (let i = 0; i < 5; i++) await clickElement(el);
    }
    await click(WEITER);
    // IDA-377: der Vorschlag erst mit „Alles geholt".
    await click("[data-rolle='nf-alles']");
    // Greedy: nf[sp-1] = 2, nf[sp-2] = 0 — zusammen genau die verfuegbaren 2.
    const anzeigen = geholt;
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
   * ⚠️ WARUM ER DIE REGEL LIEST UND NICHT DAS AUSSEHEN. jsdom berechnet kein
   * CSS. Der Test belegt deshalb das gerenderte Klassenpaar UND liest
   * `.chip.warnhinweis`: zwei Klassen sind spezifischer als `.chip` und lassen
   * die Umbruchregeln nicht von der Stylesheet-Reihenfolge abhängen.
   */
  it("der Knappheitssatz nutzt die umbruchfaehige Warnhinweis-Klasse", async () => {
    const chip = regeln(".chip");
    const hinweis = regeln(".chip.warnhinweis");
    // Die Voraussetzung des Befunds, aus dem Stylesheet GELESEN statt behauptet:
    // faellt `nowrap` in T64 je weg, geht diese Zeile rot und der naechste Leser
    // weiss, dass die Ueberschreibung neu zu bewerten ist.
    expect(chip.get("white-space")).toBe("nowrap");

    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={[
          POS({ id: "sp-1", soll: 5, handlagerBestand: 2 }),
          POS({ id: "sp-2", fachLabel: "Fach 2", soll: 5, handlagerBestand: 2 }),
        ]}
        andereEinheitErreichbar
        letzterCheckText={null}
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

    expect(w.className).toMatch(/warnhinweis/);

    // Und die Geometrie MUSS mit: `border-radius: 99px` mit `padding: 2.5px 9px`
    // ueber zwei Zeilen ist ein zerlaufendes Oval — man tauschte Abschneiden
    // gegen Unlesbarkeit. Die Liste ist genau die Schnittmenge aus „steht in
    // `.chip`" und „macht einen SATZ unlesbar".
    for (const eig of ["display", "white-space", "border-radius", "padding", "font-size"]) {
      expect(chip.has(eig)).toBe(true);
      expect(hinweis.get(eig)).toBeTruthy();
      expect(hinweis.get(eig)).not.toBe(chip.get(eig));
    }

    // Der Ton bleibt, wo er war: die Ueberschreibung tauscht die FORM, nicht die
    // Farbe. `gelb` ist die Warnstufe (§6.6.2) — ohne die Klassen waere es ein
    // Absatz ohne Ampelwert.
    expect(w.className).toMatch(/chip/);
    expect(w.className).toMatch(/gelb/);
  });
});

/**
 * IDA-226 — WOHIN DIE TEILE GEHOEREN. Das Handlager-Fach sagt nur, woher; wer
 * nach dem Check einraeumt, braucht das Fach der Einheit und die Menge. Ein
 * Artikel in zwei Faechern ist der Fall, an dem eine Liste ohne Ziel
 * unbrauchbar wird: zwei gleiche Zeilen.
 */
describe("CheckFlow — Ziel-Fach und Einraeumliste (IDA-226)", () => {
  const ZWEI_FAECHER = [
    POS({ id: "sp-1", fachLabel: "Fach 1", soll: 3 }),
    POS({ id: "sp-2", fachLabel: "Fach 2", soll: 2 }),
    POS({ id: "sp-3", fachLabel: "Fach 2", artikelId: "art-2", artikelName: "Mullbinde", soll: 1 }),
  ];

  async function bisNachfuellen() {
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        soll={ZWEI_FAECHER}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleBestaetigen();
    await plus(2); // Mullbinde gezaehlt 1 = Soll, fehlt nicht
    await click(WEITER);
    await click("[data-rolle='nf-alles']"); // IDA-377: geholt startet bei 0
  }

  const faecherMitText = (rolle: string) =>
    queryAll(`[data-rolle='${rolle}']`).map((f) => f.textContent ?? "");

  it("gliedert den Nachfuellschritt nach dem Fach der Einheit", async () => {
    await bisNachfuellen();
    const faecher = faecherMitText("nf-fach");
    expect(faecher).toHaveLength(2);
    expect(faecher[0]).toMatch(/^Fach 1.*Kompresse.*Lücke 3/);
    expect(faecher[1]).toMatch(/^Fach 2.*Kompresse.*Lücke 2/);
    // Was auf Soll ist, steht auch im Fach nicht.
    expect(faecher[1]).not.toContain("Mullbinde");
  });

  it("nennt am Abschluss je Fach, wie viel wohin gehoert — das Bestaetigte", async () => {
    await bisNachfuellen();
    // Fach 2 nur 1 statt 2 geholt.
    await clickElement(queryAll("[data-rolle='nf-liste'] button[aria-label$='verringern']")[1]);
    await click(ABSCHLIESSEN);
    expect(faecherMitText("einraeum-fach")).toEqual(["Fach 1Kompresse3 Stk", "Fach 2Kompresse1 Stk"]);
    expect(document.body.textContent).toContain("Wohin die geholten Teile gehören");
  });

  it("laesst ein Fach weg, in das nichts geholt wurde — und die Liste, wenn nichts geholt wurde", async () => {
    await bisNachfuellen();
    const minusNf = (i: number) =>
      clickElement(queryAll("[data-rolle='nf-liste'] button[aria-label$='verringern']")[i]);
    for (let i = 0; i < 2; i++) await minusNf(1);
    await click(ABSCHLIESSEN);
    expect(faecherMitText("einraeum-fach")).toEqual(["Fach 1Kompresse3 Stk"]);
    await unmount();

    await bisNachfuellen();
    for (let i = 0; i < 3; i++) await minusNf(0);
    for (let i = 0; i < 2; i++) await minusNf(1);
    await click(ABSCHLIESSEN);
    expect(exists("[data-rolle='einraeum-liste']")).toBe(false);
  });
});

describe("CheckFlow — die Nutzlast (§12.1 Punkt 1)", () => {
  it("sendet genau das Gezaehlte — Ist, Nachfuellmenge, Geraet und Druck", async () => {
    // ⚠️ Ohne diese Zusicherung ist KEINE der acht 1:1-Zeilen der Brief-Tabelle
    // gedeckt: `?? p.soll`, das greedy Ergebnis, die Geraeteantwort und der
    // Druck erreichen die Leitung nur ueber `zaehlung()`, und die Rueckmeldung
    // ist gemockt. IDA-377: Geraet und Druck haben keine Vorbelegung mehr, und
    // der Vorschlag kommt erst mit „Alles geholt".
    //
    // `toStrictEqual` und nicht `toEqual` (N-4, empirisch belegt): `bemerkung`
    // wird in `checkNutzlast` BEDINGT gespreizt — `toEqual` behandelte einen
    // Schluessel mit Wert `undefined` wie einen fehlenden.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS({ soll: 5 })]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    for (let i = 0; i < 3; i++) await plus(0); // Ist = 3
    // Angetippt und wieder auf den Ausgangswert gestellt: NUR Geaendertes wird
    // gesendet (:152-155) — hier also NICHTS.
    await verfallAufklappen();
    await fill("[data-rolle='zaehlliste'] input[type='month']", "2027-03");
    await fill("[data-rolle='zaehlliste'] input[type='month']", "2026-09");
    await click(WEITER);
    await click("[data-rolle='nf-alles']"); // greedy: Luecke 2, Handlager 20 → 2
    await click(WEITER);
    await click("[data-rolle='geraet-fehlt']");
    await click(WEITER);
    await druckAblesen(199);
    await click(ABSCHLIESSEN);

    expect(abschluss).toHaveBeenCalledTimes(1);
    expect(abschluss.mock.calls[0][0]).toStrictEqual({
      fahrzeugId: "fz-1",
      // IDA-358: die Sendungs-ID des Geraets — der Server erkennt daran eine Wiederholung.
      sendungId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      positionen: [{ sollPositionId: "sp-1", ist: 3, nachfuellMenge: 2, boxMenge: 0 }],
      // IDA-377: ein fehlendes Geraet traegt KEINEN Zustand mehr.
      geraete: [{ geraetId: "g-1", vorhanden: false }],
      flaschen: [{ flascheId: "o-1", druckBar: 199 }],
      verfaelle: [],
      // IDA-222: ein Vollcheck ohne Plomben sendet keine
      art: "voll",
      plomben: [],
    });
  });

  it("ein GEAENDERTER Verfall wird gesendet", async () => {
    // Die Gegenprobe zum Filter oben: ohne sie bliebe „nur Geaendertes" auch
    // dann gruen, wenn gar nichts mehr gesendet wuerde.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    await fill("[data-rolle='zaehlliste'] input[type='month']", "2027-03");
    await alleBestaetigen();
    await click(WEITER);
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].verfaelle).toStrictEqual([
      { artikelId: "art-1", verfall: "2027-03" },
    ]);
  });

  it("ein GELEERTES Feld loescht die Angabe — es ist nicht „unangetastet\"", async () => {
    // Der Leerknopf am Feld (DRK-306) schreibt genau das: „keine Angabe".
    // `checkNutzlast` unterscheidet drei Faelle — fehlender Eintrag =
    // unangetastet, `""`/`null` = LOESCHEN. Ohne diesen Test deckten die beiden
    // Tests oben nur zwei davon ab, und ein Filter, der die geleerte Angabe
    // mit wegwirft, bliebe gruen.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    await fill("[data-rolle='zaehlliste'] input[type='month']", "");
    await alleBestaetigen();
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const gedrueckt = (rolle: string) =>
      query(`[data-rolle='${rolle}']`).getAttribute("aria-pressed");
    const haken = (rolle: string) => queryAll(`[data-rolle='${rolle}'] svg`).length;
    const zustaende = () =>
      queryAll("[data-rolle='geraet-zustand']").map((e) => e.getAttribute("aria-pressed"));

    // IDA-377: KEINE VORBELEGUNG — nichts gedrueckt, kein Haken. Offen ist ein
    // Geraet daran, dass keiner seiner Chips gedrueckt ist, und an der Leiste
    // („Noch n von m offen", Test unten).
    expect(gedrueckt("geraet-vorhanden")).toBe("false");
    expect(gedrueckt("geraet-fehlt")).toBe("false");
    expect(zustaende()).toEqual(["false", "false", "false"]);
    expect(queryAll("[data-rolle='geraet'] svg").length).toBe(0);

    // Ein Zustand sagt zugleich „vorhanden" — ein Tipp statt zwei (IDA-377).
    await clickElement(queryAll("[data-rolle='geraet-zustand']")[0]);
    expect(gedrueckt("geraet-vorhanden")).toBe("true");
    expect(gedrueckt("geraet-fehlt")).toBe("false");

    // ⚠️ DIE SEHENDE HAELFTE der Befund-35-Reparatur (Review-Befund 4). Ohne
    // den Haken unterscheidet sich der gewaehlte Chip vom ungewaehlten NUR
    // durch die Farbe — der Chiptext ist in beiden Faellen derselbe, und ein
    // `<svg>` traegt keinen Text, faellt also durch jede `textContent`-Zusicherung
    // hindurch. `aria-pressed` allein deckt nur die Bildschirmleserin ab.
    expect(haken("geraet-vorhanden")).toBe(1);
    expect(haken("geraet-fehlt")).toBe(0);

    expect(zustaende()).toEqual(["true", "false", "false"]);
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
   * tragen die CSS-Modulklasse `.chipKnopf`, welche das UA-Chrome entfernt und
   * das 56x56px-Tippziel setzt (DRK-399). Ohne diese Klasse bliebe um die
   * rund 21px hohe Chip-Pille das Browser-Chrome stehen. „Tap-Mass 56px" ist
   * eine Querschnittsregel dieses Plans, und
   * `core/theme/tokens.ts:33` begruendet sie woertlich („Bedienung mit
   * Handschuhen … eine Einsatzanforderung, keine Stilfrage", zitiert in
   * `_ui/Stepper.tsx:10-11`). Diese fuenf Knoepfe SIND der Geraeteschritt, und
   * ein Fehlgriff schreibt „fehlt" oder „Defekt" ins Journal.
   *
   * ⚠️ GEPRUEFT WIRD `>= 56`, NICHT `>= 44` (DRK-399): bis dahin prueften
   * diese Zeilen die `FullShell`-Dichte, und die 44 standen gruen neben einer
   * Einsatzanforderung von 56. Und `>=`, nicht `=== "56px"`: die Regel ist das
   * Tippmass, nicht der Literalwert. Ob die Zeile dabei umbricht, sieht nur ein
   * echter Browser (`e2e/lagerbuch-helfer.spec.ts`, DRK-399).
   *
   * ⚠️ jsdom berechnet kein CSS (`HelferChip.tsx:22-28`); deshalb prüft der
   * Test die gerenderte Klasse und ihre deklarierte Regel gemeinsam.
   */
  it("die fuenf Auswahlknoepfe sind mit Handschuhen treffbar (Tippmass)", async () => {
    await mount(
      <CheckFlow kontoZugang={false} {...VOLL} fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]} verfall={{}} warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const knoepfe = queryAll(
      "[data-rolle='geraet-vorhanden'], [data-rolle='geraet-fehlt'], [data-rolle='geraet-zustand']",
    );
    // Ohne diese Zahl liefe die Schleife bei leerem Trefferarray durch, ohne
    // eine einzige Zusicherung auszufuehren (Regel 2).
    expect(knoepfe.length).toBe(5);
    const chipKnopf = regeln(".chipKnopf");
    for (const k of knoepfe) {
      expect(k.className).toMatch(/chipKnopf/);
      expect(Number.parseInt(chipKnopf.get("min-height") ?? "", 10)).toBeGreaterThanOrEqual(56);
      // Auch die BREITE: „fehlt" war als Tippziel 42,5px schmal (DRK-399).
      expect(Number.parseInt(chipKnopf.get("min-width") ?? "", 10)).toBeGreaterThanOrEqual(56);
      // Das UA-Chrome um jede Pille muss mit weg, sonst sitzt der vergroesserte
      // Knopf als grauer Kasten um den Chip.
      expect(chipKnopf.get("border")).toBe("0");
      expect(chipKnopf.get("background")).toBe("none");
      // `inline-flex` + `center`: die Hoehe entsteht sonst nur unter dem Chip
      // statt um ihn herum, und das Tippziel liegt neben dem, was man sieht.
      expect(chipKnopf.get("display")).toBe("inline-flex");
      expect(chipKnopf.get("align-items")).toBe("center");
    }
  });

  /*
   * IDA-377 — GERAETE STARTEN UNBEANTWORTET. Bis hier stand jedes Geraet auf
   * „vorhanden, In Ordnung", und ein durchgetippter Check bezeugte Geraete, die
   * niemand angesehen hatte. Jetzt sperrt ein offenes Geraet den Schritt — in
   * beiden Lagen, als Zwischen- und als letzter Schritt.
   */
  const ZWEI_GERAETE: CheckGeraet[] = [GERAET, { id: "g-2", typ: "medizin", name: "AED" }];
  const geraeteFlow = (flaschen: CheckFlasche[] = []) => mount(
    <CheckFlow
      kontoZugang={false} {...VOLL}
      fahrzeug={FZ}
      soll={[]}
      geraete={ZWEI_GERAETE}
      flaschen={flaschen}
      verfall={{}}
      warn={WARN}
      andereEinheitErreichbar
      letzterCheckText={null}
    />,
  );
  const zeile = (i: number) => queryAll("[data-rolle='geraet']")[i]!;
  const tippe = (i: number, text: string) => clickElement(
    [...zeile(i).querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!,
  );
  const zustandVon = (i: number) =>
    [...zeile(i).querySelectorAll("[data-rolle='geraet-zustand'][aria-pressed='true']")]
      .map((b) => b.textContent);

  it("ein unbeantwortetes Geraet sperrt „Abschließen“ — und sendet nichts (IDA-377)", async () => {
    await geraeteFlow();
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(true);
    expect(query("[data-rolle='abschlussleiste']").textContent).toContain("Noch 2 von 2 offen");
    await click(ABSCHLIESSEN);
    expect(abschluss).not.toHaveBeenCalled();

    await tippe(0, "In Ordnung");
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(true);
    expect(query("[data-rolle='abschlussleiste']").textContent).toContain("Noch 1 von 2 offen");
    await tippe(1, "fehlt");
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(false);
    expect(query("[data-rolle='abschlussleiste']").textContent).toContain("2 Gerät(e) geprüft");
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].geraete).toStrictEqual([
      { geraetId: "g-1", vorhanden: true, zustand: "In Ordnung" },
      { geraetId: "g-2", vorhanden: false },
    ]);
  });

  it("ein unbeantwortetes Geraet sperrt auch „Weiter“ (IDA-377)", async () => {
    await geraeteFlow([FLASCHE]);
    expect(query<HTMLButtonElement>(WEITER).disabled).toBe(true);
    await click(WEITER);
    expect(exists("[data-rolle='o2-liste']")).toBe(false);
    await alleGeraeteOk();
    expect(query<HTMLButtonElement>(WEITER).disabled).toBe(false);
    await click(WEITER);
    expect(exists("[data-rolle='o2-liste']")).toBe(true);
  });

  it("„Alle in Ordnung“ setzt nur die OFFENEN — eine gegebene Antwort bleibt stehen (IDA-377)", async () => {
    await geraeteFlow();
    expect(query("[data-rolle='geraete-alle-ok']").textContent).toBe("Alle in Ordnung");
    await tippe(0, "Defekt");
    // Mit einer Antwort heisst der Knopf, was er tut.
    expect(query("[data-rolle='geraete-alle-ok']").textContent).toBe("Übrige in Ordnung");
    await alleGeraeteOk();
    expect(zustandVon(0)).toEqual(["Defekt"]);
    expect(zustandVon(1)).toEqual(["In Ordnung"]);
    // Nichts mehr offen, nichts mehr zu uebernehmen.
    expect(exists("[data-rolle='geraete-alle-ok']")).toBe(false);
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].geraete).toStrictEqual([
      { geraetId: "g-1", vorhanden: true, zustand: "Defekt" },
      { geraetId: "g-2", vorhanden: true, zustand: "In Ordnung" },
    ]);
  });

  it("„Alle in Ordnung“ laesst auch ein FEHLENDES Geraet stehen (IDA-377)", async () => {
    await geraeteFlow();
    await tippe(1, "fehlt");
    await alleGeraeteOk();
    expect(zeile(1).querySelector("[data-rolle='geraet-fehlt']")!.getAttribute("aria-pressed")).toBe("true");
    expect(zustandVon(0)).toEqual(["In Ordnung"]);
  });

  it("der Riegel steht in `abschliessen` SELBST, nicht nur am Knopf (IDA-377)", async () => {
    /*
     * Wie `zurNachfuellung` (DRK-304): ein wiederhergestellter Entwurf kann auf
     * einem spaeteren Schritt stehen als dem, der noch offen ist. Nachgestellt
     * ueber das Neuladen (IDA-358) mit einem inzwischen ZWEITEN Geraet — der
     * Entwurf steht auf „Sauerstoff", das neue Geraet ist unbeantwortet, und
     * dort sperrt nur der Druck den Knopf.
     */
    const mitGeraeten = (geraete: CheckGeraet[]) => (
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={geraete}
        flaschen={[FLASCHE]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />
    );
    await mount(mitGeraeten([GERAET]));
    await alleGeraeteOk();
    await click(WEITER);
    await druckAblesen(180);
    await unmount();

    await mount(mitGeraeten(ZWEI_GERAETE));
    expect(exists("[data-rolle='o2-liste']")).toBe(true);
    await click(ABSCHLIESSEN);
    expect(abschluss).not.toHaveBeenCalled();
    // Der Tipp fuehrt dorthin, wo noch etwas offen ist.
    expect(exists("[data-rolle='geraete-alle-ok']")).toBe(true);
    expect(query("[data-rolle='geraete-alle-ok']").textContent).toBe("Übrige in Ordnung");
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[O2({ nennfuelldruckBar: 0 })]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    // IDA-377: erst abgelesen gibt es etwas zu bewerten. Und ohne Nennfuelldruck
    // gibt es keine Obergrenze — auch ein hoher Wert sperrt nicht.
    await druckAblesen(250);
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(false);
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[O2({ nennfuelldruckBar: 200 })]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await druckAblesen(200); // IDA-377: abgelesen, nicht vorbelegt
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[
          O2({ id: "o-1", name: "O2 klein", nennfuelldruckBar: 200, letzterDruck: 190 }),
          O2({ id: "o-2", name: "O2 groß", nennfuelldruckBar: 300, letzterDruck: null }),
        ]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const t = query("[data-rolle='o2-liste']").textContent ?? "";
    expect(t).toContain("zuletzt gemessen: 190 bar");
    expect(t).toContain("noch nicht gemessen");
  });

  it("der Druck startet LEER — der letzte Messwert ist nur ein Hinweis (IDA-377)", async () => {
    // Bis IDA-377 stand hier der Nennfuelldruck („voll annehmen, Abgelesenes
    // runterstellen", :136-137) — gruen, 100 %, direkt neben „zuletzt gemessen:
    // 40 bar", und ein Tipp auf „Abschliessen" buchte eine volle Flasche, die
    // niemand abgelesen hatte. Der letzte Messwert (190) wird weiterhin nur
    // ANGEZEIGT: sonst schriebe ein Check den vorigen Wert fort.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[O2({ nennfuelldruckBar: 200, letzterDruck: 190 })]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const feld = query<HTMLInputElement>("input[aria-label='Druck O2 klein']");
    expect(feld.value).toBe("");
    expect(feld.placeholder).toBe("–");
    const t = query("[data-rolle='o2-liste']").textContent ?? "";
    expect(t).toContain("nicht abgelesen");
    expect(t).toContain("zuletzt gemessen: 190 bar");
    expect(t).not.toContain("%");
    // Unabgelesen ist weder gruen noch rot.
    expect(kreis().className).not.toMatch(/pruefKreisOk/);
    expect(kreis().className).not.toMatch(/pruefKreisFehl/);
  });

  it("ein fehlender Druck sperrt „Abschließen“ und „Weiter“ (IDA-377)", async () => {
    // Letzter Schritt: „Abschließen".
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[
          O2({ id: "o-1", name: "O2 klein" }),
          O2({ id: "o-2", name: "O2 groß" }),
        ]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(true);
    expect(query("[data-rolle='abschlussleiste']").textContent).toContain("Noch 2 von 2 abzulesen");
    await fill("input[aria-label='Druck O2 klein']", "150");
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(true);
    expect(query("[data-rolle='abschlussleiste']").textContent).toContain("Noch 1 von 2 abzulesen");
    await click(ABSCHLIESSEN);
    expect(abschluss).not.toHaveBeenCalled();
    await fill("input[aria-label='Druck O2 groß']", "180");
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(false);
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].flaschen).toStrictEqual([
      { flascheId: "o-1", druckBar: 150 },
      { flascheId: "o-2", druckBar: 180 },
    ]);
    await unmount();

    // Zwischenschritt: „Weiter". Im Vollcheck MIT Plomben folgen sie dem
    // Sauerstoff (IDA-222) — der einzige Fall, in dem er nicht der letzte ist.
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        plomben={[{ id: "pl-1", bezeichnung: "Medizinkoffer", fachLabel: "Medizinkoffer", erwartet: "12345" }]}
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[O2({})]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(exists("[data-rolle='o2-liste']")).toBe(true);
    expect(query<HTMLButtonElement>(WEITER).disabled).toBe(true);
    await click(WEITER);
    expect(exists("[data-rolle='o2-liste']")).toBe(true);
    await druckAblesen(150);
    expect(query<HTMLButtonElement>(WEITER).disabled).toBe(false);
    await click(WEITER);
    expect(exists("[data-rolle='o2-liste']")).toBe(false);
  });

  it("ein Druck ueber 110 % des Nennfuelldrucks sperrt und sagt es (IDA-377)", async () => {
    // 950 statt 195 — ein Tippfehler, der sonst als „voll" gebucht wuerde.
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[]}
        flaschen={[O2({ nennfuelldruckBar: 200 })]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await druckAblesen(950);
    const t = query("[data-rolle='o2-liste']").textContent ?? "";
    expect(t).toContain("über 220 bar – bitte prüfen");
    expect(t).not.toContain("%");
    expect(kreis().className).toMatch(/pruefKreisFehl/);
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(true);
    expect(query("[data-rolle='abschlussleiste']").textContent).toContain("1 Druck zu hoch");
    await click(ABSCHLIESSEN);
    expect(abschluss).not.toHaveBeenCalled();

    // Die Grenze selbst ist erlaubt: 220 bar = 110 %.
    await druckAblesen(220);
    expect(query("[data-rolle='o2-liste']").textContent).not.toContain("bitte prüfen");
    expect(query<HTMLButtonElement>(ABSCHLIESSEN).disabled).toBe(false);
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
        geraeteGemeldet: 0,
        flaschenAuffaellig: 1,
        flaschenNichtBewertbar: 0,
        verfallAuffaellig: 2,
      },
    });
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleBestaetigen();
    await click(WEITER);
    await click(WEITER);
    await alleGeraeteOk(); // IDA-377
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-ergebnis']").textContent ?? "";
    expect(t).toContain("3 aus Handlager geholt");
    expect(t).toContain("2 fehlt weiterhin");
    expect(t).toContain("1 Gerät(e) auffällig");
    expect(t).toContain("1 Flasche(n) wechseln");
    expect(t).toContain("2 laufen ab");
    // Gegenprobe zum Satz unten: gebucht === bestaetigt sagt NICHTS.
    expect(t).not.toContain("konnten nur");
  });

  /**
   * DRK-194 (c) — DIE FUSSNOTE HATTE EINEN ORT UND KEINEN TEST.
   *
   * ⛔ GETESTET WAR NUR DER CHIP DANEBEN („2 fehlt weiterhin"), und der ist die
   * ZAHL. Die Fussnote ist die HANDLUNGSANWEISUNG — sie sagt, woran es lag (das
   * Handlager hatte nicht genug) und was jetzt zu tun ist (der Verwaltung
   * melden). Faellt sie weg, bleibt eine Zahl ohne Adressat stehen: die Person
   * am Fahrzeug sieht, dass etwas fehlt, und erfaehrt nicht, dass sie es
   * weitergeben muss.
   *
   * ⚠️ NICHT MIT DER NACHBARFUSSNOTE ZU VERWECHSELN („konnten nur … gebucht
   * werden. Das Handlager war zwischenzeitlich leer"): die haengt an
   * `nachfuellBestaetigt > nachgefuellt` und meint einen anderen Vorgang —
   * bestaetigt, aber nicht buchbar. Diese hier haengt an `offen > 0` und meint
   * „fehlt weiterhin". Der Fall unten haelt beide auseinander.
   */
  it("nennt bei offenen Teilen den Grund UND den Adressaten, nicht nur die Zahl", async () => {
    abschluss.mockResolvedValue({
      ok: true,
      wert: {
        checkId: "c1",
        // ⛔ `nachgefuellt === nachfuellBestaetigt`: so bleibt die NACHBARfussnote
        // stumm und der Fall misst die hiesige allein.
        nachgefuellt: 1,
        nachfuellBestaetigt: 1,
        offen: 2,
        geraeteAuffaellig: 0,
        geraeteGemeldet: 0,
        flaschenAuffaellig: 0,
        flaschenNichtBewertbar: 0,
        verfallAuffaellig: 0,
      },
    });
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        // IDA-377: das Handlager ist LEER — nur dann ist es der Grund.
        soll={[POS({ handlagerBestand: 0 })]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleBestaetigen();
    await click(WEITER);
    await click(WEITER);
    await alleGeraeteOk(); // IDA-377
    await click(ABSCHLIESSEN);

    const t = query("[data-rolle='check-ergebnis']").textContent ?? "";
    expect(t).toContain("Das Handlager hatte nicht genug.");
    expect(t).toContain("bitte der Verwaltung melden");
    expect(query("[data-rolle='offen-grund']").textContent).toBe(
      "Das Handlager hatte nicht genug. 2 Teile fehlen weiterhin im Fahrzeug – bitte der Verwaltung melden.",
    );
    // Die Nachbarfussnote gehoert einem anderen Vorgang und darf hier nicht stehen.
    expect(t).not.toContain("zwischenzeitlich leer");
  });

  /*
   * IDA-377 — DER GRUND STIMMT. Bis hier hiess es immer „Das Handlager hatte
   * nicht genug", auch wenn bewusst nichts geholt wurde und das Handlager voll
   * war — eine Meldung, der die Verwaltung vergeblich nachgeht.
   */
  const offenGrund = async (pos: CheckPos, holen: "nichts" | "alles", offen: number) => {
    abschluss.mockResolvedValue({ ok: true, wert: { ...WERT_NULL, offen } });
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[pos]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleBestaetigen();
    await click(WEITER);
    if (holen === "alles") await click("[data-rolle='nf-alles']");
    await click(ABSCHLIESSEN);
    return query("[data-rolle='offen-grund']").textContent ?? "";
  };

  it("nichts geholt bei vollem Handlager heisst „nicht nachgefüllt“, nicht „Handlager“ (IDA-377)", async () => {
    const t = await offenGrund(POS({ soll: 5, handlagerBestand: 20 }), "nichts", 5);
    expect(t).toBe("5 Teile fehlen weiterhin im Fahrzeug – sie wurden nicht nachgefüllt.");
    expect(t).not.toContain("Handlager");
  });

  it("nennt beide Gruende getrennt, wenn beide zutreffen (IDA-377)", async () => {
    // Luecke 5, Handlager 2, nichts geholt: 2 haetten gehen koennen, 3 nicht.
    const t = await offenGrund(POS({ soll: 5, handlagerBestand: 2 }), "nichts", 5);
    expect(t).toBe(
      "5 Teile fehlen weiterhin im Fahrzeug: 2 nicht nachgefüllt, für 3 hatte das Handlager nicht genug.",
    );
  });

  it("alles geholt, was das Handlager hatte: nur der Handlager-Grund (IDA-377)", async () => {
    const t = await offenGrund(POS({ soll: 5, handlagerBestand: 2 }), "alles", 3);
    expect(t).toBe(
      "Das Handlager hatte nicht genug. 3 Teile fehlen weiterhin im Fahrzeug – bitte der Verwaltung melden.",
    );
  });

  /*
   * IDA-377 — DER CHECK MELDET SELBST. Ein fehlendes oder defektes Geraet legt
   * serverseitig einen Mangel an; die Fussnote sagt dann, WAS gemeldet wurde,
   * statt die Helferin zur Verwaltung zu schicken.
   */
  const geraeteMelden = async (geraeteGemeldet: number) => {
    abschluss.mockResolvedValue({
      ok: true, wert: { ...WERT_NULL, geraeteAuffaellig: 2, geraeteGemeldet },
    });
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[
          GERAET,
          { id: "g-2", typ: "medizin", name: "AED" },
          { id: "g-3", typ: "medizin", name: "Trage" },
        ]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const zeilen = queryAll("[data-rolle='geraet']");
    const tippe = (i: number, text: string) => clickElement(
      [...zeilen[i]!.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!,
    );
    await tippe(0, "Defekt");
    await tippe(1, "fehlt");
    // Gebrauchsspuren sind kein Mangel und stehen nicht in der Meldung.
    await tippe(2, "Gebrauchsspuren");
    await click(ABSCHLIESSEN);
    return query("[data-rolle='geraete-gemeldet']").textContent ?? "";
  };

  it("nennt, was an die Verwaltung GEMELDET wurde — Geraet und Befund (IDA-377)", async () => {
    expect(await geraeteMelden(2)).toBe("An die Verwaltung gemeldet: Absaugpumpe (defekt), AED (fehlt).");
  });

  it("hat der Server nicht alles gemeldet, bleibt es beim Auftrag an die Helferin (IDA-377)", async () => {
    // Gegenprobe: ein Server, der nichts anlegt (vor IDA-377: 0), darf keine
    // Meldung behaupten, die es nicht gibt.
    expect(await geraeteMelden(0)).toBe("Fehlende oder defekte Geräte bitte der Verwaltung melden.");
  });

  it("und schweigt, wenn nichts offen bleibt", async () => {
    /*
     * ⚠️ DIE GEGENPROBE, ohne die der Fall darueber auch ueber einer Karte gruen
     * waere, die den Satz IMMER zeigt. „Das Handlager hatte nicht genug" unter
     * einem vollstaendigen Check waere eine Meldung, der jemand nachgeht — und
     * zwar vergeblich.
     */
    abschluss.mockResolvedValue({
      ok: true,
      wert: {
        checkId: "c1",
        nachgefuellt: 1,
        nachfuellBestaetigt: 1,
        offen: 0,
        geraeteAuffaellig: 0,
        geraeteGemeldet: 0,
        flaschenAuffaellig: 0,
        flaschenNichtBewertbar: 0,
        verfallAuffaellig: 0,
      },
    });
    await mount(
      <CheckFlow
        kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleBestaetigen();
    await click(WEITER);
    await click(WEITER);
    await alleGeraeteOk(); // IDA-377
    await click(ABSCHLIESSEN);

    const t = query("[data-rolle='check-ergebnis']").textContent ?? "";
    expect(t).not.toContain("Das Handlager hatte nicht genug.");
    expect(t).not.toContain("fehlt weiterhin");
  });

  it("ohne Artikel nennt die Karte KEINE Handlager-Zahl", async () => {
    // Die Gegenseite von `hatArtikel`: ein Chip „0 aus Handlager geholt" waere
    // eine Aussage ueber Arbeit, die nie stattgefunden hat.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
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
        geraeteGemeldet: 0,
        flaschenAuffaellig: 0,
        flaschenNichtBewertbar: 0,
        verfallAuffaellig: 0,
      },
    });
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-ergebnis']").textContent ?? "";
    expect(t).toContain("2 Flasche(n) nicht bewertbar");
    // „nicht bewertbar" ist NICHT „alles in Ordnung".
    expect(t).not.toContain("Alles in Ordnung");
  });

  it("bietet ZWEI Links statt eines Zustandsresets (§7.9.1)", async () => {
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
    await click(ABSCHLIESSEN);
    expect(query<HTMLAnchorElement>("[data-rolle='nochmal']").getAttribute("href")).toBe(
      "/helfer/check?fz=fz-1",
    );
    expect(query<HTMLAnchorElement>("[data-rolle='anderes']").getAttribute("href")).toBe(
      "/helfer/check",
    );
  });

  it("ohne andere Einheit bleibt nur EIN Link — „Nochmal diese Einheit\"", async () => {
    /*
     * DRK-302, die zweite Haelfte der Begrenzung; seit DRK-376 traegt sie
     * BEIDE Gruende. Ohne sie zeigte die Seite zwar nur eine Einheit, staende
     * am Abschluss aber ein Knopf in die volle Liste — der Einstieg waere genau
     * eine Bedienung von seiner Begrenzung entfernt, und zwar an der Stelle, an
     * der die Helferin ohnehin hinsieht.
     *
     * ⚠️ HIER WIRD VERSTECKT UND NICHT GETAUSCHT, anders als im Leerzustand:
     * „Nochmal diese Einheit" BLEIBT und ist der Ausgang, den dieser Schirm in
     * jeder Lage behaelt — es ist der Weg, mit dem sie nach einer Buchung
     * frische Bestaende sieht, und ein Zustandsreset ueber sieben Setter ist es
     * ausdruecklich nicht (§7.9.1).
     */
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar={false}
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
    await click(ABSCHLIESSEN);
    expect(query<HTMLAnchorElement>("[data-rolle='nochmal']").getAttribute("href")).toBe(
      "/helfer/check?fz=fz-1",
    );
    expect(exists("[data-rolle='anderes']")).toBe(false);
  });

  it("kodiert die Fahrzeug-ID im „Nochmal\"-Link (Befund 31)", async () => {
    // T80 baut dieselbe URL mit `encodeURIComponent` und begruendet das damit,
    // dass ein importierter Alt-Bestand andere IDs tragen kann; ein rohes
    // `?fz=a b` erzeugt eine kaputte URL. Beide Tasks laufen in derselben
    // Welle und erzeugen dieselbe URL-Form.
    await mount(
      <CheckFlow
      kontoZugang={false} {...VOLL}
          fahrzeug={{ id: "fz 1/a", name: "RTW 1", kennung: null, einheitenart: "fahrzeug" }}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
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
    kontoZugang={false} {...VOLL}
    fahrzeug={FZ}
    soll={[POS({ soll: 5 })]}
    geraete={[GERAET]}
    flaschen={[FLASCHE]}
    verfall={{}}
    warn={WARN}
    andereEinheitErreichbar
    letzterCheckText={null}
  />
);

/**
 * Dasselbe Fahrzeug, aber ANGEMELDET statt mit Kärtchen (DRK-305).
 * Einziger Unterschied ist `kontoZugang` — alles andere bleibt gleich, damit
 * die Gegenprobe unten wirklich nur die Herkunft misst.
 */
const VOLLES_FAHRZEUG_KONTO = (
  <CheckFlow
    kontoZugang {...VOLL}
    fahrzeug={FZ}
    soll={[POS({ soll: 5 })]}
    geraete={[GERAET]}
    flaschen={[FLASCHE]}
    verfall={{}}
    warn={WARN}
    andereEinheitErreichbar
    letzterCheckText={null}
  />
);

async function alleSechsSetzen(flaeche = VOLLES_FAHRZEUG): Promise<void> {
  await mount(flaeche);
  for (let i = 0; i < 3; i++) await plus(0); // 1 `ist` = 3
  await verfallAufklappen();
  await fill("[data-rolle='zaehlliste'] input[type='month']", "2027-03"); // 2 `verfallState`
  await click(WEITER);
  await click("[data-rolle='nf-alles']"); // 3 `nachfuell` = 2 (greedy, IDA-377: per Tipp)
  await click(WEITER);
  await click("[data-rolle='geraet-fehlt']"); // 4 `geraeteState`
  await click(WEITER);
  await druckAblesen(199); // 5 `druck` = 199 (IDA-377: abgelesen statt vom Nennfuelldruck herunter)
  // 6 `phase` steht auf „sauerstoff".
}

async function pruefeAlleSechs(neuGeladen = false): Promise<void> {
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
  expect(geholt()).toEqual(["2"]);
  await click(ZURUECK);
  // 1 — die gezaehlte Menge.
  expect(zahlfelder()[0].value).toBe("3");
  // 2 — der gemeldete Verfall, im Feld UND im Chip. Das Feld steht noch offen:
  // das Aufklappen ist Anzeige im selben Baum und ueberlebt den Schrittwechsel.
  // Ein Neuladen (IDA-358) ueberlebt es nicht — Anzeige liegt nicht im Entwurf.
  if (neuGeladen) await verfallAufklappen();
  expect(
    query<HTMLInputElement>("[data-rolle='zaehlliste'] input[type='month']").value,
  ).toBe("2027-03");
  // Seit IDA-219 traegt die gezaehlte Zeile nur noch den Verfallschip.
  const chips = queryAll("[data-rolle='zaehlliste'] [data-rolle='helfer-chip']").map(
    (e) => e.textContent ?? "",
  );
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

  it("DRK-305 — ANGEMELDET zeigt das Code-Feld NICHT, sondern den Weg zur Anmeldung", async () => {
    /*
     * ⚠️ DER TEUERSTE SACKGASSEN-FALL DES MODULS, und der Server sieht ihn
     * nicht: fällt der Konto-Zugang mitten im Check aus, gibt er den
     * Kärtchen-Grund `sitzung` zurück — er kann die Herkunft nicht
     * unterscheiden. Das Code-Feld verlangte dann ein Kärtchen, das diese
     * Person nie hatte, und der einzige Ausweg wäre, die Seite zu verlassen:
     * der GESAMTE Zählstand liegt in sechs `useState`. Gefunden von der
     * Codex-Review zu PR #164.
     *
     * Deshalb steht hier `pruefeAlleSechs()` wie im Kärtchen-Fall darueber —
     * die Zusage ist dieselbe: nichts geht verloren.
     */
    abschluss.mockResolvedValue({
      ok: false,
      grund: "sitzung",
      text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
    });
    await alleSechsSetzen(VOLLES_FAHRZEUG_KONTO);
    await click(ABSCHLIESSEN);

    expect(exists("[data-rolle='erneuern']")).toBe(false);
    const weg = query<HTMLAnchorElement>("[data-rolle='check-anmelden']");
    expect(weg.getAttribute("href")).toBe("/verwaltung");
    // NEUER TAB — daran hängt, dass der Zählstand überlebt.
    expect(weg.getAttribute("target")).toBe("_blank");
    expect(weg.getAttribute("rel")).toBe("noreferrer");
    // Und der Satz nennt kein Kärtchen mehr.
    expect(query("[data-rolle='check-fehler']").textContent).not.toContain("Kärtchen");
    await pruefeAlleSechs();
  });

  it("DRK-305 — mit Kärtchen gibt es den Anmelde-Weg NICHT", async () => {
    // Gegenprobe zur Zeile darueber: ohne sie wäre der Test auch dann grün,
    // wenn der Link in BEIDEN Herkünften erschiene.
    abschluss.mockResolvedValue({
      ok: false,
      grund: "sitzung",
      text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
    });
    await alleSechsSetzen();
    await click(ABSCHLIESSEN);
    expect(exists("[data-rolle='check-anmelden']")).toBe(false);
    expect(exists("[data-rolle='erneuern']")).toBe(true);
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
    await click(ABSCHLIESSEN);
    expect(query("[data-rolle='check-fehler']").textContent).toContain("unvollständig");
    expect(exists("[data-rolle='erneuern']")).toBe(false);
  });

  it("nach erfolgreicher Erneuerung verschwindet das Feld und der Knopf steht wieder", async () => {
    abschluss.mockResolvedValue({ ok: false, grund: "sitzung", text: "abgelaufen" });
    erneuere.mockResolvedValue({ ok: true, wert: null });
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
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
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await alleGeraeteOk(); // IDA-377
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-fehler']").textContent ?? "";
    // IDA-358: die Statuszeile aus `core/entwurf` — die Sendung liegt auf dem
    // Geraet und wird von selbst erneut versucht.
    expect(t).toMatch(/^Nicht gesendet\. Neuer Versuch in \d+ s\.$/);
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
    expect(query("[data-rolle='check-fehler']").textContent).toContain("Nicht gesendet");
    await pruefeAlleSechs();
  });

  /*
   * IDA-358 — DER VORFALL VOM 04.11.2026: Abschluss waehrend eines Rollouts
   * gescheitert, Seite neu geladen, Check weg. „Neu geladen" ist hier Abbau und
   * Neuaufbau; der Speicher (`localStorage`) ist derselbe wie im Browser.
   */
  it("IDA-358: alle sechs Zustaende ueberstehen ein Neuladen, die Sendung geht von selbst raus", async () => {
    abschluss.mockRejectedValue(new Error("offline"));
    await alleSechsSetzen();
    await click(ABSCHLIESSEN);
    const ersteId = (abschluss.mock.calls[0][0] as { sendungId: string }).sendungId;
    await unmount();

    abschluss.mockReset();
    abschluss.mockResolvedValue({ ok: true, wert: WERT_NULL });
    await mount(VOLLES_FAHRZEUG);
    expect(abschluss).toHaveBeenCalledTimes(1);
    expect((abschluss.mock.calls[0][0] as { sendungId: string }).sendungId).toBe(ersteId);
    expect(exists("[data-rolle='check-ergebnis']")).toBe(true);
    expect(Object.keys(localStorage).filter((k) => k.startsWith("iuk-entwurf:"))).toEqual([]);
  });

  it("IDA-358: ein Neuladen mitten im Zaehlen stellt den Stand wieder her", async () => {
    await alleSechsSetzen();
    await unmount();
    await mount(VOLLES_FAHRZEUG);
    expect(query("[data-rolle='entwurf-hinweis']").textContent).toBe("Eingaben wiederhergestellt.");
    await pruefeAlleSechs(true);
    expect(abschluss).not.toHaveBeenCalled();
  });

  it("IDA-358: eine Ablehnung des Servers behaelt den Entwurf, ohne ihn zu wiederholen", async () => {
    abschluss.mockResolvedValue({ ok: false, grund: "eingabe", text: "Abgelehnt." });
    await alleSechsSetzen();
    await click(ABSCHLIESSEN);
    expect(query("[data-rolle='check-fehler']").textContent).toBe("Abgelehnt.");
    await unmount();
    await mount(VOLLES_FAHRZEUG);
    expect(abschluss).toHaveBeenCalledTimes(1);
    await pruefeAlleSechs(true);
  });
});

describe("CheckFlow — Bauform", () => {
  it("kennt genau EIN Fahrzeug — keine Woerterbuecher, keine `preselect`-Prop", () => {
    // §7.9.1: heute wandert die Soll-Bestueckung der GESAMTEN Organisation in
    // den RSC-Payload — auf ein privates Telefon, in einer Sitzung ohne Konto.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/preselect|Record<string, Pos\[\]>|fahrzeuge:/);
    // ⚠️ MEHRZEILIG SEIT DRK-309 (`einheitenart` kam dazu) — die Zusage ist
    // unveraendert: EIN Fahrzeug, kein Woerterbuch. Der Ausdruck prueft
    // deshalb den Anfang der Prop, nicht ihre Zeilenumbrueche.
    expect(q).toMatch(/fahrzeug: \{\s+id: string/);
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

describe("CheckFlow — die Ueberschrift ist greifbar (DRK-373)", () => {
  /*
   * WOZU DER GREIFER DA IST. Seit DRK-373 steht der Name der gebundenen
   * Einheit auf der Check-Strecke ZWEIMAL: in dieser Ueberschrift und im
   * Hinweis „dein Scan gilt hier nicht" (`_ui/ScanHinweis.tsx`), den die Seite
   * darueber rendert. Ein e2e-Greifer ueber den blossen Text traf damit zwei
   * Elemente; die naheliegende „Reparatur" `.first()` haette den HINWEIS
   * gelesen und gruen behauptet, der Check laufe auf dieser Einheit — genau
   * die Verwechslung, gegen die DRK-373 geschrieben ist, nur im Test.
   *
   * ⚠️ DIESER BLOCK IST DIE EINZIGE STELLE, DIE DEN GREIFER UEBER ALLE PHASEN
   * HAELT. In `e2e/` steht er in drei Faellen, und die laufen je gegen EINE
   * Phase; faellt er in einer anderen weg, ist das dort nicht zu sehen. Welche
   * Phase die erste ist, haengt an der Bestueckung (`schrittFolge`) — dieselbe
   * Begruendung, aus der `letzterCheckZeile` an JEDEM Schritt steht.
   */
  const KOPF = "[data-rolle='check-einheit']";

  const lagen = [
    { was: "Zaehlschritt", soll: [POS()], geraete: [], flaschen: [] },
    { was: "Geraeteschritt als erster", soll: [], geraete: [GERAET], flaschen: [] },
    { was: "Sauerstoff als erster", soll: [], geraete: [], flaschen: [FLASCHE] },
    { was: "nichts zu pruefen", soll: [], geraete: [], flaschen: [] },
  ] as const;

  it("traegt den Greifer in JEDER Eingangslage", async () => {
    let geprueft = 0;
    for (const lage of lagen) {
      await mount(
        <CheckFlow
          kontoZugang={false} {...VOLL}
          fahrzeug={FZ}
          soll={[...lage.soll]}
          geraete={[...lage.geraete]}
          flaschen={[...lage.flaschen]}
          verfall={{}}
          warn={WARN}
          andereEinheitErreichbar={false}
          letzterCheckText={null}
        />,
      );
      expect(query(KOPF).textContent, lage.was).toContain(FZ.name);
      geprueft += 1;
      await unmount();
    }
    // Eine Schleife ohne Durchlauf fuehrt null Zusicherungen aus.
    expect(geprueft).toBe(lagen.length);
  });

  it("sitzt an ALLEN Ueberschriften der Datei, nicht nur an der ersten", () => {
    /*
     * Die Lagen oben erreichen die Eingangsschirme; die Ueberschriften der
     * SPAETEREN Phasen (Nachfuellen, Geraete, Sauerstoff, Fertig) haengen an
     * einem Zaehlstand, den dieser Block nicht durchklickt. Deshalb hier ein
     * Quelltext-Scan: JEDE `{kopfEinheit}`-Ueberschrift traegt den Greifer.
     * Ohne ihn waere „an allen sechs" eine Behauptung im Kommentar.
     */
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    const alle = [...q.matchAll(/<div className=\{s\.schirmKopf\}[^>]*>\{kopfEinheit\}/g)];
    expect(alle.length, "keine `kopfEinheit`-Ueberschrift gefunden").toBeGreaterThanOrEqual(6);
    expect(alle.filter((m) => !m[0].includes('data-rolle="check-einheit"'))).toEqual([]);
  });
});

describe("CheckFlow — der letzte Check (DRK-306, AK1)", () => {
  const ZEILE = "[data-rolle='letzter-check']";

  it("nennt den Zeitpunkt des letzten Checks im Zaehlschritt", async () => {
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText="14.09.2026, 08:12"
      />,
    );
    expect(query(ZEILE).textContent).toContain("14.09.2026, 08:12");
  });

  it("unterscheidet „noch nie geprueft\" von einem alten Zeitpunkt", async () => {
    // `null` ist eine eigene Aussage und darf nicht als leere Zeile enden: eine
    // Zeile ohne Text saehe aus wie ein Ladefehler, und ein Fahrzeug ohne
    // Historie ist der haeufigste Ersteinsatz.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    const text = query(ZEILE).textContent ?? "";
    expect(text).toContain("Noch kein Check");
    expect(text).not.toContain("Letzter Check:");
  });

  it("steht AUCH auf einem Fahrzeug OHNE Soll-Artikel, das bei „Geraete\" anfaengt", async () => {
    // Welcher Schritt der erste ist, haengt an `schrittFolge`. Eine Zeile, die
    // nur im Zaehlschritt steht, waere hier ersatzlos weg — „sichtbar" waere
    // dann eine Aussage ueber die Bestueckung, nicht ueber die Oberflaeche.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[]}
        geraete={[GERAET]}
        flaschen={[FLASCHE]}
        warn={WARN}
        verfall={{}}
        andereEinheitErreichbar
        letzterCheckText="14.09.2026, 08:12"
      />,
    );
    expect(query(ZEILE).textContent).toContain("14.09.2026, 08:12");
  });

  it("verschwindet auf dem FERTIG-Schirm — dort waere er der VORLETZTE Check", async () => {
    // Nach dem Abschluss ist der letzte Check DIESER hier. Die vorgeladene Zahl
    // stimmt dann zwar noch, behauptet aber das Falsche: „zuletzt geprueft am
    // 14.09." direkt unter „Check abgeschlossen".
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText="14.09.2026, 08:12"
      />,
    );
    // ⚠️ `alleBestaetigen` zuerst: seit DRK-304 sperrt eine unberuehrte Position
    // „Weiter". Ohne diesen Schritt bliebe der Test auf dem Zaehlschirm stehen
    // und pruefte die Abwesenheit der Zeile dort, wo sie stehen SOLL.
    await alleBestaetigen();
    await click(WEITER);
    await click(ABSCHLIESSEN);
    expect(exists("[data-rolle='check-ergebnis']")).toBe(true);
    expect(exists(ZEILE)).toBe(false);
  });
});

describe("CheckFlow — das Verfallsfeld leeren (DRK-306, AK4)", () => {
  const LEEREN = "[data-rolle='verfall-leeren']";
  const FELD = "[data-rolle='zaehlliste'] input[type='month']";

  it("bietet den Knopf NUR an, wenn eine Angabe dasteht", async () => {
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    expect(exists(LEEREN)).toBe(false);
    await fill(FELD, "2027-03");
    expect(exists(LEEREN)).toBe(true);
  });

  it("raeumt das Feld — und der VORBELEGTE Wert kommt NICHT zurueck", async () => {
    /*
     * ⚠️ DER TEUERSTE FEHLER DIESER AENDERUNG, und er ist still: `verfallWert`
     * loest ueber `verfallState[a] ?? verfall[a] ?? ""` auf. Ein `delete` oder
     * ein `undefined` im Zustand faellt durch die ??-Kette auf die VORBELEGUNG
     * zurueck — der alte Monat stuende sofort wieder im Feld, und weder
     * `typecheck` noch `build` saehen etwas. Ohne eine Vorbelegung im Prop
     * waere dieser Test gruen, egal welche der beiden Fassungen dasteht.
     */
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    expect(query<HTMLInputElement>(FELD).value).toBe("2026-09");
    await click(LEEREN);
    expect(query<HTMLInputElement>(FELD).value).toBe("");
    expect(exists(LEEREN)).toBe(false);
  });

  it("sendet daraufhin `null` — die Angabe wird geloescht, nicht „unangetastet\" gelassen", async () => {
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    await click(LEEREN);
    await alleBestaetigen();   // DRK-304: unberuehrte Position sperrt „Weiter"
    await click(WEITER);
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].verfaelle).toStrictEqual([
      { artikelId: "art-1", verfall: null },
    ]);
  });

  it("sendet NICHTS, wenn gar keine Angabe dastand", async () => {
    // Ohne Vorbelegung ist „geleert" derselbe Zustand wie „nie angefasst" — der
    // Filter in `zaehlung()` vergleicht gegen den Vorwert. Ein gesendeter
    // Eintrag loeste hier ein `loescheVerfallEintrag` auf einer Zeile aus, die
    // es nie gab.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    await fill(FELD, "2027-03");
    await click(LEEREN);
    await alleBestaetigen();   // DRK-304: unberuehrte Position sperrt „Weiter"
    await click(WEITER);
    await click(ABSCHLIESSEN);
    expect(abschluss.mock.calls[0][0].verfaelle).toStrictEqual([]);
  });

  it("nimmt die Live-Vorschau „{n} laufen ab\" mit zurueck", async () => {
    // Die Zahl im Fuss rechnet aus DEMSELBEN Zustand. Bliebe sie nach dem
    // Leeren stehen, zaehlte die Oberflaeche eine Angabe, die sie gerade
    // zurueckgenommen hat.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2020-01" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("1 laufen ab");
    await click(LEEREN);
    expect(query("[data-rolle='zaehl-summe']").textContent).not.toContain("laufen ab");
  });

  it("teilt den aria-Praefix des FELDES nicht — sonst greift jeder Selektor zwei Elemente", async () => {
    /*
     * Gemessen in `e2e/lagerbuch-helfer.spec.ts`: das Feld heisst
     * `Verfall <Artikel>`, und ein Knopf mit demselben Anfang liess ein
     * bestehendes `getByLabel(/^Verfall …/)` mit „strict mode violation"
     * brechen. Der Fund ist heimtueckisch, weil er nur mit VORBELEGUNG
     * auftritt — ohne sie erscheint der Knopf gar nicht, und der fremde Test
     * bleibt gruen.
     */
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS()]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    const feldLabel = query(FELD).getAttribute("aria-label") ?? "";
    const knopfLabel = query(LEEREN).getAttribute("aria-label") ?? "";
    expect(feldLabel).toBe("Verfall Kompresse");
    expect(knopfLabel.startsWith(feldLabel)).toBe(false);
    // Dasselbe gilt fuer den Aufklappknopf aus IDA-233 — er steht IMMER da,
    // nicht erst mit Vorbelegung, und braeche den Greifer damit in jedem Lauf.
    const aufLabel = query("[data-rolle='verfall-knopf']").getAttribute("aria-label") ?? "";
    expect(aufLabel.startsWith("Verfall")).toBe(false);
  });

  it("traegt ein eigenes aria-label je Artikel — der Knopf steht je Zeile", async () => {
    // Zwei Artikel, zwei Knoepfe: „entfernen" allein waere fuer eine
    // Bildschirmleserin zweimal derselbe Text an zwei verschiedenen Angaben.
    await mount(
      <CheckFlow
    kontoZugang={false} {...VOLL}
        fahrzeug={FZ}
        soll={[POS(), POS({ id: "sp-2", artikelId: "art-2", artikelName: "Mullbinde" })]}
        geraete={[]}
        flaschen={[]}
        verfall={{ "art-1": "2026-09", "art-2": "2026-10" }}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    await verfallAufklappen();
    const labels = queryAll(LEEREN).map((b) => b.getAttribute("aria-label"));
    expect(labels).toStrictEqual([
      "Kompresse: Verfall entfernen",
      "Mullbinde: Verfall entfernen",
    ]);
  });
});

describe("IDA-247 — zu viel an Bord", () => {
  const BOX = { name: "Entnahmebox" };
  const zaehle = async (n: number) => { for (let i = 0; i < n; i++) await plus(0); };
  const flow = (soll: CheckPos[], entnahmebox: { name: string } | null) => mount(
    <CheckFlow
      kontoZugang={false} {...VOLL}
      entnahmebox={entnahmebox}
      fahrzeug={FZ}
      soll={soll}
      geraete={[]}
      flaschen={[]}
      verfall={{}}
      warn={WARN}
      andereEinheitErreichbar
      letzterCheckText={null}
    />,
  );

  it("schlägt den Überschuss über „OK bis“ vor und sendet, was wirklich in die Box kam", async () => {
    await flow([POS({ soll: 2, sollMax: 4 })], BOX);
    await zaehle(7);
    await click(WEITER);

    const liste = query("[data-rolle='box-liste']");
    expect(liste.textContent).toContain("3 zu viel");
    expect(liste.textContent).toContain("OK bis 4");
    expect(query("[data-rolle='abschlussleiste']").textContent).toContain("3 in die Box");
    // Nur zwei der drei landen wirklich in der Kiste.
    await clickElement(query("[data-rolle='box-liste'] button[aria-label$='verringern']"));
    await click(ABSCHLIESSEN);

    expect(abschluss.mock.calls[0]![0].positionen).toEqual([
      { sollPositionId: "sp-1", ist: 7, nachfuellMenge: 0, boxMenge: 2 },
    ]);
  });

  it("zeigt nichts, solange der Bestand innerhalb von „OK bis“ liegt", async () => {
    await flow([POS({ soll: 2, sollMax: 4 })], BOX);
    await zaehle(4);
    await click(WEITER);

    expect(queryAll("[data-rolle='box-liste']")).toHaveLength(0);
  });

  it("nennt den Überschuss ohne aufnehmende Box, ohne etwas zu buchen", async () => {
    await flow([POS({ soll: 2 })], null);
    await zaehle(5);
    await click(WEITER);

    expect(query("[data-rolle='box-liste']").textContent).toContain("3 zu viel");
    expect(queryAll("[data-rolle='box-liste'] button")).toHaveLength(0);
    expect(query("[data-rolle='box-hinweis']").textContent).toContain("der Verwaltung melden");
    await click(ABSCHLIESSEN);

    expect(abschluss.mock.calls[0]![0].positionen).toEqual([
      { sollPositionId: "sp-1", ist: 5, nachfuellMenge: 0, boxMenge: 0 },
    ]);
  });

  it("meldet auf dem Fertig-Schirm, was in die Box gelegt wurde", async () => {
    abschluss.mockResolvedValue({ ok: true, wert: { ...WERT_NULL, inBox: 3 } });
    await flow([POS({ soll: 2 })], BOX);
    await zaehle(5);
    await click(WEITER);
    await click(ABSCHLIESSEN);

    expect(query("[data-rolle='check-ergebnis']").textContent).toContain("3 in die Entnahmebox gelegt");
  });
});
