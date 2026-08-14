import { describe, expect, it, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";

/**
 * DIE QR-VERWALTUNG BEKOMMT EINEN SEITENKOPF STATT EINES EIGENEN `<h1>`
 * (Durchgang Aufgabe 13, Punkt 1 — gilt hier, ANDERS als Punkt 2: `qr` läuft
 * unter `MinimalShell` und behält das Handschuh-Maß, siehe Kommentar am
 * Seitenanfang von `page.tsx`).
 *
 * Zwei bisher ungetestete Zusagen wandern hier mit rein, weil die Seite vorher
 * gar keine eigene Testdatei hatte:
 *
 * 1. DER RIEGEL PRÜFT DASSELBE PRÄDIKAT WIE DIE MENÜ-SICHTBARKEIT (Punkt 7,
 *    Gegenprobe): `moduleAdminPageOrNotFound("qr")`.
 * 2. DAS ZU BEARBEITENDE PRESET KOMMT AUS DER GELADENEN LISTE, nicht aus
 *    einer eigenen Abfrage — eine unbekannte `id` ergibt deshalb schlicht das
 *    Anlege-Formular, keinen Fehler (Kommentar in `page.tsx`).
 *
 * Leichte Bauform wie `qr/page.test.tsx`: der Elementbaum wird verglichen,
 * nichts wird gemountet.
 */
vi.mock("@/core/auth/guards", () => ({
  moduleAdminPageOrNotFound: vi.fn(),
  requireModuleAdmin: vi.fn(),
  canAdminModule: vi.fn(),
}));
vi.mock("@/app/m/qr/_lib/presets", () => ({
  listPresets: vi.fn(),
  createPreset: vi.fn(),
  updatePreset: vi.fn(),
  deletePreset: vi.fn(),
  reorderPresets: vi.fn(),
}));

import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { listPresets } from "@/app/m/qr/_lib/presets";
import QrAdminPage from "@/app/m/qr/admin/page";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { PresetForm } from "@/app/m/qr/admin/preset-form";
import type { Preset } from "@/app/m/qr/_lib/types";

const guardMock = vi.mocked(moduleAdminPageOrNotFound);
const listPresetsMock = vi.mocked(listPresets);

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

const PRESETS: Preset[] = [
  { id: "p1", label: "Eins", icon: "🔧", kind: "text", value: "a" },
  { id: "p2", label: "Zwei", icon: "🔧", kind: "text", value: "b" },
];

describe("qr/admin: Zugriff und Seitenkopf", () => {
  beforeEach(() => {
    guardMock.mockReset().mockResolvedValue(undefined);
    listPresetsMock.mockReset().mockResolvedValue([]);
  });

  it("prueft denselben Modul-Key wie die Sichtbarkeit des Verwaltung-Links im Menue", async () => {
    await QrAdminPage({ searchParams: Promise.resolve({}) });
    expect(guardMock).toHaveBeenCalledWith("qr");
  });

  it("traegt einen Seitenkopf mit Titel statt eines eigenen <h1>", async () => {
    const baum = flatten(
      (await QrAdminPage({ searchParams: Promise.resolve({}) })) as ReactElement,
    );
    const kopf = baum.find((el) => el.type === Seitenkopf);
    expect(kopf).toBeDefined();
    expect((kopf!.props as { titel: string }).titel).toBe("Presets verwalten");
    expect(baum.some((el) => el.type === "h1")).toBe(false);
  });

  it("hat kein `zurueck`: die Verwaltung ist der Modul-Admin-Einstieg, keine [id]-Detailseite", async () => {
    const baum = flatten(
      (await QrAdminPage({ searchParams: Promise.resolve({}) })) as ReactElement,
    );
    const kopf = baum.find((el) => el.type === Seitenkopf)!;
    expect((kopf.props as { zurueck?: unknown }).zurueck).toBeUndefined();
  });

  it("waehlt das zu bearbeitende Preset aus der geladenen Liste, nicht per eigener Abfrage", async () => {
    listPresetsMock.mockResolvedValue(PRESETS);
    const baum = flatten(
      (await QrAdminPage({
        searchParams: Promise.resolve({ bearbeiten: "p2" }),
      })) as ReactElement,
    );
    const formular = baum.find((el) => el.type === PresetForm)!;
    expect((formular.props as { preset?: Preset }).preset?.id).toBe("p2");
  });

  it("faellt bei einer unbekannten id auf das Anlege-Formular zurueck, nicht auf einen Fehler", async () => {
    listPresetsMock.mockResolvedValue(PRESETS);
    const baum = flatten(
      (await QrAdminPage({
        searchParams: Promise.resolve({ bearbeiten: "gibtsnicht" }),
      })) as ReactElement,
    );
    const formular = baum.find((el) => el.type === PresetForm)!;
    expect((formular.props as { preset?: Preset }).preset).toBeUndefined();
  });
});
