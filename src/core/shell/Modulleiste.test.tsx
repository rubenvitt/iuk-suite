// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import type { SuiteNavItem } from "@/core/shell/types";

/*
 * Das Mocken von `usePathname` folgt `SuiteNav.test.tsx`, nicht der Variante
 * aus dem Aufgaben-Brief: dort ist es ein `vi.fn()`, dessen Rueckgabewert per
 * `mockReturnValue` je Test gesetzt wird, kein veraenderliches `{ wert }`-
 * Objekt. Zwei Bauformen fuer denselben Mock im selben Verzeichnis waeren ein
 * Stilbruch ohne fachlichen Grund.
 */
const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn(() => "/verwaltung") }));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

const { Modulleiste } = await import("@/core/shell/Modulleiste");

const NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", abschnitt: "Bestand" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", abschnitt: "Bestand" },
  { key: "journal", title: "Journal", href: "/verwaltung/journal", abschnitt: "Protokoll" },
];

afterEach(async () => {
  await unmount();
  pathnameMock.mockReturnValue("/verwaltung");
});

describe("Modulleiste", () => {
  it("trägt die Abschnittsüberschriften in der Reihenfolge des ersten Auftretens", async () => {
    await mount(<Modulleiste nav={NAV} />);
    expect(queryAll('[data-testid="nav-abschnitt"]').map((a) => a.textContent)).toEqual([
      "Bestand",
      "Protokoll",
    ]);
  });

  it("stellt den Eintrag ohne Abschnitt vor die erste Überschrift", async () => {
    await mount(<Modulleiste nav={NAV} />);
    const kinder = queryAll('[data-testid="nav-abschnitt"], [data-testid="nav-link"]');
    expect(kinder[0].textContent).toBe("Übersicht");
  });

  it("markiert die aufgerufene Seite als page", async () => {
    pathnameMock.mockReturnValue("/verwaltung/artikel");
    await mount(<Modulleiste nav={NAV} />);
    const aktiv = queryAll('[data-testid="nav-link"]').filter((l) => l.hasAttribute("aria-current"));
    expect(aktiv.length).toBe(1);
    expect(aktiv[0].getAttribute("aria-current")).toBe("page");
    expect(aktiv[0].textContent).toBe("Artikel");
  });

  /*
   * NICHT-VAKUÄR, UND ZWAR NACHWEISLICH: die vorige Zusicherung ("markiert die
   * aufgerufene Seite als page") bliebe auch dann grün, wenn `navLinks` den
   * dritten Parameter gar nicht bekäme — in `NAV` ist kein Href Suffix eines
   * anderen, jede Gruppe fände ihren Treffer für sich allein zum selben
   * Ergebnis. Diese Vorlage erzwingt den Unterschied: `kurz` ("/artikel",
   * Gruppe "Bestand") ist Suffix von `lang` ("/verwaltung/artikel", Gruppe
   * "Archiv") — der aufgerufene Pfad passt auf BEIDE. `aktiverEintrag` waehlt
   * global den laengsten Treffer (`lang`); nur wenn beide Gruppen denselben
   * dritten Parameter (die VOLLSTAENDIGE Liste) bekommen, sehen sie dieselbe
   * Entscheidung. Bekaeme `navLinks` ihn nicht, faende jede Gruppe ihren
   * EIGENEN Treffer in ihrer eigenen Teilliste — `kurz` UND `lang` waeren
   * gleichzeitig markiert. Empirisch geprueft: mit `ganze = sichtbar` als
   * Default (dritten Parameter entfernt) schlaegt genau diese Zusicherung fehl
   * (`aktiv.length` wird 2 statt 1), waehrend die drei uebrigen Tests in
   * dieser Datei weiterhin gruen bleiben — siehe Bericht.
   */
  it("markiert nur den global spezifischsten Treffer, nicht jede Gruppe für sich", async () => {
    const UEBERLAPPEND: SuiteNavItem[] = [
      { key: "uebersicht", title: "Übersicht", href: "/verwaltung" },
      { key: "kurz", title: "Kurz", href: "/artikel", abschnitt: "Bestand" },
      { key: "lang", title: "Lang", href: "/verwaltung/artikel", abschnitt: "Archiv" },
    ];
    pathnameMock.mockReturnValue("/verwaltung/artikel");
    await mount(<Modulleiste nav={UEBERLAPPEND} />);
    const aktiv = queryAll('[data-testid="nav-link"]').filter((l) => l.hasAttribute("aria-current"));
    expect(aktiv.length).toBe(1);
    expect(aktiv[0].textContent).toBe("Lang");
  });

  it("benennt sich für Screenreader", async () => {
    await mount(<Modulleiste nav={NAV} />);
    expect(query('[data-testid="modulleiste"]').getAttribute("aria-label")).toBe(
      "Modulnavigation",
    );
  });

  it("rendert nichts bei leerer Navigation", async () => {
    await mount(<Modulleiste nav={[]} />);
    expect(queryAll('[data-testid="modulleiste"]').length).toBe(0);
  });
});
