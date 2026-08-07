// @vitest-environment jsdom

import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  mount,
  query,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  templateFilter,
  TemplateVerknuepfung,
} from "./TemplateVerknuepfung";

const mocks = vi.hoisted(() => ({
  zuweisen: vi.fn(),
  sync: vi.fn(),
  loesen: vi.fn(),
  ausFahrzeug: vi.fn(),
}));

vi.mock("../../../../_actions/templates", () => ({
  fahrzeugTemplateZuweisen: (...args: unknown[]) => mocks.zuweisen(...args),
  fahrzeugTemplateSync: (...args: unknown[]) => mocks.sync(...args),
  fahrzeugTemplateLoesen: (...args: unknown[]) => mocks.loesen(...args),
  templateAusFahrzeug: (...args: unknown[]) => mocks.ausFahrzeug(...args),
}));

const VORLAGEN = [
  { id: "tpl-alt", name: "Aktuelle Altvorlage" },
  { id: "tpl-neu", name: "Vorlage Neu" },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 20; versuch += 1) {
    if (pruefen()) return;
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

function knopf(text: string, portal = false): HTMLButtonElement {
  const wurzel: ParentNode = portal ? document.body : query("[data-rolle='template-verknuepfung']");
  const treffer = Array.from(wurzel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => (button.textContent ?? "").includes(text));
  if (!treffer) throw new Error(`Knopf nicht gefunden: ${text}`);
  return treffer;
}

async function waehleVorlage(text: string): Promise<void> {
  const input = query<HTMLInputElement>("[aria-label='Vorlage']");
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-select-item-option",
  )).find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Vorlage nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

async function loesenBestaetigen(): Promise<void> {
  await clickElement(knopf("Verknüpfung lösen"));
  await warte();
  const bestaetigen = Array.from(document.body.querySelectorAll<HTMLButtonElement>(
    ".ant-popconfirm-buttons button",
  )).find((button) => (button.textContent ?? "").includes("Lösen"));
  if (!bestaetigen) throw new Error("Lösen-Bestätigung fehlt");
  await clickElement(bestaetigen);
  await warte();
}

async function modalOeffnen(): Promise<void> {
  await clickElement(knopf("Vorlage aus diesem Fahrzeug erstellen"));
  await warte();
  expect(queryPortal(".ant-modal-title").textContent)
    .toBe("Vorlage aus Fahrzeug erstellen");
}

