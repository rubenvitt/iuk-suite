// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";
import { click, exists, fill, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

const stunden = vi.fn();
const inhalt = vi.fn();
const zurueck = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("../../_actions/telefon", () => ({
  stundenEintragenAction: (...a: unknown[]) => stunden(...a),
  entnehmenAction: vi.fn(),
  zuruecklegenAction: (...a: unknown[]) => zurueck(...a),
}));
vi.mock("../../_actions/verwaltung", () => ({ inhaltSpeichernAction: (...a: unknown[]) => inhalt(...a) }));

import { InhaltAmGeraet } from "./InhaltAmGeraet";
import { MangelAmGeraet } from "./MangelAmGeraet";
import { PruefungAmGeraet } from "./PruefungAmGeraet";
import { StundenAmGeraet } from "./StundenAmGeraet";
import { ZuruecklegenAmGeraet } from "./ZuruecklegenAmGeraet";

/**
 * IDA-358 — was am Gerät getippt ist, übersteht Neuladen und gescheitertes Absenden. „Neuladen" ist Abbau und
 * Neuaufbau; `localStorage` ist derselbe wie im Browser.
 */
const G = "6f1c2a4e-0000-4000-8000-000000000001";
const P = "6f1c2a4e-0000-4000-8000-000000000002";
const fetchMock = vi.fn();
const json = (k: unknown, status = 200) => new Response(JSON.stringify(k), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  fetchMock.mockReset();
  stunden.mockReset();
  inhalt.mockReset();
  zurueck.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

const pruefung = () => mount(
  <App>
    <PruefungAmGeraet geraetId={G} geraetName="Stromerzeuger" pruefartId={P} titel="Prüfung" checkliste={[{ id: P, text: "Öl", hinweis: "" }]} stundenPflicht={false} stundenZuletzt={null} />
  </App>,
);

describe("Prüfung am Gerät", () => {
  it("stellt Antworten nach dem Neuladen wieder her", async () => {
    await pruefung();
    await click("input[name='pruef-" + P + "'][value='mangel']");
    await fill("textarea[aria-label='Mangel bei Öl']", "Ölstand zu niedrig");
    await unmount();
    await pruefung();
    expect(query<HTMLInputElement>("input[name='pruef-" + P + "'][value='mangel']").checked).toBe(true);
    expect(query<HTMLTextAreaElement>("textarea[aria-label='Mangel bei Öl']").value).toBe("Ölstand zu niedrig");
    expect(query("[data-rolle='entwurf-hinweis']").textContent).toContain("Eingaben wiederhergestellt.");
  });

  it("hält die Prüfung bei einem 502 fest und sendet sie nach dem Neuladen mit derselben Sendung", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));
    await pruefung();
    await click("input[name='pruef-" + P + "'][value='ok']");
    await click("button.ant-btn-primary");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(query("[data-rolle='entwurf-hinweis']").textContent).toMatch(/^Nicht gesendet\./);
    const erste = JSON.parse(String((fetchMock.mock.calls[0][1].body as FormData).get("daten"))).sendung;
    expect(ladeEntwurf(`wartung:pruefung:${G}`)?.sendung?.id).toBe(erste);
    await unmount();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(json({ ok: true, maengel: 0 }));
    await pruefung();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1].body as FormData).get("daten"))).sendung).toBe(erste);
    expect(exists("[data-rolle='pruefung-fertig']")).toBe(true);
    expect(ladeEntwurf(`wartung:pruefung:${G}`)).toBeNull();
  });

  it("eine Ablehnung der Route zeigt ihren Text und behält den Entwurf", async () => {
    fetchMock.mockResolvedValue(json({ ok: false, fehler: "Dieses Gerät gibt es nicht mehr." }, 400));
    await pruefung();
    await click("input[name='pruef-" + P + "'][value='ok']");
    await click("button.ant-btn-primary");
    expect(query("[role='alert']").textContent).toBe("Dieses Gerät gibt es nicht mehr.");
    expect(ladeEntwurf(`wartung:pruefung:${G}`)?.sendung).toBeNull();
    expect(ladeEntwurf(`wartung:pruefung:${G}`)?.stand).toBeTruthy();
  });
});

