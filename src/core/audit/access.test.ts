import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("./server", () => ({ auditDenied: vi.fn(), auditActor: () => ({ kind: "anonymous" }) }));
import { auth } from "@/core/auth";
import { canReadAudit, requireAuditReader } from "./access";
beforeEach(() => { vi.stubEnv("ADMIN_GROUP", "dashboard-admins"); vi.stubEnv("SUITE_ADMIN_GROUP_PORTAL", "portal-only"); });
it.each([null, [], ["member"], ["iuk-qr-admin"], ["portal-only"]])("rejects non-suite identity %j even with forged isAdmin", async (groups) => {
  vi.mocked(auth).mockResolvedValue((groups ? { user: { id: "user", groups, isAdmin: true } } : null) as never);
  expect(await canReadAudit()).toBe(false);
  await expect(requireAuditReader()).rejects.toThrow("Forbidden");
});
it("allows only the confirmed suite group", async () => {
  vi.mocked(auth).mockResolvedValue({ user: { id: "suite", groups: ["dashboard-admins"], isAdmin: false } } as never);
  expect(await canReadAudit()).toBe(true);
  expect(await requireAuditReader()).toMatchObject({ id: "suite" });
});
