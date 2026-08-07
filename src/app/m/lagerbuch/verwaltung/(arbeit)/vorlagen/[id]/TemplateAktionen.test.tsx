// @vitest-environment jsdom

import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  existsPortal,
  mount,
  query,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { TemplateAktionen } from "./TemplateAktionen";

const actions = vi.hoisted(() => ({
  deleteTemplate: vi.fn(),
  renameTemplate: vi.fn(),
  setTemplateAktiv: vi.fn(),
  templateAufFahrzeugeSyncen: vi.fn(),
}));

vi.mock("../../../../_actions/templates", () => actions);

const INTERN = "An error occurred in the Server Components render";
const echtesGetComputedStyle = globalThis.getComputedStyle;

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 30; versuch += 1) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

async function buttonMitText(text: string): Promise<HTMLButtonElement> {
  const knopf = queryAll<HTMLButtonElement>("button")
    .find((element) => element.textContent?.includes(text));
  if (!knopf) throw new Error(`Knopf nicht gefunden: ${text}`);
  return knopf;
}

async function portalButtonMitText(text: string): Promise<HTMLButtonElement> {
  const knopf = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".ant-modal button"))
    .find((element) => element.textContent?.includes(text));
  if (!knopf) throw new Error(`Portal-Knopf nicht gefunden: ${text}`);
  return knopf;
}

