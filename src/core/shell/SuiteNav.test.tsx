// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mount,
  unmount,
  query,
  queryAll,
  click,
  exists,
  queryPortal,
  existsPortal,
  clickPortal,
} from "@/app/m/qr/_lib/test-dom";
import { Modulnav, SuiteNav, aktiverEintrag } from "./SuiteNav";
import type { SuiteNavItem } from "./types";

/**
 * DRAWER- UND MENUE-INHALT WERDEN MIT `…Portal`-ABFRAGEN GEPRUEFT,
 * KOPFZEILEN-INHALT NICHT.
 *
 * antd rendert `Drawer` UND `Dropdown` durch ein Portal nach `document.body` —
 * ihr Inhalt ist ein GESCHWISTER des Mount-Wirts, kein Nachfahre. `query()`
 * sucht im Wirt und fände ihn nie. Alles in der Kopfzeile (`modulnav`,
 * `menue-knopf`, `nutzermenue`, `anmelden`) bleibt dagegen im Wirt und wird
 * mit `query`/`exists` geprüft.
 *
 * Weil BEIDE Portale an `document.body` haengen, ist `existsPortal` allein
 * mehrdeutig, sobald dieselbe testId in beiden vorkommen koennte. Wo es darauf
 * ankommt (Abmelden), wird deshalb INNERHALB von `suite-drawer` gesucht.
 *
 * Zwei Dinge, die dieser Test NICHT kann und die anderswo geprueft werden:
 * - Was man auf 390px bzw. 1280px SIEHT: jsdom wertet Media Queries nicht aus,
 *   und eine Kaskadenkollision (`.nurMobil` gegen `.ant-btn`) sieht es erst
 *   recht nicht. Das besitzt der Playwright-Lauf; die CSS-Regel besitzt
 *   `shell-css.test.ts`.
 * - Ob antds Drawer/Dropdown korrekt animieren. Hier zaehlt nur, dass die
 *   Eintraege im DOM stehen und die richtigen Ziele tragen.
 */

const { signOutMock, pathnameMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  pathnameMock: vi.fn(() => "/"),
}));

