// @vitest-environment jsdom
// src/app/m/radio/_ui/AusleihRahmen.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `_actions/sitzung.ts` traegt `"use server"` und zieht `next/headers`, die Gate-Schranke
 * und die Moduldatenbank nach. Der Rahmen braucht `beenden` nur als REFERENZ fuer
 * `<form action={…}>`; WAS sie tut, gehoert A9 (`_actions/guards.test.ts`,
 * `_lib/bauform.test.ts`). Dieselbe Bauform wie
 * `lagerbuch/_ui/HelferRahmen.test.tsx:15-16` und `radio/_ui/GateFormular.test.tsx:34`.
 */
const beendenMock = vi.hoisted(() => vi.fn());
vi.mock("../_actions/sitzung", () => ({ beenden: beendenMock }));

/**
 * L3 — ⛔ NUR `viewerOderNull` IST ERSETZT, `istRadioVerwaltung` LAEUFT ECHT.
 *
 * `viewerOderNull` ist die einzige Stelle des Rahmens mit IO: sie ruft `auth()` und
 * braeuchte sonst eine Sitzung. Das PRAEDIKAT dagegen muss echt bleiben — waere es
 * mitgemockt, maesse der Updater-Fall unten die Attrappe und nicht die
 * Betreiberentscheidung vom 2026-08-27 („der Link zeigt sich BEIDEN Stufen").
 * Dieselbe Teilmocken-Bauform wie `_lib/ausleihZugang.test.ts:55`
 * (`vi.mock("./host", async (echt) => …)`) und `(ausleihe)/geraete/page.test.tsx:100-103`.
 * ⚠️ Hier stand bis zur Fix-Runde 1 zu L3 `_lib/host.test.ts` als Vorbild — jene Datei
 * kennt weder einen Teilmock noch `_lib/zugang` (ihr einziges `vi.mock` ist ein VOLLmock
 * auf `next/navigation`, `:7`). Gemessen, REVIEW-L3 Fund 3.
 */
const viewerMock = vi.hoisted(() => vi.fn());
vi.mock("../_lib/zugang", async (echt) => ({
  ...(await echt<typeof import("../_lib/zugang")>()),
  viewerOderNull: viewerMock,
}));