async function portalFuellen(selector: string, wert: string): Promise<void> {
  const eingabe = queryPortal<HTMLInputElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(eingabe),
    "value",
  )?.set;
  if (!setter) throw new Error("Kein value-Setter am Portal-Eingabefeld");
  await act(async () => {
    setter.call(eingabe, wert);
    eingabe.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function rendern(): Promise<void> {
  await mount(
    <TemplateAktionen id="t1" name="RTW Nord" aktiv fahrzeuge={3} />,
  );
  await warte();
}

async function umbenennen(neuerName = "RTW Süd"): Promise<void> {
  await clickElement(await buttonMitText("Umbenennen"));
  await warte();
  await portalFuellen(".ant-modal input[aria-label='Name der Vorlage']", neuerName);
  await clickElement(await portalButtonMitText("Speichern"));
  await warte();
}

async function loeschen(): Promise<void> {
  await clickElement(await buttonMitText("Vorlage löschen"));
  await warte();
  await portalFuellen(
    ".ant-modal input[aria-label='Namen zur Bestätigung eingeben']",
    "RTW Nord",
  );
  await clickElement(queryPortal(".ant-modal [data-rolle='loeschen']"));
  await warte();
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.deleteTemplate.mockResolvedValue({ ok: true });
  actions.renameTemplate.mockResolvedValue({ ok: true });
  actions.setTemplateAktiv.mockResolvedValue({ ok: true });
  actions.templateAufFahrzeugeSyncen.mockResolvedValue({
    ok: true,
    wert: {
      fahrzeuge: 2,
      hinzugefuegt: 3,
      aktualisiert: 4,
      uebersprungen: 5,
      entfernt: 6,
      losgeloest: 7,
    },
  });
  vi.stubGlobal("getComputedStyle", (element: Element, pseudo?: string | null) => {
    if (pseudo) {
      return { getPropertyValue: () => "" } as unknown as CSSStyleDeclaration;
    }
    return echtesGetComputedStyle(element);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await unmount();
});

describe("TemplateAktionen", () => {
  it("rendert genau Umbenennen, Aktiv-Schalter, Synchronisieren und Löschen", async () => {
    await rendern();

    expect(queryAll("button")).toHaveLength(4);
    expect(query("button[role='switch']").getAttribute("aria-label")).toBe(
      "Vorlage aktiv",
    );
    expect(document.body.textContent).toContain("Umbenennen");
    expect(document.body.textContent).toContain("Auf alle Fahrzeuge übertragen");
    expect(document.body.textContent).toContain("Vorlage löschen");
  });

  it("benennt exakt um und übernimmt den Namen erst nach Erfolg", async () => {
    await rendern();
    await umbenennen();

    expect(actions.renameTemplate).toHaveBeenCalledWith({ id: "t1", name: "RTW Süd" });
    expect(existsPortal(".ant-modal")).toBe(false);

    await clickElement(await buttonMitText("Umbenennen"));
    await warte();
    expect(queryPortal<HTMLInputElement>(".ant-modal input").value).toBe("RTW Süd");
  });

  it.each([
    ["ok:false", () => actions.renameTemplate.mockResolvedValueOnce({
      ok: false,
      fehler: INTERN,
      feldFehler: { name: "Name darf nicht leer sein" },
    })],
    ["Reject", () => actions.renameTemplate.mockRejectedValueOnce(new Error(INTERN))],
  ])("hält Umbenennen bei %s offen und zeigt nur den festen Fehler", async (_fall, vorbereiten) => {
    vorbereiten();
    await rendern();
    await umbenennen("Neuer Name");

    expect(existsPortal(".ant-modal")).toBe(true);
    expect(queryPortal<HTMLInputElement>(".ant-modal input").value).toBe("Neuer Name");
    expect(document.body.textContent).toContain("Vorlage konnte nicht umbenannt werden.");
    expect(document.body.textContent).not.toContain(INTERN);
  });

  it("bindet den Feldfehler beim Umbenennen direkt an das Namensfeld", async () => {
    actions.renameTemplate.mockResolvedValueOnce({
      ok: false,
      fehler: INTERN,
      feldFehler: { name: "Name darf nicht leer sein" },
    });
    await rendern();
    await umbenennen("");

    await warteAuf(
      () => document.body.querySelector(".ant-form-item-explain-error") !== null,
      "Feldfehler am Namen",
    );
    expect(queryPortal(".ant-form-item-explain-error").textContent).toBe(
      "Name darf nicht leer sein",
    );
  });

  it("ändert den Aktivstatus mit exaktem Payload erst nach Erfolg", async () => {
    await rendern();
    await clickElement(query("button[role='switch']"));
    await warte();

    expect(actions.setTemplateAktiv).toHaveBeenCalledWith({ id: "t1", aktiv: false });
    expect(query("button[role='switch']").getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toContain("inaktiv");
  });

  it.each([
    ["ok:false", () => actions.setTemplateAktiv.mockResolvedValueOnce({ ok: false, fehler: INTERN })],
    ["Reject", () => actions.setTemplateAktiv.mockRejectedValueOnce(new Error(INTERN))],
  ])("behält den Aktivstatus bei %s und zeigt nur den festen Fehler", async (_fall, vorbereiten) => {
    vorbereiten();
    await rendern();
    await clickElement(query("button[role='switch']"));
    await warte();

    expect(query("button[role='switch']").getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).toContain("Vorlagenstatus konnte nicht geändert werden.");
    expect(document.body.textContent).not.toContain(INTERN);
  });

  it("zeigt alle sechs Synchronisationszähler", async () => {
    await rendern();
    await clickElement(await buttonMitText("Auf alle Fahrzeuge übertragen"));
    await warte();

    expect(actions.templateAufFahrzeugeSyncen).toHaveBeenCalledWith({ templateId: "t1" });
    expect(document.body.textContent).toContain(
      "2 Fahrzeug(e): 3 hinzugefügt, 4 aktualisiert, 5 übersprungen, 6 entfernt, 7 losgelöst.",
    );
  });

  it.each([
    ["ok:false", () => actions.templateAufFahrzeugeSyncen.mockResolvedValueOnce({
      ok: false,
      fehler: INTERN,
    })],
    ["Reject", () => actions.templateAufFahrzeugeSyncen.mockRejectedValueOnce(new Error(INTERN))],
  ])("zeigt bei Sync-%s nur den festen Fehler und keine alte Zusammenfassung", async (_fall, vorbereiten) => {
    vorbereiten();
    await rendern();
    await clickElement(await buttonMitText("Auf alle Fahrzeuge übertragen"));
    await warte();

    expect(document.body.textContent).toContain("Vorlage konnte nicht synchronisiert werden.");
    expect(document.body.textContent).not.toContain("Fahrzeug(e):");
    expect(document.body.textContent).not.toContain(INTERN);
  });

  it("zeigt im Löschdialog den vollständigen Fahrzeug-Hinweis", async () => {
    await rendern();
    await clickElement(await buttonMitText("Vorlage löschen"));
    await warte();

    expect(document.body.textContent).toContain(
      "3 Fahrzeug(e) werden von dieser Vorlage gelöst; ihre Positionen bleiben als individuelle Bestückung erhalten.",
    );
  });

  it.each([
    ["ok:false", () => actions.deleteTemplate.mockResolvedValueOnce({ ok: false, fehler: INTERN })],
    ["Reject", () => actions.deleteTemplate.mockRejectedValueOnce(new Error(INTERN))],
  ])("hält den Löschdialog bei %s offen und zeigt nur den festen Fehler", async (_fall, vorbereiten) => {
    vorbereiten();
    await rendern();
    await loeschen();

    expect(actions.deleteTemplate).toHaveBeenCalledWith({ id: "t1" });
    expect(existsPortal(".ant-modal")).toBe(true);
    expect(document.body.textContent).toContain("Vorlage konnte nicht gelöscht werden.");
    expect(document.body.textContent).not.toContain(INTERN);
  });

  it("schließt den Löschdialog ausschließlich nach Erfolg", async () => {
    await rendern();
    await loeschen();

    expect(actions.deleteTemplate).toHaveBeenCalledWith({ id: "t1" });
    expect(existsPortal(".ant-modal")).toBe(false);
  });

  it("importiert exakt die vier Actions, keinen generischen Löschpfad und nutzt Alert.title", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/TemplateAktionen.tsx",
      "utf8",
    );
    for (const name of [
      "deleteTemplate",
      "renameTemplate",
      "setTemplateAktiv",
      "templateAufFahrzeugeSyncen",
    ]) {
      expect(quelle).toContain(name);
    }
    expect(quelle).not.toMatch(/loescheElement|Alert[^>]*\bmessage=/);
    expect(quelle).toMatch(/<Alert[\s\S]*?\btitle=/);
  });
});
