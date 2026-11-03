import { afterEach, describe, expect, it } from "vitest";
import { _leserZuruecksetzen, ladeLeserNamen, type LeserTransport } from "./leser";

const gruppe = { data: [{ id: "g1", name: "kummerkasten-leser" }] };
const mitglieder = { users: [{ displayName: "Erika Mustermann" }] };

function transport(antworten: unknown[]): { t: LeserTransport; urls: string[] } {
  const urls: string[] = [];
  const t: LeserTransport = async (url) => {
    urls.push(url);
    const a = antworten.shift();
    if (a instanceof Error) throw a;
    return { ok: true, status: 200, json: async () => a };
  };
  return { t, urls };
}

afterEach(() => _leserZuruecksetzen());

describe("ladeLeserNamen", () => {
  it("nimmt bei leerer API-URL den Issuer", async () => {
    const { t, urls } = transport([gruppe, mitglieder]);
    const env = { POCKET_ID_API_URL: "", POCKET_ID_ISSUER: "https://id.example/", POCKET_ID_API_KEY: "k" };
    expect(await ladeLeserNamen(env, t, 0)).toEqual(["Erika Mustermann"]);
    expect(urls[0]).toMatch(/^https:\/\/id\.example\/api\/user-groups\?/);
  });

  it("gibt nach Ablauf der TTL bei einem Fehler keine alte Liste aus", async () => {
    const env = { POCKET_ID_ISSUER: "https://id.example", POCKET_ID_API_KEY: "k" };
    const { t } = transport([gruppe, mitglieder, new Error("weg"), new Error("weg")]);
    expect(await ladeLeserNamen(env, t, 0)).toEqual(["Erika Mustermann"]);
    expect(await ladeLeserNamen(env, t, 4 * 60_000)).toEqual(["Erika Mustermann"]);
    expect(await ladeLeserNamen(env, t, 6 * 60_000)).toEqual([]);
  });
});