import { mount, hydrate, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import type { AusleihZugang } from "../_lib/ausleihZugang";
import { istRadioAdmin, type RadioViewer } from "../_lib/zugang";
import { AusleihRahmen } from "./AusleihRahmen";

const QUELLE = "src/app/m/radio/_ui/AusleihRahmen.tsx";
const STYLESHEET = "src/app/m/radio/_ui/ausleihe.module.css";
const MODUL = "src/app/m/radio";

/**
 * ⛔ ERZEUGT, NICHT AUFGEZAEHLT — und das ist die Behebung eines gemessenen Lochs
 * (REVIEW-A18, Fund 2). Hier stand bis zur Fix-Runde 1 zu A18 eine HARTCODIERTE Liste der
 * vier Dateien aus A16. A18 legte drei weitere `_ui/`-Flaechen an und hob die Liste nicht;
 * gemessen: ein `size="large"` am antd-`Button` in `_ui/AktualisierenKnopf.tsx` liess alle
 * 435 Faelle des Moduls gruen. Eine Liste, die jede spaetere Aufgabe von Hand nachziehen
 * muss, veraltet still — die erzeugte Menge kann es nicht.
 *
 * ⛔ UND SIE REICHT UEBER `_ui/` HINAUS: Falle 4 gilt jeder Flaeche, die ein antd-Element
 * rendert, nicht nur einer Insel. `(ausleihe)/geraete/page.tsx` rendert `Empty` und liegt
 * ausserhalb von `_ui/` — ein Scan nur ueber `_ui/*.tsx` liesse genau sie aus.
 */
const FALLE4_DATEIEN = () => quellDateien(MODUL).filter((p) => p.endsWith(".tsx"));

/**
 * Die Teilmenge davon, die `ausleihe.module.css` ueberhaupt liest.
 *
 * ⛔ ZWEI ABGELEITETE MENGEN UND NICHT EINE: der Klassenscan darf nur Dateien sehen, die
 * GENAU DIESES Stylesheet ziehen. Eine gemeinsame Liste waere in dem Moment
 * rot-by-construction, in dem A19/A20 eine Flaeche mit einem zweiten Modul-Stylesheet
 * anlegen — deren Klassen stuenden dann zu Recht nicht in `ausleihe.module.css`.
 */
const STYLESHEET_LESER = () =>
  FALLE4_DATEIEN().filter((pfad) =>
    /\bimport\s+s\s+from\s+["'][^"']*ausleihe\.module\.css["']/.test(
      ohneKommentare(readFileSync(pfad, "utf8")),
    ),
  );

/**
 * ⬜ L10 — DIE ZEICHENKETTE FUER DEN CUTOVER-PRUEFSATZ, HIER ALS ERWARTUNG.
 * §P.9 des Generalprobe-Pruefsatzes
 * (`docs/superpowers/plans/2026-08-18-radio-cutover-leitplan.md:266,277,906`)
 * faehrt `curl` gegen den PORTAL-Host und prueft per `grep -c`, dass sie dort FEHLT.
 * ⛔ Sie traegt keinen Umlaut — sie wird zum Grep-Anker eines Runbooks
 * (`briefs/KOPF.md`, Global Constraints).
 * ⛔ Und sie ist ausdruecklich NICHT die Wortmarke: `src/core/registry.ts:197` fuehrt
 * `title: "Funkgeräte"`, und der App-Umschalter des Portals rendert genau diesen Titel —
 * die Wortmarke stuende im Portal-HTML und machte den Pruefschritt wertlos.
 */
const L10 = "radio-ausleih-rahmen";

const ZUGANG_CODE: AusleihZugang = {
  weg: "code",
  codeId: "zc-1",
  bezeichnung: "Aufsteller Wache",
  laeuftAb: new Date(Date.now() + 6 * 3600_000),
};
const ZUGANG_SUITE: AusleihZugang = { weg: "suite", sub: "pid-1", name: "Rita Roth" };
/**
 * Der Suite-Weg OHNE Anzeigenamen — `name` ist dort `string | null`
 * (`_lib/ausleihZugang.ts:61-63`). Der Rueckfall ist die Anzeigeentscheidung aus
 * `AusleihRahmen.tsx:107-110`, und ohne diesen Zugang erreicht ihn kein Fall.
 */
const ZUGANG_SUITE_OHNE_NAMEN: AusleihZugang = { weg: "suite", sub: "pid-1", name: null };

/**
 * Kopie von `ohneKommentare()` aus `src/app/m/radio/_lib/quelltextScan.ts:61-81`.
 *
 * ⚠️ OHNE SIE SIND DREI DER SCANS UNTEN AUF IHRER EIGENEN BEGRUENDUNG ROT:
 * `AusleihRahmen.tsx` schreibt „KEIN `usePathname`", „kein `<Link href="/abmelden">`" und
 * die Falle-7-Begruendung woertlich in seinen Kopfkommentar. Das sind die Saetze, die der
 * Plan konserviert haben will; die naheliegende „Reparatur" waere, sie zu loeschen.
 * `riegel.test.ts` exportiert die Funktion nicht, und dies ist ein anderer Testkoerper.
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

/** Jeder Klassenname, den eine Quelldatei als `s.name` aus dem Stylesheet zieht. */
function genutzteKlassen(pfad: string): string[] {
  const treffer = ohneKommentare(readFileSync(pfad, "utf8")).matchAll(/\bs\.([A-Za-z][A-Za-z0-9_]*)/g);
  return [...new Set([...treffer].map((m) => m[1]!))];
}

/**
 * Jeder Klassenname, den `ausleihe.module.css` tatsaechlich DEKLARIERT.
 *
 * ⛔ UEBER `ohneKommentare`, WIE DIE VORLAGE (`lagerbuch/_ui/rahmen.test.tsx:54-64`). Roh
 * gelesen gelten Datei-Anker in Kommentaren als Deklaration: `\.([a-zA-Z]+)\s*(?=:)` passt
 * auf das `.md:` in „…A16.md:82-84". Gemessen (Review K5): 28 roh gegen 24 echt, die vier
 * Zusatznamen sind `md`, `css`, `ts`, `tsx`. Heute nicht ausnutzbar — keine Flaeche schreibt
 * `s.md` —, aber die Kopie sicherte weniger zu als ihre Vorlage.
 */
function deklarierteKlassen(): Set<string> {
  const treffer = ohneKommentare(readFileSync(STYLESHEET, "utf8")).matchAll(
    /\.([a-zA-Z][a-zA-Z0-9_]*)\s*(?=[,{:[])/g,
  );
  return new Set([...treffer].map((m) => m[1]!));
}

/** Jede ausgelieferte Quelldatei unter einem Verzeichnis — Testdateien ausgenommen. */
function quellDateien(wurzel: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      quellDateien(pfad, treffer);
      continue;
    }
    if (!/\.(?:tsx?|css)$/.test(eintrag)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

const serverBaum = (html: string): HTMLElement => {
  const traeger = document.createElement("div");
  traeger.innerHTML = html;
  return traeger;
};

/**
 * L3 — die zwei Umgebungsvariablen, die das Praedikat liest, und ihre Ruecknahme.
 *
 * ⛔ WARUM SIE VOR JEDEM FALL GELOESCHT WERDEN und nicht bloss am Ende zurueckgestellt:
 * `.env`-Dateien laedt vitest hier nicht, ein in der Shell oder in der CI EXPORTIERTES
 * SUITE_UPDATER_GROUP_RADIO dagegen kaeme mit — und faerbte den anonymen Fall unten
 * still um. Zeichengleiche Bauform aus `_lib/zugang.test.ts:109-126`.
 */
const alterAdmin = process.env.SUITE_ADMIN_GROUP_RADIO;
const alterUpdater = process.env.SUITE_UPDATER_GROUP_RADIO;
const zuruecksetzen = () => {
  for (const [name, wert] of [
    ["SUITE_ADMIN_GROUP_RADIO", alterAdmin],
    ["SUITE_UPDATER_GROUP_RADIO", alterUpdater],
  ] as const) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
};

beforeEach(() => {
  delete process.env.SUITE_ADMIN_GROUP_RADIO;
  delete process.env.SUITE_UPDATER_GROUP_RADIO;
  // Der Regelfall dieser Datei ist die ANONYME Ausleihflaeche: keine Suite-Sitzung.
  viewerMock.mockResolvedValue(null);
});

afterEach(async () => {
  await unmount();
  beendenMock.mockClear();
  viewerMock.mockReset();
});

describe("radio-AusleihRahmen: die Bauform", () => {
  it("traegt kein use client und keinen ant-design-icons-Import", () => {
    /*
     * Falle 6 UND Falle 7 in einem Fall, und sie sind gegenlaeufig (`CLAUDE.md:41-44`):
     * ein `"use client"` machte den Rahmen zur Client-Grenze und liesse `AusleihZugang`
     * als Client-Referenz ankommen; ein `@ant-design/icons` ergaebe HTTP 500 schon beim
     * Import, und `"use client"` behebt das NICHT — es macht es still.
     * §4.2 (Spec:3380): „alles Server, keine Ausnahme ausser der Restzeit".
     */
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/["']use client["']/);
    expect(q).not.toContain("@ant-design" + "/icons");
    expect(q, "kein antd auf dieser Flaeche (Entscheidung E9)").not.toMatch(/from\s+["']antd["']/);
  });

  it("die Fussnavigation bekommt aktiv als Prop, nicht ueber usePathname", () => {
    /*
     * Bauform-Zulaessigkeitstafel Zeile 16 (`briefs/KOPF.md:357`): `usePathname()` machte
     * den Rahmen zur Client-Grenze. Und es liefert den AEUSSEREN Pfad — auf dem zweiten
     * Weg (`/m/radio/geraete`, `src/core/routing.ts:54-67`) markierte die Leiste dauerhaft
     * den falschen Eintrag, wie in `lagerbuch/_ui/HelferRahmen.tsx:14-26` gemessen.
     */
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/\busePathname\b/);
    /*
     * ⛔ JEDER Hook, nicht eine Aufzaehlung von dreien: `useActionState` und
     * `useFormStatus` sind auf dieser Flaeche die realistischen Faelle (das Gate benutzt
     * `useActionState` bereits), und `useMemo`/`useCallback`/`useRef` kaemen ebenso durch
     * (Review K7). Der Ausdruck faengt jeden Bezeichner der Hook-Form.
     */
    expect(q, "kein Hook in einer Server Component").not.toMatch(/\buse[A-Z][A-Za-z]*\s*\(/);
  });

  it("setzt weder size noch eine der beiden Tap-Zahlen anders als E8 sie festlegt", () => {
    /*
     * Entscheidung E8 (`briefs/KOPF.md`, A16): 64 fuer die Fussnavigation, 44 fuer die
     * kleinen Ziele, beides als CSS-Variablen — und ⛔ `size` auf keinem Element
     * (Falle 4: `size="large"` ist 72). Bis hierher hatte KEINE der beiden Zahlen einen
     * Waechter: Sonde P8 des Reviews verdrehte 64 auf 48 und 44 auf 24, alle 393 Faelle
     * blieben gruen.
     * ⚠️ Das ist NICHT die Falle-5-Messung — ob `min-width` gegen antds cssinjs-Regeln
     * durchkommt, bleibt der Browserlauf in beiden Farbmodi (⬜ im Stylesheet benannt).
     * Dies ist der Textteil, den ein Tor halten kann.
     */
    const css = readFileSync(STYLESHEET, "utf8");
    expect(css, "E8: die Fussnavigation misst 64").toMatch(/--radio-tap-nav:\s*64px/);
    expect(css, "E8: WCAG 2.5.5 AAA sind 44").toMatch(/--radio-tap-klein:\s*44px/);
    const gescannt = FALLE4_DATEIEN();
    expect(gescannt.length, "leere Dateiliste — der Scan waere leer-gruen").toBeGreaterThan(9);
    for (const pfad of gescannt) {
      expect(ohneKommentare(readFileSync(pfad, "utf8")), `${pfad}: Falle 4`).not.toMatch(/\bsize=/);
    }
  });

  it("der Abmeldeweg ist ein form action, kein Link auf /abmelden", () => {
    /*
     * Bauform-Zulaessigkeitstafel Zeile 15 (`briefs/KOPF.md:356`), NS-Z3, Zusage §3.10
     * Nr. 7: Nexts Prefetch fordert das Ziel beim blossen Darueberfahren an und beendete
     * die Sitzung ungefragt. Ein POST-Formular ist nicht prefetch-faehig.
     * ⛔ UND KEIN `signOut` — das raeumte die Suite-Sitzung auf ALLEN Modul-Hosts
     * (Spec:2610-2614); `_lib/bauform.test.ts:521` haelt das zusaetzlich modulweit fest.
     */
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q, "ein Link auf /abmelden — Prefetch beendet die Sitzung").not.toMatch(/["'`]\/abmelden/);
    expect(q).toMatch(/<form\s+action=\{beenden\}/);
    expect(q).not.toMatch(/\bsignOut\b/);
  });

  it("nennt nur Klassen, die ausleihe.module.css DEKLARIERT", () => {
    /*
     * Falle 2 in ihrer stillsten Gestalt: `s.tippfehler` ist `undefined`, das Element
     * rendert ohne Klasse, und weder `typecheck` noch `lint` noch `build` sagen ein Wort —
     * die Linie verschwindet einfach. Vorbild `lagerbuch/_ui/rahmen.test.tsx:54-64`.
     */
    const deklariert = deklarierteKlassen();
    const leser = STYLESHEET_LESER();
    expect(leser.length, "leere Dateiliste — der Scan waere leer-gruen").toBeGreaterThan(5);
    const fehlend = leser.flatMap((pfad) =>
      genutzteKlassen(pfad)
        .filter((name) => !deklariert.has(name))
        .map((name) => `${pfad}: s.${name}`),
    );
    expect(fehlend).toEqual([]);
  });
});

describe("radio-AusleihRahmen: das Sitzungsetikett kommt vom RIEGEL", () => {
  it("zeigt bei weg code die bezeichnung, bei weg suite den Namen", async () => {
    /*
     * §4.2 (Spec:3382-3384): „bei Code-Zugang ‚Zugang: Code <bezeichnung>', bei
     * angemeldeter Sitzung der Anzeigename". Die Zeichenkette kommt aus `AusleihZugang`
     * (A7, `_lib/ausleihZugang.ts:61-63`) — ⛔ NICHT aus dem Cookie: dessen Nutzlast
     * traegt nur `codeId` (Spec:2504-2507), und eine dort eingefrorene Bezeichnung waere
     * zwoelf Stunden alt.
     */
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
    );
    expect(query("[data-rolle='radio-sitzungsetikett']").textContent).toContain("Aufsteller Wache");

    await unmount();
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_SUITE, children: <p /> }),
    );
    const etikett = query("[data-rolle='radio-sitzungsetikett']").textContent ?? "";
    expect(etikett).toContain("Rita Roth");
    expect(etikett, "die codeId gehoert nicht auf den Bildschirm").not.toContain("pid-1");

    /*
     * ⛔ DER DRITTE ZWEIG — der RUECKFALL, wenn der Suite-Weg keinen Anzeigenamen fuehrt.
     * `AusleihRahmen.tsx:107-110` sichert woertlich zu, `sub` sei „eine undurchsichtige
     * Kennung, die auf keinen Bildschirm gehoert" — bis hierher setzte das keine Zeile
     * durch: der Halt `not.toContain("pid-1")` darueber greift nur, SOLANGE `name`
     * gesetzt ist. Die Fehlerklasse aus `progress.md:441-446`, gemessen als Sonde P4 des
     * Reviews (`?? zugang.sub` liess alle 46 Faelle gruen).
     * ⚠️ Der Anker ist umlautfrei ("Angemeldet"), nicht der ganze Satz.
     */
    await unmount();
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_SUITE_OHNE_NAMEN, children: <p /> }),
    );
    const rueckfall = query("[data-rolle='radio-sitzungsetikett']").textContent ?? "";
    expect(rueckfall, "ohne Namen traegt der Rueckfalltext").toContain("Angemeldet");
    expect(rueckfall, "die Kennung gehoert nicht auf den Bildschirm").not.toContain("pid-1");
  });

  it("traegt die Wortmarke — der erste Posten von §4.2", async () => {
    /*
     * §4.2 (Spec:3374-3384) nennt „Wortmarke + Sitzungsetikett" in einem Atemzug; bis
     * hierher bewachte kein Fall die Wortmarke (Sonde P3 des Reviews: die Zeile ersatzlos
     * entfernt, 397 Faelle blieben gruen). Sie traegt zugleich Last in der L10-Begruendung
     * (`AusleihRahmen.tsx:23-25`, „Er ist ausdruecklich NICHT die Wortmarke") — die
     * Unterscheidung ist erst dann eine, wenn die Wortmarke auch da ist.
     * ⚠️ Der Anker ist umlautfrei (Global Constraints): „Funkger", nicht das ganze Wort.
     */
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
    );
    expect(query(`[data-rolle='${L10}']`).textContent).toContain("Funkger");
  });

  it("ein Code-Zugang bekommt keinen Link ins Portal", async () => {
    /*
     * §4.2 (Spec:3387-3391) und die Gegenprobe `docs/design/README.md:420`: ein sichtbarer
     * Weg dorthin, wo die aufrufende Person nicht hindarf, ist schlechter als keiner. Wer
     * ueber einen QR-Code kam, hat keine Suite-Sitzung — der Link fuehrte in den Login.
     */
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
    );
    expect(exists("[data-rolle='radio-portallink']")).toBe(false);
  });

  it("eine Suite-Sitzung bekommt ihn — sonst waere der Fall darueber leer-gruen", async () => {
    // Die positive Haelfte. Ohne sie bliebe „kein Link" auch dann gruen, wenn es den Link
    // ueberhaupt nicht gibt — dieselbe Fehlerklasse wie ein Waechter ueber leerer Menge.
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_SUITE, children: <p /> }),
    );
    expect(exists("[data-rolle='radio-portallink']")).toBe(true);
  });

  it("nur der Code-Weg zeigt eine Restzeit — der Suite-Weg hat keinen Ablauf", async () => {
    /*
     * Spec:4065-4068, woertlich: „den Ablaufzeitpunkt (`laeuftAb` — bei `weg: "suite"`
     * gibt es keinen, der Kopf zeigt dann keine Restzeit)". Der Typ erzwingt es bereits
     * (`_lib/ausleihZugang.ts:61-63` fuehrt `laeuftAb` nur im Code-Zweig); dieser Fall
     * belegt, dass die Flaeche daraus auch das Richtige macht.
     */
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
    );
    expect(exists("[data-rolle='radio-restzeit']")).toBe(true);

    await unmount();
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_SUITE, children: <p /> }),
    );
    expect(exists("[data-rolle='radio-restzeit']")).toBe(false);
  });
});

