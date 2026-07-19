import { describe, it, expect, vi, beforeEach } from "vitest";

// Negativ-Test der Schreibgrenze: der Beweis ist „wurde der Schreiber
// aufgerufen?" — auth() ist gemockt, damit es ohne echten Request laeuft, und
// der DB-nahe Query-Layer ebenso, damit eine Ablehnung unabhaengig von SQLite
// nachweisbar ist. Ohne den Mock koennte ein durchgerutschter Aufruf an einem
// DB-Fehler scheitern und faelschlich wie eine Ablehnung aussehen.
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/m/qr/_lib/presets", () => ({
  createPreset: vi.fn().mockResolvedValue({ id: "p1" }),
  updatePreset: vi.fn().mockResolvedValue({ id: "p1" }),
  deletePreset: vi.fn().mockResolvedValue(true),
  reorderPresets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/core/auth";
import { createPreset, deletePreset } from "@/app/m/qr/_lib/presets";
import { createPresetAction, deletePresetAction } from "@/app/m/qr/actions";

const authMock = vi.mocked(auth);

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  authMock.mockReset();
  vi.mocked(createPreset).mockClear();
  vi.mocked(deletePreset).mockClear();
});

describe("qr admin actions: Autorisierungsgrenze", () => {
  it("anonym darf nicht anlegen", async () => {
    authMock.mockResolvedValue(null as never);
    await expect(
      createPresetAction(fd({ label: "L", kind: "url", value: "https://x" })),
    ).rejects.toThrow("Forbidden");
    expect(createPreset).not.toHaveBeenCalled();
  });

  it("eingeloggt ohne Gruppe darf nicht löschen", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(deletePresetAction(fd({ id: "p1" }))).rejects.toThrow("Forbidden");
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it("drk-qr-user allein genügt nicht", async () => {
    authMock.mockResolvedValue({ user: { groups: ["drk-qr-user"] } } as never);
    await expect(deletePresetAction(fd({ id: "p1" }))).rejects.toThrow("Forbidden");
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it("drk-qr-admin darf anlegen", async () => {
    authMock.mockResolvedValue({ user: { groups: ["drk-qr-admin"], id: "u1" } } as never);
    await createPresetAction(fd({ label: "L", kind: "url", value: "https://x" }));
    expect(createPreset).toHaveBeenCalledTimes(1);
  });

  it("Suite-Admin darf auch ohne QR-Gruppe", async () => {
    authMock.mockResolvedValue({ user: { groups: ["dashboard-admins"], id: "u1" } } as never);
    await createPresetAction(fd({ label: "L", kind: "url", value: "https://x" }));
    expect(createPreset).toHaveBeenCalledTimes(1);
  });

  it("ungültige Eingabe wird abgelehnt, ohne zu schreiben", async () => {
    authMock.mockResolvedValue({ user: { groups: ["drk-qr-admin"], id: "u1" } } as never);
    await expect(createPresetAction(fd({ label: "", kind: "url", value: "x" }))).rejects.toThrow();
    expect(createPreset).not.toHaveBeenCalled();
  });
});
