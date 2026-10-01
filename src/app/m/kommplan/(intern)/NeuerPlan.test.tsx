// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { click, existsPortal, fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

const aktion = vi.hoisted(() => ({ legePlanAnAction: vi.fn() }));
vi.mock("../_actions/plan", () => aktion);
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { NeuerPlan, NeuerPlanFormular } from "./NeuerPlan";

afterEach(async () => { await unmount(); aktion.legePlanAnAction.mockReset(); router.push.mockReset(); });

describe("Neuer Plan", () => {
  it("der Knopf öffnet das Flyin", async () => {
    await mount(<NeuerPlan />);
    await click("button[data-neu]");
    expect(existsPortal('form[aria-label="Neuer Plan"]')).toBe(true);
  });
  it("sendet Titel, Art, Anlass und Datum und meldet die neue ID", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: true, id: "p-neu" });
    const angelegt = vi.fn();
    await mount(<NeuerPlanFormular onAngelegt={angelegt} onAbbrechen={() => {}} />);
    await fill('input[name="titel"]', "Übung Nord");
    await fill('input[name="anlass"]', "Probe");
    await submitForm();
    await act(async () => {});
    expect(aktion.legePlanAnAction).toHaveBeenCalledWith({ titel: "Übung Nord", typ: "kommunikationsplan", anlass: "Probe", datum: null, vorlage: null });
    expect(angelegt).toHaveBeenCalledWith("p-neu");
  });
  it("Feldfehler stehen am Feld, nicht rot, mit aria-invalid", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "Bitte einen Titel eintragen." } });
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} />);
    await submitForm();
    await act(async () => {});
    expect(query('input[name="titel"]').getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("Bitte einen Titel eintragen.");
    expect(document.querySelector(".ant-alert-error")).toBeNull();
  });
  it("auch das Datum: aria-invalid und aria-describedby zeigen auf den Fehlertext", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { datum: "Diesen Tag gibt es nicht." } });
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} />);
    await fill('input[name="titel"]', "X");
    await submitForm();
    await act(async () => {});
    // antd legt die id des DatePicker auf das <input>; der Greifer geht über die Beschriftung, nicht über eine antd-Klasse
    const datum = query<HTMLInputElement>(`#${CSS.escape(query("label[for$='-datum']").getAttribute("for")!)}`);
    expect(datum.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(datum.getAttribute("aria-describedby")!)?.textContent).toBe("Diesen Tag gibt es nicht.");
  });
  it("ein Wurf (keine Verbindung, Recht entzogen) wird ein Hinweis, kein Absturz", async () => {
    aktion.legePlanAnAction.mockRejectedValue(new Error("Forbidden"));
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} />);
    await fill('input[name="titel"]', "X");
    await submitForm();
    await act(async () => {});
    expect(document.body.textContent).toContain("Der Plan ließ sich nicht anlegen.");
  });
  it("Vorlage wählen: Art und Anlass übernommen, Datum heute, Datum im Titel ersetzt, die Vorlage geht mit", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: true, id: "neu" });
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} heute="2026-10-01" startVorlage="v1"
      vorlagen={[{ id: "v1", titel: "Kommunikationsplan Einsatz 22.02.2026", typ: "fernmeldeskizze", anlass: "Großübung" }]} />);
    expect(query<HTMLInputElement>('input[name="titel"]').value).toBe("Kommunikationsplan Einsatz 01.10.2026");
    expect(query<HTMLInputElement>('input[name="anlass"]').value).toBe("Großübung");
    await submitForm('form[aria-label="Neuer Plan"]');
    await act(async () => {});
    expect(aktion.legePlanAnAction).toHaveBeenCalledWith({
      titel: "Kommunikationsplan Einsatz 01.10.2026", typ: "fernmeldeskizze", anlass: "Großübung", datum: "2026-10-01", vorlage: "v1",
    });
  });
  it("eine Vorlage ohne Datum im Titel behält ihren Titel — kein „ (Kopie)“", async () => {
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} heute="2026-10-01" startVorlage="v1"
      vorlagen={[{ id: "v1", titel: "Fernmeldeskizze Stab", typ: "fernmeldeskizze", anlass: null }]} />);
    expect(query<HTMLInputElement>('input[name="titel"]').value).toBe("Fernmeldeskizze Stab");
  });
  it("ohne Vorlage: vorlage null, Datum leer, wie bisher", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: true, id: "neu" });
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} vorlagen={[]} heute="2026-10-01" />);
    await fill('input[name="titel"]', "Leer");
    await submitForm('form[aria-label="Neuer Plan"]');
    await act(async () => {});
    expect(aktion.legePlanAnAction).toHaveBeenCalledWith(expect.objectContaining({ vorlage: null, datum: null }));
  });
});
