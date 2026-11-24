import { beforeEach, describe, expect, it, vi } from "vitest";
import { planeAbgleich, wendeAbgleichAn } from "../../_lib/abgleich";
import { STANDARD_FILTER } from "../../_lib/filter";
import { legeZugangAn, widerrufeZugang } from "../../_lib/schluessel";
import { testDb as neueDb, type TestDb } from "../../_lib/testDb";

let db: TestDb;
vi.mock("../../_db/client", () => ({ getDb: () => db }));
const abgelehnt = vi.fn();
vi.mock("@/core/audit/server", () => ({ auditDenied: (...a: unknown[]) => abgelehnt(...a) }));

import { abholungDrosselZuruecksetzen } from "../../_lib/ablehnung";
import { GET } from "./route";

function anfrage(schluessel?: string, host = "helfer.localtest.me"): Request {
  return new Request(`http://${host}/api/stammdaten`, { headers: { host, ...(schluessel ? { authorization: `Bearer ${schluessel}` } : {}) } });
}

describe("GET api/stammdaten (LLH-1194)", () => {
  beforeEach(() => {
    db = neueDb();
    abgelehnt.mockClear();
    abholungDrosselZuruecksetzen();
    const personen = [{ quellId: "q1", vorname: "Jana", nachname: "Albers", status: "aktiv", gesperrt: false, austritt: null, gruppen: [], qualifikationen: [{ liste: "med", name: "Sanitätshelfer", kurz: "SanH" }], fahrerlaubnis: [] }];
    wendeAbgleichAn(db, planeAbgleich({ personen, unlesbar: 0 }, [], STANDARD_FILTER, "2026-11-25", "hiorg"), { neueFreigeben: true, von: { name: "T", sub: "t" } });
  });

  it("mit gültigem Schlüssel: 200, Vertrag „Stammdaten-Abruf“, nicht cachebar", async () => {
    const { schluessel } = legeZugangAn(db, "Lifeline Hub", "Ruben");
    const antwort = await GET(anfrage(schluessel));
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("cache-control")).toBe("no-store");
    const koerper = await antwort.json();
    expect(Object.keys(koerper)).toEqual(["personal"]);
    expect(koerper.personal).toEqual([{ kennung: expect.any(String), name: "Albers, Jana", qualifikationen: ["Sanitätshelfer"] }]);
  });

  it("ohne oder mit widerrufenem Schlüssel: 401 ohne Namen", async () => {
    const ohne = await GET(anfrage());
    expect(ohne.status).toBe(401);
    expect(await ohne.text()).not.toContain("Albers");
    const { id, schluessel } = legeZugangAn(db, "Lifeline Hub", "Ruben");
    widerrufeZugang(db, id);
    expect((await GET(anfrage(schluessel))).status).toBe(401);
  });

  it("auf fremdem Host: 404, auch mit gültigem Schlüssel", async () => {
    const { schluessel } = legeZugangAn(db, "Lifeline Hub", "Ruben");
    expect((await GET(anfrage(schluessel, "radio.localtest.me"))).status).toBe(404);
  });

  it("Ablehnungen landen gedrosselt im Audit", async () => {
    for (let i = 0; i < 8; i++) await GET(anfrage("x".repeat(43)));
    expect(abgelehnt).toHaveBeenCalledTimes(6);
    expect(abgelehnt.mock.calls.at(-1)).toEqual(["helfer", { kind: "anonymous" }, "access_throttled"]);
  });
});
