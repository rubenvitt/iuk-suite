import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FristStand, Stufe, Zustand } from "../_lib/fristen";
import type { GeraetZeile } from "../_lib/typen";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../_db/client", () => ({ getDb: () => ({}) }));
vi.mock("../_lib/zugang", () => ({
  requireZugang: async () => ({ rechte: { admin: true, gruppen: ["g1"] } }),
  istVerwalter: () => true,
}));

const stand = (name: string, stufe: Stufe): FristStand => ({
  vorlage: { id: name, name, wer: "intern", monate: 12, stunden: null, anlass: null },
  letzte: null, faelligAm: null, faelligBeiStunden: null, reststunden: null, stufe, text: "noch nie erledigt",
});
const geraet = (id: string, staende: FristStand[], zustand: Zustand) => ({
  id, name: `Gerät ${id}`, ort: "Lager", gruppeName: "IuK", zustand, staende,
  naechste: [...staende].sort((a, b) => (a.stufe === "ueberfaellig" ? -1 : b.stufe === "ueberfaellig" ? 1 : 0))[0] ?? null,
}) as unknown as GeraetZeile;

// Ein Gerät mit ZWEI überfälligen Fristen, eins mit einer baldigen, eins nicht einsatzbereit ohne Frist.
const GERAETE = [
  geraet("a", [stand("Wartung", "ueberfaellig"), stand("Elektroprüfung", "ueberfaellig")], "ok"),
  geraet("b", [stand("Wartung", "bald")], "mangel"),
  geraet("c", [], "defekt"),
];

vi.mock("../_lib/daten", async (orig) => ({
  ...(await orig<typeof import("../_lib/daten")>()),
  ladeGruppen: () => [],
  ladeGeraete: () => GERAETE,
  ladeMaengel: () => [{ id: "m1" }],
}));

import Uebersicht from "./page";

const html = async () => renderToString(await Uebersicht({ searchParams: Promise.resolve({}) })).replaceAll("<!-- -->", "");
const kennzahlen = (h: string) =>
  [...h.matchAll(/<a ([^>]*data-kennzahl=[^>]*)>([\s\S]*?)<\/a>/g)].map(([, attribute, inhalt]) => ({
    href: /href="([^"]+)"/.exec(attribute)![1].replaceAll("&amp;", "&"),
    text: inhalt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));

/** IDA-381: jede Kennzahl führt auf genau die gezählten Einträge, in richtiger Einzahl. */
describe("Übersicht der Gerätewartung", () => {
  it("zählt Geräte, nicht Fristen, und verlinkt die gefilterte Liste", async () => {
    expect(kennzahlen(await html())).toEqual([
      { href: "/geraete?frist=ueberfaellig", text: "1 Gerät mit überfälliger Frist" },
      { href: "/geraete?frist=bald", text: "1 Gerät bald fällig" },
      { href: "/geraete?zustand=defekt", text: "1 Gerät nicht einsatzbereit" },
      { href: "/maengel", text: "1 Mangel offen" },
    ]);
  });

  it("„Was steht an“ ohne Versalien, wie im Portal", async () => {
    const h = await html();
    expect(h).toContain("kickerLeise");
    expect(h).toContain("Überfällig · Wartung · IuK");
    expect(h).toContain("Bald · Wartung · IuK");
  });
});
