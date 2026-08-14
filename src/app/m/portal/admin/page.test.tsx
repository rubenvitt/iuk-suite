import { describe, expect, it, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";

/**
 * DIE VERWALTUNG BEKOMMT EINEN SEITENKOPF STATT EINES EIGENEN `<h1>`
 * (Durchgang Aufgabe 13, Punkt 1). Zwei weitere Zusagen dieser Datei:
 *
 * 1. DER RIEGEL PRÜFT DASSELBE PRÄDIKAT WIE DIE MENÜ-SICHTBARKEIT (Punkt 7,
 *    Gegenprobe): `moduleAdminPageOrNotFound("portal")` — dieselbe Zeichenkette,
 *    die `canAdminModule("portal")` in `layout.tsx` für den Nav-Eintrag prüft.
 *    Ein abweichender Modul-Key hier wäre ein 404 für jeden Admin.
 * 2. `ServiceTable` bekommt die geladenen Dienste unverändert.
 *
 * Leichte Bauform wie `qr/page.test.tsx`: der Elementbaum wird verglichen,
 * nichts wird gemountet — `getAllServices`/`leseAnsprechpartner` sind
 * DB-Funktionen, ein DOM-Mount bräuchte eine echte migrierte Datenbank dafür.
 */
vi.mock("@/core/auth/guards", () => ({
  moduleAdminPageOrNotFound: vi.fn(),
  requireModuleAdmin: vi.fn(),
  canAdminModule: vi.fn(),
}));
vi.mock("@/app/m/portal/_lib/services", () => ({
  getAllServices: vi.fn(),
  getVisibleServicesForUser: vi.fn(),
  getServiceById: vi.fn(),
  getServiceBySlug: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
}));
vi.mock("@/app/m/portal/_lib/einstellungen", () => ({
  leseAnsprechpartner: vi.fn(),
  setzeAnsprechpartner: vi.fn(),
}));

import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { getAllServices } from "@/app/m/portal/_lib/services";
import { leseAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";
import PortalAdminPage from "@/app/m/portal/admin/page";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { ServiceTable } from "@/app/m/portal/admin/service-table";
import { AnsprechpartnerForm } from "@/app/m/portal/admin/ansprechpartner-form";

const guardMock = vi.mocked(moduleAdminPageOrNotFound);
const servicesMock = vi.mocked(getAllServices);
const ansprechpartnerMock = vi.mocked(leseAnsprechpartner);

function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (isValidElement(node)) {
    out.push(node);
    flatten((node.props as { children?: unknown }).children, out);
  }
  return out;
}

describe("Portal-Verwaltung: Zugriff und Seitenkopf", () => {
  beforeEach(() => {
    guardMock.mockReset().mockResolvedValue(undefined);
    servicesMock.mockReset().mockResolvedValue([]);
    ansprechpartnerMock.mockReset().mockResolvedValue(null);
  });

  it("prueft denselben Modul-Key wie die Sichtbarkeit des Verwaltung-Links im Menue", async () => {
    await PortalAdminPage();
    expect(guardMock).toHaveBeenCalledWith("portal");
  });

  it("traegt einen Seitenkopf mit Titel statt eines eigenen <h1>", async () => {
    const baum = flatten((await PortalAdminPage()) as ReactElement);
    const kopf = baum.find((el) => el.type === Seitenkopf);
    expect(kopf).toBeDefined();
    expect((kopf!.props as { titel: string }).titel).toBe("Dienste verwalten");
    expect(baum.some((el) => el.type === "h1")).toBe(false);
  });

  it("reicht die geladenen Dienste unveraendert an ServiceTable durch", async () => {
    const services = [
      { id: "s1", name: "BookStack", slug: "docs", url: "https://docs.example", isPublic: true },
    ];
    servicesMock.mockResolvedValue(services as never);

    const baum = flatten((await PortalAdminPage()) as ReactElement);
    const tabelle = baum.find((el) => el.type === ServiceTable)!;
    expect((tabelle.props as { services: unknown[] }).services).toEqual(services);
  });

  it("reicht den gepflegten Ansprechpartner unveraendert an das Formular durch", async () => {
    ansprechpartnerMock.mockResolvedValue("IuK-Gruppe — iuk@example.org");

    const baum = flatten((await PortalAdminPage()) as ReactElement);
    const formular = baum.find((el) => el.type === AnsprechpartnerForm)!;
    expect((formular.props as { wert: string | null }).wert).toBe("IuK-Gruppe — iuk@example.org");
  });
});
