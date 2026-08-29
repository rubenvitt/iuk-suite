// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { testDb, type TestDb } from "../../../../_lib/testDb";
import { teilnehmerAnlegen } from "../../../../_lib/queries";
import type { ParticipantDetailDTO } from "../../../../_lib/typen";

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

import AdminTeilnehmerDetailPage, { teilnehmerDetailInhalt } from "./page";

beforeEach(() => {
  mockDb = testDb();
  sitzung = { user: { id: "sub-1", groups: ["uav-training-admin"] } };
});
afterEach(async () => {
  await unmount();
});

function fixture(): ParticipantDetailDTO {
  return {
    participant: { id: "p1", name: "Jonas", loginCode: "ABCDEFGH", aktiv: true, beginn: "2026-01-01", lastSeen: null },
    erledigt: 2,
    gesamt: 5,
    quote: 0.4,
    teile: [{ teil: 1, erledigt: 2, gesamt: 5, quote: 0.4 }],
    aufgaben: [
      { taskId: "t1", teil: 1, nummer: "1.1", titel: "Vorflugkontrolle", anzahl: 2, ziel: 3, erledigt: false, nichtAnwendbar: false, letzteDurchfuehrung: null },
    ],
    letzteAktivitaet: null,
  };
}

describe("teilnehmerDetailInhalt — Kopf und Stammdaten (Vorbild personenInhalt/katalogInhalt)", () => {
  it("zeigt Name und Login-Code direkt aus der DTO, ohne Datenbank", async () => {
    await mount(teilnehmerDetailInhalt(fixture()));
    expect(query("h1").textContent).toBe("Jonas");
    expect(document.body.textContent).toContain("ABCDEFGH");
  });

  it("fuehrt ueber den Rueckweg des Seitenkopfs zurueck zur Uebersicht", async () => {
    /*
     * Hier stand ein nacktes `<a href="/admin">← Teilnehmer</a>`: ohne
     * `<nav>`-Landmark (per Screenreader springt man zwischen Landmarks), in antds
     * `colorLink` — also Suite-Rot (Falle 3) — und unter der 44px-Tapflaeche. Der
     * Rueckweg gehoert `core/shell/Seitenkopf`, samt seinem `data-testid`.
     */
    await mount(teilnehmerDetailInhalt(fixture()));
    const zurueck = query('[data-testid="seitenkopf-zurueck"]');
    expect(zurueck.getAttribute("href")).toBe("/admin");
    expect(zurueck.textContent).toContain("Teilnehmer");
    expect(zurueck.closest("nav")?.getAttribute("aria-label")).toBe("Zurück");
  });

  it("bietet den Detail-CSV-Weg als Aktion des Seitenkopfs, nicht als roten Textlink", async () => {
    await mount(teilnehmerDetailInhalt(fixture()));
    const aktionen = query('[data-testid="seitenkopf-aktionen"]');
    expect(aktionen.textContent).toContain("Auswertung als CSV");
    expect(aktionen.querySelector("a")?.getAttribute("href")).toBe(
      "/api/admin/participants/p1/export",
    );
  });

  it("sagt im Seitenkopf, wofuer die Seite da ist", async () => {
    await mount(teilnehmerDetailInhalt(fixture()));
    expect(query('[data-testid="seitenkopf-beschreibung"]').textContent).toContain("Zugang");
  });
});

describe("AdminTeilnehmerDetailPage", () => {
  it("rendert Name, Code und den sichtbaren Magic-Link eines vorhandenen Teilnehmers", async () => {
    const angelegt = teilnehmerAnlegen(mockDb, "Hanna");
    await mount(
      await AdminTeilnehmerDetailPage({ params: Promise.resolve({ id: angelegt.id }) }),
    );
    expect(query("h1").textContent).toBe("Hanna");
    expect(document.body.textContent).toContain(angelegt.loginCode);
    // Fix-Runde 1: der Link steht jetzt als sichtbarer Text neben dem Kopieren-Knopf.
    expect(document.body.textContent).toContain(`code=${angelegt.loginCode}`);
    expect(document.body.textContent).toContain("Kopieren");
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