describe("Mangel am Gerät", () => {
  const mangel = () => mount(<App><MangelAmGeraet geraetId={G} geraetName="Stromerzeuger" mitName /></App>);

  it("stellt Text und Name wieder her", async () => {
    await mangel();
    await fill("textarea[aria-label='Was ist los?']", "Tankdeckel fehlt");
    await fill("input[aria-label='Dein Name']", "Rosa");
    await unmount();
    await mangel();
    expect(query<HTMLTextAreaElement>("textarea[aria-label='Was ist los?']").value).toBe("Tankdeckel fehlt");
    expect(query<HTMLInputElement>("input[aria-label='Dein Name']").value).toBe("Rosa");
  });

  it("ohne Verbindung bleibt die Meldung liegen", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await mangel();
    await fill("textarea[aria-label='Was ist los?']", "Tankdeckel fehlt");
    await click("button.ant-btn-primary");
    expect(query("[data-rolle='entwurf-hinweis']").textContent).toMatch(/^Nicht gesendet\./);
    const e = ladeEntwurf<{ text: string }>(`wartung:mangel:${G}`);
    expect(e?.stand.text).toBe("Tankdeckel fehlt");
    expect(e?.sendung?.id).toBe((fetchMock.mock.calls[0][1].body as FormData).get("sendung"));
  });
});

describe("Betriebsstunden am Gerät", () => {
  const ansicht = () => mount(<App><StundenAmGeraet geraetId={G} geraetName="Stromerzeuger" zuletzt={100} /></App>);

  it("stellt den Stand wieder her und hält ihn bei einem Wurf fest", async () => {
    stunden.mockRejectedValue(new Error("offline"));
    await ansicht();
    await fill("input[aria-label='Stand am Zähler']", "130");
    await unmount();
    await ansicht();
    expect(query<HTMLInputElement>("input[aria-label='Stand am Zähler']").value).toBe("130");
    await click("button.ant-btn-primary");
    expect(stunden).toHaveBeenCalledWith(G, { stunden: 130, sendung: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(ladeEntwurf(`wartung:stunden:${G}`)?.sendung).toBeTruthy();
  });
});

describe("Inhalt am Gerät", () => {
  const ansicht = (stand = "s1") => mount(
    <App><InhaltAmGeraet geraetId={G} geraetName="Kiste" inhalt={[{ id: P, text: "Tupfer", soll: 10, bemerkung: "" }]} stand={stand} /></App>,
  );

  it("stellt die Liste wieder her, solange der Server-Stand derselbe ist", async () => {
    await ansicht();
    await fill("input[aria-label='Position 1: Bemerkung']", "steril");
    await unmount();
    await ansicht();
    expect(query<HTMLInputElement>("input[aria-label='Position 1: Bemerkung']").value).toBe("steril");
    await unmount();
    await ansicht("s2");
    expect(query<HTMLInputElement>("input[aria-label='Position 1: Bemerkung']").value).toBe("");
  });

  it("verwirft den Entwurf nach dem Speichern", async () => {
    inhalt.mockResolvedValue({ ok: true });
    await ansicht();
    await fill("input[aria-label='Position 1: Bemerkung']", "steril");
    await click("button.ant-btn-primary");
    expect(inhalt).toHaveBeenCalledTimes(1);
    expect(ladeEntwurf(`wartung:inhalt:${G}:s1`)).toBeNull();
  });
});

describe("Zurücklegen am Gerät", () => {
  it("ZuruecklegenAmGeraet setzt „wieder da“ auf die offene Menge und schickt offen mit", async () => {
    zurueck.mockResolvedValue({ ok: true });
    const entnahme = {
      id: "e1", wer: "Helfer A", nutzer: "sub-a", zweck: "Übung", ganz: false, seit: Date.UTC(2026, 10, 7, 10),
      positionen: [{ id: P, inhaltId: "i1", text: "Patchkabel", menge: 3, zurueck: 1, offen: 2 }],
    };
    await mount(<App><ZuruecklegenAmGeraet geraetId={G} geraetName="Netzwerkkiste" kiste anleitung="Kurz ansehen." entnahmen={[entnahme]} /></App>);
    expect(query("main, div").textContent).toContain("Kurz ansehen.");
    await click("button[data-rolle='zuruecklegen-senden']");
    expect(zurueck).toHaveBeenCalledTimes(1);
    expect(zurueck.mock.calls[0][0]).toBe(G);
    expect(zurueck.mock.calls[0][1]).toEqual({ entnahmeId: "e1", positionen: [{ positionId: P, zurueck: 2, fehlt: false, offen: 2 }] });
  });

  it("Gerät: „Mangel melden“ schließt erst die Entnahme und geht dann zur Meldung", async () => {
    zurueck.mockResolvedValue({ ok: true });
    const entnahme = {
      id: "e2", wer: "Helfer A", zweck: "", ganz: true, seit: Date.UTC(2026, 10, 7, 10), positionen: [],
    };
    await mount(<App><ZuruecklegenAmGeraet geraetId={G} geraetName="Stromerzeuger" kiste={false} anleitung="" entnahmen={[entnahme]} /></App>);
    await click("button[data-rolle='zuruecklegen-mangel']");
    expect(zurueck).toHaveBeenCalledTimes(1);
    expect(zurueck.mock.calls[0][1]).toEqual({ entnahmeId: "e2", positionen: [] });
    expect(push).toHaveBeenCalledWith(`/g/${G}/mangel`);
  });
});
