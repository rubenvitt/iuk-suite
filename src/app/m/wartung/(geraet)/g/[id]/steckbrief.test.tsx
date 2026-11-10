import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AmGeraet } from "../../../_lib/telefon";
import type { Rechte } from "../../../_lib/zugang";

/**
 * IDA-381 — der Steckbrief am QR-Code: offene Mängel stehen auch ohne Anmeldung da (alle, gekürzt, mit Tag, ohne
 * Meldende), und die Inhaltsliste einer Kiste sagt „4 von 6 da“, wenn etwas unterwegs ist.
 */
let daten: AmGeraet & { viewer: unknown; rechte: Rechte; zugang: boolean };
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./laden", () => ({ geraetOeffentlich: async () => daten }));
vi.mock("../../../_db/client", () => ({ getDb: () => ({}) }));
vi.mock("../../../_lib/daten", () => ({ ladeEinsatz: () => null }));
vi.mock("../../../_lib/zugang", () => ({ loginZiel: (_h: Headers, pfad: string) => pfad, verwaltetGruppe: () => false }));
vi.mock("../../../_ui/telefon/AnlassKnopf", () => ({ AnlassKnopf: () => null }));

import Steckbrief from "./page";

const G = "6f1c2a4e-0000-4000-8000-000000000001";
const LANG = "Der Tankdeckel schließt nicht mehr richtig, beim Kippen läuft Benzin aus und riecht im ganzen Fahrzeug, bitte tauschen";

function stand(kiste: boolean): typeof daten {
  return {
    g: {
      id: G, name: "Stromerzeuger 1", hersteller: "", typ: "", seriennr: "", gruppeId: "gr", gruppeName: "Technik", artId: "a",
      artEinzahl: "Gerät", ikone: "", stundenPflicht: false, kiste, ortArt: "lager", ort: "Halle", fahrzeugId: null, stunden: null,
      hinweise: "", pruefanleitung: "", aktiv: true, zustand: "defekt", plan: [], staende: [], naechste: null, offeneMaengel: 2,
      fehlend: 0, unterwegs: false, imEinsatz: false,
    },
    pruefung: null, checkliste: [], punkteJe: {}, unterlagen: [],
    offen: [
      { id: "m2", text: LANG, einsatzbereit: false, gemeldetAm: Date.UTC(2026, 10, 9, 10) },
      { id: "m1", text: "Griff locker", einsatzbereit: true, gemeldetAm: Date.UTC(2026, 10, 2, 10) },
    ],
    unterwegs: { ganz: null, jePosition: new Map(), entnahmen: [] },
    viewer: null, rechte: { admin: false, gruppen: [] } as unknown as Rechte, zugang: false,
  };
}

const html = async () => renderToStaticMarkup(await Steckbrief({ params: Promise.resolve({ id: G }) }));

describe("Steckbrief: offene Mängel (IDA-381)", () => {
  beforeEach(() => {
    daten = stand(false);
  });

  it("ohne Anmeldung: alle offenen Mängel, gekürzt und mit Tag, ohne Meldende", async () => {
    const h = await html();
    expect(h).toContain("2 offene Mängel");
    expect(h.match(/data-rolle="offener-mangel"/g)).toHaveLength(2);
    expect(h).toContain("Griff locker");
    expect(h).not.toContain(LANG);
    expect(h).toContain("Der Tankdeckel schließt nicht mehr richtig");
    expect(h).toContain("…");
    expect(h).toContain("09.11.");
    expect(h).toContain("02.11.");
  });

  it("mit Zugang dieselbe Liste statt nur des ersten Mangels", async () => {
    daten = { ...stand(false), zugang: true, viewer: { id: "x" } };
    const h = await html();
    expect(h.match(/data-rolle="offener-mangel"/g)).toHaveLength(2);
    expect(h).toContain("Griff locker");
  });

  it("ohne offenen Mangel keine Liste", async () => {
    daten = { ...stand(false), offen: [] };
    expect(await html()).not.toContain("offene-maengel");
  });
});

describe("Steckbrief: Inhalt einer Kiste (IDA-381)", () => {
  it("„4 von 6 da“ bei dem, was unterwegs ist; sonst „6 ×“", async () => {
    daten = {
      ...stand(true),
      checkliste: [{ id: "i1", text: "Patchkabel", hinweis: "", soll: 6 }, { id: "i2", text: "Schere", hinweis: "", soll: 1 }],
      unterwegs: { ganz: null, jePosition: new Map([["i1", 2]]), entnahmen: [] },
    };
    const h = await html();
    expect(h).toContain("4 von 6 da");
    expect(h).toContain("1 ×");
    expect(h).not.toContain("6 ×");
  });
});
