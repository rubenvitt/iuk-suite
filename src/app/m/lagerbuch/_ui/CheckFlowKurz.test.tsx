// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  mount, unmount, query, queryAll, exists, click, clickElement, fill,
} from "@/app/m/qr/_lib/test-dom";

const abschluss = vi.fn();
vi.mock("../_actions/check", () => ({ checkAbschluss: (...a: unknown[]) => abschluss(...a) }));
vi.mock("../_actions/sitzung", () => ({ erneuereSitzung: vi.fn() }));

import { CheckFlow, type CheckPlombe, type CheckPos } from "./CheckFlow";

/**
 * IDA-222 — Kurzcheck und Plomben in der Check-Insel. Die Faelle des
 * Vollchecks ohne Plomben stehen in `CheckFlow.test.tsx`.
 */
const FZ = { id: "fz-1", name: "KTW 1", kennung: null, einheitenart: "fahrzeug" as const };
const WARN = { rotTage: 31, gelbTage: 56 };
const POS = (id: string, artikelId: string, fachLabel: string): CheckPos => ({
  id, fachLabel, artikelId, artikelName: `Artikel ${artikelId}`, einheit: "Stk",
  handlagerFach: "A", soll: 2, fahrzeugBestand: 2, handlagerBestand: 10,
});
const SOLL = [
  POS("sp-a", "a", "Fach 1"),
  POS("sp-b", "b", "Fach 1"),
  POS("sp-k1", "k1", "Medizinkoffer"),
  POS("sp-k2", "k2", "Medizinkoffer"),
];
const KOFFER: CheckPlombe = { id: "pl-k", bezeichnung: "Medizinkoffer", fachLabel: "Medizinkoffer", erwartet: "12345" };
const NIE: CheckPlombe = { id: "pl-n", bezeichnung: "Kindertasche", fachLabel: "Kindertasche", erwartet: null };

const WERT = {
  checkId: "c1", nachgefuellt: 0, nachfuellBestaetigt: 0, offen: 0, geraeteAuffaellig: 0,
  flaschenAuffaellig: 0, flaschenNichtBewertbar: 0, verfallAuffaellig: 0, plombenOffen: 0, plombenGesetzt: 0,
};

beforeEach(() => {
  abschluss.mockReset();
  abschluss.mockResolvedValue({ ok: true, wert: WERT });
});
afterEach(async () => { await unmount(); });

const kurz = (plomben: CheckPlombe[] = [KOFFER, NIE]) => mount(
  <CheckFlow
    kontoZugang={false}
    art="kurz"
    fahrzeug={FZ}
    soll={SOLL}
    stichprobe={{ "sp-a": "Seit 30 Tagen nicht gezählt" }}
    versiegelt={{ "pl-k": ["sp-k1", "sp-k2"] }}
    plomben={plomben}
    geraete={[]}
    flaschen={[]}
    verfall={{}}
    warn={WARN}
    andereEinheitErreichbar
    letzterCheckText={null}
  />,
);

const gezaehlteIds = () =>
  queryAll("[data-rolle='zaehlliste'] button[aria-label$='verringern']").length;

const alleNullZaehlen = async () => {
  for (const el of queryAll("[data-rolle='zaehlliste'] button[aria-label$='verringern']")) {
    await clickElement(el);
  }
};

