// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { ScanHinweis } from "./ScanHinweis";

const QUELLE = "src/app/m/lagerbuch/_ui/ScanHinweis.tsx";
const STYLESHEET = "src/app/m/lagerbuch/_ui/helfer.module.css";

/**
 * DRK-373 — „dein Scan gilt hier nicht".
 *
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5), wie
 * `_ui/rahmen.test.tsx` und `helfer/check/page.test.tsx` sie halten.
 *
 * ⚠️ OHNE SIE SIND DIE BAUFORM-SCANS UNTEN AUF IHRER EIGENEN BEGRUENDUNG ROT:
 * der Kopfkommentar von `ScanHinweis.tsx` schreibt „KEIN "use client"" und
 * „kein antd" aus, und genau diese Saetze sind das, was konserviert werden
 * soll. Die naheliegende „Reparatur" waere, sie zu loeschen.
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
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

const EINHEIT = (
  id: string,
  name: string,
  kennung: string | null = null,
  einheitenart: "fahrzeug" | "tasche" | null = "fahrzeug",
) => ({ id, name, kennung, einheitenart });

const RTW = EINHEIT("rtw-1", "RTW 1", "MS-RTW-1");
const KTW = EINHEIT("ktw-1", "KTW 1", "MS-KTW-1");

const text = () => query("[data-rolle='scan-hinweis-text']").textContent ?? "";

afterEach(async () => {
  await unmount();
});

describe("ScanHinweis — beide Einheiten stehen drin (AK 2)", () => {
  it("nennt die gescannte UND die gezeigte Einheit beim Namen", async () => {
    await mount(<ScanHinweis gescannt={KTW} gezeigt={RTW} />);
    expect(text()).toContain("KTW 1");
    expect(text()).toContain("RTW 1");
  });

  /**
   * ⚠️ DIE REIHENFOLGE IST DIE AUSSAGE, nicht nur Satzbau. „Gescannt hast du
   * KTW 1, dein Kaertchen ist auf RTW 1" und die Umkehrung davon sind beide
   * gruen gegen ein `toContain` auf beide Namen — und genau eine von beiden ist
   * richtig. Wer sie vertauscht, schickt die Helferin in die Einheit, in der
   * sie NICHT steht.
   */
  it("nennt das Gescannte VOR dem Gezeigten", async () => {
    await mount(<ScanHinweis gescannt={KTW} gezeigt={RTW} />);
    expect(text().indexOf("KTW 1")).toBeLessThan(text().indexOf("RTW 1"));
  });

  /**
   * ⚠️ DER SATZ MUSS DEN GRUND TRAGEN, nicht nur die zwei Namen — das
   * Akzeptanzkriterium lautet „… und warum der Check trotzdem die gebundene
   * zeigt". Ohne den Grund liest sich der Hinweis als Fehler der Anwendung, und
   * der naechste Handgriff ist, es „zu reparieren".
   */
  it("sagt, dass das Kaertchen der Grund ist", async () => {
    await mount(<ScanHinweis gescannt={KTW} gezeigt={RTW} />);
    expect(text()).toMatch(/Kärtchen/);
  });

  it("traegt eine Ueberschrift, die sagt, dass der Scan nicht gilt", async () => {
    await mount(<ScanHinweis gescannt={KTW} gezeigt={RTW} />);
    expect(query("[data-rolle='scan-hinweis']").textContent).toContain("gilt hier nicht");
  });
});

