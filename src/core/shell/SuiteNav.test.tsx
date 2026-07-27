// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mount,
  unmount,
  query,
  queryAll,
  exists,
  queryPortal,
  existsPortal,
  clickPortal,
} from "@/app/m/qr/_lib/test-dom";
import { SuiteNav, aktiverSchluessel } from "./SuiteNav";
import type { AppSwitcherEntry, SuiteNavItem } from "./types";

/**
 * DRAWER-INHALT WIRD MIT `…Portal`-ABFRAGEN GEPRUEFT, KOPFZEILEN-INHALT NICHT.
 *
 * antd rendert den `Drawer` durch ein Portal nach `document.body` — sein Inhalt
 * ist ein GESCHWISTER des Mount-Wirts, kein Nachfahre. `query()` sucht im Wirt
 * und faende ihn nie, auch mit `forceRender` nicht. Alles in der Kopfzeile
 * (`modulzeile`, `modulnav`, `menue-knopf`) bleibt dagegen im Wirt und wird mit
 * `query`/`exists` geprueft.
 *
 * Zwei Dinge, die dieser Test NICHT kann und die anderswo geprueft werden:
 * - Was man auf 390px SIEHT: jsdom wertet Media Queries nicht aus. Das besitzt
 *   der Playwright-Lauf; die CSS-Regel besitzt `shell-css.test.ts`.
 * - Ob antds Drawer korrekt animiert. Hier zaehlt nur, dass die Eintraege im
 *   DOM stehen und die richtigen Ziele tragen.
 */

const { signOutMock, pathnameMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  pathnameMock: vi.fn(() => "/"),
}));