describe("radio-AusleihRahmen: die Ablaufgrenze rechnet der RAHMEN (§4.2)", () => {
  /**
   * ⚠️ BEIDE FAELLE PRUEFEN DAS SERVER-HTML, nicht den gemounteten Baum — und genau darin
   * liegt ihre Zusage. `Restzeit` setzt ihren Zeitgeber sofort nach dem Mounten; im
   * gemounteten Baum haette ein fest verdrahtetes `abgelaufenInitial={false}` nach einem
   * Durchlauf dieselbe Anzeige ergeben wie die richtige Rechnung. `renderToString` fuehrt
   * keinen Effekt aus — dort ist die Rechnung `zugang.laeuftAb <= jetzt` die EINZIGE
   * Quelle. Vorbild: `lagerbuch/_ui/HelferRahmen.test.tsx:230-244`.
   *
   * ⛔ WARUM ES SIE NEBEN `Restzeit.test.tsx` BRAUCHT: jene Datei reicht
   * `abgelaufenInitial` als Prop herein und bewacht damit die Insel. Der STARTWERT
   * entsteht aber HIER, in `AusleihRahmen.tsx` — ohne diese zwei Faelle liesse sich er
   * auf eine Konstante verdrahten, und alle uebrigen Faelle blieben gruen (gemessen als
   * Sonden S35 und S36). Der Hydrationsfehler kaeme dann durch den Aufrufer zurueck.
   *
   * Die beiden sind keine Kopien voneinander: der erste haelt allein die Richtung „noch
   * nicht abgelaufen", der zweite allein die Richtung „abgelaufen".
   */
  it("weit vor Ablauf traegt das Server-HTML KEINEN Ablaufsatz", async () => {
    let html = "";
    await hydrate(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
      (wirt) => {
        html = wirt.innerHTML;
      },
    );
    expect(serverBaum(html).querySelector("[data-rolle='radio-restzeit']")).not.toBeNull();
    expect(serverBaum(html).querySelector("[data-rolle='radio-restzeit-abgelaufen']")).toBeNull();
  });

  it("nach Ablauf traegt es ihn schon — die Gegenrichtung", async () => {
    const abgelaufen: AusleihZugang = { ...ZUGANG_CODE, laeuftAb: new Date(Date.now() - 60_000) };
    let html = "";
    await hydrate(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: abgelaufen, children: <p /> }),
      (wirt) => {
        html = wirt.innerHTML;
      },
    );
    expect(serverBaum(html).querySelector("[data-rolle='radio-restzeit-abgelaufen']")).not.toBeNull();
  });
});

