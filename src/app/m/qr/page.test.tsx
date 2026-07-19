import { describe, expect, it, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";

/**
 * Das Modul ist `requiresAuth: false` — die Startseite ist also fuer jeden im
 * Netz erreichbar, waehrend `listPresets()` nicht nutzerbezogen ist und schlicht
 * alle Zeilen liefert. Faellt die Schranke, sehen anonyme Besucher saemtliche
 * Schnellzugriffe, darunter WLAN-Presets, deren Passwort beim Antippen im
 * erzeugten Code steckt. Der Plan legt fest: Presets nur eingeloggt.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/m/qr/_lib/presets", () => ({ listPresets: vi.fn() }));

import { auth } from "@/core/auth";
import { listPresets } from "@/app/m/qr/_lib/presets";
import QrHomePage from "@/app/m/qr/page";
import { PresetGrid } from "@/app/m/qr/PresetGrid";
import type { Preset } from "@/app/m/qr/_lib/types";

const authMock = vi.mocked(auth);
const listPresetsMock = vi.mocked(listPresets);

const preset: Preset = {
  id: "wlan-einsatz",
  label: "WLAN Einsatz",
  kind: "wifi",
  value: { ssid: "DRK", password: "geheim123", encryption: "WPA" },
};

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

// PresetGrid wird als Element nur erzeugt, nicht ausgefuehrt — deshalb ueber den
// Komponententyp gesucht und nicht ueber ein data-testid aus seinem Inneren.
async function render() {
  const tree = flatten((await QrHomePage()) as ReactElement);
  return {
    hasPresetGrid: tree.some((el) => el.type === PresetGrid),
    testIds: tree
      .map((el) => (el.props as { "data-testid"?: string })["data-testid"])
      .filter((id): id is string => typeof id === "string"),
  };
}

describe("QR-Startseite: Sichtbarkeit der Schnellzugriffe", () => {
  beforeEach(() => {
    authMock.mockReset();
    listPresetsMock.mockReset();
    listPresetsMock.mockResolvedValue([preset]);
  });

  it("anonym: keine Schnellzugriffe, stattdessen der Anmelde-Hinweis", async () => {
    authMock.mockResolvedValue(null as never);
    const { hasPresetGrid, testIds } = await render();
    expect(hasPresetGrid).toBe(false);
    expect(testIds).toContain("qr-login-hint");
  });

  it("anonym wird gar nicht erst in der Datenbank nachgesehen", async () => {
    authMock.mockResolvedValue(null as never);
    await render();
    expect(listPresetsMock).not.toHaveBeenCalled();
  });

  it("angemeldet: Schnellzugriffe statt Hinweis", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    const { hasPresetGrid, testIds } = await render();
    expect(hasPresetGrid).toBe(true);
    expect(testIds).not.toContain("qr-login-hint");
    expect(listPresetsMock).toHaveBeenCalledTimes(1);
  });
});