describe("ScanHinweis — zwei gleichnamige Einheiten (DRK-309, Reviewrunde 16)", () => {
  /**
   * DER FALL, DER DEN HINWEIS SONST WERTLOS MACHT. `lagerorte.name` traegt fuer
   * Einheiten keinen Eindeutigkeitsschluessel — zwei Taschen duerfen „Betreuung"
   * heissen und beide ohne Kennung sein. Dann stuende hier „Gescannt hast du
   * Betreuung, dein Kaertchen ist auf Betreuung ausgestellt": ein Hinweis, der
   * einen Unterschied BEHAUPTET, den er nicht zeigt. Das ist schlechter als
   * keiner, weil er zum Weiterzaehlen einlaedt.
   */
  it("haengt im Kollisionsfall die Id an — beide Einheiten bleiben unterscheidbar", async () => {
    const a = EINHEIT("t-a", "Betreuung", null, "tasche");
    const b = EINHEIT("t-b", "Betreuung", null, "tasche");
    await mount(<ScanHinweis gescannt={a} gezeigt={b} />);
    expect(text()).toContain("t-a");
    expect(text()).toContain("t-b");
  });

  /**
   * ⚠️ UND DER SCHLUSS DES SATZES DARF DEN NAMEN NICHT EIN DRITTES MAL NENNEN.
   *
   * Der Satz endete einmal auf „… geprueft wird hier also {name}" — mit dem
   * BLOSSEN Namen, und der macht im Kollisionsfall genau die Unterscheidung
   * zunichte, fuer die `einheitLabels` zwei Zeilen darueber eine Id anhaengt:
   * „geprueft wird hier also Betreuung", waehrend beide Einheiten so heissen.
   * Der Hinweis benennt also zwei Einheiten und zeigt am Ende auf keine von
   * beiden.
   *
   * Gezaehlt wird der NAME, nicht das Satzende: ein `toMatch` auf die
   * Schlussformel waere bei jeder Umformulierung rot, ohne dass etwas kaputt
   * ist. Zweimal heisst „einmal je Beschriftung" — ein drittes Vorkommen kann
   * nur der blosse Name sein.
   */
  it("nennt den gleichen Namen genau zweimal — einmal je Beschriftung", async () => {
    const a = EINHEIT("t-a", "Betreuung", null, "tasche");
    const b = EINHEIT("t-b", "Betreuung", null, "tasche");
    await mount(<ScanHinweis gescannt={a} gezeigt={b} />);
    expect(text().match(/Betreuung/g)).toHaveLength(2);
  });

  /**
   * ⚠️ DIE GEGENPROBE, OHNE DIE DIE ZEILE DARUEBER ZU VIEL BEWIESE: die Id ist
   * haesslich und darf NUR im Kollisionsfall erscheinen. Ein bedingungsloses
   * Anhaengen bestuende den Test oben genauso — und schriebe eine nanoid in
   * jeden Hinweis, den irgendwer je liest.
   */
  it("nennt ohne Kollision KEINE Id", async () => {
    await mount(<ScanHinweis gescannt={KTW} gezeigt={RTW} />);
    expect(text()).not.toContain("ktw-1");
    expect(text()).not.toContain("rtw-1");
  });

  /**
   * Die Art trennt, wo der Name es nicht tut (DRK-309): ein Fahrzeug „Betreuung"
   * neben einer Tasche „Betreuung" braucht keine Id — „· Fahrzeug" und
   * „· Tasche" koennen nie dieselbe Zeichenkette ergeben.
   */
  it("laesst die Art trennen, wo sie das kann — dann ohne Id", async () => {
    const wagen = EINHEIT("x-1", "Betreuung", null, "fahrzeug");
    const tasche = EINHEIT("x-2", "Betreuung", null, "tasche");
    await mount(<ScanHinweis gescannt={wagen} gezeigt={tasche} />);
    expect(text()).toContain("Fahrzeug");
    expect(text()).toContain("Tasche");
    expect(text()).not.toContain("x-1");
  });
});

describe("ScanHinweis — kein Ausweg, keine Sackgasse", () => {
  /**
   * ⚠️ NULL LINKS, UND DAS IST DIE ENTSCHEIDUNG DES TICKETS (offene Frage 2).
   *
   * Ein „Weiter zu KTW 1" machte aus der Anzeige-Entscheidung faktisch einen
   * Riegel mit Umgehung; ein „Hol dir das Kaertchen von KTW 1" BEHAUPTET die
   * physische Verteilung der Kaertchen — die offene Betreiberfrage 5, und die
   * ist unbeantwortet. Der Hinweis ist ein Hinweis: der Check laeuft weiter.
   *
   * Das ist zugleich die Zusicherung gegen den naheliegendsten naechsten
   * Handgriff, denn ein Weg zurueck ist auf jeder anderen gestalteten Flaeche
   * dieses Zweigs PFLICHT (`LeerZustand.weg`, §11.7). Hier waere er falsch —
   * und ohne diese Zeile sieht das niemand.
   */
  it("rendert keinen Link und keinen Knopf", async () => {
    await mount(<ScanHinweis gescannt={KTW} gezeigt={RTW} />);
    expect(queryAll("a")).toHaveLength(0);
    expect(queryAll("button")).toHaveLength(0);
  });
});