/**
 * ================================================================================
 * AUFGABE L3 — DER WEG IN DIE VERWALTUNG, IM KOPF DER AUSLEIHFLAECHE
 * ================================================================================
 *
 * ⛔ WOFUER DIESE FAELLE DA SIND UND WOFUER NICHT: sie messen eine ANZEIGE-Entscheidung.
 * Sie riegeln NICHTS. Alle zwoelf Verwaltungsflaechen tragen ihren Riegel als erste
 * Anweisung, unabhaengig davon, ob ein Link auf sie zeigt
 * (`.superpowers/sdd/BERICHT-urls-und-adminzugang.md` §2.7, `riegel.test.ts` Klauseln (a)
 * und (e)). ⛔ Ein Link aendert daran nichts — und ein fehlender Link sichert nichts.
 *
 * ⛔ WARUM HIER UND NICHT AM GATE: `page.tsx` trug den Link bis zum 2026-08-27 und er war TOT DURCH
 * KONSTRUKTION — wer eine Suite-Sitzung hat, ist von `page.tsx:75` laengst nach `/geraete`
 * weitergeschickt (§2.10, Posten 7, entfernt in `4b4d1627`). Der Bestand verortet ihn selbst hier:
 * `_lib/zugang.ts:505-507` nennt „am /admin-Link der Ausleihflaeche" als Grund, warum `istRadioAdmin`
 * die Admin-Stufe bleibt. ⚠️ Die Messung nennt `:456-458`; seither gewandert, Wortlaut gleich.
 *
 * ⛔ BEIDE STUFEN, UND DAS IST GEMESSEN (Betreiberentscheidung 2026-08-27, Bericht §2.8):
 * SECHS der zehn Verwaltungsseiten stehen dem UPDATER offen, `/admin` selbst
 * eingeschlossen (`admin/(arbeit)/page.tsx` traegt `requireRadioVerwaltung()`). Haenge der
 * Link an `istRadioAdmin`, bliebe der Updater ohne sichtbaren Weg auf eine Seite, die er
 * VOLLBERECHTIGT oeffnet. Sonde P2 unten misst genau diese Fehlbauform.
 *
 * ⛔ DER ANKER IST DER VERTRAG AN L6: `data-rolle="radio-verwaltungslink"`, umlautfrei.
 * `gate-admin` gibt es nicht mehr; der e2e-Fall ankert auf DIESEM Namen.
 */
