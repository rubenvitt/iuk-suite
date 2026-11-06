import { describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({ host: "mcp.localtest.me:3000" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: t.host, "x-forwarded-proto": "https" }) }));
vi.mock("../_lib/module", () => ({ MCP_MODULE: [] }));
vi.mock("../_lib/token", async (orig) => ({
  ...(await orig<typeof import("../_lib/token")>()),
  pocketIdPruefer: () => ({}),
  pruefeToken: async (kopf: string | null) =>
    kopf === "Bearer gut"
      ? { ok: true, person: { sub: "s", name: null, email: null, groups: [] } }
      : { ok: false, grund: kopf ? "ungueltig" : "fehlt" },
}));

import { GET, POST } from "./route";

const anfrage = (koerper: unknown, token?: string) => new Request("https://mcp.localtest.me/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(koerper),
});
const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } };

describe("Endpunkt /mcp", () => {
  it("ohne Token 401 mit dem Weg zur Anmeldung, mit kaputtem Token invalid_token", async () => {
    const ohne = await POST(anfrage(INIT));
    expect(ohne.status).toBe(401);
    expect(ohne.headers.get("www-authenticate")).toContain("resource_metadata=");
    expect((await POST(anfrage(INIT, "schlecht"))).headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect((await GET(new Request("https://mcp.localtest.me/mcp"))).status).toBe(401);
  });

  it("mit Token antwortet der Server zustandslos mit JSON", async () => {
    const r = await POST(anfrage(INIT, "gut"));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { result: { serverInfo: { name: string }; instructions: string } };
    expect(body.result.serverInfo.name).toBe("iuk-suite");
    const liste = await POST(anfrage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "gut"));
    expect(((await liste.json()) as { result: { tools: unknown[] } }).result.tools).toEqual([]);
  });

  it("nimmt einen Client mit neuerer Protokollversion an, statt 400 zu antworten", async () => {
    const mit = (version: string, koerper: unknown) => {
      const r = anfrage(koerper, "gut");
      r.headers.set("mcp-protocol-version", version);
      return r;
    };
    const init = await POST(mit("2099-01-01", { ...INIT, params: { ...INIT.params, protocolVersion: "2099-01-01" } }));
    expect(init.status).toBe(200);
    expect(((await init.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe("iuk-suite");
    const liste = await POST(mit("2099-01-01", { jsonrpc: "2.0", id: 2, method: "tools/list" }));
    expect(liste.status).toBe(200);
    expect(((await liste.json()) as { result: { tools: unknown[] } }).result.tools).toEqual([]);
    for (const v of ["2000-01-01", "kaputt"]) {
      expect((await POST(mit(v, { jsonrpc: "2.0", id: 3, method: "tools/list" }))).status, v).toBe(400);
    }
  });

  it("auf einem anderen Host gibt es den Endpunkt nicht", async () => {
    t.host = "wartung.localtest.me";
    expect((await POST(anfrage(INIT, "gut"))).status).toBe(404);
    t.host = "mcp.localtest.me:3000";
  });
});
