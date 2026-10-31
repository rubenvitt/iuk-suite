import { describe, expect, it, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";

/**
 * DIE STARTSEITE DER SUITE BEKOMMT EINEN SEITENKOPF (Durchgang Aufgabe 13).
 *
 * Bis hierher begann die Seite direkt mit dem Suchfeld aus `DiensteRaster` —
 * keine Zeile sagte, wo man ist. `core/shell/Seitenkopf` direkt importiert,
 * kein modul-eigener Adapter (Punkt 1 der Prüfliste).
 *
 * Dieselbe leichte Bauform wie `qr/page.test.tsx`: `PortalPage()` liefert
 * einen Elementbaum, keinen DOM — `Seitenkopf` und `DiensteRaster` werden nur
 * als UNAUSGEFÜHRTE Elemente verglichen (`el.type === Komponente`), ein voller
 * DOM-Mount bräuchte `_lib/launcher.ts` bis in eine echte Datenbank.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/core/shell/launcherEintraege", () => ({ launcherEintraege: vi.fn() }));
vi.mock("@/app/m/portal/_lib/einstellungen", () => ({
  leseAnsprechpartner: vi.fn(),
  setzeAnsprechpartner: vi.fn(),
}));
vi.mock("@/app/m/lagerbuch/_lib/faelligkeiten", () => ({
  LAGERBUCH_FAELLIGKEITS_ARTEN: ["Verfall"],
  darfLagerbuchFaelligkeitenSehen: (g: string[] | null) => !!g?.includes("lager-admin"),
  lagerbuchFaelligkeiten: () => [{
    id: "v", art: "Verfall", titel: "NaCl", wo: null, zustand: "abgelaufen",
    dringlichkeit: "ueberfaellig", sortierung: "", pfad: "/verwaltung/verfall",
  }],
}));
vi.mock("@/app/m/radio/_lib/faelligkeiten", () => ({
  RADIO_FAELLIGKEITS_ARTEN: ["Ausleihe"],
  darfRadioFaelligkeitenSehen: () => false,
  radioFaelligkeiten: () => [],
}));

import { auth } from "@/core/auth";
import { launcherEintraege } from "@/core/shell/launcherEintraege";
import { leseAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";
import PortalPage from "@/app/m/portal/page";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { DiensteRaster } from "@/app/m/portal/_ui/DiensteRaster";
import { FaelligkeitenKarte } from "@/app/m/portal/_ui/FaelligkeitenKarte";

const authMock = vi.mocked(auth);
const launcherMock = vi.mocked(launcherEintraege);
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

describe("Portal-Startseite: Seitenkopf statt eigenem <h1>", () => {
  beforeEach(() => {
    authMock.mockReset();
    launcherMock.mockReset();
    ansprechpartnerMock.mockReset();
    authMock.mockResolvedValue(null as never);
    launcherMock.mockResolvedValue([]);
    ansprechpartnerMock.mockResolvedValue(null);
  });

  it("traegt einen Seitenkopf mit Titel", async () => {
    const baum = flatten((await PortalPage()) as ReactElement);
    const kopf = baum.find((el) => el.type === Seitenkopf);
    expect(kopf).toBeDefined();
    expect((kopf!.props as { titel: string }).titel).toBe("Apps & Dienste");
  });

  it("hat kein eigenes <h1> daneben", async () => {
    const baum = flatten((await PortalPage()) as ReactElement);
    expect(baum.some((el) => el.type === "h1")).toBe(false);
  });

  it("hat kein `zurueck`: die Startseite ist die Wurzel, kein Rueckweg auf sich selbst", async () => {
    const baum = flatten((await PortalPage()) as ReactElement);
    const kopf = baum.find((el) => el.type === Seitenkopf)!;
    expect((kopf.props as { zurueck?: unknown }).zurueck).toBeUndefined();
  });

  it("reicht Liste und Ansprechpartner unveraendert an DiensteRaster durch", async () => {
    const eintraege = [
      {
        key: "lagerbuch",
        title: "Lagerbuch",
        href: "https://l",
        abschnitt: "Apps",
        extern: false,
      },
    ];
    launcherMock.mockResolvedValue(eintraege as never);
    ansprechpartnerMock.mockResolvedValue("IuK-Gruppe — iuk@example.org");

    const baum = flatten((await PortalPage()) as ReactElement);
    const raster = baum.find((el) => el.type === DiensteRaster)!;
    const props = raster.props as { eintraege: unknown[]; ansprechpartner: string | null };
    expect(props.eintraege).toEqual(eintraege);
    expect(props.ansprechpartner).toBe("IuK-Gruppe — iuk@example.org");
  });

  it("liest die Liste ueber die Gruppen der Sitzung, anonym ueber null", async () => {
    authMock.mockResolvedValue({ user: { groups: ["a", "b"] } } as never);
    await PortalPage();
    expect(launcherMock).toHaveBeenCalledWith(["a", "b"]);

    authMock.mockResolvedValue(null as never);
    await PortalPage();
    expect(launcherMock).toHaveBeenCalledWith(null);
  });
});

describe("Portal-Startseite: Kachel „Was steht an“ (IDA-297)", () => {
  beforeEach(() => {
    launcherMock.mockResolvedValue([]);
    ansprechpartnerMock.mockResolvedValue(null);
  });

  it("fehlt ohne Recht an einem Quellmodul", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    expect(flatten((await PortalPage()) as ReactElement).some((el) => el.type === FaelligkeitenKarte)).toBe(false);
  });

  it("zeigt Lagerbuch-Admins die Zahlen", async () => {
    authMock.mockResolvedValue({ user: { groups: ["lager-admin"] } } as never);
    const karte = flatten((await PortalPage()) as ReactElement).find((el) => el.type === FaelligkeitenKarte)!;
    expect((karte.props as { zaehlung: unknown }).zaehlung).toEqual({ ueberfaellig: 1, bald: 0 });
  });
});
