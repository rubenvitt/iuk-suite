// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, click, fill, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import type { SuiteNavItem } from "@/core/shell/types";

/*
 * `usePathname` gemockt wie in `SuiteNav.test.tsx` und `Modulleiste.test.tsx` —
 * dieselbe Bauform im selben Verzeichnis.
 */
const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn(() => "/verwaltung") }));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

const { NavListe } = await import("@/core/shell/SuiteNav");
const { vergissZugeklappt } = await import("@/core/shell/navZustand");

/**
 * VIERZEHN EINTRÄGE, also über `NAV_LANG_AB_EINTRAEGEN` (12) — sonst prüfte
 * diese Datei eine Bedienung, die es gar nicht gibt. Die kurze Gegenprobe steht
 * unten und benutzt dieselbe Liste beschnitten.
 */
const LANG: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", abschnitt: "Bestand" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", abschnitt: "Bestand" },
  { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", abschnitt: "Bestand" },
  { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", abschnitt: "Bestand" },
  { key: "lagerorte", title: "Lagerorte", href: "/verwaltung/lagerorte", abschnitt: "Bestand" },
  { key: "fahrzeuge", title: "Fahrzeuge", href: "/verwaltung/fahrzeuge", abschnitt: "Einheiten" },
  { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", abschnitt: "Einheiten" },
  { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", abschnitt: "Einheiten" },
  { key: "checks", title: "Checks", href: "/verwaltung/checks", abschnitt: "Prüfungen" },
  { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", abschnitt: "Prüfungen" },
  { key: "etiketten", title: "Artikeletiketten", href: "/verwaltung/etiketten", abschnitt: "Einrichtung" },
  { key: "ortsetiketten", title: "Ortsetiketten", href: "/verwaltung/ortsetiketten", abschnitt: "Einrichtung" },
  { key: "import", title: "Import", href: "/verwaltung/import", abschnitt: "Einrichtung" },
];

const KURZ = LANG.slice(0, 4);

const linkTitel = () => queryAll('[data-testid="nav-link"]').map((l) => l.textContent);
const abschnitt = (titel: string) =>
  queryAll<HTMLButtonElement>('[data-testid="nav-abschnitt"]').find((k) => k.textContent === titel)!;

beforeEach(() => {
  vergissZugeklappt();
  localStorage.clear();
  pathnameMock.mockReturnValue("/verwaltung");
});

afterEach(async () => {
  await unmount();
});

describe("NavListe — kurze Navigation bleibt, wie sie war", () => {
  /*
   * DIE ZUSAGE DIESER GANZEN ÄNDERUNG, und sie gehört an den Anfang: `radio`,
   * `files`, `zeichen`, `uav` und `aufgaben` liegen alle unter der Schwelle und
   * bekommen deshalb NICHTS dazu — kein Feld, keine Schalter. Wer die Schwelle
   * herausnimmt, sieht es hier zuerst.
   */
  it("hat kein Filterfeld und keine Schalter", async () => {
    await mount(<NavListe nav={KURZ} modulKey="kurz" />);
    expect(exists('[data-testid="nav-filter"]')).toBe(false);
    for (const kopf of queryAll('[data-testid="nav-abschnitt"]')) {
      expect(kopf.tagName, "Überschrift ist ein Schalter, obwohl die Liste kurz ist").toBe("DIV");
    }
  });
});

describe("NavListe — Abschnitte aufklappen", () => {
  it("macht die Überschriften zu Schaltern, die ihren Zustand ansagen", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    const kopf = abschnitt("Bestand");
    expect(kopf.tagName).toBe("BUTTON");
    expect(kopf.getAttribute("aria-expanded")).toBe("true");
    // `aria-controls` zeigt auf einen Knoten, den es gibt — sonst wäre die
    // Zusage an die Vorleseanwendung eine Falschaussage.
    expect(query(`#${kopf.getAttribute("aria-controls")}`)).toBeTruthy();
  });

  it("klappt einen Abschnitt zu und nimmt seine Links aus dem Baum", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    expect(linkTitel()).toContain("Artikel");
    await click('[data-testid="nav-abschnitt"]');
    const kopf = abschnitt("Bestand");
    expect(kopf.getAttribute("aria-expanded")).toBe("false");
    /*
     * ⚠️ GEPRÜFT WIRD `hidden` AM KASTEN, nicht die Sichtbarkeit: jsdom rechnet
     * keine Layoutboxen und wertet die CSS-Regel `.navGruppeLinks[hidden]` nicht
     * aus. `hidden` ist die ehrliche Messgröße — es ist zugleich das, was die
     * Links aus dem Tabstopp und aus dem Vorlesebaum nimmt. Dass die Regel im
     * Stylesheet steht (und die `display: flex` daneben schlägt), hält
     * `shell-css.test.ts` fest.
     */
    const liste = query(`#${kopf.getAttribute("aria-controls")}`);
    expect(liste.hasAttribute("hidden")).toBe(true);
    // Die Überschrift bleibt stehen — niemand soll den Abschnitt suchen müssen.
    expect(abschnitt("Bestand")).toBeTruthy();
  });

  it("merkt sich den Zustand über einen Neuaufbau hinweg", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    await click('[data-testid="nav-abschnitt"]');
    await unmount();

    await mount(<NavListe nav={LANG} modulKey="lang" />);
    expect(abschnitt("Bestand").getAttribute("aria-expanded")).toBe("false");
  });

  it("hält die Stände zweier Module auseinander", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    await click('[data-testid="nav-abschnitt"]');
    await unmount();

    await mount(<NavListe nav={LANG} modulKey="anderes" />);
    expect(abschnitt("Bestand").getAttribute("aria-expanded")).toBe("true");
  });

  /*
   * DIE REGEL, DIE DAS ZUKLAPPEN GEFAHRLOS MACHT. Wer ein Lesezeichen in einen
   * zugeklappten Abschnitt öffnet, landete sonst auf einer Seite, deren Platz in
   * der Navigation nicht zu sehen ist — die Orientierung fiele genau dann aus,
   * wenn man sie braucht.
   */
  it("klappt den Abschnitt der aufgerufenen Seite wieder auf", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    await click('[data-testid="nav-abschnitt"]');
    expect(abschnitt("Bestand").getAttribute("aria-expanded")).toBe("false");
    await unmount();

    pathnameMock.mockReturnValue("/verwaltung/artikel");
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    expect(abschnitt("Bestand").getAttribute("aria-expanded")).toBe("true");
  });

  /*
   * DIE KEHRSEITE, UND SIE IST NICHT SELBSTVERSTÄNDLICH: griffe die Regel
   * darüber bei JEDEM Render statt nur beim Pfadwechsel, wäre der Schalter des
   * aktiven Abschnitts tot — ein Klick klappte zu, der Effekt klappte sofort
   * wieder auf, und niemand fände heraus, warum.
   */
  it("lässt ein bewusstes Zuklappen des aktiven Abschnitts stehen", async () => {
    pathnameMock.mockReturnValue("/verwaltung/artikel");
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    await click('[data-testid="nav-abschnitt"]');
    expect(abschnitt("Bestand").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("NavListe — filtern", () => {
  it("zeigt nur die passenden Einträge und nennt die Trefferzahl", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    await fill('[data-testid="nav-filter"]', "etiketten");
    expect(linkTitel()).toEqual(["Artikeletiketten", "Ortsetiketten"]);
    expect(query('[data-testid="nav-filter-stand"]').textContent).toBe(
      `2 von ${LANG.length} Einträgen`,
    );
  });

  it("sagt es, wenn nichts passt", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    await fill('[data-testid="nav-filter"]', "zzz");
    expect(linkTitel()).toEqual([]);
    expect(query('[data-testid="nav-filter-stand"]').textContent).toBe("Kein Eintrag passt");
  });

  /*
   * ⚠️ WÄHREND GEFILTERT WIRD, GIBT ES NICHTS AUFZUKLAPPEN — und dieser Fall ist
   * der Grund: der Treffer steht in einem Abschnitt, den jemand zugeklappt hat.
   * Bliebe der Zustand in Kraft, fände der Filter den Eintrag und zeigte ihn
   * nicht. Das liest sich wie ein kaputter Filter und ist das Gegenteil dessen,
   * wofür er da ist.
   */
  it("zeigt Treffer auch aus einem zugeklappten Abschnitt", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    await click('[data-testid="nav-abschnitt"]'); // „Bestand" zu
    await fill('[data-testid="nav-filter"]', "verfall");
    expect(linkTitel()).toEqual(["Verfall"]);
    expect(abschnitt("Bestand").tagName, "Schalter während des Filterns").toBe("DIV");
  });

  it("gibt den Aufklappzustand nach dem Leeren unverändert zurück", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    await click('[data-testid="nav-abschnitt"]');
    await fill('[data-testid="nav-filter"]', "verfall");
    await fill('[data-testid="nav-filter"]', "");
    expect(abschnitt("Bestand").getAttribute("aria-expanded")).toBe("false");
  });

  it("benennt das Feld für Vorleseanwendungen", async () => {
    await mount(<NavListe nav={LANG} modulKey="lang" />);
    expect(query('[data-testid="nav-filter"]').getAttribute("aria-label")).toBe(
      "Menü filtern",
    );
  });

  /*
   * ZWEI INSTANZEN STEHEN GLEICHZEITIG IM BAUM (Seitenleiste und Drawer, welche
   * man sieht entscheidet CSS). Ohne eigene testIds wäre jeder künftige
   * Playwright-Zugriff eine Strict-Mode-Verletzung — dieselbe Überlegung wie
   * beim Theme-Umschalter. Und ohne eigenen `idPraefix` trügen vier Knoten
   * dieselbe `id`.
   */
  it("trennt testIds und aria-controls-Ids der beiden Ausprägungen", async () => {
    await mount(
      <div>
        <NavListe nav={LANG} modulKey="lang" />
        <NavListe nav={LANG} modulKey="lang" testIdZusatz="-drawer" />
      </div>,
    );
    expect(queryAll('[data-testid="nav-filter"]').length).toBe(1);
    expect(queryAll('[data-testid="nav-filter-drawer"]').length).toBe(1);
    const ids = queryAll('[data-testid="nav-abschnitt"]').map((k) => k.getAttribute("aria-controls"));
    expect(new Set(ids).size, "zwei Knoten mit derselben aria-controls-Id").toBe(ids.length);
  });
});