async function modalName(wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(".ant-modal input[aria-label='Vorlagenname']");
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error("Kein value-Setter am Namensfeld");
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function modalAbsenden(): Promise<void> {
  const form = queryPortal<HTMLFormElement>(".ant-modal form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await warte();
}

async function mounten(hatPositionen = true): Promise<void> {
  await mount(
    <TemplateVerknuepfung
      fahrzeugId="fz-1"
      aktuelleVorlage={{ id: "tpl-alt", name: "Aktuelle Altvorlage" }}
      vorlagen={VORLAGEN}
      hatPositionen={hatPositionen}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.zuweisen.mockResolvedValue({ ok: true, wert: {} });
  mocks.sync.mockResolvedValue({ ok: true, wert: {} });
  mocks.loesen.mockResolvedValue({ ok: true });
  mocks.ausFahrzeug.mockResolvedValue({ ok: true, wert: { id: "tpl-aus-fz" } });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("TemplateVerknuepfung — vier Actions und fuenf Bedienelemente", () => {
  it("zeigt auch eine inaktive aktuelle Vorlage benannt und entfernt sie aus den Alternativen", async () => {
    await mounten();

    expect(query("[data-rolle='aktuelle-vorlage']").textContent)
      .toContain("Aktuelle Altvorlage");
    await act(async () => {
      query("[aria-label='Vorlage']")
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await warte();
    const optionen = Array.from(document.body.querySelectorAll<HTMLElement>(
      ".ant-select-item-option",
    )).map((option) => option.textContent);
    expect(optionen).toEqual(["Vorlage Neu"]);
  });

  it("rendert Select plus genau vier fachliche Action-Ausgaenge", async () => {
    await mounten();
    expect(query("[aria-label='Vorlage']")).toBeTruthy();
    expect([
      "Verknüpfen",
      "Erneut übertragen",
      "Verknüpfung lösen",
      "Vorlage aus diesem Fahrzeug erstellen",
    ].map((text) => knopf(text).textContent?.includes(text))).toEqual([
      true,
      true,
      true,
      true,
    ]);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/TemplateVerknuepfung.tsx",
      "utf8",
    );
    expect(quelle).toContain("fahrzeugTemplateZuweisen");
    expect(quelle).toContain("fahrzeugTemplateSync");
    expect(quelle).toContain("fahrzeugTemplateLoesen");
    expect(quelle).toContain("templateAusFahrzeug");
    expect(quelle).not.toContain("templateAufFahrzeugeSyncen");
  });

  it("filtert den typed Select explizit ueber sein Label", () => {
    expect(templateFilter("neu", { value: "tpl-neu", label: "Vorlage Neu" })).toBe(true);
    expect(templateFilter("alt", { value: "tpl-neu", label: "Vorlage Neu" })).toBe(false);
  });
});

describe("TemplateVerknuepfung — Zuweisen, Sync und Loesen", () => {
  it("weist die gewaehlte Vorlage zu und leert die Auswahl nur bei Erfolg", async () => {
    await mounten();
    await waehleVorlage("Vorlage Neu");
    await clickElement(knopf("Verknüpfen"));
    await warte();

    expect(mocks.zuweisen).toHaveBeenCalledWith({
      fahrzeugId: "fz-1",
      templateId: "tpl-neu",
    });
    expect(query(".ant-select").textContent).not.toContain("Vorlage Neu");
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("behaelt bei Zuweisen-%s die Auswahl und zeigt den festen Fehler", async (
    _fall,
    antwort,
  ) => {
    mocks.zuweisen.mockImplementationOnce(antwort);
    await mounten();
    await waehleVorlage("Vorlage Neu");
    await clickElement(knopf("Verknüpfen"));
    await warte();

    expect(query(".ant-select").textContent).toContain("Vorlage Neu");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Vorlage konnte nicht verknüpft werden.");
  });

  it("ruft Sync und Loesen mit der Fahrzeug-ID", async () => {
    await mounten();
    await clickElement(knopf("Erneut übertragen"));
    await warte();
    await loesenBestaetigen();

    expect(mocks.sync).toHaveBeenCalledWith({ fahrzeugId: "fz-1" });
    expect(mocks.loesen).toHaveBeenCalledWith({ fahrzeugId: "fz-1" });
  });

  it.each([
    ["sync", "Vorlage konnte nicht erneut übertragen werden."],
    ["loesen", "Vorlagenverknüpfung konnte nicht gelöst werden."],
  ] as const)("zeigt beim fehlgeschlagenen %s den festen Warning-Text", async (
    aktion,
    text,
  ) => {
    mocks[aktion].mockResolvedValueOnce({ ok: false, fehler: "interner Text" });
    await mounten();
    if (aktion === "sync") {
      await clickElement(knopf("Erneut übertragen"));
      await warte();
    } else await loesenBestaetigen();
    expect(query(".ant-alert-warning").textContent).toContain(text);
  });

  it("blockiert einen zweiten Actionstart waehrend der erste noch laeuft", async () => {
    let fertig!: (wert: { ok: true; wert: object }) => void;
    mocks.sync.mockReturnValueOnce(new Promise((resolve) => { fertig = resolve; }));
    await mounten();
    const sync = knopf("Erneut übertragen");
    await clickElement(sync);
    await clickElement(sync);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    await act(async () => { fertig({ ok: true, wert: {} }); });
    await warte();
  });
});

describe("TemplateVerknuepfung — Vorlage aus Fahrzeug", () => {
  it("laesst den Ausgang ohne aktive Positionen sichtbar erklaert, aber deaktiviert", async () => {
    await mounten(false);
    const erstellen = knopf("Vorlage aus diesem Fahrzeug erstellen");
    expect(erstellen.disabled).toBe(true);
    expect(query("[data-rolle='keine-positionen']").textContent)
      .toContain("aktive Soll-Position");
  });

  it("bindet Name und Checkbox direkt und sendet den exakten Payload", async () => {
    await mounten();
    await modalOeffnen();
    await modalName("Vorlage aus RTW");
    const checkbox = queryPortal<HTMLInputElement>(
      ".ant-modal input[aria-label='Neue Vorlage verknüpfen']",
    );
    expect(checkbox.checked).toBe(true);
    await clickElement(checkbox);
    await modalAbsenden();

    expect(mocks.ausFahrzeug).toHaveBeenCalledWith({
      fahrzeugId: "fz-1",
      name: "Vorlage aus RTW",
      verknuepfen: false,
    });
    expect(document.body.querySelector(".ant-modal-content")).toBeNull();
  });

  it("bindet Feldfehler an den Namen und behaelt Modal sowie Werte", async () => {
    mocks.ausFahrzeug.mockResolvedValueOnce({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { name: "Name darf nicht leer sein" },
    });
    await mounten();
    await modalOeffnen();
    await modalName(" ");
    await modalAbsenden();

    expect(mocks.ausFahrzeug).toHaveBeenCalledWith({
      fahrzeugId: "fz-1",
      name: " ",
      verknuepfen: true,
    });
    await warteAuf(
      () => document.body.querySelector(".ant-form-item-explain-error") !== null,
      "Feldfehler am Vorlagennamen",
    );
    expect(queryPortal(".ant-form-item-explain-error").textContent)
      .toBe("Name darf nicht leer sein");
    expect(queryPortal<HTMLInputElement>(".ant-modal input[aria-label='Vorlagenname']").value)
      .toBe(" ");
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("behaelt Modal, Name und Checkbox bei %s offen", async (_fall, antwort) => {
    mocks.ausFahrzeug.mockImplementationOnce(antwort);
    await mounten();
    await modalOeffnen();
    await modalName("Vorlage bleibt");
    const checkbox = queryPortal<HTMLInputElement>(
      ".ant-modal input[aria-label='Neue Vorlage verknüpfen']",
    );
    await clickElement(checkbox);
    await modalAbsenden();

    expect(queryPortal<HTMLInputElement>(".ant-modal input[aria-label='Vorlagenname']").value)
      .toBe("Vorlage bleibt");
    expect(queryPortal<HTMLInputElement>(
      ".ant-modal input[aria-label='Neue Vorlage verknüpfen']",
    ).checked).toBe(false);
    expect(queryPortal(".ant-modal .ant-alert-warning").textContent)
      .toContain("Vorlage konnte nicht aus dem Fahrzeug erstellt werden.");
  });
});
