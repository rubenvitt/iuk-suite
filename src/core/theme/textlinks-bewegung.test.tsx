// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { Alert, Breadcrumb, Button, Collapse, ConfigProvider, Form, Input, Menu, Pagination, Table, Tree } from "antd";
import { buildTheme } from "@/core/theme/theme";
import { fill, mount, unmount } from "@/app/m/qr/_lib/test-dom";
import { SuiteNav } from "@/core/shell/SuiteNav";
import { SuiteLeiste } from "@/core/shell/Navigator";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/core/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/core/rueckmeldung/senden", () => ({ sendeRueckmeldung: vi.fn() }));

/**
 * Zwei Regeln aus `app/globals.css`, die an antds Markup hängen (Falle 20):
 * die Lauftext-Links und die Höhen-Motion unter reduzierter Bewegung. Geprüft
 * wird gegen das, was antd heute RENDERT, nicht gegen den Regeltext allein.
 */
const CSS = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
const LAUFTEXT = /^(html :where\([^)]*\) a:where\(:not\(\[class\*="ant-"\]\)\))\s*\{/m.exec(CSS)?.[1] ?? "";

const a = (href: string, text: string) => createElement("a", { href }, text);

function zeichne(...kinder: ReactElement[]): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToString(createElement(ConfigProvider, { theme: buildTheme("light") }, ...kinder));
  document.body.appendChild(wirt);
  return wirt;
}

const trifft = (wirt: HTMLElement, href: string) => {
  const link = wirt.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
  expect(link, `Link ${href} gerendert`).not.toBeNull();
  return link!.matches(LAUFTEXT);
};

afterEach(async () => {
  await unmount();
  document.body.innerHTML = "";
});

