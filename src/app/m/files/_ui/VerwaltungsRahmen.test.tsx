// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * DER RAHMEN DER VERWALTUNG — EINE STELLE, ZWEI IMPORTEURE.
 *
 * `files` bedient zwei Hosts unter demselben Pfad `/m/files`: der Verteiler
 * `page.tsx` liegt auszerhalb aller Route-Groups (er muss beide Rollen bedienen)
 * und bekommt `(verwaltung)/layout.tsx` deshalb NICHT. Haengen Shell und
 * Navigation allein am Layout, stuende die Freigaben-Uebersicht auf der
 * Modulwurzel ohne Navigation — Spec §3.5. Beide rufen darum diesen Rahmen.
 *
 * `SuiteNav` ist ersetzt: eine Client-Komponente mit antd-Kontext
 * (`useThemeMode` wirft auszerhalb des Providers). `Modulleiste` bekommt einen
 * SICHTBAREN Platzhalter, damit pruefbar ist, DASS und MIT WAS sie gerufen wird —
 * das ist die Seitenleiste (`SuiteRahmen`) und damit die Modulnavigation selbst.
 */
const { authMock, suiteNavMock, modulleisteMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  suiteNavMock: vi.fn(() => null),
  /*
   * Der Platzhalter TRAEGT die Zahl der angekommenen Eintraege — damit steht die
   * Aussage „die Navigation ist da" im gerenderten Markup und nicht nur in einem
   * Mock-Aufrufprotokoll. `Modulleiste` rendert bei leerer Liste nichts, ein
   * verlorenes `nav` waere sonst eine still fehlende Leiste.
   */
  modulleisteMock: vi.fn((props: { nav: unknown }) => (
    <i
      data-testid="modulleiste-platz"
      data-anzahl={Array.isArray(props.nav) ? props.nav.length : -1}
    />
  )),
}));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/core/shell/SuiteNav", () => ({ SuiteNav: suiteNavMock }));
vi.mock("@/core/shell/Modulleiste", () => ({ Modulleiste: modulleisteMock }));
// `launcherEintraege` GEMOCKT, seit dem Navigations-Umbau nötig: `SuiteHeader`
// ruft es angemeldet für den App-Umschalter, und die echte Implementierung
// erreicht über `dienstEintraege` die Portal-Datenbank — die es in diesem Test
// nicht gibt (kein `getModuleDb("portal")`-Setup hier, dieser Test dreht sich
// um `files`). Ohne den Mock scheitert der Test unten an `SqliteError: no such
// table: services`, nicht an der eigentlich geprüften Aussage.
vi.mock("@/core/shell/launcherEintraege", () => ({ launcherEintraege: vi.fn(async () => []) }));

import { VerwaltungsRahmen } from "./VerwaltungsRahmen";
import { FILES_NAV } from "../_lib/nav";
import { Shell } from "@/core/shell/Shell";
import { AppUmschalter } from "@/core/shell/AppUmschalter";
import { getModule } from "@/core/registry";

const NAV_QUELLE = readFileSync("src/app/m/files/_lib/nav.ts", "utf8");
const RAHMEN_QUELLE = readFileSync("src/app/m/files/_ui/VerwaltungsRahmen.tsx", "utf8");
/**
 * OHNE Kommentare — sonst prueft der Scan die BEGRUENDUNG statt des Codes: die
 * Datei erklaert, warum `Layout.Header` in RSC `undefined` ergibt, und ein Scan
 * ueber den Rohtext wird an genau diesem Satz rot. Der naheliegende „Fix" waere
 * dann, die Erklaerung zu loeschen (gemessen, genau so passiert).
 */
