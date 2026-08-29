import { it, expect } from "vitest";
import { GET } from "./route";
it("Alt-Bookmark /aufgabe/1-1 → 308 /aufgabe?id=1-1", async () => {
  const r = await GET(new Request("http://uav-training.iuk-ue.de/aufgabe/1-1", { headers: { host: "uav-training.iuk-ue.de" } }), { params: Promise.resolve({ id: "1-1" }) });
  expect(r.status).toBe(308); expect(r.headers.get("location")).toBe("/aufgabe?id=1-1");
});
