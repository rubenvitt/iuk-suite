// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";
import { LAGERBUCH_NAV } from "@/app/m/lagerbuch/_lib/nav";

const redirect = vi.hoisted(() => vi.fn((p: string) => { throw new Error(`REDIRECT:${p}`); }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NOTFOUND"); }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

/**
 * RISIKO AUS DEM VORAB-SCAN, BESTAETIGT: `VerwaltungsRahmen` -> `Shell` ->
 * `FullShell` ist eine ASYNC Server Component. `react-dom/client` (das
 * Testharness) kann so etwas nicht rendern ("An unknown Component is an
 * async Client Component"), das ist eine RSC-Faehigkeit, keine Client-Faehigkeit.
 * Ersetzt wie in den uebrigen Consumes desselben Tests per `vi.mock` — Vorbild
 * `helfer/page.test.tsx:150-155` (`HelferRahmen`-Mock mit Marker-Div).
 *
 * Review-Nachtrag (Befund 2): der Mock verwarf `nav` bisher ungelesen, damit
 * war die einzige Absicherung fuer `nav={LAGERBUCH_NAV}` im ganzen Repo ein
 * roher Quelltext-Scan (bauform.test.ts deckt `g/` nicht ab). Der Mock
 * schreibt das empfangene `nav` jetzt mit — Vorbild fuer den Sammel-Ansatz:
 * `gesuchtMit` weiter unten bei den Lesepfad-Mocks (Befund 1).
 */
const rahmenAufrufe = vi.hoisted(() => ({ nav: [] as unknown[] }));
vi.mock("@/app/m/lagerbuch/_ui/VerwaltungsRahmen", () => ({
  VerwaltungsRahmen: (p: { nav: unknown; children: ReactNode }) => {
    rahmenAufrufe.nav.push(p.nav);
    return <div data-rolle="verwaltungsrahmen">{p.children}</div>;
  },
}));

const viewer = vi.hoisted(() => ({ wert: null as { sub: string; groups: string[] } | null }));
const helfer = vi.hoisted(() => ({ wert: null as { tokenId: string } | null }));
vi.mock("@/app/m/lagerbuch/_lib/zugang", () => ({
  viewerOderNull: async () => viewer.wert,
  istLagerbuchAdmin: (v: unknown) => Boolean(v),
}));
vi.mock("@/app/m/lagerbuch/_lib/helferZugang", () => ({
  helferZugangOderNull: async () => helfer.wert,
}));

const treffer = vi.hoisted(() => ({ geraet: null as { id: string } | null,
                                    bz: null as { id: string } | null }));
/**
 * Review-Nachtrag (Befund 1): die Mocks ignorierten bisher ihr Argument — der
 * A13.3-Quelltext-Scan beweist nur die TEXTORDNUNG von
 * `normalisiereBarcode(` vor `geraetByBarcode(`/`bzGeraetByBarcode(`, nicht
 * dass der NORMALISIERTE Wert tatsaechlich uebergeben wird. Diese Mutation
 * blieb bisher unsichtbar: `geraetByBarcode(db, code)` statt
 * `geraetByBarcode(db, gesucht)`. `gesuchtMit` sammelt jetzt den tatsaechlich
 * uebergebenen Barcode je Lesepfad.
 */
const gesuchtMit = vi.hoisted(() => ({ geraet: [] as string[], bz: [] as string[] }));
vi.mock("@/app/m/lagerbuch/_lib/lesepfade/geraete", () => ({
  geraetByBarcode: (_db: unknown, barcode: string) => {
    gesuchtMit.geraet.push(barcode);
    return treffer.geraet;
  },
}));
vi.mock("@/app/m/lagerbuch/_lib/lesepfade/bz", () => ({
  bzGeraetByBarcode: (_db: unknown, barcode: string) => {
    gesuchtMit.bz.push(barcode);
    return treffer.bz;
  },
}));
vi.mock("@/app/m/lagerbuch/_db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/app/m/lagerbuch/_lib/host", () => ({ requireLagerbuchHost: () => {} }));

import GeraetDeepLink from "./page";

const params = (code: string) => Promise.resolve({ code });

beforeEach(() => {
  viewer.wert = null; helfer.wert = null;
  treffer.geraet = null; treffer.bz = null;
  gesuchtMit.geraet = []; gesuchtMit.bz = [];
  rahmenAufrufe.nav = [];
  redirect.mockClear(); notFound.mockClear();
});
afterEach(() => unmount());

describe("g/[code] — die Rollen-Weiche (§3.2.1, §11.3)", () => {
  /**
   * §11.5, ZUSTAND 18: ohne jede Sitzung fuehrt der Weg AUFS GATE mit returnTo,
   * NIE nach /login. Das ist die Zeile, an der ein requireLagerbuchAdmin() in
   * dieser Datei sichtbar wuerde — und der Grund, warum hier ein Praedikat steht
   * und kein Riegel. Ein Riegel schickte jeden anonymen Scan nach /login, also
   * genau den Ausfall, gegen den requiresAuth:false gebaut ist.
   */
  it("schickt ohne Sitzung aufs Gate mit returnTo", async () => {
    await expect(GeraetDeepLink({ params: params("4012345678901") }))
      .rejects.toThrow("REDIRECT:/?returnTo=%2Fg%2F4012345678901");
  });

  /** Mit Helfer-Sitzung, ohne Verwaltungsrecht: der Helfer-Bereich. Eine
   *  Helfer-Geraeteansicht gibt es in V1 nicht (1:1 aus page.tsx:24). */
  it("schickt mit Helfer-Sitzung in den Helfer-Bereich", async () => {
    helfer.wert = { tokenId: "t1" };
    await expect(GeraetDeepLink({ params: params("4012345678901") }))
      .rejects.toThrow("REDIRECT:/helfer");
  });

  it("leitet den Admin bei einem Geraetetreffer weiter", async () => {
    viewer.wert = { sub: "u1", groups: ["lagerbuch_nutzer"] };
    treffer.geraet = { id: "g1" };
    await expect(GeraetDeepLink({ params: params("4012345678901") }))
      .rejects.toThrow("REDIRECT:/verwaltung/geraete/g1");
  });

  /** Erst Geraete, dann BZ: der Barcode-Namensraum ist ueber beide Tabellen
   *  global eindeutig (geraetSpeichern prueft das), daher genuegt die
   *  Reihenfolge. 1:1 aus page.tsx:29-32. */
  it("leitet den Admin bei einem BZ-Treffer weiter", async () => {
    viewer.wert = { sub: "u1", groups: ["lagerbuch_nutzer"] };
    treffer.bz = { id: "b1" };
    await expect(GeraetDeepLink({ params: params("4012345678901") }))
      .rejects.toThrow("REDIRECT:/verwaltung/bz/b1");
  });

  /** ÄUSSERE Pfadform in jedem Redirect-Ziel (§2.1 g): unter dem Host-Rewrite
   *  fuehrt /verwaltung/geraete/g1 richtig, /m/lagerbuch/... waere doppelt. */
  it("benutzt in den Zielen die aeussere Pfadform", async () => {
    viewer.wert = { sub: "u1", groups: ["lagerbuch_nutzer"] };
    treffer.geraet = { id: "g1" };
    await expect(GeraetDeepLink({ params: params("x") })).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith("/verwaltung/geraete/g1");
    expect(redirect).not.toHaveBeenCalledWith(expect.stringContaining("/m/lagerbuch"));
  });
});

describe("g/[code] — der eine gerenderte Zustand (§11.3, 8-C2)", () => {
  beforeEach(() => { viewer.wert = { sub: "u1", groups: ["lagerbuch_nutzer"] }; });

  /**
   * ALTE FASSUNG: page.tsx:33 ruft notFound(). NEUE FASSUNG: HTTP 200 mit einem
   * gestalteten Zustand. §12.3, Regel 3 — beide stehen hier namentlich
   * nebeneinander.
   */
  it("ruft NICHT notFound", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    expect(notFound).not.toHaveBeenCalled();
  });

  it("nennt den gescannten Code im Klartext", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    // Zur Kontrolle gegen das Typenschild — die Auskunft, die die Suite-404
    // ausgerechnet nicht gibt.
    expect(query("[data-testid='lb-barcode-code']").textContent).toBe("4012345678901");
  });

  it("traegt Ueberschrift und Erklaerung", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    expect(document.body.textContent).toContain("Kein Gerät zu diesem Barcode");
    expect(document.body.textContent)
      .toContain("weder ein Gerät noch eine Sauerstoff-Flasche");
  });

  /** §11.7: BEIDE benannten Wege stehen IM Zustand und werden nicht durch die
   *  Navigation ersetzt. */
  it("bietet beide Wege zurueck", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    expect(query("[data-testid='lb-barcode-nochmal']").getAttribute("href"))
      .toBe("/verwaltung/geraete/scan");
    expect(query("[data-testid='lb-barcode-liste']").getAttribute("href"))
      .toBe("/verwaltung/geraete");
  });

  /**
   * FALLE 29: die einzige unnormalisierte Lesestelle des Bestands
   * (page.tsx:29,31) — waehrend beide Schreibwege trimmen und der andere
   * Leseweg ebenfalls. Trimmen kann nur Treffer HINZUFUEGEN.
   *
   * ⚠️ RULING A13.3: der Brief-Testkoerper verankert NICHT an der Klammer
   * (`quelle.indexOf("geraetByBarcode")` ohne `(`) — das trifft die IMPORTZEILE
   * (die der Consumes-Vertrag erzwingt) noch vor jedem Aufruf im Rumpf und ist
   * fuer JEDE vertragskonforme Implementierung unerfuellbar. Repariert wie
   * `bauform.test.ts:288-293` es vormacht („mit `/istLagerbuchAdmin/` gruen,
   * mit `/istLagerbuchAdmin\s*\(/` rot"): an der Aufrufklammer verankert, ueber
   * `ohneKommentareUndZeichenketten` (POSITIVE Zusicherung — ein Kommentar oder
   * ein Zeichenkettenliteral mit dem Aufruftext darf den Nachweis nicht
   * erfuellen).
   */
  it("normalisiert den Routenparameter vor der Suche", async () => {
    const quelle = readFileSync(join(__dirname, "page.tsx"), "utf8");
    const bereinigt = ohneKommentareUndZeichenketten(quelle);
    const i = bereinigt.search(/\bnormalisiereBarcode\s*\(/);
    expect(i).toBeGreaterThan(-1);
    // ...und nicht nur aufgerufen, sondern VOR beiden Lesepfaden angewandt:
    expect(bereinigt.search(/\bgeraetByBarcode\s*\(/)).toBeGreaterThan(i);
    expect(bereinigt.search(/\bbzGeraetByBarcode\s*\(/)).toBeGreaterThan(i);
  });

  /**
   * REVIEW-NACHTRAG, BEFUND 1: der Quelltext-Scan oben beweist nur die
   * TEXTORDNUNG, nicht den tatsaechlich uebergebenen WERT. Diese Mutation blieb
   * bisher gruen: `geraetByBarcode(db, code)` statt `geraetByBarcode(db,
   * gesucht)` — Falle 29 waere damit wieder offen, unsichtbar fuer den
   * Quelltext-Scan. Ein Code MIT Leerzeichen zeigt den Unterschied: nur der
   * NORMALISIERTE Wert (getrimmt) darf bei beiden Lesepfaden ankommen. Beide
   * Pfade werden erreicht, weil `treffer.geraet`/`treffer.bz` im `beforeEach`
   * auf `null` stehen (Miss → faellt bis zum gestalteten Zustand durch).
   */
  it("sucht in BEIDEN Lesepfaden mit dem NORMALISIERTEN Wert, nicht dem rohen", async () => {
    await mount(await GeraetDeepLink({ params: params(" 4012345678901 ") }));
    expect(gesuchtMit.geraet).toEqual(["4012345678901"]);
    expect(gesuchtMit.bz).toEqual(["4012345678901"]);
  });

  /**
   * REVIEW-NACHTRAG, BEFUND 2 (Laufzeit-Haelfte): der Rahmen-Mock verwarf `nav`
   * bisher ungelesen — vertragsseitig fing der Quelltext-Scan es ab, aber
   * `bauform.test.ts` deckt `g/` nicht ab, der Quelltext-Scan war also die
   * EINZIGE Absicherung im ganzen Repo. Diese Zusicherung prueft zusaetzlich
   * gegen den echten Import: dieselbe Referenz, alle 15 Eintraege.
   */
  it("reicht LAGERBUCH_NAV unveraendert an den Rahmen weiter", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    expect(rahmenAufrufe.nav.at(-1)).toBe(LAGERBUCH_NAV);
    expect(LAGERBUCH_NAV).toHaveLength(15);
  });
});

