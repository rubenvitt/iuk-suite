import { describe, it, expect } from "vitest";
import { GET } from "./route";

const aufruf = (datei: string) =>
  GET(new Request(`http://localhost/favicon/${datei}`), { params: Promise.resolve({ datei }) });

describe("GET /favicon/<name>.svg", () => {
  it("liefert das Zeichen als SVG", async () => {
    const antwort = await aufruf("qr.svg");
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("image/svg+xml");
    expect(await antwort.text()).toContain("<title>QR-Codes</title>");
  });

  it("liefert das App-Icon als PNG", async () => {
    const antwort = await aufruf("qr-apple-180.png");
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await antwort.arrayBuffer());
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  });

  it("antwortet auf Unbekanntes mit 404", async () => {
    expect((await aufruf("gibtsnicht.svg")).status).toBe(404);
    expect((await aufruf("qr.png")).status).toBe(404);
  });
});