describe("radio-AusleihRahmen: der Weg in die Verwaltung (L3)", () => {
  const VERWALTUNGSLINK = "[data-rolle='radio-verwaltungslink']";
  const person = (groups: string[]): RadioViewer => ({ sub: "pid-7", name: "V. Person", groups });

  it("die Admin-Stufe sieht den Weg", async () => {
    /*
     * ⛔ DIE UPDATER-STUFE IST ABSICHTLICH OFFEN GESETZT, und der Viewer steht trotzdem
     * NICHT in ihr. Ohne das truege der Fall nicht, was sein Name sagt: bei geschlossener
     * Updater-Stufe waere `istRadioUpdater` fuer JEDEN Viewer `false`, und ein Rahmen, der
     * versehentlich nur die Admin-Gruppe kennte, saehe genauso aus
     * (dieselbe Richtung wie `_lib/zugang.test.ts:549-563`).
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      viewerMock.mockResolvedValue(person(["iuk-radio-admin"]));
      await mount(
        await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_SUITE, children: <p /> }),
      );
      const link = query(VERWALTUNGSLINK);
      /*
       * ⛔ DER AEUSSERE PFAD, NICHT `/m/radio/admin` — ein innerer wuerde auf dem
       * Modul-Host doppelt praefixiert (`AusleihRahmen.tsx:70-72`, gemessen in
       * `lagerbuch/_ui/HelferRahmen.tsx:37-40`).
       */
      expect(link.getAttribute("href")).toBe("/admin");
      expect(link.tagName, "ein Anker, kein Knopf").toBe("A");
      expect(link.textContent?.trim(), "ein Zeichen allein traegt nicht").not.toBe("");
    } finally {
      zuruecksetzen();
    }
  });

  it("die Updater-Stufe sieht ihn ebenfalls — das ist der Sinn der Entscheidung", async () => {
    /*
     * ⛔ DER TRAGENDE FALL, und zugleich die Gegenprobe gegen die naheliegende
     * Fehlbauform „der Link haengt an `istRadioAdmin`": die erste Zusicherung haelt fest,
     * dass diese Person die ADMIN-Stufe NICHT hat, die zweite, dass sie den Weg trotzdem
     * sieht. ⛔ `admin` bleibt dabei strikt strenger als `updater`; hier waechst nichts
     * zusammen, der Rahmen fragt nur die schwaechere der drei Fragen.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      viewerMock.mockResolvedValue(person(["eine-updater-gruppe"]));
      await mount(
        await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_SUITE, children: <p /> }),
      );
      expect(istRadioAdmin(person(["eine-updater-gruppe"])), "sonst misst der Fall die Admin-Stufe")
        .toBe(false);
      expect(query(VERWALTUNGSLINK).getAttribute("href")).toBe("/admin");
    } finally {
      zuruecksetzen();
    }
  });

  it("die ANONYME Ausleihflaeche zeigt ihn NICHT — §4.9.6", async () => {
    /*
     * ⛔ DER WICHTIGSTE FALL, UND ER HAT EINE SPEC-BEGRUENDUNG (§4.9.6, Spec:3919-3922):
     * der Bestand setzte auf der anonymen Flaeche einen Knopf „Geraete verwalten" auf
     * `/admin` (`radio-inventar/.../DeviceList.tsx:89-98`) — „ein sichtbarer Weg dorthin,
     * wo die aufrufende Person nicht hindarf, verletzt die Gegenprobe"
     * (`docs/design/README.md:420`). Die Betreiberentscheidung vom 2026-08-27 hebt das
     * NICHT auf, sie erfuellt es: der Link erscheint NUR Berechtigten.
     *
     * ⛔ BEIDE UMGEBUNGSLAGEN, weil `null` zwei Wege durch das Praedikat nimmt: bei
     * OFFENER Updater-Stufe liefe ein fehlender Null-Schutz in `viewer.groups` und damit
     * in einen TypeError statt in ein `false` (`_lib/zugang.test.ts:610-620`).
     */
    try {
      viewerMock.mockResolvedValue(null);
      await mount(
        await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
      );
      expect(exists(VERWALTUNGSLINK), "geschlossene Updater-Stufe").toBe(false);

      await unmount();
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      await mount(
        await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
      );
      expect(exists(VERWALTUNGSLINK), "offene Updater-Stufe").toBe(false);

      /*
       * ⛔ UND DIE DRITTE LAGE, die weder anonym noch berechtigt ist: eine ANGEMELDETE
       * Person OHNE jede Stufe. Ohne sie bliebe der Fall auch ueber einem Rahmen gruen,
       * der schlicht auf „ist da eine Sitzung?" prueft statt auf die Rechtestufe —
       * `zugang.weg === "suite"` steht in dieser Datei zwei Zeilen ueber dem Praedikat und
       * ist der naheliegende Fehlgriff.
       */
      await unmount();
      viewerMock.mockResolvedValue(person(["irgendeine-andere"]));
      await mount(
        await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_SUITE, children: <p /> }),
      );
      expect(exists(VERWALTUNGSLINK), "angemeldet ohne Stufe").toBe(false);
    } finally {
      zuruecksetzen();
    }
  });

  it("haengt am Praedikat und NICHT am Zugangsweg — auch der Code-Zugang zeigt ihn", async () => {
    /*
     * ⛔ DIE GEGENPROBE ZUR AUFLAGE 2 („der Link haengt am Praedikat, nicht am Riegel") in
     * ihrer hier drohenden Gestalt: ein spaeterer Leser sieht `zugang.weg === "suite"` an
     * der Zeile darueber und ergaenzt es als vermeintlich fehlende Bedingung. Das blendete
     * genau die Verwalterin aus, die am Aufsteller steht und ueber den QR-Code hereinkam —
     * die Luecke, die L3 schliessen soll. Das Praedikat schliesst den Fall bereits ein:
     * ohne Suite-Sitzung gibt `viewerOderNull()` `null`.
     */
    try {
      viewerMock.mockResolvedValue(person(["iuk-radio-admin"]));
      await mount(
        await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
      );
      expect(exists(VERWALTUNGSLINK)).toBe(true);
    } finally {
      zuruecksetzen();
    }
  });
});

