import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mount, rerender, unmount } from "../../../../src/app/m/qr/_lib/test-dom";
import type { Ankerstand } from "../typen";
import { BLOECKE, CEKS, EINSAETZE } from "./testvektoren";

const befehle = vi.hoisted(() => ({
  bloecke: vi.fn(),
  schluesselFreigeben: vi.fn(),
  ankerAbgleichen: vi.fn(),
}));
vi.mock("../befehle", () => ({ befehle }));

import { useVerwaltung } from "./useVerwaltung";

type Ergebnis = ReturnType<typeof useVerwaltung>;

/** `renderHook` ohne Testing Library: Eine Sonde hält das jeweils letzte Ergebnis fest. */
async function renderVerwaltung(aktiv = true): Promise<{ aktuell: Ergebnis; neu: (aktiv: boolean) => Promise<void> }> {
  const halter = { aktuell: undefined as unknown as Ergebnis };
  function Sonde({ aktiv }: { aktiv: boolean }) {
    halter.aktuell = useVerwaltung(aktiv);
    return null;
  }
  await mount(<Sonde aktiv={aktiv} />);
  await warte();
  return {
    get aktuell() {
      return halter.aktuell;
    },
    neu: async (a: boolean) => {
      await rerender(<Sonde aktiv={a} />);
      await warte();
    },
  };
}

/** Lässt die Promise-Ketten (Befehle, WebCrypto) auslaufen. */
async function warte(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });
  }
}

function ankerstand(teil: Partial<Ankerstand> = {}): Ankerstand {
  return {
    bestaetigtBis: 3,
    hash: BLOECKE[2].hash,
    gemeldetAm: "2026-09-25T10:00:00+02:00",
    abweichung: null,
    offline: false,
    widerrufen: false,
    ...teil,
  };
}

/** Alles, was an Klartext der Testvektoren im Zustand stehen könnte. */
const KLARTEXT = EINSAETZE.flatMap((e) => [e.nummer, e.stichwort, e.strasse, e.ort]).concat(CEKS.map((c) => c.cek));

function enthaeltKlartext(wert: unknown): string[] {
  const text = JSON.stringify(wert);
  return KLARTEXT.filter((k) => text.includes(k));
}

beforeEach(() => {
  for (const f of Object.values(befehle)) f.mockReset();
  befehle.bloecke.mockResolvedValue(BLOECKE);
  befehle.schluesselFreigeben.mockResolvedValue(CEKS);
  befehle.ankerAbgleichen.mockResolvedValue(ankerstand());
});

afterEach(async () => {
  await unmount();
});

