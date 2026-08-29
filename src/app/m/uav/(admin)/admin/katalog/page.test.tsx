// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { testDb, type TestDb } from "../../../_lib/testDb";
import { taskAnlegen } from "../../../_lib/queries";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../../../_db/client", () => ({ getDb: () => mockDb }));

import AdminKatalogPage, { katalogInhalt } from "./page";

beforeEach(() => {
  mockDb = testDb();
  sitzung = null;
});
afterEach(async () => {
  await unmount();
});

function aufgabe(nummer: string) {
  return {
    teil: 1 as const,
    nummer,
    titel: `Aufgabe ${nummer}`,
    lernziel: "",
    schritte: [],
    durchfuehrungshinweise: [],
    sicherheitshinweise: [],
    zielanzahlDefault: 1,
    aktiv: true,
    bildUrl: null,
  };
}

describe("katalogInhalt — Kopf und Tabelle", () => {
  it("zeigt den Titel und findet den Aufgabentitel in der Tabelle", async () => {
    await mount(katalogInhalt([{ ...aufgabe("1.1"), id: "a1", sortOrder: 0 }]));
    expect(query("h1").textContent).toBe("Aufgabenkatalog");
    expect(document.body.textContent).toContain("Aufgabe 1.1");
  });
});

describe("AdminKatalogPage — Gate", () => {
  it("mit uav-training-admin: rendert den Katalog mit der angelegten Aufgabe", async () => {
    sitzung = { user: { id: "sub-1", groups: ["uav-training-admin"] } };
    taskAnlegen(mockDb, aufgabe("2.1"));
    await mount(await AdminKatalogPage());
    expect(query("h1").textContent).toBe("Aufgabenkatalog");
    expect(document.body.textContent).toContain("Aufgabe 2.1");
  });

  it("ohne Gruppe: notFound()", async () => {
    sitzung = { user: { id: "sub-2", groups: [] } };
    await expect(AdminKatalogPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
