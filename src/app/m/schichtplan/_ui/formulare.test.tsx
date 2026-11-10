// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, fillElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";

const helferSpeichern = vi.fn();
vi.mock("../_actions/planung", () => ({
  einheitSpeichernAction: vi.fn(),
  planungSpeichernAction: vi.fn(),
  tempHelferSpeichernAction: (...a: unknown[]) => helferSpeichern(...a),
}));

import { EinheitFormular, PlanungFormular, TempFormular } from "./formulare";

/** IDA-358 — die Flyin-Formulare des Schichtplans behalten ihre Eingaben auf dem Gerät. */
beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  helferSpeichern.mockReset();
});
afterEach(async () => { await unmount(); });

const formular = (onPlanung = vi.fn()) => mount(<App><TempFormular planId="p1" helfer={null} katalog={[]} onPlanung={onPlanung} /></App>);
const felder = () => Array.from(document.querySelectorAll<HTMLInputElement>("input.ant-input"));

describe("TempFormular (Modus 2)", () => {
  it("blosses Oeffnen legt nichts ab; Getipptes uebersteht das Neuladen; Speichern raeumt", async () => {
    await formular();
    expect(ladeEntwurf("schichtplan:helfer:p1:neu")).toBeNull();
    await fillElement(felder()[0]!, "Rosa");
    await fillElement(felder()[1]!, "Braunuele");
    await unmount();

    await formular();
    expect(felder()[0]!.value).toBe("Rosa");
    expect(felder()[1]!.value).toBe("Braunuele");
    expect(query("[data-rolle='entwurf-hinweis']").textContent).toContain("Eingaben wiederhergestellt.");

    helferSpeichern.mockResolvedValue({ ok: true, wert: { id: "p1" } });
    const knopf = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Anlegen")!;
    await clickElement(knopf);
    expect(helferSpeichern).toHaveBeenCalledTimes(1);
    expect(ladeEntwurf("schichtplan:helfer:p1:neu")).toBeNull();
  });

  it("ein abgelehntes Speichern laesst den Entwurf liegen", async () => {
    helferSpeichern.mockResolvedValue({ ok: false, fehler: "Nachname fehlt.", feldFehler: {} });
    await formular();
    await fillElement(felder()[0]!, "Rosa");
    await fillElement(felder()[1]!, "B");
    const knopf = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Anlegen")!;
    await clickElement(knopf);
    expect(ladeEntwurf("schichtplan:helfer:p1:neu")).not.toBeNull();
  });
});

describe("PlanungFormular und EinheitFormular (Modus 2)", () => {
  it("die Planung stellt Name und Ort nach dem Neuladen wieder her", async () => {
    const ansicht = () => mount(<App><PlanungFormular planung={null} fahrzeuge={[]} onGespeichert={vi.fn()} /></App>);
    await ansicht();
    await fillElement(felder()[0]!, "Stadtfest");
    await fillElement(felder()[1]!, "Uelzen");
    await unmount();
    await ansicht();
    expect(felder()[0]!.value).toBe("Stadtfest");
    expect(felder()[1]!.value).toBe("Uelzen");
  });

  it("„Planung anlegen“ ist nie grau und sagt am Feld, was fehlt (IDA-385)", async () => {
    const { planungSpeichernAction } = await import("../_actions/planung");
    await mount(<App><PlanungFormular planung={null} fahrzeuge={[]} onGespeichert={vi.fn()} /></App>);
    const knopf = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Planung anlegen")!;
    expect(knopf.disabled).toBe(false);
    await clickElement(knopf);
    const meldungen = Array.from(document.querySelectorAll("[role='alert']")).map((x) => x.textContent);
    expect(meldungen).toEqual(expect.arrayContaining(["Bitte einen Namen eintragen.", "Bitte Beginn und Ende wählen."]));
    expect(planungSpeichernAction).not.toHaveBeenCalled();
    await fillElement(felder()[0]!, "Stadtfest");
    expect(Array.from(document.querySelectorAll("[role='alert']")).map((x) => x.textContent)).not.toContain("Bitte einen Namen eintragen.");
  });

  it("ein Abschnitt stellt seinen Namen je Planung wieder her", async () => {
    const ansicht = () => mount(<App><EinheitFormular planId="p1" einheit={null} fahrzeuge={[]} katalog={[]} einteilungen={0} onPlanung={vi.fn()} /></App>);
    await ansicht();
    await fillElement(felder()[0]!, "Sanitaetswache Markt");
    await unmount();
    await ansicht();
    expect(felder()[0]!.value).toBe("Sanitaetswache Markt");
    expect(ladeEntwurf("schichtplan:einheit:p1:neu")).not.toBeNull();
  });
});
