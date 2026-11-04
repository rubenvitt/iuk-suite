import { afterEach, describe, expect, it, vi } from "vitest";
import { _merkerLeeren, fundAus, kategorieAus, lebensmittelUrl, schlageNach } from "./lebensmittel";

const TREFFER = {
  status: 1,
  product: { product_name_de: "Apfelsaft naturtrüb", quantity: "1 l", categories_tags: ["en:beverages", "en:juices"] },
};

const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => { _merkerLeeren(); vi.unstubAllEnvs(); });

describe("Lebensmitteldatenbank", () => {
  it("liest Name, Kategorie und Einheit aus einem Treffer", () => {
    expect(fundAus(TREFFER)).toEqual({ name: "Apfelsaft naturtrüb 1 l", kategorie: "Getränke", einheit: "Packung" });
    expect(fundAus({ status: 0 })).toBeNull();
    expect(fundAus({ status: 1, product: { quantity: "1 l" } })).toBeNull();
    expect(kategorieAus(["en:canned-foods", "en:soups"])).toBe("Konserven");
    expect(kategorieAus(["en:something-else"])).toBeNull();
  });

  it("schickt nur die EAN hinaus und merkt sich Treffer wie Nichttreffer", async () => {
    const abruf = vi.fn(async () => antwort(TREFFER));
    expect(await schlageNach("4005906002481", abruf as unknown as typeof fetch, 0)).toMatchObject({ name: "Apfelsaft naturtrüb 1 l" });
    expect(await schlageNach("4005906002481", abruf as unknown as typeof fetch, 1000)).toMatchObject({ name: "Apfelsaft naturtrüb 1 l" });
    expect(abruf).toHaveBeenCalledTimes(1);
    expect(String((abruf.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/4005906002481\.json\?/);

    const leer = vi.fn(async () => antwort({ status: 0 }, 404));
    expect(await schlageNach("4000000000017", leer as unknown as typeof fetch, 0)).toBeNull();
    expect(await schlageNach("4000000000017", leer as unknown as typeof fetch, 1000)).toBeNull();
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("wirft nie und merkt sich keinen Netzfehler", async () => {
    const kaputt = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await schlageNach("4000000000024", kaputt as unknown as typeof fetch, 0)).toBeNull();
    expect(await schlageNach("4000000000024", kaputt as unknown as typeof fetch, 1)).toBeNull();
    expect(kaputt).toHaveBeenCalledTimes(2);
    expect(await schlageNach("keine-ean", kaputt as unknown as typeof fetch, 0)).toBeNull();
  });

  it("lässt sich abschalten", async () => {
    vi.stubEnv("VERPFLEGUNG_LEBENSMITTEL_URL", "aus");
    expect(lebensmittelUrl()).toBeNull();
    const abruf = vi.fn();
    expect(await schlageNach("4005906002481", abruf as unknown as typeof fetch, 0)).toBeNull();
    expect(abruf).not.toHaveBeenCalled();
  });
});
