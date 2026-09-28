import { describe, it, expect, beforeEach, vi } from "vitest";
import { nanoid, urlAlphabet } from "nanoid";

/**
 * DAS RUECKKEHRZIEL DES ORTSETIKETTS OHNE SITZUNG — DRK-493.
 *
 * Nur Ausgang 3 (Gate mit `returnTo`); Ausgang 1 und 2 und ihre Zielwahl sind
 * `ortZielPfad` und stehen in `_lib/ortZiel.test.ts`.
 */
const HOST = "lagerbuch.localtest.me";
const umleitungen: string[] = [];

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: HOST }) }));
vi.mock("next/navigation", () => ({
  redirect: (pfad: string) => {
    umleitungen.push(pfad);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("../../_lib/host", () => ({ requireLagerbuchHost: vi.fn() }));
vi.mock("../../_lib/helferZugang", () => ({
  helferZugangOderNull: vi.fn(async () => null),
  kontoZugangOderNull: vi.fn(async () => null),
}));
vi.mock("../../_lib/lesepfade/ortEtiketten", () => ({ etikettOrt: vi.fn() }));
vi.mock("../../_db/client", () => ({ getDb: vi.fn(() => ({ marke: "db" })) }));

import OrtDeepLink from "./page";

const params = (ortId: string) => ({ params: Promise.resolve({ ortId }) });

async function rueckkehrZiel(ortId: string): Promise<URL> {
  await expect(OrtDeepLink(params(ortId))).rejects.toThrow("NEXT_REDIRECT");
  const gate = new URL(umleitungen[0], `https://${HOST}`);
  expect(gate.pathname).toBe("/");
  return new URL(gate.searchParams.get("returnTo")!, gate);
}

beforeEach(() => {
  umleitungen.length = 0;
});

describe("/o/<id> — Gate mit Rueckkehrziel", () => {
  /**
   * Gelesen ueber `URL`, so wie der Browser nach der Anmeldung. Next reicht
   * `ortId` DEKODIERT herein; roh eingesetzt hiesse `rtw#1?x=/2` danach nur
   * noch `/o/rtw`.
   */
  it("gibt dem Gate eine Id mit Trennzeichen vollstaendig mit", async () => {
    const rueckkehr = await rueckkehrZiel("rtw#1?x=/2 &");
    expect(rueckkehr.pathname.split("/")).toEqual(["", "o", "rtw%231%3Fx%3D%2F2%20%26"]);
    expect(decodeURIComponent(rueckkehr.pathname.slice("/o/".length))).toBe("rtw#1?x=/2 &");
    expect(rueckkehr.search + rueckkehr.hash).toBe("");
  });

  it("fuer nanoid-Ids und den Handlager bleibt das Ziel ZEICHENGLEICH mit dem rohen", async () => {
    for (const id of [urlAlphabet, "handlager", nanoid()]) {
      umleitungen.length = 0;
      await expect(OrtDeepLink(params(id))).rejects.toThrow("NEXT_REDIRECT");
      expect(umleitungen).toEqual([`/?returnTo=${encodeURIComponent(`/o/${id}`)}`]);
    }
  });
});
