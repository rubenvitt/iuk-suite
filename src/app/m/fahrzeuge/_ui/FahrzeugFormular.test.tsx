// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillElement, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";

const speichern = vi.hoisted(() => vi.fn());
vi.mock("../_actions/verwaltung", () => ({ fahrzeugSpeichernAction: (...a: unknown[]) => speichern(...a) }));

import { FahrzeugFormular } from "./FahrzeugFormular";

/** IDA-358 — das Fahrzeugformular behält seine Eingaben auf dem Gerät, bis das Speichern bestätigt ist. */
beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  speichern.mockReset();
});
afterEach(async () => { await unmount(); });

const felder = () => Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input.ant-input, textarea"));

describe("FahrzeugFormular (Modus 2)", () => {
  it("Getipptes übersteht Neuladen und gescheitertes Speichern; Erfolg räumt", async () => {
    speichern.mockRejectedValueOnce(new Error("502"));
    const ansicht = () => mount(<FahrzeugFormular eintrag={null} onFertig={() => {}} />);
    await ansicht();
    expect(ladeEntwurf("fahrzeuge:fahrzeug:neu")).toBeNull();
    await fillElement(felder()[0]!, "RTW");
    await fillElement(felder()[5]!, "Rosa Braunüle fehlt");
    await submitForm();
    await act(async () => {});
    await unmount();

    await ansicht();
    expect(felder()[0]!.value).toBe("RTW");
    expect(felder()[5]!.value).toBe("Rosa Braunüle fehlt");
    expect(query("[data-rolle='entwurf-hinweis']").textContent).toContain("Eingaben wiederhergestellt.");

    speichern.mockResolvedValue({ ok: true, wert: {} });
    await submitForm();
    await act(async () => {});
    expect(ladeEntwurf("fahrzeuge:fahrzeug:neu")).toBeNull();
  });
});
