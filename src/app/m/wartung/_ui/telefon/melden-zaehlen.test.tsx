// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vergissFluechtig } from "@/core/entwurf/ablage";
import { click, exists, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

const entnehmen = vi.fn();
const zurueck = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../_actions/telefon", () => ({
  stundenEintragenAction: vi.fn(),
  entnehmenAction: (...a: unknown[]) => entnehmen(...a),
  zuruecklegenAction: (...a: unknown[]) => zurueck(...a),
}));

import { EntnehmenAmGeraet } from "./EntnehmenAmGeraet";
import { MangelAmGeraet } from "./MangelAmGeraet";
import { ZuruecklegenAmGeraet } from "./ZuruecklegenAmGeraet";

/** IDA-381 — Einsatzfrage ohne Vorauswahl, Folge nach dem Melden, „− n +“ und die Meldung bei zu viel. */
const G = "6f1c2a4e-0000-4000-8000-000000000001";
const P = "6f1c2a4e-0000-4000-8000-000000000002";
const fetchMock = vi.fn();
const json = (k: unknown, status = 200) => new Response(JSON.stringify(k), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  fetchMock.mockReset();
  entnehmen.mockReset();
  zurueck.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe("Mangel am Gerät: Einsatzfrage", () => {
  const mangel = () => mount(<App><MangelAmGeraet geraetId={G} geraetName="Stromerzeuger" /></App>);

  it("hat keine Vorauswahl und sendet ohne Wahl nicht, sondern sagt es am Feld", async () => {
    await mangel();
    expect(queryAll<HTMLInputElement>("input[name='einsatzbereit']").some((r) => r.checked)).toBe(false);
    await fill("textarea[aria-label='Was ist los?']", "Kabel angescheuert");
    await click("button.ant-btn-primary");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query("[data-rolle='wahl-fehlt']").textContent).toBe("Bitte wählen, ob das Gerät noch raus kann.");
    await click("input[name='einsatzbereit'][value='defekt']");
    expect(exists("[data-rolle='wahl-fehlt']")).toBe(false);
  });

  it("„Nein“: sendet `nein` und sagt danach, dass das Gerät auf nicht einsatzbereit steht", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await mangel();
    await fill("textarea[aria-label='Was ist los?']", "Springt nicht an");
    await click("input[name='einsatzbereit'][value='defekt']");
    await click("button.ant-btn-primary");
    expect((fetchMock.mock.calls[0][1].body as FormData).get("einsatzbereit")).toBe("nein");
    expect(query("[data-rolle='mangel-folge']").textContent).toContain("„Nicht einsatzbereit“");
  });

  it("„Ja“: sendet `ja` und nennt nur die Mängelliste", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await mangel();
    await fill("textarea[aria-label='Was ist los?']", "Griff locker");
    await click("input[name='einsatzbereit'][value='mangel']");
    await click("button.ant-btn-primary");
    expect((fetchMock.mock.calls[0][1].body as FormData).get("einsatzbereit")).toBe("ja");
    const folge = query("[data-rolle='mangel-folge']").textContent;
    expect(folge).toContain("Mängelliste");
    expect(folge).not.toContain("einsatzbereit");
  });
});

describe("Entnehmen am Gerät: Zähler", () => {
  const ansicht = () => mount(
    <App><EntnehmenAmGeraet geraetId={G} geraetName="Kiste" positionen={[{ id: P, text: "Patchkabel", soll: 6, frei: 6 }]} etwasUnterwegs={false} ganzMoeglich /></App>,
  );
  const mitnehmen = () => query<HTMLButtonElement>("button.ant-btn-primary");

  it("zählt mit − und + innerhalb von 0 bis frei", async () => {
    await ansicht();
    expect(query<HTMLButtonElement>("button[aria-label='Menge Patchkabel verringern']").disabled).toBe(true);
    await click("button[aria-label='Menge Patchkabel erhöhen']");
    await click("button[aria-label='Menge Patchkabel erhöhen']");
    expect(query<HTMLInputElement>("input[aria-label='Menge Patchkabel']").value).toBe("2");
    expect(mitnehmen().disabled).toBe(false);
    entnehmen.mockResolvedValue({ ok: true });
    await click("button.ant-btn-primary");
    expect(entnehmen).toHaveBeenCalledWith(G, expect.objectContaining({ ganz: false, positionen: [{ inhaltId: P, menge: 2 }] }));
  });

  it("„9 von 6“: Meldung am Feld, Mitnehmen gesperrt; − führt zurück auf das, was da ist", async () => {
    await ansicht();
    await fill("input[aria-label='Menge Patchkabel']", "9");
    expect(query("[data-rolle='zu-viel']").textContent).toBe("Nur 6 da.");
    expect(query("input[aria-label='Menge Patchkabel']").getAttribute("aria-invalid")).toBe("true");
    expect(mitnehmen().disabled).toBe(true);
    await click("button[aria-label='Menge Patchkabel verringern']");
    expect(query<HTMLInputElement>("input[aria-label='Menge Patchkabel']").value).toBe("6");
    expect(exists("[data-rolle='zu-viel']")).toBe(false);
    expect(mitnehmen().disabled).toBe(false);
  });
});

describe("Zurücklegen am Gerät: Zähler", () => {
  it("mehr „wieder da“ als unterwegs: Meldung am Feld, Zurücklegen gesperrt", async () => {
    const entnahme = {
      id: "e1", wer: "Helfer A", zweck: "", ganz: false, seit: Date.UTC(2026, 10, 7, 10),
      positionen: [{ id: P, inhaltId: "i1", text: "Patchkabel", menge: 2, zurueck: 0, offen: 2 }],
    };
    await mount(<App><ZuruecklegenAmGeraet geraetId={G} geraetName="Kiste" anleitung="" entnahmen={[entnahme]} /></App>);
    expect(query<HTMLInputElement>("input[aria-label='Wieder da Patchkabel']").value).toBe("2");
    expect(query<HTMLButtonElement>("button[aria-label='Wieder da Patchkabel erhöhen']").disabled).toBe(true);
    await fill("input[aria-label='Wieder da Patchkabel']", "3");
    expect(query("[data-rolle='zu-viel']").textContent).toBe("Nur 2 unterwegs.");
    expect(query<HTMLButtonElement>("button[data-rolle='zuruecklegen-senden']").disabled).toBe(true);
    await click("button[aria-label='Wieder da Patchkabel verringern']");
    await click("button[aria-label='Wieder da Patchkabel verringern']");
    expect(query<HTMLInputElement>("input[aria-label='Wieder da Patchkabel']").value).toBe("1");
    expect(exists("[role='radiogroup'][aria-label='Rest Patchkabel']")).toBe(true);
    expect(zurueck).not.toHaveBeenCalled();
  });
});
