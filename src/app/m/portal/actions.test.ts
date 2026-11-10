import { describe, it, expect, vi, beforeEach } from "vitest";

// Negative-path security test for the admin mutation boundary: a logged-in
// non-admin must NOT be able to create/delete services. auth() is mocked so
// this runs without a real request/session; the DB-touching collaborator
// (services) and next/cache are mocked too so a rejection can be proven
// purely by "was the writer called", independent of the sqlite layer.
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/m/portal/_lib/services", async (original) => {
  // Die Formularlesung (`dienstFelderAusFormular`) bleibt echt — sie ist die Grenze, die hier zählt.
  const echt = await original<typeof import("@/app/m/portal/_lib/services")>();
  return {
    DienstEingabeFehler: echt.DienstEingabeFehler,
    dienstFelderAusFormular: echt.dienstFelderAusFormular,
    legeDienstAn: vi.fn().mockResolvedValue({ id: "svc-1" }),
    deleteService: vi.fn().mockResolvedValue(undefined),
    updateService: vi.fn().mockResolvedValue({ id: "svc-1" }),
  };
});
vi.mock("@/app/m/portal/_lib/einstellungen", () => ({
  setzeAnsprechpartner: vi.fn(),
  setzeZeitzone: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/core/auth";
import { legeDienstAn, deleteService, updateService } from "@/app/m/portal/_lib/services";
import { setzeZeitzone } from "@/app/m/portal/_lib/einstellungen";
import { revalidatePath } from "next/cache";
import {
  bearbeiteServiceAction,
  createServiceAction,
  deleteServiceAction,
  setzeSichtbarkeitAction,
  setzeZeitzoneAction,
} from "@/app/m/portal/actions";

const authMock = vi.mocked(auth);
const createServiceMock = vi.mocked(legeDienstAn);
const deleteServiceMock = vi.mocked(deleteService);

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

describe("portal admin actions: authorization boundary", () => {
  beforeEach(() => {
    authMock.mockReset();
    createServiceMock.mockClear();
    deleteServiceMock.mockClear();
  });

  it("non-admin session cannot create a service", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(
      createServiceAction(formData({ name: "X", url: "https://x.example" }))
    ).rejects.toThrow("Forbidden");
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("non-admin session cannot delete a service", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(deleteServiceAction(formData({ id: "svc-1" }))).rejects.toThrow("Forbidden");
    expect(deleteServiceMock).not.toHaveBeenCalled();
  });

  it("admin session (admin) is allowed to create a service", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    await createServiceAction(formData({ name: "X", url: "https://x.example", isPublic: "on" }));
    expect(createServiceMock).toHaveBeenCalledTimes(1);
    expect(createServiceMock.mock.calls[0][0]).not.toHaveProperty("slug");
  });

  it("speichert einen nicht oeffentlichen Dienst mit den gewaehlten Gruppen (IDA-227)", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    const fd = formData({ name: "X", url: "https://x.example" });
    fd.append("requiredGroups", "iuk");
    fd.append("requiredGroups", "sanitaet");
    await createServiceAction(fd);
    expect(createServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: false, requiredGroups: ["iuk", "sanitaet"] }),
    );
  });

  it("legt keinen nicht oeffentlichen Dienst ohne Gruppe an — den saehe niemand", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    await expect(
      createServiceAction(formData({ name: "X", url: "https://x.example" })),
    ).resolves.toEqual({ ok: false, fehler: expect.stringMatching(/mindestens eine Gruppe/) });
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("non-admin session cannot change who sees a service", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(
      setzeSichtbarkeitAction(formData({ id: "svc-1", isPublic: "on" })),
    ).rejects.toThrow("Forbidden");
    expect(vi.mocked(updateService)).not.toHaveBeenCalled();
  });

  it("admin session changes who sees a service", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    const fd = formData({ id: "svc-1" });
    fd.append("requiredGroups", "iuk");
    await setzeSichtbarkeitAction(fd);
    expect(vi.mocked(updateService)).toHaveBeenCalledWith("svc-1", {
      isPublic: false,
      requiredGroups: ["iuk"],
    });
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/m/portal");
  });

  it("lehnt eine Adresse ohne http(s) ab, bevor etwas geschrieben ist (IDA-391)", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    const ergebnis = await createServiceAction(formData({ name: "X", url: "javascript:alert(1)", isPublic: "on" }));
    expect(ergebnis).toEqual({ ok: false, fehler: expect.stringMatching(/http/) });
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("non-admin session cannot edit a service", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(
      bearbeiteServiceAction(formData({ id: "svc-1", name: "X", url: "https://x.example", isPublic: "on" })),
    ).rejects.toThrow("Forbidden");
    expect(vi.mocked(updateService)).not.toHaveBeenCalledWith("svc-1", expect.objectContaining({ name: "X" }));
  });

  it("admin session edits everything the tile shows, the Kennung stays (IDA-391)", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    vi.mocked(updateService).mockClear();
    const fd = formData({
      id: "svc-1",
      name: " Wiki ",
      url: "https://wiki.example",
      description: "Handbuch",
      category: "Doku",
      iconUrl: "",
      isPublic: "on",
    });
    await expect(bearbeiteServiceAction(fd)).resolves.toEqual({ ok: true });
    expect(vi.mocked(updateService)).toHaveBeenCalledWith("svc-1", {
      name: "Wiki",
      url: "https://wiki.example",
      description: "Handbuch",
      category: "Doku",
      iconUrl: null,
      openInNewTab: false,
      isPublic: true,
      requiredGroups: [],
    });
  });

  it("meldet einen inzwischen geloeschten Dienst, statt still nichts zu tun", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    vi.mocked(updateService).mockResolvedValueOnce(undefined);
    const ergebnis = await bearbeiteServiceAction(formData({ id: "weg", name: "X", url: "https://x.example", isPublic: "on" }));
    expect(ergebnis).toEqual({ ok: false, fehler: expect.any(String) });
  });

  it("non-admin session cannot change the suite time zone", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(setzeZeitzoneAction(formData({ zeitzone: "UTC" }))).rejects.toThrow("Forbidden");
    expect(vi.mocked(setzeZeitzone)).not.toHaveBeenCalled();
  });

  it("admin session sets the time zone and revalidates the whole suite", async () => {
    authMock.mockResolvedValue({ user: { groups: ["admin"] } } as never);
    await setzeZeitzoneAction(formData({ zeitzone: "Europe/Lisbon" }));
    expect(vi.mocked(setzeZeitzone)).toHaveBeenCalledWith("Europe/Lisbon");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/", "layout");
  });
});