vi.mock("next-auth/react", () => ({ signOut: signOutMock }));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));
vi.mock("@/core/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

const MODULE: AppSwitcherEntry[] = [
  { key: "portal", title: "Portal", icon: "AppstoreOutlined", href: "https://iuk-ue.de" },
  { key: "qr", title: "QR-Codes", icon: "QrcodeOutlined", href: "https://qr.iuk-ue.de" },
];

const NAV: SuiteNavItem[] = [
  { key: "start", title: "Uebersicht", href: "/" },
  { key: "vergleich", title: "Vergleich", href: "/vergleich" },
];

async function zeichne(props: Partial<Parameters<typeof SuiteNav>[0]> = {}) {
  await mount(
    <SuiteNav
      entries={MODULE}
      nav={[]}
      userName="Ruben Vitt"
      angemeldet
      {...props}
    />,
  );
}

afterEach(async () => {
  await unmount();
  signOutMock.mockClear();
  pathnameMock.mockReturnValue("/");
});

describe("SuiteNav — angemeldet", () => {
  it("rendert jedes Modul als echten Link, ohne dass etwas geoeffnet werden muss", async () => {
    await zeichne();
    // keystone.spec.ts:35 prueft `getByRole("link", {name: /Alpha/})` ohne
    // Oeffnen. Waere das ein Menu/Dropdown, faende Playwright nichts.
    const desktop = query('[data-testid="modulzeile"]');
    const links = Array.from(desktop.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://iuk-ue.de",
      "https://qr.iuk-ue.de",
    ]);
    expect(links.map((a) => a.textContent)).toEqual(["Portal", "QR-Codes"]);
  });

  it("zeigt dieselben Module im Drawer", async () => {
    await zeichne();
    const drawer = queryPortal('[data-testid="suite-drawer"]');
    const ziele = Array.from(drawer.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(ziele).toContain("https://iuk-ue.de");
    expect(ziele).toContain("https://qr.iuk-ue.de");
  });

  it("hat einen Abmelden-Knopf, der ueber den OIDC-Signout geht", async () => {
    await zeichne();
    await clickPortal('[data-testid="abmelden"]');
    // Derselbe Weg, den SessionGuard bei RefreshTokenError automatisch geht —
    // ohne ihn endete der Logout auf einer 404 (siehe oidc-signout/route.ts).
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  it("zeigt den Namen und keine Anmelde-Aufforderung", async () => {
    await zeichne();
    expect(queryPortal('[data-testid="suite-drawer"]').textContent).toContain("Ruben Vitt");
    expect(existsPortal('[data-testid="anmelden"]')).toBe(false);
  });

  it("zeigt die Modulnavigation, wenn das Modul welche uebergibt", async () => {
    await zeichne({ nav: NAV });
    const zeile = query('[data-testid="modulnav"]');
    expect(Array.from(zeile.querySelectorAll("a")).map((a) => a.textContent)).toEqual([
      "Uebersicht",
      "Vergleich",
    ]);
  });

  it("markiert den aktiven Eintrag der Modulnavigation", async () => {
    pathnameMock.mockReturnValue("/vergleich");
    await zeichne({ nav: NAV });
    const aktiv = queryAll('[data-testid="modulnav"] a[aria-current="page"]');
    expect(aktiv).toHaveLength(1);
    expect(aktiv[0].getAttribute("href")).toBe("/vergleich");
  });
});

describe("aktiverSchluessel — welcher Eintrag ist dran", () => {
  // Reine Berechnung, deshalb ohne DOM. Der DOM-Test oben mockt `usePathname`
  // und kann daher NICHT beweisen, dass die Aufloesung unter dem Proxy-Rewrite
  // stimmt — das gehoert dem E2E. Hier geht es um die Faelle, die der E2E
  // nicht guenstig durchspielen kann.

  it("nimmt den aeuszeren Pfad (ohne Rewrite)", () => {
    expect(aktiverSchluessel("/vergleich", NAV)).toBe("vergleich");
  });

  it("nimmt den inneren Pfad (mit Rewrite) — welchen usePathname liefert, haengt an Next", () => {
    expect(aktiverSchluessel("/m/feedback/vergleich", NAV)).toBe("vergleich");
  });

  it("markiert die Uebersicht auf der Modulwurzel, obwohl `/` Suffix von nichts ist", () => {
    // "/m/feedback".endsWith("/") ist false — ein naiver Suffix-Test liesze die
    // Uebersicht auf ihrer eigenen Seite unmarkiert.
    expect(aktiverSchluessel("/m/feedback", NAV)).toBe("start");
    expect(aktiverSchluessel("/", NAV)).toBe("start");
  });

  it("laeszt die Uebersicht auf einer Unterseite NICHT mitleuchten", () => {
    expect(aktiverSchluessel("/m/feedback/vergleich", NAV)).not.toBe("start");
  });

  it("nimmt den spezifischsten Treffer, wenn zwei passen", () => {
    const verschachtelt = [
      { key: "gruppen", title: "Gruppen", href: "/groups" },
      { key: "eine", title: "Eine Gruppe", href: "/groups/17" },
    ];
    expect(aktiverSchluessel("/m/feedback/groups/17", verschachtelt)).toBe("eine");
  });

  it("gibt null, wenn nichts passt und es keine Wurzel gibt", () => {
    expect(aktiverSchluessel("/irgendwo", [{ key: "a", title: "A", href: "/anders" }])).toBeNull();
  });

  it("laesst die Modulnavigation weg, wenn nichts uebergeben wird", async () => {
    await zeichne({ nav: [] });
    expect(exists('[data-testid="modulnav"]')).toBe(false);
  });
});

describe("SuiteNav — anonym", () => {
  it("bietet Anmelden statt Abmelden und KEINE Modulliste", async () => {
    // Der anonyme Besucher auf `qr` bekaeme sonst `feedback` angeboten:
    // canAccess() steigt bei requiresAuth:false frueh mit true aus, aber die
    // Modulwurzel von feedback liegt hinter requireFeedbackAccess() und wirft
    // ihn auf 404. Ein Wechselziel, das nicht funktioniert, gehoert nicht in
    // die Leiste.
    await zeichne({ angemeldet: false, userName: null });
    expect(existsPortal('[data-testid="anmelden"]')).toBe(true);
    expect(existsPortal('[data-testid="abmelden"]')).toBe(false);
    // Die Knopfreihe liegt in der Kopfzeile, nicht im Portal — hier `exists`.
    expect(exists('[data-testid="modulzeile"]')).toBe(false);
    expect(queryPortal('[data-testid="anmelden"]').getAttribute("href")).toBe("/login");
  });
});
