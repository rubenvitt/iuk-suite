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

  it("benutzt den Seitenkopf der Suite: Beschreibung und CSV-Weg als Aktion", async () => {
    /*
     * Die Seite baute ihren Kopf bis dahin selbst — ein eigenes `<h1>` in einer
     * eigenen Flex-Zeile mit dem CSV-Knopf daneben. Dieser Fall haelt fest, dass
     * jetzt `core/shell/Seitenkopf` traegt (die beiden `data-testid` gehoeren ihm)
     * und dass die Seite sagt, wofuer sie da ist.
     */
    await mount(teilnehmerInhalt([zeile("Bruno")]));
    expect(query('[data-testid="seitenkopf-beschreibung"]').textContent).toContain("Zugang");
    const aktionen = query('[data-testid="seitenkopf-aktionen"]');
    expect(aktionen.textContent).toContain("Liste als CSV");
    expect(aktionen.querySelector("a")?.getAttribute("href")).toBe("/api/admin/participants/export");
  });

  it("verlinkt den Namen ohne Suite-Rot und ohne vollen Seitenwechsel", async () => {
    /*
     * Der Name war ein nacktes `<a href>`: antds `colorLink` ist in dieser Suite
     * `#c8000f` (Falle 3), also stand eine Datenflaeche in der Farbe der
     * Primaeraktion — und ein `<a>` warf die Anwendung weg statt clientseitig zu
     * navigieren. Beides ist an dieser Stelle nicht direkt messbar (jsdom rechnet
     * keine Farben, `next/link` rendert ebenfalls ein `<a>`), messbar ist die
     * Gegenmassnahme: die Zelle setzt ihre Farbe selbst auf `inherit`.
     */
    await mount(teilnehmerInhalt([zeile("Bruno")]));
    const links = [...document.querySelectorAll("a")].filter(
      (a) => a.getAttribute("href") === "/admin/teilnehmer/Bruno",
    );
    expect(links.length).toBeGreaterThan(0);
    const namensLink = links.find((a) => a.textContent === "Bruno");
    expect(namensLink).toBeDefined();
    expect(namensLink?.style.color).toBe("inherit");
    // WCAG 2.5.5: der Zeilenlink ist rohes Markup und erbt die 44px nicht.
    expect(namensLink?.style.minHeight).toBe("44px");
  });

  it("Fix-Runde 1: zeigt den Login-Code und einen Magic-Link-Kopieren-Knopf je Zeile", async () => {
    await mount(teilnehmerInhalt([zeile("Bruno")]));
    expect(document.body.textContent).toContain("ABCDEFGH");
    expect(document.body.textContent).toContain("Link kopieren");
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