describe("ScanHinweis — Bauform", () => {
  it("ist eine Server Component ohne antd", () => {
    // §7.1: der Helfer-Ast ist antd-frei; `_lib/bauform.test.ts` haelt das
    // modulweit, dieser Scan haelt es an der Datei (und faengt damit auch eine
    // Verschiebung aus dem Ast heraus).
    const code = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(code).not.toMatch(/^\s*["']use client["']/m);
    expect(code).not.toMatch(/from\s+"antd(\/|")|from\s+"@ant-design\/icons/);
  });

  /**
   * ⚠️ DER NAME KOMMT AUS `einheitLabels`, NICHT AUS `name` — und ein Scan
   * darauf ist hier nicht redundant zum Kollisionstest oben. Jener prueft die
   * WIRKUNG an zwei gleichnamigen Einheiten; dieser faengt den Fall, dass
   * jemand die Kollisionsauflösung „vereinfacht" und dabei den Testfall
   * gleich mitanpasst.
   */
  it("benennt ueber `einheitLabels`", () => {
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).toMatch(/\beinheitLabels\s*\(/);
  });

  it("`gescannt` und `gezeigt` sind PFLICHT-Props", () => {
    // Die Zusage ist der TYP: der halbe Hinweis („dein Scan gilt hier nicht"
    // ohne zu sagen, was stattdessen gilt) ist der teuerste Ausgang der Datei.
    type P = ComponentProps<typeof ScanHinweis>;
    const _pflicht: [P["gescannt"], P["gezeigt"]] = [KTW, RTW];
    expect(_pflicht).toHaveLength(2);
    // @ts-expect-error — ohne `gezeigt` ist der Aufruf ein Typfehler.
    const _halb = <ScanHinweis gescannt={KTW} />;
    expect(_halb).toBeTruthy();
  });

  it("nennt nur Klassen, die `helfer.module.css` DEKLARIERT", () => {
    /*
     * Vite erzeugt fuer JEDEN Schluessel eines CSS-Moduls einen Namen, auch
     * fuer einen, den es nicht gibt — `s.gibtEsNicht` liefert unter Vitest
     * `"_gibtEsNicht_ef45c4"` statt `undefined`. Ein Tippfehler im Klassennamen
     * ist unter Vitest also strukturell unsichtbar, waehrend er im Next-Build
     * `undefined` ergibt und React still `class="undefined"` rendert. Nur der
     * Abgleich gegen das Stylesheet selbst faengt das (Bauform aus
     * `_ui/rahmen.test.tsx`).
     */
    let css = ohneKommentare(readFileSync(STYLESHEET, "utf8"));
    for (let i = 0; i < 5; i++) css = css.replace(/\{[^{}]*\}/g, " ");
    const deklariert = new Set<string>();
    // Zeichengleich der Selektor-Regex aus `_ui/rahmen.test.tsx` — eine
    // laxere Fassung („Punkt optional") liest jedes Wort im Stylesheet als
    // Klassennamen und der Scan wird leer-gruen, ohne dass etwas fehlt.
    for (const m of css.matchAll(/(?:^|[\s,>+~(])\.([A-Za-z][A-Za-z0-9_-]*)/gm)) {
      deklariert.add(m[1]!);
    }
    expect(deklariert.size, "leeres Stylesheet — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(50);

    const genutzt = [...new Set(
      [...ohneKommentare(readFileSync(QUELLE, "utf8"))
        .matchAll(/\bs\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]!),
    )];
    expect(genutzt.length, "keine einzige Klasse geprueft").toBeGreaterThanOrEqual(3);
    expect(genutzt.filter((k) => !deklariert.has(k))).toEqual([]);
  });
});