const RAHMEN_CODE = RAHMEN_QUELLE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("FILES_NAV", () => {
  /**
   * DREI EINTRAEGE, IMMER ALLE DREI. Es gibt nur EINE Zugriffsstufe im Modul
   * (`requireFilesAccess`), also kann kein Eintrag in ein `notFound()` fuehren —
   * die Gegenprobe aus `docs/design/README.md` („fuehrt kein Weg dorthin, wo die
   * aufrufende Person nicht hindarf?") ist hier strukturell erfuellt.
   *
   * Die Ein-Eintrag-Regel aus `portal/layout.tsx` („ohne Verwaltungsrecht gar
   * keine Navigation, statt einer Zeile mit dem einen Eintrag, der auf die Seite
   * zeigt, auf der man steht") greift deshalb nie. Sie steht hier trotzdem, damit
   * niemand spaeter „Posteingang" und „Abgabelinks" hinter ein zweites Praedikat
   * legt und dabei genau diese Ein-Eintrag-Zeile erzeugt.
   */
  it("hat genau drei Eintraege: Freigaben, Posteingang, Abgabelinks", () => {
    expect(FILES_NAV).toEqual([
      { key: "start", title: "Freigaben", href: "/" },
      { key: "posteingang", title: "Posteingang", href: "/posteingang" },
      { key: "zugangslinks", title: "Abgabelinks", href: "/zugangslinks" },
    ]);
  });

  /**
   * FALLE 6, und Vitest kann ihre FOLGE strukturell nicht sehen: unter Vitest
   * sind beide Module normale ES-Module, `"use client"` ist ein wirkungsloser
   * String. Was pruefbar ist, ist die Direktive selbst — und genau deswegen
   * existiert diese Datei getrennt von `_ui/`.
   *
   * Laege `FILES_NAV` neben einer Client-Komponente, bekaemen die beiden Server
   * Components eine Client-REFERENZ statt des Wertes: HTTP 500 fuer die ganze
   * Seite, `pnpm typecheck` und `pnpm build` schweigen.
   */
  it("liegt in einem Modul OHNE `use client`", () => {
    expect(NAV_QUELLE).not.toMatch(/^\s*["']use client["']/m);
  });
});

describe("VerwaltungsRahmen", () => {
  /**
   * Kein Import aus `antd` — der Rahmen delegiert an `Shell`. Damit ist der
   * Compound-Zugriff (`Layout.Header`, `Typography.Title`, …) in dieser Server
   * Component nicht nur unterlassen, sondern unmoeglich. Die Falle selbst ist
   * unter Vitest unsichtbar (dort ist `antd` ein normales Modul und
   * `Layout.Header` schlicht definiert); dieser Scan ist deshalb die einzige
   * Instanz, die sie halten kann.
   */
  it("importiert nichts aus `antd` und greift auf keine Compound-Komponente zu", () => {
    expect(RAHMEN_CODE).not.toMatch(/from\s+["']antd/);
    expect(RAHMEN_CODE).not.toMatch(
      /\b(Typography|Form|Descriptions|List|Card|Collapse|Breadcrumb|Input|Space|Statistic|Table|Tag|Badge|Layout|Grid)\.[A-Z]/,
    );
  });

  /**
   * Server Component: keine Direktive. Der Rahmen ruft `getModule` (liest die
   * Registry) und steht in zwei Server-Layouts.
   */
  it("ist eine Server Component (kein `use client`)", () => {
    expect(RAHMEN_QUELLE).not.toMatch(/^\s*["']use client["']/m);
  });

  /**
   * DAS DRITTE BEIN DER ZUSAGE — und das einzige, das an genau EINER Zeile haengt.
   *
   * `_ui/files.css` hat im ganzen Repo genau diesen einen Importeur (der Rahmen
   * traegt ihn absichtlich statt der beiden Layouts, siehe Datei-Kopf). Fehlt die
   * Zeile, laedt KEINE Verwaltungsseite die `--fi-*`-Variablen und die
   * Umschaltung: Tabelle und Kartenliste stehen gleichzeitig da, eigenes Markup
   * ist farblos.
   *
   * Und der Ausfall ist still — GEMESSEN: mit entfernter Zeile bleiben beide
   * T18-Suiten 20/20 gruen. `files-css.test.ts` liest die Datei von der Platte und
   * fragt nicht, WER sie importiert; unter Vitest ist der CSS-Import ein Stub ohne
   * Wirkung; `typecheck`, `lint` und `build` schweigen alle drei. Diese Zeile ist
   * die einzige Instanz, die den Import halten kann.
   */
  it("importiert `./files.css` — der einzige Importeur im Repo", () => {
    expect(
      RAHMEN_CODE,
      "ohne diesen Import laedt keine Verwaltungsseite die --fi-*-Variablen und " +
        "die Umschaltung Tabelle/Kartenliste — still, ohne Fehlermeldung",
    ).toMatch(/import\s+["']\.\/files\.css["']/);
  });

  /**
   * DIE VERDRAHTUNG, nicht der Inhalt: `nav` muss bei `Shell` ANKOMMEN. Ein
   * Rahmen, der `nav` annimmt und nicht weitergibt, ist genau der Defekt aus
   * §3.5 („ohne Navigation") — und der Inhaltstest oben faende ihn nicht.
   */
  it("gibt Rolle, Modulschluessel und `nav` an `Shell` weiter", () => {
    const element = VerwaltungsRahmen({ nav: FILES_NAV, children: null }) as ReactElement<{
      variant: string;
      moduleKey: string;
      nav: unknown;
    }>;
    expect(element.type).toBe(Shell);
    expect(element.props.moduleKey).toBe("files");
    expect(element.props.variant).toBe(getModule("files").shell);
    expect(element.props.nav).toEqual(FILES_NAV);
  });

  /**
   * Und der Durchlauf durch die ECHTE Shell: dass `nav` bei `Modulleiste`
   * ankommt, ist die Aussage „die Modulnavigation ist da" — `Modulleiste`
   * rendert bei leerer Liste ohnehin nichts (`Modulleiste.tsx`), ein
   * verlorenes `nav` waere also eine still fehlende Leiste.
   */
  it("laesst `nav` bis zur Modulnavigation durchlaufen und rendert die Kinder", async () => {
    authMock.mockResolvedValue({ user: { name: "Test", groups: [] } });
    modulleisteMock.mockClear();
    const markup = renderToStaticMarkup(
      (await VerwaltungsRahmenGerendert()) as ReactElement,
    );
    expect(modulleisteMock).toHaveBeenCalled();
    expect(modulleisteMock.mock.calls[0][0]).toEqual({ nav: FILES_NAV });
    // Die drei Eintraege stehen im Markup, nicht nur im Aufrufprotokoll.
    expect(markup).toContain('data-anzahl="3"');
    expect(markup).toContain("files-kind");
  });
});

/**
 * Haendisches Auflösen der asynchronen Kette: `Shell` ist synchron, `FullShell`
 * und `SuiteHeader` sind `async`. `renderToStaticMarkup` kann keine
 * asynchrone Komponente rendern, also werden die beiden Stufen hier awaited und
 * nur der fertige, synchrone Baum gerendert. Dasselbe Vorgehen wie in
 * `core/shell/SuiteHeader.test.tsx`.
 */
async function VerwaltungsRahmenGerendert(): Promise<unknown> {
  const shellElement = VerwaltungsRahmen({
    nav: FILES_NAV,
    children: <p data-testid="files-kind">files-kind</p>,
  }) as ReactElement<Record<string, unknown>>;
  return await aufloesen(shellElement);
}

/**
 * Löst jede Server-Komponente im Baum auf (`Shell` synchron, `FullShell` und
 * `SuiteHeader` `async`), bis nur noch Blätter übrig sind — rekursiv, weil
 * die drei Stufen ineinander verschachtelt sind.
 *
 * `AppUmschalter` wird bewusst NICHT aufgelöst, obwohl es typeof "function"
 * ist wie die Server Components auch: seit dem Navigations-Umbau hängt es
 * angemeldet im Baum, und es ist eine Client-Komponente mit `useState`. Reacts
 * Hooks brauchen den echten Renderer-Kontext; ein bloßer `fn(props)`-Aufruf
 * außerhalb davon wirft "Invalid hook call" (kein Dispatcher gesetzt).
 * `next/link`s `Link` trifft dasselbe Problem nie — es ist per `forwardRef`
 * gebaut (`typeof Link === "object"`, nicht `"function"`) und fällt schon
 * über die allgemeine Bedingung unten aus der Auflösung heraus. Für
 * `AppUmschalter` gilt das nicht, deshalb der explizite Ausschluss: es bleibt
 * als unaufgelöstes Element stehen und wird korrekt vom abschließenden
 * `renderToStaticMarkup` gerendert — das läuft im echten React-Renderkontext
 * und darf Hooks aufrufen. Für diesen Test ist das ausreichend: geprüft wird
 * hier nur, DASS `nav` bis zu `Modulleiste` durchreicht (gemockt, siehe
 * Dateikopf — sonst dieselbe Hook-Falle wie bei `AppUmschalter`), nicht der
 * Inhalt des Umschalters (den deckt `AppUmschalter.test.tsx` ab).
 */
async function aufloesen(element: unknown): Promise<unknown> {
  if (Array.isArray(element)) return Promise.all(element.map(aufloesen));
  if (!element || typeof element !== "object") return element;
  const el = element as ReactElement<Record<string, unknown>> & { type: unknown };
  if (typeof el.type !== "function" || el.type === AppUmschalter) {
    if (el.props && "children" in el.props) {
      const kinder = await aufloesen(el.props.children);
      return { ...el, props: { ...el.props, children: kinder } };
    }
    return el;
  }
  const fn = el.type as (props: unknown) => unknown;
  return aufloesen(await fn(el.props));
}
