// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll, exists, fill } from "@/app/m/qr/_lib/test-dom";
import { DiensteRaster } from "@/app/m/portal/_ui/DiensteRaster";
import type { LauncherEintrag } from "@/core/shell/types";

const EINTRAEGE: LauncherEintrag[] = [
  { key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined", href: "https://l", abschnitt: "Apps", extern: false },
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

  it("filtert über die Suche", async () => {
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} />);
    await fill('[data-testid="portal-suche"]', "lager");
    expect(queryAll('[data-testid="service-tile"]').length).toBe(1);
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
    expect(exists('[data-testid="portal-suche"]')).toBe(false);
    // Der Leerzustand steigt vor dem Raster aus — kein `portal-grid` in diesem Zweig.
    expect(exists('[data-testid="portal-grid"]')).toBe(false);
  });

  /*
   * BEFUND 2. Der alte Satz behauptete „im Moment ist für dich keine [Gruppe]
   * hinterlegt" — etwas, das die Komponente gar nicht wissen kann: sie kennt
   * nur die GEMISCHTE LISTE, nicht die Gruppen der Person. Wer Gruppen hat, zu
   * denen nur nichts passt, las damit eine Unwahrheit. Die Zusicherung oben
   * (`toContain("freigeschaltet")`) würde schon auf der Überschrift allein
   * grün bleiben — dieser Test pinnt deshalb zusätzlich den nächsten Schritt,
   * den der neue Satz nennt.
   */
  it("nennt einen naechsten Schritt statt eine Unwahrheit ueber Gruppen", async () => {
    await mount(<DiensteRaster eintraege={[]} ansprechpartner={null} />);
    const leer = query('[data-testid="portal-leer"]');
    expect(leer.textContent).not.toContain("ist für dich keine hinterlegt");
    expect(leer.textContent).toContain("ab und wieder an");
    expect(leer.textContent).toContain("bis zu einer Stunde");
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

  it("sagt es, wenn die Suche nichts findet — das ist nicht derselbe Zustand", async () => {
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} />);
    await fill('[data-testid="portal-suche"]', "gibtesnicht");
    expect(exists('[data-testid="portal-ohne-treffer"]')).toBe(true);
    // Kein Ansprechpartner-Hinweis: nicht freigeschaltet zu sein und nichts
    // gefunden zu haben sind zwei verschiedene Lagen.
    expect(exists('[data-testid="portal-leer"]')).toBe(false);
  });
});
