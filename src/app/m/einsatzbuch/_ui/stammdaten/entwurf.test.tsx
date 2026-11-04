// @vitest-environment jsdom
import { App } from "antd";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillElement, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { entwurfSchluessel, ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";

const a = vi.hoisted(() => ({ fahrzeug: vi.fn(), quali: vi.fn(), einstellungen: vi.fn() }));
vi.mock("../../_actions/stammdaten", () => ({
  fahrzeugSpeichernAction: (...x: unknown[]) => a.fahrzeug(...x),
  personSpeichernAction: vi.fn(),
  stichwortSpeichernAction: vi.fn(),
  qualifikationSpeichernAction: (...x: unknown[]) => a.quali(...x),
}));
vi.mock("../../_actions/einstellungen", () => ({ einstellungenSpeichernAction: (...x: unknown[]) => a.einstellungen(...x) }));

import { EinstellungenFormular } from "../EinstellungenFormular";
import { QualifikationFormular } from "./QualifikationFormular";
import { StammdatenFormular } from "./StammdatenFormular";

/** IDA-358: der Schluessel eines Bearbeiten-Entwurfs traegt den Fingerabdruck des Serverstands. */
const entwurfZu = (anfang: string) => {
  const k = entwurfSchluessel().find((x) => x.startsWith(anfang) && !x.endsWith(":wahl"));
  return k ? ladeEntwurf(k) : null;
};

/** IDA-358 — die Verwaltungsformulare des Einsatzbuchs behalten ihre Eingaben auf dem Gerät. */
beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  a.fahrzeug.mockReset(); a.quali.mockReset(); a.einstellungen.mockReset();
});
afterEach(async () => { await unmount(); });

const felder = () => Array.from(document.querySelectorAll<HTMLInputElement>("input.ant-input, input.ant-input-number-input"));
const hinweis = () => query("[data-rolle='entwurf-hinweis']").textContent;

describe("StammdatenFormular (Modus 2)", () => {
  const ansicht = (onGespeichert = vi.fn()) =>
    mount(<StammdatenFormular art="fahrzeuge" eintrag={null} qualifikationen={[]} onGespeichert={onGespeichert} onAbbrechen={() => {}} />);

  it("Getipptes übersteht Neuladen und gescheitertes Speichern; Erfolg räumt", async () => {
    a.fahrzeug.mockRejectedValueOnce(new Error("502"));
    await ansicht();
    expect(ladeEntwurf("einsatzbuch:fahrzeuge:neu")).toBeNull();
    await fillElement(felder()[0]!, "RTW");
    await fillElement(felder()[2]!, "Rotkreuz Uelzen 92-2");
    await submitForm();
    await act(async () => {});
    await unmount();

    await ansicht();
    expect(felder()[0]!.value).toBe("RTW");
    expect(felder()[2]!.value).toBe("Rotkreuz Uelzen 92-2");
    expect(hinweis()).toContain("Eingaben wiederhergestellt.");

    a.fahrzeug.mockResolvedValue({ ok: true, wert: {} });
    await submitForm();
    await act(async () => {});
    expect(ladeEntwurf("einsatzbuch:fahrzeuge:neu")).toBeNull();
  });
});

describe("QualifikationFormular (Modus 2)", () => {
  it("stellt Kurzform und Bezeichnung wieder her", async () => {
    const ansicht = () => mount(<QualifikationFormular eintrag={null} vorschlagRang={3} anzahl={0} onGespeichert={() => {}} onAbbrechen={() => {}} />);
    await ansicht();
    await fillElement(felder()[0]!, "RS");
    await fillElement(felder()[1]!, "Rettungssanitäter");
    await unmount();
    await ansicht();
    expect(felder()[0]!.value).toBe("RS");
    expect(felder()[1]!.value).toBe("Rettungssanitäter");
  });
});

describe("EinstellungenFormular (Modus 2)", () => {
  const START = { fristMinuten: 15, besatzung: true, bereitschaft: "DRK-Bereitschaft Uelzen" };
  const ansicht = () => mount(<App><EinstellungenFormular start={START} /></App>);

  it("stellt den Namen wieder her; nach dem Speichern steht der neue Stand ohne Entwurf da", async () => {
    await ansicht();
    await fillElement(query<HTMLInputElement>("#einstellung-bereitschaft"), "DRK Bad Bevensen");
    await unmount();
    await ansicht();
    expect(query<HTMLInputElement>("#einstellung-bereitschaft").value).toBe("DRK Bad Bevensen");

    a.einstellungen.mockResolvedValue({ ok: true });
    await submitForm();
    await act(async () => {});
    expect(query<HTMLInputElement>("#einstellung-bereitschaft").value).toBe("DRK Bad Bevensen");
    expect(entwurfZu("einsatzbuch:einstellungen")).toBeNull();
    expect(document.querySelector("[data-rolle='entwurf-hinweis']")).toBeNull();
  });
});
