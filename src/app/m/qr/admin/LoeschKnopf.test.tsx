// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

/**
 * IDA-390: „Löschen" wirkte sofort, ohne Rückfrage — auch an WLAN-Einträgen mit Passwort. Geprüft
 * wird: erst die Rückfrage mit dem Namen, gelöscht erst nach der Bestätigung, danach eine Meldung.
 */
const { deletePresetActionMock, replace, success } = vi.hoisted(() => ({
  deletePresetActionMock: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/app/m/qr/actions", () => ({ deletePresetAction: deletePresetActionMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("antd", async (original) => {
  const antd = await original<typeof import("antd")>();
  const App = Object.assign(antd.App, { useApp: () => ({ message: { success } }) });
  return { ...antd, App };
});

import { LoeschKnopf } from "@/app/m/qr/admin/LoeschKnopf";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

function knopf(text: string): HTMLButtonElement {
  const b = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => (x.textContent ?? "").trim() === text,
  );
  if (!b) throw new Error(`Kein Knopf „${text}“`);
  return b;
}

beforeEach(() => {
  deletePresetActionMock.mockReset().mockResolvedValue(undefined);
  replace.mockReset();
  success.mockReset();
});

afterEach(async () => {
  await unmount();
});

describe("LoeschKnopf", () => {
  it("ist ein Textknopf, kein roter Primärknopf", async () => {
    await mount(<LoeschKnopf id="p1" label="Gast-WLAN" kind="wifi" />);
    const b = query<HTMLButtonElement>('[data-testid="preset-delete"]');
    expect(b.className).toContain("ant-btn-text");
    expect(b.className).not.toContain("ant-btn-primary");
  });

  it("fragt mit dem Namen nach und nennt bei WLAN das Passwort", async () => {
    await mount(<LoeschKnopf id="p1" label="Gast-WLAN" kind="wifi" />);
    await clickElement(query('[data-testid="preset-delete"]'));

    const dialog = document.body.querySelector<HTMLElement>(".ant-modal")!;
    expect(dialog.textContent).toContain("„Gast-WLAN“ löschen?");
    expect(dialog.textContent).toContain("samt WLAN-Passwort");
    expect(deletePresetActionMock).not.toHaveBeenCalled();
  });

  it("löscht erst nach der Bestätigung und meldet es", async () => {
    await mount(<LoeschKnopf id="p7" label="Lagekarte" kind="url" />);
    await clickElement(query('[data-testid="preset-delete"]'));
    await clickElement(knopf("Löschen"));
    await act(async () => {});

    expect(deletePresetActionMock).toHaveBeenCalledTimes(1);
    expect((deletePresetActionMock.mock.calls[0][0] as FormData).get("id")).toBe("p7");
    expect(success).toHaveBeenCalledWith("„Lagekarte“ gelöscht.");
    expect(replace).toHaveBeenCalledWith("/admin");
  });

  it("Abbrechen löscht nichts", async () => {
    await mount(<LoeschKnopf id="p7" label="Lagekarte" kind="url" />);
    await clickElement(query('[data-testid="preset-delete"]'));
    await clickElement(knopf("Abbrechen"));
    await act(async () => {});

    expect(deletePresetActionMock).not.toHaveBeenCalled();
  });
});