describe("Links im Lauftext (globals.css)", () => {
  it("steht in der Datei und liegt über antds Link-Reset (0,0,2)", () => {
    expect(LAUFTEXT).not.toBe("");
    expect(CSS).toMatch(/a:where\(:not\(\[class\*="ant-"\]\)\)\s*\{\s*text-decoration: underline;/);
  });

  it("unterstreicht Links in Absatz, Beschreibungsliste, Hinweis und Feldhilfe", () => {
    const wirt = zeichne(
      createElement("p", null, "Verbinde zuerst unter ", a("/p", "Einstellungen"), " ein Konto."),
      createElement("dl", null, createElement("dt", null, "Quelle"), createElement("dd", null, a("/dd", "HiOrg"))),
      createElement(Alert, { title: createElement("span", null, "Titel ", a("/alert-titel", "hier")), description: createElement("span", null, "Alle erfunden. ", a("/alert", "Quelle ändern")) }),
      createElement(Form, null, createElement(Form.Item, { label: "Feld", extra: createElement("span", null, "Siehe ", a("/extra", "Hilfe")) }, createElement(Input))),
    );
    for (const href of ["/p", "/dd", "/alert-titel", "/alert", "/extra"]) expect(trifft(wirt, href), href).toBe(true);
  });

  it("lässt Menü, Knopf, Brotkrumen, Seitenzahlen, Tabellenlinks und Typography.Link in Ruhe", () => {
    const wirt = zeichne(
      createElement(Menu, { mode: "inline", items: [{ key: "m", label: a("/menue", "Artikel") }] }),
      createElement(Button, { href: "/knopf" }, "Excel"),
      createElement(Breadcrumb, { items: [{ title: a("/krume", "Lager") }, { title: "Artikel" }] }),
      createElement(Pagination, { total: 50, current: 1 }),
      createElement(Table, { rowKey: "id", columns: [{ title: "Name", dataIndex: "id", render: (id: string) => a(`/zeile-${id}`, id) }], dataSource: [{ id: "x" }] }),
      createElement("p", null, createElement(Button, { href: "/knopf-im-satz", type: "link" }, "Knopf im Satz")),
    );
    for (const href of ["/menue", "/knopf", "/krume", "/zeile-x", "/knopf-im-satz"]) expect(trifft(wirt, href), href).toBe(false);
    const seiten = [...wirt.querySelectorAll<HTMLAnchorElement>(".ant-pagination a")];
    expect(seiten.length).toBeGreaterThan(0);
    expect(seiten.filter((s) => s.matches(LAUFTEXT))).toEqual([]);
  });

  it("lässt die Navigation der Shell in Ruhe", async () => {
    await mount(createElement(SuiteNav, {
      nav: [{ key: "start", title: "Übersicht", href: "/" }, { key: "liste", title: "Liste", href: "/liste" }],
      modulKey: "feedback", userName: "Ruben Vitt", angemeldet: true, profilHref: "http://portal.localtest.me:3000",
      rueckmeldeweg: { art: "link", url: "https://forms.example.test/f/abc" },
    }));
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((l) => l.matches(LAUFTEXT)).map((l) => l.getAttribute("href"))).toEqual([]);
  });

  it("lässt das Menü von FullShell in Ruhe — Seiten, App-Ebene, Portal und Treffer", async () => {
    await mount(createElement(SuiteLeiste, {
      daten: {
        modulKey: "lagerbuch", modulTitel: "Lagerbuch", modulIcon: "warehouse", modulBereich: "Material",
        modulHref: "https://l.example", nav: [{ key: "start", title: "Übersicht", href: "/" }, { key: "artikel", title: "Artikel", href: "/artikel", abschnitt: "Bestand" }],
        eintraege: [
          { key: "lagerbuch", title: "Lagerbuch", icon: "warehouse", href: "https://l.example", abschnitt: "Apps", bereich: "Material", extern: false },
          { key: "dienst:1", title: "Nextcloud", href: "https://n.example", abschnitt: "Zusammenarbeit", extern: true },
        ],
        auswahl: { angeheftet: [], zuletzt: [] }, bereiche: ["Material"], portalHref: "https://p.example",
        suchHref: "https://p.example/suche", angemeldet: true, userName: "Ruben Vitt", userBild: null,
        profilHref: "https://p.example", rueckmeldeweg: null, modulStand: null,
      },
    }));
    const unterstrichen = () =>
      [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((l) => l.matches(LAUFTEXT)).map((l) => l.getAttribute("href"));
    expect(document.querySelectorAll('[data-testid="nav-link"], [data-testid="app-eintrag"], [data-testid="app-portal"]').length).toBeGreaterThan(3);
    expect(unterstrichen()).toEqual([]);
    await fill('[data-testid="befehlspalette-eingabe"]', "art");
    expect(document.querySelectorAll('[data-testid="befehl"]').length).toBeGreaterThan(0);
    expect(unterstrichen()).toEqual([]);
  });
});

describe("Höhen-Motion unter reduzierter Bewegung (globals.css)", () => {
  it("antd gibt `.ant-motion-collapse` mit !important aus — unsere Regel liegt darüber", () => {
    const cache = createCache();
    renderToString(createElement(StyleProvider, { cache }, createElement(ConfigProvider, { theme: buildTheme("light") },
      createElement(Collapse, { items: [{ key: "a", label: "A", children: "x" }] }),
      createElement(Menu, { mode: "inline", items: [{ key: "s", label: "S", children: [{ key: "a", label: "A" }] }] }),
      createElement(Tree, { treeData: [{ key: "a", title: "A" }] }))));
    const antd = extractStyle(cache, { plain: true });
    // Diese (0,2,0)-Selektoren mit `!important` schlagen `*` — gäbe es sie nicht mehr, wäre die Regel tot.
    for (const komponente of ["collapse", "menu", "tree"]) {
      expect(antd).toMatch(new RegExp(`\\.ant-${komponente} \\.ant-motion-collapse\\{[^}]*transition:[^}]*!important`));
      expect(antd).toMatch(new RegExp(`\\.ant-${komponente} \\.ant-motion-collapse-legacy-active\\{[^}]*!important`));
    }
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
    expect(block).toMatch(/html:root \.ant-motion-collapse,\s*html:root \.ant-motion-collapse-legacy-active\s*\{\s*transition-duration: 0s !important;/);
  });
});
