// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { testDb, type TestDb } from "../../_lib/testDb";
import { teilnehmerAnlegen } from "../../_lib/queries";
import type { ParticipantProgressDTO } from "../../_lib/typen";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../../_db/client", () => ({ getDb: () => mockDb }));

import AdminTeilnehmerPage, { teilnehmerInhalt } from "./page";

beforeEach(() => {
  mockDb = testDb();
  sitzung = null;
});
afterEach(async () => {
  await unmount();
});

function zeile(name: string): ParticipantProgressDTO {
  return { participant: { id: name, name, loginCode: "ABCDEFGH", aktiv: true, beginn: null, lastSeen: null }, erledigt: 0, gesamt: 5, quote: 0 };
}

describe("teilnehmerInhalt — Kopf, Formular, Tabelle", () => {
  it("zeigt den Titel und findet den Teilnehmernamen in der Tabelle", async () => {
    await mount(teilnehmerInhalt([zeile("Bruno")]));
    expect(query("h1").textContent).toBe("Teilnehmer");
    expect(document.body.textContent).toContain("Bruno");
  });
});

describe("AdminTeilnehmerPage — Gate", () => {
  it("mit uav-training-admin: rendert die Übersicht mit dem angelegten Teilnehmer", async () => {
    sitzung = { user: { id: "sub-1", groups: ["uav-training-admin"] } };
    teilnehmerAnlegen(mockDb, "Carla");
    await mount(await AdminTeilnehmerPage());
    expect(query("h1").textContent).toBe("Teilnehmer");
    expect(document.body.textContent).toContain("Carla");
  });

  it("ohne Gruppe: notFound()", async () => {
    sitzung = { user: { id: "sub-2", groups: [] } };
    await expect(AdminTeilnehmerPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("anonym: notFound()", async () => {
    sitzung = null;
    await expect(AdminTeilnehmerPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
