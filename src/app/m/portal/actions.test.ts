import { describe, it, expect, vi, beforeEach } from "vitest";

// Negative-path security test for the admin mutation boundary: a logged-in
// non-admin must NOT be able to create/delete services. auth() is mocked so
// this runs without a real request/session; the DB-touching collaborator
// (services) and next/cache are mocked too so a rejection can be proven
// purely by "was the writer called", independent of the sqlite layer.
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/m/portal/_lib/services", () => ({
  createService: vi.fn().mockResolvedValue({ id: "svc-1" }),
  deleteService: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/core/auth";
import { createService, deleteService } from "@/app/m/portal/_lib/services";
import { createServiceAction, deleteServiceAction } from "@/app/m/portal/actions";

const authMock = vi.mocked(auth);
const createServiceMock = vi.mocked(createService);
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
      createServiceAction(formData({ slug: "x", name: "X", url: "https://x.example" }))
    ).rejects.toThrow("Forbidden");
    expect(createServiceMock).not.toHaveBeenCalled();
  });

  it("non-admin session cannot delete a service", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(deleteServiceAction(formData({ id: "svc-1" }))).rejects.toThrow("Forbidden");
    expect(deleteServiceMock).not.toHaveBeenCalled();
  });

  it("admin session (dashboard-admins) is allowed to create a service", async () => {
    authMock.mockResolvedValue({ user: { groups: ["dashboard-admins"] } } as never);
    await createServiceAction(formData({ slug: "x", name: "X", url: "https://x.example" }));
    expect(createServiceMock).toHaveBeenCalledTimes(1);
  });
});
