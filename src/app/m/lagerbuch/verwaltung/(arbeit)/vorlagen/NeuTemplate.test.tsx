// @vitest-environment jsdom

import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  mount,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { NeuTemplate } from "./NeuTemplate";

const mocks = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../_actions/templates", () => ({
  createTemplate: (...args: unknown[]) => mocks.createTemplate(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 30; versuch++) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

function knopfMitText(text: string): HTMLElement {
  const knopf = queryAll<HTMLElement>("button")
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf nicht gefunden: ${text}`);
  return knopf;
}

async function oeffnen(): Promise<void> {
  await clickElement(knopfMitText("Neue Vorlage"));
  await warteAuf(
    () => document.body.querySelector("[role='dialog']") !== null,
    "Dialog für eine neue Vorlage",
  );
}

async function nameEintragen(name: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>("[aria-label='Name']");
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error("Kein value-Setter für den Namen");
  await act(async () => {
    setter.call(input, name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function absenden(): Promise<void> {
  const form = queryPortal<HTMLFormElement>("[data-rolle='neue-vorlage']");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTemplate.mockResolvedValue({ ok: true, wert: { id: "template-neu" } });
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await unmount();
});

describe("NeuTemplate", () => {
  it("ist eine echte Client-Insel und verwendet Alert.title statt der entfernten message-API", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/NeuTemplate.tsx",
      "utf8",
    );
    expect(quelle.split(/\r?\n/, 1)[0]).toBe('"use client";');
    expect(quelle).toMatch(/<Alert[\s\S]*\btitle=\{fehler\}/);
    expect(quelle).not.toMatch(/<Alert[\s\S]*\bmessage=/);
  });

  it("sendet den Namen und leert, schließt sowie aktualisiert nur nach Erfolg", async () => {
    await mount(<NeuTemplate />);
    await oeffnen();
    await nameEintragen("RTW Standard");
    await absenden();
    await warteAuf(() => mocks.createTemplate.mock.calls.length === 1, "Template-Action");

    expect(mocks.createTemplate).toHaveBeenCalledWith({ name: "RTW Standard" });
    await warteAuf(
      () => document.body.querySelector("[role='dialog']") === null,
      "geschlossener Vorlagendialog",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await oeffnen();
    expect(queryPortal<HTMLInputElement>("[aria-label='Name']").value).toBe("");
  });

  it("bindet bekannte Feldfehler, warnt allgemein und erhält Dialog sowie Wert", async () => {
    mocks.createTemplate.mockResolvedValueOnce({
      ok: false,
      fehler: "Vorlage konnte fachlich nicht angelegt werden.",
      feldFehler: {
        name: "Name ist bereits vergeben.",
        unbekannt: "Phantomfeld darf nicht erscheinen.",
      },
    });
    await mount(<NeuTemplate />);
    await oeffnen();
    await nameEintragen("RTW Standard");
    await absenden();

    await warteAuf(
      () => (document.body.textContent ?? "").includes("Name ist bereits vergeben."),
      "Feldfehler am Namen",
    );
    expect(queryPortal(".ant-form-item-explain-error").textContent)
      .toBe("Name ist bereits vergeben.");
    expect(queryPortal(".ant-alert-warning").textContent)
      .toBe("Vorlage konnte fachlich nicht angelegt werden.");
    expect(document.body.textContent).not.toContain("Phantomfeld");
    expect(queryPortal<HTMLInputElement>("[aria-label='Name']").value).toBe("RTW Standard");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("zeigt bei einem Runtimefehler nur den festen sicheren Hinweis", async () => {
    mocks.createTemplate.mockRejectedValueOnce(new Error("internes Framework-Geheimnis"));
    await mount(<NeuTemplate />);
    await oeffnen();
    await nameEintragen("RTW Standard");
    await absenden();

    await warteAuf(
      () => (document.body.textContent ?? "").includes("Vorlage konnte nicht angelegt werden."),
      "fester Runtimefehler",
    );
    expect(queryPortal(".ant-alert-warning").textContent)
      .toBe("Vorlage konnte nicht angelegt werden.");
    expect(document.body.textContent).not.toContain("internes Framework-Geheimnis");
    expect(queryPortal<HTMLInputElement>("[aria-label='Name']").value).toBe("RTW Standard");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
