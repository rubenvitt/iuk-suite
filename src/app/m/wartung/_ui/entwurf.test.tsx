// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";
import { fillElement, mount, queryPortal, unmount, clickElement } from "@/app/m/qr/_lib/test-dom";

const speichern = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../_actions/verwaltung", () => ({
  artSpeichernAction: (...a: unknown[]) => speichern(...a),
  artLoeschenAction: vi.fn(),
}));

import { ArtenVerwaltung } from "./ArtenVerwaltung";
import { GeraetFormular, type GeraetWerte } from "./GeraetFormular";

/**
 * IDA-358 — Verwaltungsdialoge der Wartung: was im Dialog getippt ist, übersteht Abbrechen und Neuladen und steht
 * beim nächsten Öffnen wieder da; nach bestätigtem Speichern ist der Entwurf weg.
 */
const START: GeraetWerte = {
  gruppeId: "g1", artId: "a1", name: "", hersteller: "", typ: "", seriennr: "", ortArt: "lager", ort: "", fahrzeugId: null, stunden: null, hinweise: "", pruefanleitung: "",
};

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  speichern.mockReset();
});
afterEach(async () => { await unmount(); });

const formular = () => mount(
  <App>
    <GeraetFormular
      entwurfSchluessel="wartung:geraet:neu" offen titel="Gerät anlegen" start={START} gruppen={[{ id: "g1", name: "IuK" }]}
      arten={[{ id: "a1", einzahl: "Stromerzeuger" }]} orte={{ lager: [], fahrzeug: [] }} fahrzeuge={[]} laeuft={false} feldFehler={{}}
      onAbbrechen={() => {}} onSpeichern={() => {}}
    />
  </App>,
);

describe("GeraetFormular (Modus 2)", () => {
  it("stellt die Eingaben beim nächsten Öffnen wieder her", async () => {
    await formular();
    await fillElement(queryPortal<HTMLInputElement>("#gw-name"), "Stromerzeuger 5 kVA");
    await unmount();
    await formular();
    expect(queryPortal<HTMLInputElement>("#gw-name").value).toBe("Stromerzeuger 5 kVA");
    expect(queryPortal("[data-rolle='entwurf-hinweis']").textContent).toContain("Eingaben wiederhergestellt.");
  });
});

describe("ArtenVerwaltung (Modus 2)", () => {
  const ansicht = () => mount(<App><ArtenVerwaltung arten={[]} katalog={[]} /></App>);
  const oeffnen = async () => {
    const knopf = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Geräteart anlegen"))!;
    await clickElement(knopf);
  };

  it("bloßes Öffnen legt keinen Entwurf an; Getipptes kommt nach dem Neuladen wieder; Speichern räumt ihn", async () => {
    await ansicht();
    await oeffnen();
    expect(ladeEntwurf("wartung:art:neu")).toBeNull();
    await fillElement(queryPortal<HTMLInputElement>("#gw-art-name"), "Stromerzeuger");
    expect(ladeEntwurf("wartung:art:neu")).not.toBeNull();
    await unmount();

    await ansicht();
    await oeffnen();
    expect(queryPortal<HTMLInputElement>("#gw-art-name").value).toBe("Stromerzeuger");

    speichern.mockResolvedValue({ ok: true });
    const ok = Array.from(document.querySelectorAll<HTMLButtonElement>(".ant-modal-footer button")).find((b) => b.textContent?.includes("Speichern"))!;
    await clickElement(ok);
    expect(speichern).toHaveBeenCalledTimes(1);
    expect(ladeEntwurf("wartung:art:neu")).toBeNull();
  });
});
