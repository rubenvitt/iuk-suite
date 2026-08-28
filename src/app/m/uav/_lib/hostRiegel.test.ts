import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hostAbweisung } from "./hostRiegel";
import { istUavHost } from "./host";

const alt = process.env.SUITE_HOST_UAV;
beforeEach(() => { process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de"; });
afterEach(() => { if (alt === undefined) delete process.env.SUITE_HOST_UAV; else process.env.SUITE_HOST_UAV = alt; });

const req = (host: string) => new Request("http://x/api/me", { headers: { host } });

describe("uav-Host-Riegel", () => {
  it("Prod-Host und Dev-Host sind eigen", () => {
    expect(istUavHost(new Headers({ host: "uav-training.iuk-ue.de" }))).toBe(true);
    expect(istUavHost(new Headers({ host: "uav.localtest.me:3000" }))).toBe(true);
  });
  it("fremder Suite-Host → 404 als text, nicht HTML", async () => {
    const r = hostAbweisung(req("feedback.localtest.me"));
    expect(r?.status).toBe(404);
    expect(r?.headers.get("content-type")).not.toContain("text/html");
  });
  it("eigener Host → null", () => expect(hostAbweisung(req("uav-training.iuk-ue.de"))).toBeNull());
  it("x-forwarded-host gewinnt", () => {
    expect(hostAbweisung(new Request("http://x/", { headers: { host: "localhost:3000", "x-forwarded-host": "uav-training.iuk-ue.de" } }))).toBeNull();
  });
});
