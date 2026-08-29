// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { testDb, type TestDb } from "../../../../_lib/testDb";
import { teilnehmerAnlegen } from "../../../../_lib/queries";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: () => {} }),
}));
let mockDb: TestDb;
vi.mock("../../../../_db/client", () => ({ getDb: () => mockDb }));

import AdminTeilnehmerDetailPage from "./page";

beforeEach(() => {
  mockDb = testDb();
  sitzung = { user: { id: "sub-1", groups: ["uav-training-admin"] } };
});
afterEach(async () => {
  await unmount();
});

describe("AdminTeilnehmerDetailPage", () => {
  it("rendert Name, Code und Magic-Link-Knopf eines vorhandenen Teilnehmers", async () => {
    const angelegt = teilnehmerAnlegen(mockDb, "Hanna");
    await mount(
      await AdminTeilnehmerDetailPage({ params: Promise.resolve({ id: angelegt.id }) }),
    );
    expect(query("h1").textContent).toBe("Hanna");
    expect(document.body.textContent).toContain(angelegt.loginCode);
    expect(document.body.textContent).toContain("Link kopieren");
  });

  it("eine unbekannte id → notFound()", async () => {
    await expect(
      AdminTeilnehmerDetailPage({ params: Promise.resolve({ id: "unbekannt" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ohne Admin-Gruppe → notFound()", async () => {
    sitzung = { user: { id: "sub-2", groups: [] } };
    const angelegt = teilnehmerAnlegen(mockDb, "Ida");
    await expect(
      AdminTeilnehmerDetailPage({ params: Promise.resolve({ id: angelegt.id }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