describe("useVerwaltung", () => {
  it("holt Blöcke, lässt die Schlüssel freigeben und öffnet alle drei im Speicher", async () => {
    const h = await renderVerwaltung();
    const z = h.aktuell.zustand;
    if (z.art !== "offen") throw new Error(`erwartet offen, war ${z.art}`);
    expect(z.offen.map((o) => o.einsatz.stichwort)).toEqual(["RD 2", "SanD", "MANV 10"]);
    expect(z.offen.map((o) => o.block.kopf.block)).toEqual([1, 2, 3]);
    expect(z.zu).toEqual([]);
    expect(z.fehler).toBeNull();
    expect(z.pruefung).toEqual({ art: "intakt", vollstaendig: true });
    expect(z.anker).toBeNull();
    expect(befehle.schluesselFreigeben).toHaveBeenCalledTimes(1);
  });

  it("ohne `aktiv` holt es nichts", async () => {
    const h = await renderVerwaltung(false);
    expect(h.aktuell.zustand).toEqual({ art: "laedt" });
    expect(befehle.bloecke).not.toHaveBeenCalled();
    expect(befehle.schluesselFreigeben).not.toHaveBeenCalled();
  });

  it("eine falsche CEK für Block 2 ergibt „Block 2 lässt sich nicht öffnen“, die anderen bleiben offen", async () => {
    befehle.schluesselFreigeben.mockResolvedValue([CEKS[0], { block: 2, cek: CEKS[0].cek }, CEKS[2]]);
    const h = await renderVerwaltung();
    const z = h.aktuell.zustand;
    if (z.art !== "offen") throw new Error(`erwartet offen, war ${z.art}`);
    expect(z.offen.map((o) => o.block.kopf.block)).toEqual([1, 3]);
    expect(z.zu.map((b) => b.kopf.block)).toEqual([2]);
    expect(z.fehler).toBeNull();
  });

  it("ein Block ohne CEK in der Antwort bleibt zu", async () => {
    befehle.schluesselFreigeben.mockResolvedValue([CEKS[0], CEKS[2]]);
    const h = await renderVerwaltung();
    const z = h.aktuell.zustand;
    if (z.art !== "offen") throw new Error(`erwartet offen, war ${z.art}`);
    expect(z.zu.map((b) => b.kopf.block)).toEqual([2]);
  });

  it("scheitert die Freigabe mit „Lesen braucht Verbindung zur Suite.“, sind alle zu und `fehler` ist gesetzt", async () => {
    befehle.schluesselFreigeben.mockRejectedValue("Lesen braucht Verbindung zur Suite.");
    const h = await renderVerwaltung();
    const z = h.aktuell.zustand;
    if (z.art !== "offen") throw new Error(`erwartet offen, war ${z.art}`);
    expect(z.offen).toEqual([]);
    expect(z.zu.map((b) => b.kopf.block)).toEqual([1, 2, 3]);
    expect(z.fehler).toBe("Lesen braucht Verbindung zur Suite.");
    // Die Kette selbst prüft die App auch ohne Freigabe — sie braucht keinen Schlüssel.
    expect(z.pruefung).toEqual({ art: "intakt", vollstaendig: true });
  });

  it("scheitert das Lesen der Blöcke, gilt `fehler` mit der Meldung aus Rust", async () => {
    befehle.bloecke.mockRejectedValue("Die Datenbank ist gesperrt.");
    const h = await renderVerwaltung();
    expect(h.aktuell.zustand).toEqual({ art: "fehler", meldung: "Die Datenbank ist gesperrt.", zu: [] });
    expect(befehle.schluesselFreigeben).not.toHaveBeenCalled();
  });

  it("`verwerfen()` → `laedt`, und nichts vom Klartext ist mehr erreichbar", async () => {
    const h = await renderVerwaltung();
    expect(enthaeltKlartext(h.aktuell.zustand).length).toBeGreaterThan(0);
    act(() => h.aktuell.verwerfen());
    await warte();
    expect(h.aktuell.zustand).toEqual({ art: "laedt" });
    expect(enthaeltKlartext(h.aktuell)).toEqual([]);
    // Kein neuer Abruf, solange niemand neu aktiviert.
    expect(befehle.schluesselFreigeben).toHaveBeenCalledTimes(1);
  });

  it("eine Freigabe, die erst nach `verwerfen()` ankommt, wird nicht mehr geöffnet", async () => {
    let gib!: (p: typeof CEKS) => void;
    befehle.schluesselFreigeben.mockReturnValue(new Promise((r) => (gib = r)));
    const h = await renderVerwaltung();
    expect(h.aktuell.zustand).toEqual({ art: "laedt" });
    act(() => h.aktuell.verwerfen());
    gib(CEKS);
    await warte();
    expect(h.aktuell.zustand).toEqual({ art: "laedt" });
  });

  it("wird es inaktiv, verwirft es den Klartext von selbst", async () => {
    const h = await renderVerwaltung();
    expect(h.aktuell.zustand.art).toBe("offen");
    await h.neu(false);
    expect(h.aktuell.zustand).toEqual({ art: "laedt" });
    expect(enthaeltKlartext(h.aktuell)).toEqual([]);
  });

  it("„Kette prüfen“ prüft lokal und gleicht gegen den Anker der Suite ab", async () => {
    const h = await renderVerwaltung();
    await act(async () => {
      await h.aktuell.kettePruefen();
    });
    const z = h.aktuell.zustand;
    if (z.art !== "offen") throw new Error(`erwartet offen, war ${z.art}`);
    expect(befehle.ankerAbgleichen).toHaveBeenCalledTimes(1);
    expect(z.pruefung).toMatchObject({ art: "intakt", vollstaendig: true });
    expect(z.anker).toEqual({ block: 3, hash: BLOECKE[2].hash, gemeldetAm: "2026-09-25T10:00:00+02:00" });
    expect(z.ankerstand).toEqual(ankerstand());
    expect(z.ankerFehler).toBeNull();
  });

  it("„Kette prüfen“ hält das lokale Ergebnis, auch wenn der Ankerabgleich scheitert", async () => {
    befehle.ankerAbgleichen.mockRejectedValue("Dieser Rechner ist noch nicht eingerichtet.");
    const h = await renderVerwaltung();
    await act(async () => {
      await h.aktuell.kettePruefen();
    });
    const z = h.aktuell.zustand;
    if (z.art !== "offen") throw new Error(`erwartet offen, war ${z.art}`);
    expect(z.pruefung).toMatchObject({ art: "intakt", vollstaendig: true });
    expect(z.anker).toBeNull();
    expect(z.ankerFehler).toBe("Dieser Rechner ist noch nicht eingerichtet.");
  });

  it("„Kette prüfen“ meldet eine gebrochene Kette", async () => {
    const h = await renderVerwaltung();
    const kaputt = BLOECKE.map((b) => (b.kopf.block === 2 ? { ...b, hash: "f".repeat(64) } : b));
    befehle.bloecke.mockResolvedValue(kaputt);
    await act(async () => {
      await h.aktuell.kettePruefen();
    });
    const z = h.aktuell.zustand;
    if (z.art !== "offen") throw new Error(`erwartet offen, war ${z.art}`);
    expect(z.pruefung).toEqual({ art: "gebrochen", block: 2, grund: "Inhalt passt nicht zum Fingerabdruck" });
  });
});
