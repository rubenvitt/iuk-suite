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
 * 3. KEINE INSEL BEKOMMT EINE FUNKTION ALS PROP (Falle 9, DRK-398): die
 *    Formulare importieren ihre Server Action selbst.
 * 4. „DIENST ANLEGEN" STEHT IM SEITENKOPF (IDA-391), Audit-Log und Rechte nicht
 *    mehr auf der Seite, sondern in der Navigation.
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
vi.mock("@/app/m/portal/_lib/gruppen", () => ({
  ladeWaehlbareGruppen: vi.fn(),
}));
vi.mock("@/app/m/portal/_lib/einstellungen", () => ({
  leseAnsprechpartner: vi.fn(),
  setzeAnsprechpartner: vi.fn(),
  leseZeitzone: vi.fn(() => "Europe/Berlin"),
  setzeZeitzone: vi.fn(),
}));

import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { getAllServices } from "@/app/m/portal/_lib/services";
import { leseAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";
import PortalAdminPage from "@/app/m/portal/admin/page";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { ServiceTable } from "@/app/m/portal/admin/service-table";
import { DienstAnlegen } from "@/app/m/portal/admin/dienst-anlegen";
import { ladeWaehlbareGruppen } from "@/app/m/portal/_lib/gruppen";
import { AnsprechpartnerForm } from "@/app/m/portal/admin/ansprechpartner-form";
import { ZeitzoneForm } from "@/app/m/portal/admin/zeitzone-form";
import { leseZeitzone } from "@/app/m/portal/_lib/einstellungen";

const guardMock = vi.mocked(moduleAdminPageOrNotFound);
const servicesMock = vi.mocked(getAllServices);
const ansprechpartnerMock = vi.mocked(leseAnsprechpartner);
const gruppenMock = vi.mocked(ladeWaehlbareGruppen);
const GRUPPEN = [{ wert: "iuk", anzeige: "IuK-Gruppe" }];

function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (isValidElement(node)) {
    out.push(node);
    const props = node.props as { children?: unknown; aktionen?: unknown };
    flatten(props.children, out);
    // Der Seitenkopf trägt „Dienst anlegen" als Prop, nicht als Kind.
    flatten(props.aktionen, out);
  }
  return out;
}

describe("Portal-Verwaltung: Zugriff und Seitenkopf", () => {
  beforeEach(() => {
    guardMock.mockReset().mockResolvedValue(undefined);
    servicesMock.mockReset().mockResolvedValue([]);
    ansprechpartnerMock.mockReset().mockResolvedValue(null);
    gruppenMock.mockReset().mockResolvedValue({ quelle: "ok", optionen: GRUPPEN });
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

  it("traegt „Dienst anlegen“ im Seitenkopf und keine Abschnitte fuer Audit-Log und Rechte (IDA-391)", async () => {
    servicesMock.mockResolvedValue([{ id: "s1", category: "Doku" }, { id: "s2", category: null }] as never);
    const baum = flatten((await PortalAdminPage()) as ReactElement);
    const kopf = baum.find((el) => el.type === Seitenkopf)!;
    const aktionen = (kopf.props as { aktionen?: ReactElement }).aktionen;
    expect(aktionen?.type).toBe(DienstAnlegen);
    expect((aktionen!.props as { kategorien: string[] }).kategorien).toEqual(["Doku"]);
    const ueberschriften = baum.filter((el) => el.type === "h2").map((el) => (el.props as { children: unknown }).children);
    expect(ueberschriften.join(" ")).not.toMatch(/Audit-Log|Rechte|Neuen Dienst/);
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

  it("reicht die waehlbaren Gruppen an Tabelle und Formular und liest sie aus den Diensten (IDA-227)", async () => {
    const services = [{ id: "s1", requiredGroups: ["alt"] }];
    servicesMock.mockResolvedValue(services as never);

    const baum = flatten((await PortalAdminPage()) as ReactElement);
    expect(gruppenMock).toHaveBeenCalledWith(services);
    for (const insel of [ServiceTable, DienstAnlegen]) {
      const element = baum.find((el) => el.type === insel)!;
      expect((element.props as { gruppen: unknown }).gruppen, insel.name).toEqual(GRUPPEN);
    }
  });

  it("reicht den gepflegten Ansprechpartner unveraendert an das Formular durch", async () => {
    ansprechpartnerMock.mockResolvedValue("IuK-Gruppe — iuk@example.org");

    const baum = flatten((await PortalAdminPage()) as ReactElement);
    const formular = baum.find((el) => el.type === AnsprechpartnerForm)!;
    expect((formular.props as { wert: string | null }).wert).toBe("IuK-Gruppe — iuk@example.org");
  });

  it("reicht keiner Insel eine Funktion als Prop (Falle 9, DRK-398)", async () => {
    const baum = flatten((await PortalAdminPage()) as ReactElement);
    const inseln = [ServiceTable, DienstAnlegen, AnsprechpartnerForm, ZeitzoneForm];
    for (const insel of inseln) {
      const element = baum.find((el) => el.type === insel);
      expect(element, `${insel.name} fehlt im Baum`).toBeDefined();
      const funktionen = Object.entries(element!.props as Record<string, unknown>)
        .filter(([, wert]) => typeof wert === "function")
        .map(([name]) => name);
      expect(funktionen, insel.name).toEqual([]);
    }
  });

  it("reicht die gepflegte Zeitzone und die waehlbaren Zonen an das Formular durch (DRK-469)", async () => {
    vi.mocked(leseZeitzone).mockReturnValue("Europe/Lisbon");

    const baum = flatten((await PortalAdminPage()) as ReactElement);
    const formular = baum.find((el) => el.type === ZeitzoneForm)!;
    const props = formular.props as { wert: string; zonen: string[] };
    expect(props.wert).toBe("Europe/Lisbon");
    expect(props.zonen).toContain("Europe/Berlin");
    expect(props.zonen).toContain("UTC");
  });
});