/**
 * Kopie von `ohneKommentare()` / `ohneKommentareUndZeichenketten()` aus
 * `_lib/bauform.test.ts:98-153` (byte-identisch, Vorbild
 * `_lib/pwaIcons.test.ts:19-39`). `bauform.test.ts` exportiert die Funktionen
 * nicht, und diese Datei ist ein anderer Testkoerper, deshalb die lokale
 * Kopie statt eines Re-Exports.
 *
 * ⚠️ RULING A13 — welcher Stripper wohin ist keine Geschmacksfrage:
 * POSITIVE Zusicherung ("ruft X auf") -> `ohneKommentareUndZeichenketten`,
 * sonst erfuellt ein Kommentar ODER ein Zeichenkettenliteral mit dem
 * Aufruftext die Zusage, ohne dass der Aufruf je liefe.
 * NEGATIVE Zusicherung ("importiert Y nicht") -> NUR `ohneKommentare`. Der
 * Modulspezifizierer "@ant-design/icons" IST ein Zeichenkettenliteral — wer
 * Zeichenketten strippt, macht den Scan blind (`bauform.test.ts:815`).
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

function ohneKommentareUndZeichenketten(quelle: string): string {
  const bereinigt = ohneKommentare(quelle);
  let ergebnis = "";
  let i = 0;
  while (i < bereinigt.length) {
    const z = bereinigt[i]!;
    if (z === '"' || z === "'" || z === "`") {
      ergebnis += " ";
      i++;
      while (i < bereinigt.length && bereinigt[i] !== z) {
        if (bereinigt[i] === "\\") i++;
        else if (bereinigt[i] === "\n") ergebnis += "\n";
        i++;
      }
      if (i < bereinigt.length) { ergebnis += " "; i++; }
      continue;
    }
    ergebnis += z;
    i++;
  }
  return ergebnis;
}

describe("g/[code] — Bauform (§3.8.2, §11.6)", () => {
  const quelle = readFileSync(join(__dirname, "page.tsx"), "utf8");

  /**
   * RULING A13.1: dieser Fall ist GESTRICHEN, mit Fundortvermerk.
   * `_lib/bauform.test.ts:319-337` traegt eine `NOCH_NICHT`-Schleife mit
   * `it.runIf(existsSync(pfad))` genau ueber `g/[code]/page.tsx` — sie laeuft
   * von selbst an, sobald die Datei existiert (kein Zutun von T164 noetig),
   * und sichert `trefferAuf(/\b(?:requireLagerbuchAdmin|requireHelferSitzung)\b/,
   * [pfad])` ueber `ohneKommentare()` — STAERKER als eine lokale Rohtext-
   * Fassung, die am eigenen Begruendungskommentar dieser Datei scheitern
   * wuerde ("...und NICHT requireLagerbuchAdmin."). T164 fasst
   * `bauform.test.ts` nicht an (Ruling A8: die Datei gehoert T173).
   */

  /**
   * REVIEW-NACHTRAG, MINOR 1: schnitt bisher auf dem Rohtext — ein Kommentar
   * ODER ein Zeichenkettenliteral mit dem Aufruftext haette den Nachweis
   * ebenso erfuellt, ohne dass `requireLagerbuchHost` je liefe. Jetzt ueber
   * `ohneKommentareUndZeichenketten` geschnitten (positive Zusicherung, A13).
   */
  it("ruft requireLagerbuchHost als erste Anweisung", () => {
    const bereinigt = ohneKommentareUndZeichenketten(quelle);
    const rumpf = bereinigt.slice(bereinigt.indexOf("export default"));
    const erste = rumpf.split("\n").find((z) => /\w/.test(z) && !z.includes("export default"));
    expect(erste).toContain("requireLagerbuchHost");
  });

  /**
   * RULING A13.2: kein deckender Fundort — `bauform.test.ts`s modulweiter
   * antd-/Icon-Scan (§7.1, Astliste `["_ui","helfer","a","t"]` + Wurzel-
   * `page.tsx`) fuehrt `g/` NICHT. Ein Streichen liesse diese Datei ohne jede
   * Icon-Sperre zurueck (dieselbe Falle, die bei T162 fast zugeschlagen
   * haette). Repariert statt gestrichen: Scan ueber `ohneKommentare()`, NICHT
   * die Zeichenketten-Fassung — der Modulspezifizierer selbst ist ein
   * Zeichenkettenliteral.
   *
   * Falle 7: die Datei ist eine Server Component. Ein Icon-Import wirft SCHON
   * BEIM IMPORT, und "use client" behebt das nicht, es macht es still.
   */
  it("importiert kein Icon-Paket und traegt kein use client", () => {
    const bereinigt = ohneKommentare(quelle);
    expect(bereinigt).not.toContain("@ant-design/icons");
    expect(bereinigt).not.toContain("lucide-react");
    expect(bereinigt).not.toMatch(/["']use client["']/);
  });

  /**
   * RULING A13.2 (derselbe Fundort-Befund wie oben): repariert ueber
   * `ohneKommentare()`.
   *
   * FALLE 1: `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag` und
   * `Button` sind in einer Server Component sicher (CLAUDE.md:11-13,
   * not-found.tsx:1,57 benutzt Button so). `Typography.Title` und Geschwister
   * ergeben HTTP 500 — der Compound-Zugriff ist es, nicht der Import.
   */
  it("greift auf kein antd-Compound zu", () => {
    const bereinigt = ohneKommentare(quelle);
    for (const verboten of [
      "Typography.", "Form.Item", "Descriptions.Item", "List.Item",
      "Input.TextArea", "Card.Meta", "Collapse.Panel", "Breadcrumb.Item",
      "Space.Compact", "Table.Summary", "Tag.CheckableTag", "Badge.Ribbon",
      "Layout.Header", "Grid.useBreakpoint",
    ]) {
      expect(bereinigt, verboten).not.toContain(verboten);
    }
  });

  /**
   * §2.9 und §2.1: VerwaltungsRahmen hat ZWEI Importeure — (arbeit)/layout.tsx
   * und diese Datei —, und `nav` ist Pflicht-Prop. §11.3 ist dazu
   * unmissverstaendlich: „mit Shell UND Modulnavigation", weil „ohne Shell und
   * ohne Modulnavigation" genau der Mangel ist, den 8-C2 behebt.
   *
   * ⚠️ Teil 5s Abschlusstabelle sagt „ohne nav"; sie irrt. Aufgeloest in
   * Plan-Teil 6, T164.
   *
   * REVIEW-NACHTRAG, BEFUND 2 (Quelltext-Haelfte) + MINOR 2: dieser Scan ist
   * der EINZIGE Ort im ganzen Repo, der `nav` fuer diese Datei sichert —
   * `bauform.test.ts` deckt `g/` nicht ab. Jetzt ueber
   * `ohneKommentareUndZeichenketten` gelesen (positive Zusicherung, A13) statt
   * roh: ein geloeschtes `nav` mit verbliebenem Erklaerkommentar ginge sonst
   * gruen durch. Die vorherige `toContain("VerwaltungsRahmen")`-Zeile entfaellt
   * — sie ist von der Importzeile trivial erfuellt und traegt nichts bei, was
   * nicht schon die Laufzeit-Zusicherung "reicht LAGERBUCH_NAV unveraendert an
   * den Rahmen weiter" (oben) abdeckt.
   */
  it("mountet den VerwaltungsRahmen MIT der vollstaendigen Navigation", () => {
    expect(ohneKommentareUndZeichenketten(quelle)).toContain("nav={LAGERBUCH_NAV}");
  });
});
