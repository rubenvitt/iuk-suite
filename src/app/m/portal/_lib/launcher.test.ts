import { describe, it, expect } from "vitest";
import { dienstZuEintrag, ABSCHNITT_WEITERE } from "@/app/m/portal/_lib/launcher";
import type { Service } from "@/app/m/portal/_db/schema";

function dienst(teil: Partial<Service> = {}): Service {
  return {
    id: "abc123",
    slug: "nextcloud",
    name: "Nextcloud",
    description: "Dateiablage des Kreisverbands",
    url: "https://cloud.example.org",
    iconUrl: null,
    category: "Zusammenarbeit",
    tags: [],
    requiredGroups: [],
    isPublic: true,
    isActive: true,
    sortOrder: 0,
    openInNewTab: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...teil,
  } as Service;
}

describe("dienstZuEintrag", () => {
  it("bildet einen Dienst auf einen Launcher-Eintrag ab", () => {
    expect(dienstZuEintrag(dienst())).toEqual({
      key: "dienst:abc123",
      title: "Nextcloud",
      beschreibung: "Dateiablage des Kreisverbands",
      iconUrl: null,
      href: "https://cloud.example.org",
      abschnitt: "Zusammenarbeit",
      extern: true,
    });
  });

  // Der Schluessel traegt ein Praefix, weil Modul-Keys und Dienst-Ids in
  // DERSELBEN Liste stehen. Ein Dienst mit der id "portal" wuerde sonst den
  // React-Key des Portal-Moduls doppeln — und React zeigt bei doppelten Keys
  // nicht den zweiten Eintrag, sondern verwirft ihn still.
  it("praefixt den Schluessel, damit er nicht mit einem Modul-Key kollidiert", () => {
    expect(dienstZuEintrag(dienst({ id: "portal" })).key).toBe("dienst:portal");
  });

  it("ordnet Dienste ohne Kategorie einem Sammelabschnitt zu", () => {
    expect(dienstZuEintrag(dienst({ category: null })).abschnitt).toBe(ABSCHNITT_WEITERE);
    // Leerraum ist keine Kategorie — sonst entstuende ein Abschnitt mit
    // unsichtbarer Ueberschrift.
    expect(dienstZuEintrag(dienst({ category: "   " })).abschnitt).toBe(ABSCHNITT_WEITERE);
  });

  it("laesst eine leere Beschreibung weg, statt sie als leeren String zu fuehren", () => {
    // `description` ist NOT NULL DEFAULT "" — ohne diesen Zweig traegt jeder
    // Eintrag ohne Beschreibung eine leere Zeile unter dem Namen.
    expect(dienstZuEintrag(dienst({ description: "" })).beschreibung).toBeUndefined();
  });
});
