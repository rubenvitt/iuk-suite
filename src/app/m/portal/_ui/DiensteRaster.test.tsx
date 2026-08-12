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
