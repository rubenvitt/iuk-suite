// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { mount, unmount, query, queryAll, exists, fill, click, clickElement, existsPortal } from "@/app/m/qr/_lib/test-dom";
import type { LauncherEintrag, SuiteNavItem } from "@/core/shell/types";

/*
 * DAS MENÜ MIT ZWEI EBENEN (IDA-347, Etappe 2). Was jsdom NICHT sieht — welche Ausprägung bei
 * 390 bzw. 1280px sichtbar ist, und die Feder beim Wechsel —, besitzt der Playwright-Lauf; hier
 * zählt, dass Einträge, Markierung, Ebenenwechsel und Suche die richtigen Ziele tragen.
 */
const { pathnameMock, pushMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/verwaltung/journal"),
  pushMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock, useRouter: () => ({ push: pushMock }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/core/theme/ThemeToggle", () => ({ ThemeToggle: ({ testId = "theme-toggle" }: { testId?: string }) => <span data-testid={testId} /> }));
vi.mock("@/core/rueckmeldung/senden", () => ({ sendeRueckmeldung: vi.fn() }));
// Die Server Action läse Sitzung und Moduldatenbanken; hier zählt, was „Springen zu“ daraus macht.
type Ergebnisse = Awaited<ReturnType<typeof import("@/app/m/portal/sucheAktion").sucheAktion>>;
const sucheAktion = vi.hoisted(() => vi.fn<(begriff: string) => Promise<Ergebnisse>>(async () => []));
vi.mock("@/app/m/portal/sucheAktion", () => ({ sucheAktion }));
/** Über die Verzögerung hinaus warten, bis die Module geantwortet haben. */
const nachDerVerzoegerung = () => act(async () => { await new Promise((r) => setTimeout(r, 300)); });

const { Navigator, SuiteLeiste } = await import("@/core/shell/Navigator");
const { sperreVerlassen } = await import("@/core/shell/verlassen");
const { App } = await import("antd");
type Daten = Parameters<typeof Navigator>[0]["daten"];

const NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", abschnitt: "Bestand" },
  { key: "journal", title: "Journal", href: "/verwaltung/journal", abschnitt: "Protokoll" },
];

const EINTRAEGE: LauncherEintrag[] = [
  { key: "portal", title: "Portal", icon: "apps", href: "https://p", abschnitt: "Apps", bereich: "Weitere Apps", extern: false },
  { key: "lagerbuch", title: "Lagerbuch", icon: "warehouse", href: "https://l", abschnitt: "Apps", bereich: "Material", extern: false },
  { key: "wartung", title: "Gerätewartung", icon: "engine", href: "https://w", abschnitt: "Apps", bereich: "Material", extern: false },
  { key: "dienst:1", title: "Nextcloud", href: "https://n", abschnitt: "Zusammenarbeit", extern: true },
];

function daten(ueber: Partial<Daten> = {}): Daten {
  return {
    modulKey: "lagerbuch",
    modulTitel: "Lagerbuch",
    modulIcon: "warehouse",
    modulBereich: "Material",
    modulHref: "https://l",
    nav: NAV,
    eintraege: EINTRAEGE,
    auswahl: { angeheftet: [], zuletzt: [] },
    bereiche: ["Material", "Weitere Apps"],
    portalHref: "https://p",
    suchHref: "https://p/suche",
    angemeldet: true,
    userName: "Gerda Wart",
    userBild: null,
    profilHref: "https://p",
    rueckmeldeweg: null,
    modulStand: null,
    ...ueber,
  };
}

afterEach(async () => {
  await unmount();
  pathnameMock.mockReturnValue("/verwaltung/journal");
  pushMock.mockReset();
  sucheAktion.mockClear();
});

describe("Navigator — Ebene Seiten", () => {
  it("zeigt oben die App und darunter ihre Seiten mit Abschnitten", async () => {
    await mount(<Navigator daten={daten()} />);
    expect(query('[data-testid="module-title"]').textContent).toBe("Lagerbuch");
    expect(queryAll('[data-testid="nav-abschnitt"]').map((a) => a.textContent)).toEqual(["Bestand", "Protokoll"]);
    expect(queryAll('[data-testid="modulleiste"] [data-testid="nav-link"]').map((a) => a.textContent)).toEqual([
      "Übersicht",
      "Artikel",
      "Journal",
    ]);
  });

  it("markiert die aufgerufene Seite als page", async () => {
    await mount(<Navigator daten={daten()} />);
    const aktiv = queryAll('[data-testid="nav-link"]').filter((l) => l.hasAttribute("aria-current"));
    expect(aktiv.map((l) => [l.textContent, l.getAttribute("aria-current")])).toEqual([["Journal", "page"]]);
  });

  it("liegt in einer nav-Landmarke", async () => {
    await mount(<Navigator daten={daten()} />);
    expect(query("nav").getAttribute("aria-label")).toBe("Navigation");
  });

  it("rendert ohne Navigation keine Seitenliste", async () => {
    await mount(<Navigator daten={daten({ nav: [] })} />);
    expect(exists('[data-testid="modulleiste"]')).toBe(false);
    expect(exists('[data-testid="app-umschalter"]')).toBe(true);
  });
});

describe("Navigator — Ebenenwechsel", () => {
  it("schiebt per App-Knopf die Ebene Alle Apps herein und gibt ihr den Fokus", async () => {
    await mount(<Navigator daten={daten()} />);
    const knopf = query('[data-testid="app-umschalter"]');
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
    expect(query('[data-testid="app-panel"]').hasAttribute("inert")).toBe(true);
    await click('[data-testid="app-umschalter"]');
    expect(knopf.getAttribute("aria-expanded")).toBe("true");
    expect(query('[data-testid="app-panel"]').hasAttribute("inert")).toBe(false);
    expect(knopf.closest("[inert]")).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Lagerbuch");
    expect(document.activeElement?.closest('[data-testid="app-panel"]')).not.toBeNull();
  });

  it("führt per Zurück auf die Seiten und den Fokus auf den App-Knopf", async () => {
    await mount(<Navigator daten={daten()} />);
    await click('[data-testid="app-umschalter"]');
    await clickElement(document.activeElement as HTMLElement);
    expect(query('[data-testid="app-panel"]').hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(query('[data-testid="app-umschalter"]'));
  });

  it("gruppiert Apps nach Bereich, Dienste nach Abschnitt, und führt das Portal getrennt", async () => {
    await mount(<Navigator daten={daten()} />);
    expect(queryAll('[data-testid="app-abschnitt"]').map((a) => a.textContent)).toEqual(["Material", "Zusammenarbeit"]);
    expect(queryAll('[data-testid="app-eintrag"]').map((a) => a.textContent)).toEqual([
      "Lagerbuch",
      "Gerätewartung",
      "Nextcloud",
    ]);
    expect(query('[data-testid="app-portal"]').getAttribute("href")).toBe("https://p");
  });

  it("markiert die eigene App, und ein Klick darauf führt zurück statt fort", async () => {
    await mount(<Navigator daten={daten()} />);
    await click('[data-testid="app-umschalter"]');
    const eigene = queryAll('[data-testid="app-eintrag"]').find((a) => a.textContent === "Lagerbuch")!;
    expect(eigene.getAttribute("aria-current")).toBe("true");
    await clickElement(eigene);
    expect(query('[data-testid="app-panel"]').hasAttribute("inert")).toBe(true);
  });

  it("öffnet Dienste in einem neuen Tab", async () => {
    await mount(<Navigator daten={daten()} />);
    const dienst = queryAll('[data-testid="app-eintrag"]').find((a) => a.textContent === "Nextcloud")!;
    expect(dienst.getAttribute("target")).toBe("_blank");
    expect(dienst.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("stellt ab vielen Einträgen Angeheftet und Zuletzt voran, ohne Doppel darunter", async () => {
    const viele: LauncherEintrag[] = Array.from({ length: 14 }, (_, i) => ({
      key: `m${i}`,
      title: `Modul ${i}`,
      href: `https://m${i}`,
      abschnitt: "Apps",
      bereich: "Material",
      extern: false,
    }));
    await mount(<Navigator daten={daten({ eintraege: viele, auswahl: { angeheftet: ["m3"], zuletzt: ["m5"] } })} />);
    expect(queryAll('[data-testid="app-abschnitt"]').map((a) => a.textContent)).toEqual(["Angeheftet", "Zuletzt", "Material"]);
    const titel = queryAll('[data-testid="app-eintrag"]').map((a) => a.textContent);
    expect(titel.slice(0, 2)).toEqual(["Modul 3", "Modul 5"]);
    expect(titel.filter((t) => t === "Modul 3")).toHaveLength(1);
  });
});

describe("Navigator — Springen zu", () => {
  it("findet Seiten und Apps, und Enter folgt dem ersten Treffer", async () => {
    await mount(<Navigator daten={daten()} />);
    await fill('[data-testid="befehlspalette-eingabe"]', "art");
    const treffer = queryAll('[data-testid="befehl"]');
    expect(treffer.map((t) => t.querySelector("span")?.textContent)).toEqual(["Artikel", "Gerätewartung"]);
    expect(exists('[data-testid="app-umschalter"]')).toBe(false);
    const feld = query<HTMLInputElement>('[data-testid="befehlspalette-eingabe"]');
    await act(async () => {
      feld.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(pushMock).toHaveBeenCalledWith("/verwaltung/artikel");
  });

  it("meldet, wenn nichts passt", async () => {
    await mount(<Navigator daten={daten({ suchHref: null })} />);
    await fill('[data-testid="befehlspalette-eingabe"]', "zzzz");
    expect(queryAll('[data-testid="befehl"]')).toHaveLength(0);
    expect(document.body.textContent).toContain("Keine Treffer");
  });

  it("sucht ab zwei Zeichen auch in den Modulen und zeigt die Inhalte unter den Menütreffern (IDA-391)", async () => {
    sucheAktion.mockResolvedValueOnce([
      {
        modul: "fahrzeuge", titel: "Fahrzeuge", icon: "truck", zustand: "treffer", mehr: false,
        treffer: [{ id: "f1", art: "Fahrzeug", titel: "Rotkreuz Teststadt 11-83-1", merkmale: [], href: "https://f/fahrzeug/1" }],
      },
    ]);
    await mount(<Navigator daten={daten()} />);
    await fill('[data-testid="befehlspalette-eingabe"]', "a");
    await fill('[data-testid="befehlspalette-eingabe"]', "ar");
    await fill('[data-testid="befehlspalette-eingabe"]', "art");
    expect(exists('[data-testid="springen-laedt"]')).toBe(true);
    await nachDerVerzoegerung();
    // Entprellt: einmal, mit dem letzten Stand.
    expect(sucheAktion).toHaveBeenCalledTimes(1);
    expect(sucheAktion).toHaveBeenCalledWith("art");
    const treffer = queryAll('[data-testid="befehl"]');
    expect(treffer.map((t) => t.querySelector("span")?.textContent)).toEqual([
      "Artikel",
      "Gerätewartung",
      "Rotkreuz Teststadt 11-83-1",
      "Alle Treffer zeigen",
    ]);
    expect(treffer[2].getAttribute("href")).toBe("https://f/fahrzeug/1");
    expect(treffer.at(-1)!.getAttribute("href")).toBe("https://p/suche?q=art");
    expect(queryAll('[class*="abschnitt"]').map((k) => k.textContent)).toContain("Fahrzeuge");
    expect(exists('[data-testid="springen-laedt"]')).toBe(false);
  });

  it("sagt „Keine Treffer“ erst, wenn auch die Module nichts liefern, und meldet einen Ausfall", async () => {
    await mount(<Navigator daten={daten()} />);
    await fill('[data-testid="befehlspalette-eingabe"]', "zzzz");
    expect(document.body.textContent).not.toContain("Keine Treffer");
    await nachDerVerzoegerung();
    expect(document.body.textContent).toContain("Keine Treffer");

    sucheAktion.mockRejectedValueOnce(new Error("offline"));
    await fill('[data-testid="befehlspalette-eingabe"]', "zzzzz");
    await nachDerVerzoegerung();
    expect(exists('[data-testid="springen-fehler"]')).toBe(true);
    expect(document.body.textContent).not.toContain("Keine Treffer");
  });

  it("zeigt das Tastenkürzel im leeren Feld, getippt nicht mehr", async () => {
    await mount(<Navigator daten={daten()} />);
    expect(query('[data-testid="springen-kuerzel"]').textContent).toMatch(/^(Strg\+K|⌘K)$/);
    await fill('[data-testid="befehlspalette-eingabe"]', "art");
    expect(exists('[data-testid="springen-kuerzel"]')).toBe(false);
  });
});

describe("Navigator — anonym", () => {
  it("hat weder Umschalter noch Suche noch App-Ebene", async () => {
    await mount(<Navigator daten={daten({ angemeldet: false, eintraege: [] })} />);
    expect(exists('[data-testid="app-umschalter"]')).toBe(false);
    expect(exists('[data-testid="app-panel"]')).toBe(false);
    expect(exists('[data-testid="befehlspalette-eingabe"]')).toBe(false);
    expect(query('[data-testid="module-title"]').closest("a")?.getAttribute("href")).toBe("https://l");
  });
});

describe("Navigator — Verlassen-Sperre (IDA-357)", () => {
  let aufheben: (() => void) | null = null;
  afterEach(() => {
    aufheben?.();
    aufheben = null;
  });
  const sperre = () => {
    aufheben = sperreVerlassen({ titel: "Speicherkonflikt offen", text: "" });
  };
  const dialog = () => document.querySelector(".ant-modal-confirm-title")?.textContent ?? null;
  const dialogKnopf = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>(".ant-modal-confirm button")].find((b) => b.textContent === text)!;
  async function klicke(el: Element): Promise<boolean> {
    let durch = true;
    await act(async () => {
      durch = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    return durch;
  }

  it("fragt vor einem Seiten-Link und bleibt bei „Bleiben“", async () => {
    sperre();
    await mount(<App><Navigator daten={daten()} /></App>);
    const artikel = queryAll('[data-testid="nav-link"]').find((l) => l.textContent === "Artikel")!;
    expect(await klicke(artikel)).toBe(false);
    expect(dialog()).toBe("Speicherkonflikt offen");
    await clickElement(dialogKnopf("Bleiben"));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("fragt vor einer anderen App und vor dem Portal, nicht vor der eigenen App", async () => {
    sperre();
    const zu = vi.fn();
    await mount(<App><Navigator daten={daten({ eintraege: EINTRAEGE.slice(0, 3) })} aufNavigation={zu} /></App>);
    await click('[data-testid="app-umschalter"]');
    const eintrag = (t: string) => queryAll('[data-testid="app-eintrag"]').find((a) => a.textContent === t)!;
    expect(await klicke(eintrag("Lagerbuch"))).toBe(false);
    expect(dialog()).toBeNull();
    expect(query('[data-testid="app-panel"]').hasAttribute("inert")).toBe(true);
    await click('[data-testid="app-umschalter"]');
    expect(await klicke(eintrag("Gerätewartung"))).toBe(false);
    expect(dialog()).toBe("Speicherkonflikt offen");
    await clickElement(dialogKnopf("Bleiben"));
    expect(await klicke(query('[data-testid="app-portal"]'))).toBe(false);
  });

  it("„Trotzdem verlassen“ führt den Sprung per Enter aus", async () => {
    sperre();
    await mount(<App><Navigator daten={daten()} /></App>);
    await fill('[data-testid="befehlspalette-eingabe"]', "art");
    const feld = query<HTMLInputElement>('[data-testid="befehlspalette-eingabe"]');
    await act(async () => {
      feld.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(dialog()).toBe("Speicherkonflikt offen");
    await clickElement(dialogKnopf("Trotzdem verlassen"));
    expect(pushMock).toHaveBeenCalledWith("/verwaltung/artikel");
  });
});

describe("SuiteLeiste", () => {
  it("trägt Seitenleiste und Ort-Knopf, und der Ort nennt App und Seite", async () => {
    await mount(<SuiteLeiste daten={daten()} />);
    expect(exists('[data-testid="modulleiste"]')).toBe(true);
    expect(exists('[data-testid="nutzermenue"]')).toBe(true);
    expect(exists('[data-testid="theme-toggle"]')).toBe(true);
    const ort = query('[data-testid="menue-knopf"]');
    expect(ort.textContent).toBe("LagerbuchJournal");
    expect(ort.getAttribute("aria-expanded")).toBe("false");
  });

  it("öffnet am Ort-Knopf dasselbe Menü als Blatt, mit eigenen testIds", async () => {
    await mount(<SuiteLeiste daten={daten()} />);
    expect(existsPortal('[data-testid="suite-drawer"]')).toBe(false);
    await click('[data-testid="menue-knopf"]');
    expect(query('[data-testid="menue-knopf"]').getAttribute("aria-expanded")).toBe("true");
    for (const id of ["suite-drawer", "modulleiste-drawer", "app-umschalter-drawer", "nutzermenue-drawer", "theme-toggle-drawer"]) {
      expect(existsPortal(`[data-testid="${id}"]`), id).toBe(true);
    }
  });

  it("nennt auf dem Profil „Profil“, nicht die Übersicht (IDA-391)", async () => {
    pathnameMock.mockReturnValue("/profil");
    const nav: SuiteNavItem[] = [{ key: "start", title: "Übersicht", href: "/" }, { key: "suche", title: "Suche", href: "/suche" }];
    await mount(<SuiteLeiste daten={daten({ modulKey: "portal", modulTitel: "Portal", nav })} />);
    expect(query('[data-testid="menue-knopf"]').textContent).toBe("PortalProfil");
  });

  it("nennt auf einer Seite außerhalb der Navigation nur die App", async () => {
    pathnameMock.mockReturnValue("/irgendwo");
    await mount(<SuiteLeiste daten={daten({ nav: [{ key: "start", title: "Übersicht", href: "/" }] })} />);
    expect(query('[data-testid="menue-knopf"]').textContent).toBe("Lagerbuch");
  });

  it("zeigt anonym Anmelden statt des Nutzermenüs", async () => {
    await mount(<SuiteLeiste daten={daten({ angemeldet: false, eintraege: [], userName: null })} />);
    expect(exists('[data-testid="anmelden"]')).toBe(true);
    expect(exists('[data-testid="nutzermenue"]')).toBe(false);
  });
});
