// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll, exists, fill, click } from "@/app/m/qr/_lib/test-dom";
import { AppUmschalter } from "@/core/shell/AppUmschalter";
import { ICONS } from "@/core/shell/icons";
import { MODULES } from "@/core/registry";
import type { LauncherEintrag } from "@/core/shell/types";

const EINTRAEGE: LauncherEintrag[] = [
  { key: "portal", title: "Portal", icon: "AppstoreOutlined", href: "https://p", abschnitt: "Apps", extern: false },
  { key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined", href: "https://l", abschnitt: "Apps", extern: false },
  { key: "dienst:1", title: "Nextcloud", beschreibung: "Dateiablage", href: "https://n", abschnitt: "Zusammenarbeit", extern: true },
];

function umschalter() {
  return <AppUmschalter modulTitel="Lagerbuch" modulKey="lagerbuch" eintraege={EINTRAEGE} />;
}

afterEach(async () => {
  await unmount();
});

describe("AppUmschalter", () => {
  it("zeigt geschlossen nur den Auslöser und sagt das an", async () => {
    await mount(umschalter());
    const knopf = query('[data-testid="app-umschalter"]');
    expect(knopf.textContent).toContain("Lagerbuch");
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
    expect(knopf.getAttribute("aria-haspopup")).toBe("true");
    expect(exists('[data-testid="app-panel"]')).toBe(false);
  });

  it("öffnet das Panel und gruppiert nach Abschnitt", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    expect(query('[data-testid="app-umschalter"]').getAttribute("aria-expanded")).toBe("true");
    expect(queryAll('[data-testid="app-abschnitt"]').map((a) => a.textContent)).toEqual([
      "Apps",
      "Zusammenarbeit",
    ]);
    expect(queryAll('[data-testid="app-eintrag"]').length).toBe(3);
  });

  it("markiert das aktuelle Modul, aber nicht als aufgerufene Seite", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    const aktiv = queryAll('[data-testid="app-eintrag"]').filter((e) =>
      e.hasAttribute("aria-current"),
    );
    expect(aktiv.length).toBe(1);
    expect(aktiv[0].textContent).toContain("Lagerbuch");
    // "true" und nicht "page": das Panel benennt die aktuelle APP, nicht die
    // aufgerufene Seite — auf /verwaltung/import ist der Eintrag beides nicht.
    expect(aktiv[0].getAttribute("aria-current")).toBe("true");
  });

  it("benutzt eine eigene Klasse, nicht die der Modulnavigation", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    // `shell.module.css` unterstreicht `.navLink[aria-current]`. Griffe der
    // Umschalter zu derselben Klasse, trüge sein aktiver Eintrag die
    // Unterstreichung der MODULNAVIGATION — und jeder künftige Playwright-
    // Locator auf `[aria-current]` fände zwei Knoten (Strict-Mode-Verletzung,
    // dieselbe Falle wie bei theme-toggle und abmelden).
    for (const el of queryAll('[data-testid="app-eintrag"]')) {
      expect(el.className).not.toMatch(/navLink/);
    }
  });

  it("filtert über Titel und Beschreibung und blendet leere Abschnitte aus", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    await fill('[data-testid="app-suche"]', "dateiablage");
    expect(queryAll('[data-testid="app-eintrag"]').map((e) => e.textContent?.trim())).toHaveLength(1);
    expect(queryAll('[data-testid="app-abschnitt"]').map((a) => a.textContent)).toEqual([
      "Zusammenarbeit",
    ]);
  });

  it("sagt es, wenn die Suche nichts findet", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    await fill('[data-testid="app-suche"]', "gibtesnicht");
    expect(exists('[data-testid="app-leer"]')).toBe(true);
    expect(query('[data-testid="app-leer"]').textContent).toContain("gibtesnicht");
  });

  it("öffnet externe Dienste in neuem Tab, Suite-Module nicht", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    const links = queryAll<HTMLAnchorElement>('[data-testid="app-eintrag"]');
    const nextcloud = links.find((l) => l.textContent?.includes("Nextcloud"));
    expect(nextcloud?.target).toBe("_blank");
    expect(nextcloud?.rel).toContain("noopener");
    expect(links.find((l) => l.textContent?.includes("Portal"))?.target).toBe("");
  });

  it("schließt mit Escape", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    const knopf = query('[data-testid="app-umschalter"]');
    knopf.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(exists('[data-testid="app-panel"]')).toBe(false);
  });

  it("kündigt sich als aufklappbare Gruppe an, nicht als Menü", async () => {
    await mount(umschalter());
    expect(query('[data-testid="app-umschalter"]').getAttribute("aria-haspopup")).toBe("true");
    await click('[data-testid="app-umschalter"]');
    // Ein Menü im ARIA-Sinn verträgt kein Textfeld: Screenreader schalten dort aus
    // dem Lesemodus in eine Menüsteuerung, in der Tippen Befehle auslöst.
    expect(query('[data-testid="app-panel"]').getAttribute("role")).toBeNull();
    for (const eintrag of queryAll('[data-testid="app-eintrag"]')) {
      expect(eintrag.getAttribute("role")).toBeNull();
    }
  });
});

/*
 * Diese Kopplung fehlte bis 2026-07-30 und hat sofort zugeschlagen: der
 * Registry-Eintrag von `files` trug `icon: "FolderOutlined"`, die ICONS-Map
 * (damals in SuiteNav.tsx, heute `icons.ts`) kannte den Namen nicht, und der
 * Rückfall auf AppstoreOutlined
 * gab dem Modul STILL das Portal-Icon. Kein Fehler, kein Log, kein rotes Gate —
 * nur ein falsches Bild in jeder Kopfzeile.
 *
 * Der Rückfall bleibt (eine neue Registry-Zeile soll die Kopfzeile nicht
 * zerlegen), aber er ist ab jetzt kein Versteck mehr: wer ein Modul ergänzt und
 * das Icon nicht einträgt, bekommt hier einen roten Test statt eines stillen
 * Duplikats. Die Prüfung läuft über die ECHTE Registry, nicht über eine
 * Liste im Test — eine Liste wäre die nächste Stelle, die vergessen wird.
 *
 * OHNE RENDERING, mit Absicht: sie prüft die Map gegen die Registry, nicht das
 * DOM. Die Zusicherung gehörte früher zu `SuiteNav.test.tsx` — seit dem
 * Navigations-Umbau löst ausschließlich `AppUmschalter` Icon-Namen auf, also
 * zieht die Zusicherung mit.
 */
describe("Modul-Icons", () => {
  it("jedes Modul der Registry hat einen Eintrag in ICONS", () => {
    for (const mod of MODULES) {
      expect(Object.keys(ICONS), `Modul ${mod.key}`).toContain(mod.icon);
    }
  });

  it("die Map trägt keine Namen, die kein Modul verlangt", () => {
    // Kein Selbstzweck: eine verwaiste Zeile hier ist der Hinweis darauf, dass
    // ein Modul umbenannt oder entfernt wurde, ohne die Kopfzeile nachzuziehen.
    // AppstoreOutlined ist ausgenommen — es ist der Rückfall und muss stehen,
    // auch wenn `portal` es einmal nicht mehr verlangen sollte.
    const verlangt = new Set(MODULES.map((m) => m.icon));
    const verwaist = Object.keys(ICONS).filter(
      (name) => name !== "AppstoreOutlined" && !verlangt.has(name),
    );
    expect(verwaist).toEqual([]);
  });
});