describe("Kurzcheck — Plomben zuerst", () => {
  it("beginnt mit den Plomben und sperrt „Weiter“, bis jede abgelesen ist", async () => {
    await kurz();
    expect(query("[data-rolle='check-art']").textContent).toBe("Kurzcheck");
    expect(queryAll("[data-rolle='plombe']")).toHaveLength(1);
    expect(query("[data-rolle='plomben-nie']").textContent).toContain("Kindertasche");
    expect((query("[data-rolle='weiter']") as HTMLButtonElement).disabled).toBe(true);
    await fill("[data-rolle='plombe-nummer']", "123 45");
    expect(query("[data-rolle='plombe']").textContent).toContain("passt");
    expect((query("[data-rolle='weiter']") as HTMLButtonElement).disabled).toBe(false);
  });

  it("zeigt die erwartete Nummer nie", async () => {
    await kurz();
    expect(document.body.textContent).not.toContain("12345");
  });

  it("passt die Plombe, zaehlt nur die Stichprobe", async () => {
    await kurz();
    await fill("[data-rolle='plombe-nummer']", "12345");
    await click("[data-rolle='weiter']");
    expect(gezaehlteIds()).toBe(1);
    expect(query("[data-rolle='stichprobe-grund']").textContent).toBe("Seit 30 Tagen nicht gezählt");
  });

  it("eine andere Nummer gibt das ganze Fach in die Zaehlliste — mit Grund", async () => {
    await kurz();
    await fill("[data-rolle='plombe-nummer']", "99999");
    expect(query("[data-rolle='plombe-folge']").textContent).toContain("2 Positionen");
    await click("[data-rolle='weiter']");
    expect(gezaehlteIds()).toBe(3);
    expect(queryAll("[data-rolle='stichprobe-grund']").map((e) => e.textContent))
      .toContain("Plombe offen: Medizinkoffer");
  });

  it("sendet Kurzcheck, gezaehlte Positionen und die gemeldete Plombe", async () => {
    await kurz();
    await click("[data-rolle='plombe-fehlt']");
    await click("[data-rolle='weiter']");
    await alleNullZaehlen();
    await click("[data-rolle='weiter']");
    await click("[data-rolle='abschliessen']");
    expect(abschluss).toHaveBeenCalledTimes(1);
    const n = abschluss.mock.calls[0][0];
    expect(n.art).toBe("kurz");
    expect(n.plomben).toEqual([{ plombeId: "pl-k", nummer: null }]);
    expect(n.positionen.map((p: { sollPositionId: string }) => p.sollPositionId).sort())
      .toEqual(["sp-a", "sp-k1", "sp-k2"]);
  });

  it("ohne stehende Plombe beginnt der Kurzcheck beim Zaehlen", async () => {
    await kurz([NIE]);
    expect(exists("[data-rolle='plomben-liste']")).toBe(false);
    expect(exists("[data-rolle='zaehlliste']")).toBe(true);
  });
});

describe("Kurzcheck — ein Artikel wird ganz gezaehlt", () => {
  it("zieht die zweite Position desselben Artikels mit", async () => {
    await mount(
      <CheckFlow
        kontoZugang={false}
        art="kurz"
        fahrzeug={FZ}
        soll={[POS("sp-a", "a", "Fach 1"), POS("sp-a2", "a", "Fach 2"), POS("sp-b", "b", "Fach 1")]}
        stichprobe={{ "sp-a": "Zufällig gezogen" }}
        versiegelt={{}}
        plomben={[]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(gezaehlteIds()).toBe(2);
  });
});

describe("Vollcheck — Plomben am Ende setzen", () => {
  it("setzt die Plomben als letzten Schritt und sendet die neuen Nummern", async () => {
    await mount(
      <CheckFlow
        kontoZugang={false}
        art="voll"
        fahrzeug={FZ}
        soll={[POS("sp-a", "a", "Fach 1")]}
        stichprobe={null}
        versiegelt={{}}
        plomben={[{ ...KOFFER, erwartet: null }, NIE]}
        geraete={[]}
        flaschen={[]}
        verfall={{}}
        warn={WARN}
        andereEinheitErreichbar
        letzterCheckText={null}
      />,
    );
    expect(query("[data-rolle='check-art']").textContent).toBe("Vollcheck");
    await alleNullZaehlen();
    await click("[data-rolle='weiter']");
    await click("[data-rolle='weiter']");
    expect(queryAll("[data-rolle='plombe']")).toHaveLength(2);
    await fill("[data-rolle='plombe-nummer']", "777");
    await click("[data-rolle='abschliessen']");
    const n = abschluss.mock.calls[0][0];
    expect(n.art).toBe("voll");
    expect(n.plomben).toEqual([{ plombeId: "pl-k", nummer: "777" }]);
  });
});
