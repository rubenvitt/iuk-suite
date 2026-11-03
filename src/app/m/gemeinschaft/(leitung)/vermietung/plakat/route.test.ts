import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";

const leitung = vi.hoisted(() => ({ wer: null as null | { id: string } }));
vi.mock("../../../_lib/vermietungZugang", () => ({ leitungImHandler: async () => leitung.wer }));

import { GET } from "./route";

const alt = process.env.SUITE_HOST_GEMEINSCHAFT;
afterEach(() => {
  leitung.wer = null;
  if (alt === undefined) delete process.env.SUITE_HOST_GEMEINSCHAFT;
  else process.env.SUITE_HOST_GEMEINSCHAFT = alt;
});

const anfrage = (host: string, extra: Record<string, string> = {}) => new Request(`http://${host}/m/gemeinschaft/vermietung/plakat`, { headers: { host, ...extra } });

describe("GET /vermietung/plakat", () => {
  it("ist auf fremdem Host und ohne Leitung ein 404", async () => {
    process.env.SUITE_HOST_GEMEINSCHAFT = "gemeinschaft.iuk-ue.de";
    leitung.wer = { id: "l1" };
    expect((await GET(anfrage("portal.iuk-ue.de"))).status).toBe(404);
    leitung.wer = null;
    expect((await GET(anfrage("gemeinschaft.iuk-ue.de"))).status).toBe(404);
  });

  it("liefert der Leitung das Plakat als PDF zum Ansehen", async () => {
    process.env.SUITE_HOST_GEMEINSCHAFT = "gemeinschaft.iuk-ue.de";
    leitung.wer = { id: "l1" };
    const r = await GET(anfrage("gemeinschaft.iuk-ue.de", { "x-forwarded-proto": "https" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toMatch(/^inline; filename="[^"]+\.pdf"$/);
    expect(r.headers.get("cache-control")).toContain("no-store");
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getSubject()).toBe("gemeinschaft.iuk-ue.de/bar");
  });
});
