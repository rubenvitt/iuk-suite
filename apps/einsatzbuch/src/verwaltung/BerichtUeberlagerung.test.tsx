/**
 * Das Berichtsblatt am Rechner (Plan Stufe 6, Entscheidung 8): die geteilte `Berichtsblatt` aus
 * dem Kern in einer Überlagerung nach der Vorlage (`pdfOffen`). Gedruckt wird über den Befehl
 * der Hülle, nie über `window.print()`.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clickElement, existsPortal, mount, queryPortal, unmount } from "../../../../src/app/m/qr/_lib/test-dom";
import { BLOECKE, EINSAETZE } from "./testvektoren";

const befehle = vi.hoisted(() => ({ drucken: vi.fn() }));
vi.mock("../befehle", () => ({ befehle }));

import { BerichtUeberlagerung } from "./BerichtUeberlagerung";

const BLOCK = BLOECKE[2];
const EINSATZ = EINSAETZE[2];

async function oeffne(p: { pruefung?: Parameters<typeof BerichtUeberlagerung>[0]["pruefung"]; beiSchliessen?: () => void } = {}): Promise<void> {
  await mount(
    <BerichtUeberlagerung
      block={BLOCK}
      einsatz={EINSATZ}
      pruefung={p.pruefung === undefined ? { art: "intakt", vollstaendig: true } : p.pruefung}
      bereitschaft="DRK-Bereitschaft Uelzen"
      sitzungName="Ruben Vitt"
      erzeugt="2026-09-25T10:15:00+02:00"
      zeitzone="Europe/Berlin"
      beiSchliessen={p.beiSchliessen ?? (() => {})}
    />,
  );
}

const text = () => document.body.textContent ?? "";
const knopf = (name: string) => Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === name);

beforeEach(() => {
  vi.clearAllMocks();
  befehle.drucken.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("BerichtUeberlagerung", () => {
  it("zeigt Steuerleiste und Berichtsblatt als eigene Überlagerung direkt unter `body`", async () => {
    await oeffne();
    const huelle = queryPortal(".bericht-ueberlagerung");
    expect(huelle.parentElement).toBe(document.body);
    expect(huelle.getAttribute("role")).toBe("dialog");
    expect(huelle.getAttribute("aria-label")).toBe(`Einsatzbericht · ${EINSATZ.nummer}`);
    expect(text()).toContain(`Einsatzbericht · ${EINSATZ.nummer}`);
    expect(text()).toContain("Im Druckdialog „Als PDF speichern“ wählen.");
    expect(existsPortal("[data-bericht]")).toBe(true);
    expect(text()).toContain("Unverändert seit der Versiegelung");
    expect(text()).toContain("Kette intakt (geprüft am Rechner)");
    expect(text()).toContain("Erzeugt 25.9.2026, 10:15 Uhr · Einsatzbuch Verwaltung, Ruben Vitt");
    expect(text()).toContain("DRK-Bereitschaft Uelzen");
  });

  it("ohne bestandene Kettenprüfung titelt das Siegel nicht „unverändert“", async () => {
    await oeffne({ pruefung: null });
    expect(text()).toContain("Unveränderlichkeit nicht bestätigt");
    expect(text()).toContain("Noch nicht geprüft");
  });

  it("gebrochen vor diesem Block: nicht bestätigt", async () => {
    await oeffne({ pruefung: { art: "gebrochen", block: 2, grund: "Fingerabdruck passt nicht" } });
    expect(text()).toContain("Unveränderlichkeit nicht bestätigt");
    expect(text()).toContain("Gebrochen bei Block 2");
  });

  it("„Als PDF speichern“ ruft den Druckbefehl der Hülle", async () => {
    await oeffne();
    await clickElement(knopf("Als PDF speichern")!);
    expect(befehle.drucken).toHaveBeenCalledTimes(1);
  });

  it("zeigt einen Druckfehler aus Rust wörtlich", async () => {
    befehle.drucken.mockRejectedValue("Das Fenster ließ sich nicht drucken.");
    await oeffne();
    await clickElement(knopf("Als PDF speichern")!);
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });
    expect(Array.from(document.body.querySelectorAll('[role="alert"]')).map((a) => a.textContent)).toContain("Das Fenster ließ sich nicht drucken.");
  });

  it("„Schließen“ und Escape schließen", async () => {
    const beiSchliessen = vi.fn();
    await oeffne({ beiSchliessen });
    await clickElement(knopf("Schließen")!);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(beiSchliessen).toHaveBeenCalledTimes(2);
  });
});