describe("radio-AusleihRahmen: die Fussnavigation", () => {
  it("traegt DREI Ziele auf AEUSSEREN Pfaden", async () => {
    /*
     * §4.2 (Spec:3387-3389) und Entscheidung E1 (`briefs/KOPF.md:436-438`): „Uebersicht"
     * zeigt auf `/geraete`, NICHT auf `/` — dort liegt das Gate, und zwei Dateien auf
     * demselben Pfad lehnt Next beim Build ab.
     * ⛔ AEUSSERE Pfade. Innere (`/m/radio/geraete`) wuerden auf dem Modul-Host doppelt
     * praefixiert (`lagerbuch/_ui/HelferRahmen.tsx:37-40`).
     */
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
    );
    const ziele = queryAll("[data-rolle='radio-fussnav'] a").map((a) => a.getAttribute("href"));
    expect(ziele).toEqual(["/geraete", "/ausleihen", "/rueckgabe"]);
  });

  it("markiert GENAU EINEN Eintrag, und zwar den aus dem Prop", async () => {
    for (const [aktiv, href] of [
      ["uebersicht", "/geraete"],
      ["ausleihen", "/ausleihen"],
      ["rueckgabe", "/rueckgabe"],
    ] as const) {
      await unmount();
      await mount(
        await AusleihRahmen({ aktiv: aktiv, zugang: ZUGANG_CODE, children: <p /> }),
      );
      const markiert = queryAll("[data-rolle='radio-fussnav'] [aria-current='page']");
      expect(markiert.length, aktiv).toBe(1);
      expect(markiert[0]!.getAttribute("href"), aktiv).toBe(href);
    }
  });

  it("jeder Eintrag traegt sichtbaren Text neben seinem Zeichen", async () => {
    // §4.6.4: `RefreshCw` faellt weg, weil ein Wort verstaendlicher ist als ein Zeichen
    // (Spec:3747-3752). Dieselbe Regel gilt fuer die Leiste: das Zeichen ist `aria-hidden`,
    // die Beschriftung traegt.
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
    );
    for (const eintrag of queryAll("[data-rolle='radio-fussnav'] a")) {
      expect(eintrag.textContent?.trim(), eintrag.getAttribute("href") ?? "?").not.toBe("");
      expect(eintrag.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
  });
});