vi.mock("next-auth/react", () => ({ signOut: signOutMock }));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));
vi.mock("@/core/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

const NAV: SuiteNavItem[] = [
  { key: "start", title: "Uebersicht", href: "/" },
  { key: "vergleich", title: "Vergleich", href: "/vergleich" },
];

async function zeichne(props: Partial<Parameters<typeof SuiteNav>[0]> = {}) {
  await mount(<SuiteNav nav={[]} userName="Ruben Vitt" angemeldet {...props} />);
}

/** Das Avatar-Menue oeffnen. Es ist bewusst NICHT vorgerendert (siehe Test unten). */
async function oeffneNutzermenue() {
  await click('[data-testid="nutzermenue"]');
}

afterEach(async () => {
  await unmount();
  signOutMock.mockClear();
  pathnameMock.mockReturnValue("/");
});

describe("SuiteNav — angemeldet", () => {
  it("zeigt keine Modul-Links mehr — der App-Wechsel hängt am Umschalter der Kopfzeile", async () => {
    /*
     * Der Navigations-Umbau nimmt SuiteNav die Modulliste komplett weg: weder
     * eine sichtbare Knopfreihe (`modulzeile`, entfallen) noch ein Vorrat im
     * Drawer.
     *
     * `queryPortal` für den Drawer und DANN `querySelectorAll` DARIN, nicht
     * `queryAll('[data-testid="suite-drawer"] …')`: der Drawer hängt per
     * Portal an `document.body`, ein Geschwister des Mount-Wirts. `queryAll`
     * sucht im Wirt (siehe Dateikopf) und fände `suite-drawer` dort nie —
     * die Zusicherung wäre immer wahr, auch mit App-Einträgen im Drawer.
     */
    await zeichne();
    const drawer = queryPortal('[data-testid="suite-drawer"]');
    expect(drawer.querySelectorAll('[data-testid="app-eintrag"]').length).toBe(0);
  });

  it("haengt Abmelden ans Avatar-Menue und geht ueber den OIDC-Signout", async () => {
    await zeichne();
    await oeffneNutzermenue();
    await clickPortal('[data-testid="abmelden"]');
    // Derselbe Weg, den SessionGuard bei RefreshTokenError automatisch geht —
    // ohne ihn endete der Logout auf einer 404 (siehe oidc-signout/route.ts).
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  it("laesst Abmelden NICHT zusaetzlich im Drawer stehen", async () => {
    /*
     * Die Zusage ist nicht kosmetisch. Der Drawer ist nur unterhalb von 768px
     * erreichbar; laege Abmelden dort, gaebe es auf dem Desktop keinen Weg
     * hinaus. Und laege es an BEIDEN Stellen, waere `getByTestId("abmelden")`
     * fuer Playwright eine Strict-Mode-Verletzung — auch dann, wenn eine der
     * beiden per CSS unsichtbar ist.
     */
    await zeichne();
    await oeffneNutzermenue();
    const drawer = queryPortal('[data-testid="suite-drawer"]');
    expect(drawer.querySelector('[data-testid="abmelden"]')).toBeNull();
    // Und im Dokument insgesamt genau einer.
    expect(document.body.querySelectorAll('[data-testid="abmelden"]')).toHaveLength(1);
  });

  it("baut das Nutzermenue erst beim Oeffnen — kein Portal auf Vorrat", async () => {
    /*
     * DAS IST DIE SSR-ZUSAGE, in jsdom gemessen. `forceRender` (oder ein
     * anfaengliches `open`) liesze antd das Portal sofort anlegen; auf dem
     * Server gibt es dafuer kein `document` ("Portal only work in client
     * side"), und der folgende Hydration-Mismatch hat auf diesem Zweig schon
     * einmal die anonymen QR-Formulare unbenutzbar gemacht (drei E2E-Timeouts).
     * Ein Test, der nur nach dem Oeffnen prueft, saehe den Rueckfall nicht.
     */
    await zeichne();
    expect(existsPortal('[data-testid="abmelden"]')).toBe(false);
    await oeffneNutzermenue();
    expect(existsPortal('[data-testid="abmelden"]')).toBe(true);
  });

  it("sagt am Ausloeser an, dass er ein Menue oeffnet — und ob es offen ist", async () => {
    await zeichne();
    const ausloeser = query('[data-testid="nutzermenue"]');
    expect(ausloeser.getAttribute("aria-haspopup")).toBe("menu");
    expect(ausloeser.getAttribute("aria-expanded")).toBe("false");
    await oeffneNutzermenue();
    expect(query('[data-testid="nutzermenue"]').getAttribute("aria-expanded")).toBe("true");
  });

  it("nennt den Namen im Menue UND im aria-label des Ausloesers", async () => {
    /*
     * Zweimal, weil einmal nicht reicht: der Gruppentitel im Menue traegt bei
     * rc-menu `role="presentation"` und wird von Screenreadern uebersprungen
     * (nachgemessen am gerenderten Markup). Sichtbar ist er trotzdem — deshalb
     * beides.
     */
    await zeichne();
    expect(query('[data-testid="nutzermenue"]').getAttribute("aria-label")).toBe(
      "Nutzermenü — Ruben Vitt",
    );
    await oeffneNutzermenue();
    expect(queryPortal('[data-testid="nutzername"]').textContent).toBe("Ruben Vitt");
    expect(existsPortal('[data-testid="anmelden"]')).toBe(false);
    expect(exists('[data-testid="anmelden"]')).toBe(false);
  });

  it("laesst auch eine Sitzung ohne Namen abmelden", async () => {
    /*
     * `session.user.name` kann leer sein. Vorher rettete der Drawer diesen Fall
     * (der Abmelden-Knopf haing an `angemeldet`, der Avatar an `userName`);
     * haenge man das Menue nun an `userName`, verloere so eine Sitzung JEDEN
     * Abmeldeweg. Deshalb gatet der Avatar auf `angemeldet`, und `initialen()`
     * liefert fuer `null` ein "?".
     */
    await zeichne({ userName: null });
    const ausloeser = query('[data-testid="nutzermenue"]');
    expect(ausloeser.getAttribute("aria-label")).toBe("Nutzermenü");
    expect(ausloeser.textContent).toContain("?");
    await oeffneNutzermenue();
    expect(existsPortal('[data-testid="abmelden"]')).toBe(true);
    expect(existsPortal('[data-testid="nutzername"]')).toBe(false);
  });

  it("zeigt die Modulnavigation im Drawer, wenn das Modul welche uebergibt", async () => {
    // Mobil ist der Drawer der einzige Ort, an dem sie steht — die sichtbare
    // zweite Zeile (`Modulnav`) ist dort ausgeblendet.
    await zeichne({ nav: NAV });
    const drawer = queryPortal('[data-testid="suite-drawer"]');
    const titel = Array.from(drawer.querySelectorAll("a")).map((a) => a.textContent);
    expect(titel).toContain("Uebersicht");
    expect(titel).toContain("Vergleich");
  });

  it("laesst die Modulnavigation NICHT mehr in der Kopfzeile stehen", async () => {
    /*
     * DIE ZUSAGE DIESES FIXES, in jsdom gemessen. `Modulnav` ist ein
     * GESCHWISTER des `<Header>` (SuiteHeader.tsx) und darf hier nicht mehr
     * auftauchen — als drittes Flex-Kind der Kopfzeile nahm sie dem Modultitel
     * zwischen 768px und 903px die gesamte Breite (er mass 0px, die Seite
     * scrollte seitwaerts).
     *
     * Ein Rueckbau nach `SuiteNav` waere ohne diese Zeile in jsdom lautlos: die
     * Geometrie sieht erst Playwright (`e2e/shell-mobil.spec.ts`,
     * Mittelbreiten), und die Aktivmarkierung bliebe an beiden Orten gruen.
     */
    await zeichne({ nav: NAV });
    expect(exists('[data-testid="modulnav"]')).toBe(false);
  });
});

describe("Modulnav — die zweite Zeile unter der Kopfzeile", () => {
  // Uebernommen aus dem `SuiteNav`-Block, seit die Zeile eine eigene Komponente
  // ist. Sie steht im Wirt (kein Portal), also `query`/`exists`.

  it("zeigt die Modulnavigation, wenn das Modul welche uebergibt", async () => {
    await mount(<Modulnav nav={NAV} />);
    const zeile = query('[data-testid="modulnav"]');
    expect(Array.from(zeile.querySelectorAll("a")).map((a) => a.textContent)).toEqual([
      "Uebersicht",
      "Vergleich",
    ]);
  });

  it("markiert den aktiven Eintrag der Modulnavigation als aktuelle SEITE", async () => {
    pathnameMock.mockReturnValue("/vergleich");
    await mount(<Modulnav nav={NAV} />);
    const aktiv = queryAll('[data-testid="modulnav"] a[aria-current="page"]');
    expect(aktiv).toHaveLength(1);
    expect(aktiv[0].getAttribute("href")).toBe("/vergleich");
  });

  it("markiert auf einer Seite ohne eigenen Eintrag nur den ABSCHNITT, nicht die Seite", async () => {
    /*
     * DER FUND AUS DEM ABSCHLUSSREVIEW. Auf `/wifi`, `/tel`, `/contact`,
     * `/groups/17`, `/trend`, `/auswertung` passt kein Eintrag; der
     * Wurzel-Fallback markierte dort trotzdem „Uebersicht" mit
     * `aria-current="page"` — eine Falschaussage gegenueber einem Screenreader
     * auf sechs Routen. Jetzt `"true"`: derselbe Rahmen, aber die schwaechere
     * und wahre Aussage.
     */
    pathnameMock.mockReturnValue("/wifi");
    await mount(<Modulnav nav={NAV} />);
    expect(queryAll('[data-testid="modulnav"] a[aria-current="page"]')).toHaveLength(0);
    const abschnitt = queryAll('[data-testid="modulnav"] a[aria-current="true"]');
    expect(abschnitt).toHaveLength(1);
    expect(abschnitt[0].getAttribute("href")).toBe("/");
  });

  it("rendert gar nichts, wenn das Modul keine Navigation uebergibt", async () => {
    // Fuenf von sieben Modulen uebergeben nichts — sie duerfen keine leere
    // Zeile und keine Trennlinie unter der Kopfzeile bekommen.
    await mount(<Modulnav nav={[]} />);
    expect(exists('[data-testid="modulnav"]')).toBe(false);
  });
});

describe("aktiverEintrag — welcher Eintrag ist dran, und ist er es wirklich", () => {
  // Reine Berechnung, deshalb ohne DOM. Der DOM-Test oben mockt `usePathname`
  // und kann daher NICHT beweisen, dass die Aufloesung unter dem Proxy-Rewrite
  // stimmt — das gehoert dem E2E. Hier geht es um die Faelle, die der E2E
  // nicht guenstig durchspielen kann.

  it("nimmt den aeuszeren Pfad (ohne Rewrite)", () => {
    expect(aktiverEintrag("/vergleich", NAV)).toEqual({ schluessel: "vergleich", genau: true });
  });

  it("nimmt den inneren Pfad (mit Rewrite) — welchen usePathname liefert, haengt an Next", () => {
    expect(aktiverEintrag("/m/feedback/vergleich", NAV)).toEqual({
      schluessel: "vergleich",
      genau: true,
    });
  });

  it("markiert die Uebersicht auf der Modulwurzel, obwohl `/` Suffix von nichts ist", () => {
    // "/m/feedback".endsWith("/") ist false — ein naiver Suffix-Test liesze die
    // Uebersicht auf ihrer eigenen Seite unmarkiert.
    expect(aktiverEintrag("/", NAV)).toEqual({ schluessel: "start", genau: true });
    expect(aktiverEintrag("/m/feedback", NAV)?.schluessel).toBe("start");
  });

  it("nennt den Wurzel-Fallback beim Namen: markiert, aber NICHT die aufgerufene Seite", () => {
    /*
     * `/wifi` gehoert zum Modul, ist aber kein Eintrag. Frueher gab es hier
     * keinen Unterschied zum echten Treffer — genau das war der Defekt.
     *
     * Dass `/m/qr` (innerer Pfad) hier `genau: false` ergibt und `/` nicht, ist
     * bewusst in Kauf genommen: `usePathname()` liefert unter Next 16.2.6 den
     * AEUSZEREN Pfad (nachgemessen, siehe SuiteNav.tsx). Kaeme es je anders,
     * faellt die Wurzel von "page" auf "true" — schwaecher, aber nie falsch.
     */
    expect(aktiverEintrag("/wifi", NAV)).toEqual({ schluessel: "start", genau: false });
    expect(aktiverEintrag("/m/feedback/groups/17", NAV)).toEqual({
      schluessel: "start",
      genau: false,
    });
  });

  it("laeszt die Uebersicht auf einer Unterseite NICHT mitleuchten", () => {
    expect(aktiverEintrag("/m/feedback/vergleich", NAV)?.schluessel).not.toBe("start");
  });

  it("nimmt den spezifischsten Treffer, wenn zwei passen", () => {
    // ECHTE Kollision: der Pfad endet auf BEIDE hrefs. Eine frühere Fassung
    // nahm `/groups` + `/groups/17` — dabei passt `/groups` gar nicht auf
    // `…/groups/17`, es gab nie zwei Treffer, und der Test war auch ohne
    // Sortierung gruen.
    const verschachtelt = [
      { key: "kurz", title: "Kurz", href: "/17" },
      { key: "lang", title: "Lang", href: "/groups/17" },
    ];
    expect(aktiverEintrag("/m/feedback/groups/17", verschachtelt)?.schluessel).toBe("lang");
  });

  it("gibt null, wenn nichts passt und es keine Wurzel gibt", () => {
    expect(aktiverEintrag("/irgendwo", [{ key: "a", title: "A", href: "/anders" }])).toBeNull();
  });
});

describe("SuiteNav — anonym", () => {
  it("bietet Anmelden in der Kopfzeile statt Abmelden und KEINE Modulliste", async () => {
    /*
     * Der Anmelden-Knopf steht an der Avatar-Position und damit auf BEIDEN
     * Groeszen — nicht mehr im Drawer, dessen Oeffner ab 768px verschwindet.
     * Deshalb `exists` (Kopfzeile) und nicht `existsPortal`.
     *
     * Anonym gibt es weiterhin KEINE Modulliste (Grund siehe SuiteNav.tsx): wer
     * abgemeldet auf `feedback` klickt, landet ohnehin auf `/login`
     * (requireFeedbackAccess.ts:35) — genau dort, wohin dieser Knopf direkt
     * fuehrt. Ein Modulwechsler, dessen Eintraege allesamt zum Login umleiten,
     * ist keiner.
     */
    await zeichne({ angemeldet: false, userName: null });
    expect(exists('[data-testid="anmelden"]')).toBe(true);
    expect(query('[data-testid="anmelden"]').getAttribute("href")).toBe("/login");
    expect(exists('[data-testid="nutzermenue"]')).toBe(false);
    expect(existsPortal('[data-testid="abmelden"]')).toBe(false);
    // Und der Anmelden-Weg steht genau einmal da, nicht zusaetzlich im Drawer.
    expect(document.body.querySelectorAll('[data-testid="anmelden"]')).toHaveLength(1);
  });
});
