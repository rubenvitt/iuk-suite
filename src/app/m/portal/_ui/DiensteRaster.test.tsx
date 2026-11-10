// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
// IDA-338: Anheften und Merken schrieben in die Portal-Datenbank; hier zählt nur der Aufruf.
const aktionen = vi.hoisted(() => ({
  setzeAngeheftetAction: vi.fn(async (key: unknown, an: unknown) => (an ? ["lagerbuch", key as string] : [])),
  merkeDienstAufrufAction: vi.fn(async () => undefined),
}));
vi.mock("@/app/m/portal/actions", () => aktionen);
import { DiensteRaster } from "@/app/m/portal/_ui/DiensteRaster";
import type { LauncherEintrag } from "@/core/shell/types";

const EINTRAEGE: LauncherEintrag[] = [
  { key: "lagerbuch", title: "Lagerbuch", icon: "warehouse", href: "https://l", abschnitt: "Apps", extern: false },
  { key: "dienst:1", title: "Nextcloud", beschreibung: "Dateiablage", href: "https://n", abschnitt: "Zusammenarbeit", extern: true },
];

afterEach(async () => {
  await unmount();
});

describe("DiensteRaster", () => {
  it("gruppiert nach Abschnitt und verlinkt jede Kachel", async () => {
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} />);
    expect(queryAll('[data-testid="portal-abschnitt"]').map((a) => a.textContent)).toEqual([
      "Apps",
      "Zusammenarbeit",
    ]);
    expect(queryAll('[data-testid="service-tile"]').length).toBe(2);
  });

  it("zeigt Modulen ihr App-Icon, Modulen ohne Zeichen ihr Icons8-Zeichen auf derselben Kachel", async () => {
    await mount(
      <DiensteRaster
        eintraege={[
          { ...EINTRAEGE[0], key: "qr", title: "QR-Codes", appIconUrl: "/favicon/qr-app-192.png?v=1" },
          { ...EINTRAEGE[0], key: "alpha", title: "Alpha", icon: "square" },
          EINTRAEGE[1],
        ]}
        ansprechpartner={null}
      />,
    );
    const zeichen = queryAll('[data-testid="app-zeichen"]');
    expect(zeichen.length).toBe(2);
    expect(zeichen[0].tagName).toBe("IMG");
    expect(zeichen[0].getAttribute("src")).toBe("/favicon/qr-app-192.png?v=1");
    expect(zeichen[1].querySelector('[data-icons8="square"]')).not.toBeNull();
    // Externe Dienste bleiben beim kleinen Zeichen.
    const dienst = queryAll('[data-testid="service-tile"]')[2];
    expect(dienst.querySelector('[data-testid="app-zeichen"]')).toBeNull();
  });

  /*
   * DER DEFEKT, DEN DIESE AUFGABE BEHEBT. Bisher rendert `services.map` über
   * `[]` ein leeres `<Row>` — eine weiße Fläche, die wie ein Ausfall
   * aussieht. Der häufigere Fall ist eine frisch angelegte Helferin, die noch
   * für nichts freigeschaltet ist.
   */
  it("nennt den Ansprechpartner, wenn nichts freigeschaltet ist", async () => {
    await mount(<DiensteRaster eintraege={[]} ansprechpartner="IuK-Gruppe — iuk@example.org" />);
    const leer = query('[data-testid="portal-leer"]');
    expect(leer.textContent).toContain("freigeschaltet");
    expect(leer.textContent).toContain("iuk@example.org");
    // Der Leerzustand steigt vor dem Raster aus — kein `portal-grid` in diesem Zweig.
    expect(exists('[data-testid="portal-grid"]')).toBe(false);
  });

  /*
   * BEFUND 2. Der alte Satz behauptete „im Moment ist für dich keine [Gruppe]
   * hinterlegt" — etwas, das die Komponente gar nicht wissen kann: sie kennt
   * nur die GEMISCHTE LISTE, nicht die Gruppen der Person. Wer Gruppen hat, zu
   * denen nur nichts passt, las damit eine Unwahrheit. Die Zusicherung oben
   * (`toContain("freigeschaltet")`) würde schon auf der Überschrift allein
   * grün bleiben — dieser Test hält die Falschaussage deshalb ausdrücklich
   * draußen.
   */
  it("sagt keine Unwahrheit ueber Gruppen", async () => {
    await mount(<DiensteRaster eintraege={[]} ansprechpartner={null} />);
    const leer = query('[data-testid="portal-leer"]');
    expect(leer.textContent).not.toContain("ist für dich keine hinterlegt");
  });

  it("vergibt das Raster genau einmal, egal wie viele Abschnitte es gibt", async () => {
    // Playwrights getByTestId ist strict: zwei Knoten mit derselben testId sind
    // eine "resolved to N elements"-Verletzung, und e2e/portal.spec.ts:8 greift
    // genau diese. Der Fehler entstand, als die Abschnitte eingezogen und das
    // data-testid in der Schleife stehen blieb.
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} />);
    expect(queryAll('[data-testid="portal-grid"]').length).toBe(1);
    // Zwei Abschnitte sind es in dieser Vorlage — sonst prüfte die Zeile darüber nichts.
    expect(queryAll('[data-testid="portal-abschnitt"]').length).toBe(2);
  });

  it("zeigt ohne gepflegten Ansprechpartner nur die Erklärung", async () => {
    await mount(<DiensteRaster eintraege={[]} ansprechpartner={null} />);
    expect(exists('[data-testid="portal-leer"]')).toBe(true);
    expect(exists('[data-testid="portal-kontakt"]')).toBe(false);
  });

  it("hat kein eigenes Suchfeld mehr: gesucht wird in „Springen zu“ (IDA-391)", async () => {
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} />);
    expect(exists('[data-testid="portal-suche"]')).toBe(false);
    expect(exists("input")).toBe(false);
  });

  it("trennt Kacheltitel nicht mitten im Wort (IDA-391)", async () => {
    await mount(<DiensteRaster eintraege={[{ ...EINTRAEGE[0], version: "1.2.3" }]} ansprechpartner={null} />);
    const titel = query('[data-testid="kachel-titel"]') as HTMLElement;
    expect(titel.className).toContain("portal-kachel-titel");
    // Die Regeln selbst stehen in portal.css; inline darf nichts sie überstimmen.
    expect(titel.style.hyphens).toBe("");
    expect(titel.style.overflowWrap).toBe("");
    expect(query('[data-testid="service-tile"]').parentElement!.className).toBe("portal-kacheln");
  });

  describe("viele Einträge (IDA-338)", () => {
    const VIELE: LauncherEintrag[] = [
      { key: "lagerbuch", title: "Lagerbuch", icon: "warehouse", href: "https://l", abschnitt: "Apps", bereich: "Material & Technik", extern: false },
      { key: "radio", title: "Funkgeräte", icon: "walkie-talkie", href: "https://r", abschnitt: "Apps", bereich: "Einsatz & Lage", extern: false },
      { key: "radio:verwaltung", title: "Funkgeräte-Verwaltung", icon: "walkie-talkie", href: "https://r/admin", abschnitt: "Apps", bereich: "Einsatz & Lage", extern: false },
      ...Array.from({ length: 11 }, (_, i): LauncherEintrag => ({
        key: `dienst:${i}`, title: `Dienst ${i}`, href: `https://d${i}`, abschnitt: i < 6 ? "Doku" : "Tools", extern: true,
      })),
    ];
    const BEREICHE = ["Einsatz & Lage", "Material & Technik"];

    it("ohne Angeheftetes und Zuletzt steht „Alle“ gleich offen, geordnet nach Bereich", async () => {
      await mount(<DiensteRaster eintraege={VIELE} ansprechpartner={null} bereiche={BEREICHE} />);
      expect(exists('[data-testid="portal-angeheftet"]')).toBe(false);
      expect(exists('[data-testid="portal-alle"]')).toBe(false);
      expect(queryAll('[data-testid="portal-abschnitt"]').map((a) => a.textContent)).toEqual([
        "Einsatz & Lage", "Material & Technik", "Weitere Dienste11",
      ]);
      // Die Verwaltung ist ein Zweitlink an ihrer App, keine eigene Zeile.
      expect(queryAll('[data-testid="portal-zeile"]').map((z) => z.textContent)).toEqual(["FunkgeräteVerwaltung", "Lagerbuch"]);
    });

    it("ohne Angeheftetes zeigt es eine Zeile statt Figur, und „Zuletzt“ allein klappt „Alle“ nicht zu (IDA-391)", async () => {
      await mount(
        <DiensteRaster eintraege={VIELE} ansprechpartner={null} bereiche={BEREICHE} auswahl={{ angeheftet: [], zuletzt: ["radio"] }} />,
      );
      const leer = query('[data-testid="portal-ohne-angeheftet"]');
      expect(leer.tagName).toBe("P");
      expect(leer.textContent).toBe("Noch nichts angeheftet");
      expect(leer.querySelector('[data-icons8="pin"]')).not.toBeNull();
      expect(exists('[data-testid="portal-zuletzt"]')).toBe(true);
      expect(query('[data-testid="portal-alle"]').getAttribute("aria-expanded")).toBe("true");
      expect(exists('[data-testid="portal-alle-liste"]')).toBe(true);
    });

    it("zeigt oben Angeheftet als Kacheln und Zuletzt ohne Doppel, den Rest zugeklappt", async () => {
      await mount(
        <DiensteRaster
          eintraege={VIELE}
          ansprechpartner={null}
          bereiche={BEREICHE}
          auswahl={{ angeheftet: ["lagerbuch", "weg"], zuletzt: ["lagerbuch", "dienst:3", "radio"] }}
        />,
      );
      expect(queryAll('[data-testid="portal-angeheftet"] [data-testid="service-tile"]').map((k) => k.getAttribute("href"))).toEqual(["https://l"]);
      expect(queryAll('[data-testid="portal-zuletzt"] [data-testid="portal-zeile"]').map((z) => z.querySelector("a")!.getAttribute("href"))).toEqual([
        "https://d3",
        "https://r",
      ]);
      expect(query('[data-testid="portal-alle"]').getAttribute("aria-expanded")).toBe("false");
      expect(exists('[data-testid="portal-alle-liste"]')).toBe(false);
      await act(async () => (query('[data-testid="portal-alle"]') as HTMLButtonElement).click());
      expect(exists('[data-testid="portal-alle-liste"]')).toBe(true);
    });

    it("anheften wirkt sofort und übernimmt danach den gespeicherten Stand", async () => {
      await mount(
        <DiensteRaster eintraege={VIELE} ansprechpartner={null} bereiche={BEREICHE} auswahl={{ angeheftet: ["lagerbuch"], zuletzt: ["radio"] }} />,
      );
      const knopf = query('[data-testid="portal-zuletzt"] [data-testid="anheften"]') as HTMLButtonElement;
      expect(knopf.getAttribute("aria-pressed")).toBe("false");
      await act(async () => knopf.click());
      expect(aktionen.setzeAngeheftetAction).toHaveBeenCalledWith("radio", true);
      expect(queryAll('[data-testid="portal-angeheftet"] [data-testid="service-tile"]').map((k) => k.getAttribute("href"))).toEqual([
        "https://l",
        "https://r",
      ]);
    });

    it("das erste Anheften klappt die offene Liste nicht zu", async () => {
      await mount(<DiensteRaster eintraege={VIELE} ansprechpartner={null} bereiche={BEREICHE} />);
      const zeile = queryAll('[data-testid="portal-zeile"]').find((z) => z.textContent === "Lagerbuch")!;
      await act(async () => (zeile.querySelector('[data-testid="anheften"]') as HTMLButtonElement).click());
      expect(exists('[data-testid="portal-alle-liste"]')).toBe(true);
      expect(query('[data-testid="portal-alle"]').getAttribute("aria-expanded")).toBe("true");
    });

    it("eine verspätete Antwort setzt einen neueren Klick nicht zurück", async () => {
      let ersteAntwort: (v: string[]) => void = () => undefined;
      aktionen.setzeAngeheftetAction
        .mockImplementationOnce(() => new Promise<string[]>((r) => { ersteAntwort = r; }))
        .mockImplementationOnce(async () => ["radio", "lagerbuch"]);
      await mount(<DiensteRaster eintraege={VIELE} ansprechpartner={null} bereiche={BEREICHE} />);
      const nadel = (text: string) =>
        queryAll('[data-testid="portal-zeile"]').find((z) => z.textContent === text)!.querySelector('[data-testid="anheften"]') as HTMLButtonElement;
      await act(async () => nadel("FunkgeräteVerwaltung").click());
      await act(async () => nadel("Lagerbuch").click());
      await act(async () => ersteAntwort(["radio"]));
      expect(queryAll('[data-testid="portal-angeheftet"] [data-testid="service-tile"]').map((k) => k.getAttribute("href"))).toEqual([
        "https://r",
        "https://l",
      ]);
    });

    it("meldet den Klick auf einen Dienst für „Zuletzt“", async () => {
      await mount(<DiensteRaster eintraege={VIELE} ansprechpartner={null} bereiche={BEREICHE} auswahl={{ angeheftet: ["dienst:2"], zuletzt: [] }} />);
      const kachel = query('[data-testid="portal-angeheftet"] [data-testid="service-tile"]') as HTMLAnchorElement;
      kachel.addEventListener("click", (e) => e.preventDefault());
      await act(async () => kachel.click());
      expect(aktionen.merkeDienstAufrufAction).toHaveBeenCalledWith("dienst:2");
    });
  });

  it("unter der Schwelle bleibt alles wie bisher, auch mit Angeheftetem", async () => {
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} auswahl={{ angeheftet: ["lagerbuch"], zuletzt: ["lagerbuch"] }} />);
    expect(exists('[data-testid="portal-angeheftet"]')).toBe(false);
    expect(queryAll('[data-testid="service-tile"]').length).toBe(2);
  });
});