describe("radio-AusleihRahmen: der Beenden-Knopf und der Inhalt", () => {
  it("ist ein Formular auf die Server Action, kein Anker", async () => {
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
    );
    const knopf = query("[data-rolle='radio-beenden']");
    expect(knopf.tagName).toBe("BUTTON");
    expect(knopf.getAttribute("type")).toBe("submit");
    expect(knopf.closest("form")).not.toBeNull();
  });

  it("rendert die Kinder im main", async () => {
    await mount(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p data-rolle="kind">Inhalt</p> }),
    );
    expect(query("main [data-rolle='kind']").textContent).toBe("Inhalt");
  });
});

describe("radio-AusleihRahmen: ⬜ L10, die Zeichenkette fuer den Cutover-Pruefsatz", () => {
  it("steht im GERENDERTEN Ergebnis, nicht nur im JSX", async () => {
    /*
     * ⛔ ABGELESEN AUS DEM SERVER-HTML, wie `briefs/A16.md:82-84` es verlangt: „lies ihn
     * aus dem tatsaechlich gerenderten Ergebnis ab, nicht aus dem Quelltext. Eine
     * Zeichenkette, die im JSX steht, aber nach dem Rendern anders aussieht (Whitespace,
     * Entities), macht den Cutover-Schritt still wertlos."
     */
    let html = "";
    await hydrate(
      await AusleihRahmen({ aktiv: "uebersicht", zugang: ZUGANG_CODE, children: <p /> }),
      (wirt) => {
        html = wirt.innerHTML;
      },
    );
    expect(html, `⬜ L10 fehlt im gerenderten Rahmen: ${L10}`).toContain(L10);
    expect(serverBaum(html).querySelector(`[data-rolle='${L10}']`)).not.toBeNull();
  });

  it("die Belegzeile im Kopf der Datei nennt genau diesen Wert", () => {
    // ⛔ Wer ihn aendert, aendert einen Cutover-Schritt mit. Ohne diesen Fall stuende im
    // Kopf eine Zusicherung, die keine Zeile durchsetzt — die Fehlerklasse aus
    // `progress.md:441-446`.
    expect(readFileSync(QUELLE, "utf8")).toContain(`Der Wert ist: "${L10}"`);
  });

  it("kommt in keiner Portal-Quelle und in keiner Huellen-Quelle vor", () => {
    /*
     * Die Haelfte des Pruefsatzes, die HEUTE messbar ist. Die andere — dass sie im
     * ausgelieferten Portal-HTML fehlt — faehrt der Cutover per `curl`
     * (`docs/superpowers/plans/2026-08-18-radio-cutover-leitplan.md:266`); ein Vitest-Lauf
     * kann keinen Host abrufen.
     * ⛔ Und sie traegt keinen Umlaut, weil sie ein Grep-Anker wird.
     */
    expect(L10).toMatch(/^[a-z0-9-]+$/);
    const fremd = [...quellDateien("src/app/m/portal"), ...quellDateien("src/core")].filter((pfad) =>
      readFileSync(pfad, "utf8").includes(L10),
    );
    expect(fremd, "die Zeichenkette steht ausserhalb des Ausleih-Rahmens").toEqual([]);
  });
});
