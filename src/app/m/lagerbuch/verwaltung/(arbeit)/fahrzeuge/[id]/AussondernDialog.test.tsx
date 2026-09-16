// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement, existsPortal, mount, queryPortal, unmount,
} from "@/app/m/qr/_lib/test-dom";

const mocks = vi.hoisted(() => ({ aussondern: vi.fn() }));

vi.mock("../../../../_actions/aussondernLagerort", () => ({
  aussondernVomLagerort: (...args: unknown[]) => mocks.aussondern(...args),
}));

import type { Einheitenart } from "../../../../_lib/konstanten";
import { AussondernDialog } from "./AussondernDialog";

const CHARGEN = [
  { id: "ch-alt", chargenNr: "CH-ALT", verfall: "2020-01", rest: 4 },
  { id: "ch-neu", chargenNr: "CH-NEU", verfall: "2030-01", rest: 6 },
];

beforeEach(() => {
  mocks.aussondern.mockReset();
  mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: null } });
});

afterEach(async () => { await unmount(); });

async function warte(): Promise<void> {
  await act(async () => { await new Promise((fertig) => setTimeout(fertig, 0)); });
}

async function warteAuf(pruefen: () => boolean, was: string): Promise<void> {
  for (let versuch = 0; versuch < 30; versuch++) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${was}`);
}

function knopfMitText(text: string, wurzel: ParentNode = document.body): HTMLElement {
  const knopf = Array.from(wurzel.querySelectorAll<HTMLElement>("button"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf nicht gefunden: ${text}`);
  return knopf;
}

async function fuellPortal(selector: string, wert: string): Promise<void> {
  const feld = queryPortal<HTMLInputElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter fuer ${selector}`);
  await act(async () => {
    setter.call(feld, wert);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function oeffne(): Promise<void> {
  await clickElement(knopfMitText("aussondern"));
  await warteAuf(
    () => document.body.querySelector("[role='dialog']") !== null,
    "Aussondern-Dialog",
  );
}

function zeige(bestand = 10, einheitenart: Einheitenart | null = "fahrzeug") {
  return mount(
    <AussondernDialog
      lagerortId="fz-1"
      artikelId="art-1"
      artikelName="Kompresse"
      einheit="Stk."
      bestand={bestand}
      chargen={CHARGEN}
      verfall="2020-01"
      einheitenart={einheitenart}
    />,
  );
}

describe("AussondernDialog", () => {
  it("uebergibt Menge, Kommentar und Lagerort an die Aktion", async () => {
    await zeige();
    await oeffne();

    await fuellPortal("input[aria-label='Menge']", "3");
    await fuellPortal("input[aria-label='Kommentar']", "MHD ueberschritten");
    await act(async () => {
      queryPortal<HTMLFormElement>("[data-rolle='aussondern']")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await warte();

    expect(mocks.aussondern).toHaveBeenCalledTimes(1);
    expect(mocks.aussondern.mock.calls[0][0]).toMatchObject({
      lagerortId: "fz-1",
      artikelId: "art-1",
      menge: 3,
      kommentar: "MHD ueberschritten",
    });
  });

  it("bietet den Knopf nicht an, wenn am Lagerort nichts liegt", async () => {
    await zeige(0);

    // Was nicht da liegt, kann nicht ausgesondert werden — der Knopf ist gesperrt.
    expect(knopfMitText("aussondern").hasAttribute("disabled")).toBe(true);
  });

  it("zeigt den Fehlersatz der Aktion an, statt ihn zu verschlucken", async () => {
    mocks.aussondern.mockResolvedValue({ ok: false, fehler: "Hier liegen nur 2 Stück." });
    await zeige();
    await oeffne();

    await fuellPortal("input[aria-label='Menge']", "3");
    await fuellPortal("input[aria-label='Kommentar']", "MHD");
    await act(async () => {
      queryPortal<HTMLFormElement>("[data-rolle='aussondern']")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await warte();

    expect(existsPortal("[role='dialog']")).toBe(true);
    expect(document.body.textContent).toContain("Hier liegen nur 2 Stück.");
  });
});

/**
 * DRK-309, Reviewrunde 4 — DER HINWEIS SAGT, WO DIE PACKUNGEN LIEGEN.
 *
 * ⚠️ DIESER DIALOG VERNICHTET BESTAND. „Das früheste Datum, das jetzt noch im
 * Fahrzeug auf einer Packung steht" unter einer Tasche ist derselbe
 * Widerspruch wie „Fahrzeug löschen" über einem Chip „Tasche" — an der Stelle,
 * an der jemand eine unumkehrbare Menge bestätigt. Geprüft wird über alle drei
 * Arten, weil der Zwischenstand auf das neutrale Wort fallen muss und nicht
 * auf „Fahrzeug" zurück.
 */
describe("Der Hinweis unter dem Monatswaehler folgt der Art", () => {
  it.each([
    ["fahrzeug", "im Fahrzeug"],
    ["tasche", "in der Tasche"],
    [null, "in der Einheit"],
  ] as const)("%s → „%s\"", async (art, ort) => {
    await zeige(10, art);
    await oeffne();
    expect(document.body.textContent)
      .toContain(`Das früheste Datum, das jetzt noch ${ort} auf einer Packung steht.`);
  });
});

describe("Abbrechen", () => {
  /**
   * ⚠️ `destroyOnHidden` RAEUMT DAS MARKUP AUF, NICHT DEN FELDSPEICHER. Die
   * Form-Instanz haengt an DIESER Komponente, nicht am Modal, und antd bewahrt
   * ihre Werte (`preserve` ist an). Ohne ausdruecklichen Reset steht beim
   * naechsten Oeffnen die abgebrochene Menge wieder da — bei einer Aktion, die
   * Bestand ABBUCHT, ist das die gefaehrliche Richtung.
   */
  it("vergisst abgebrochene Eingaben beim naechsten Oeffnen", async () => {
    await zeige();
    await oeffne();
    await fuellPortal("input[aria-label='Menge']", "7");
    await fuellPortal("input[aria-label='Kommentar']", "doch nicht");

    await clickElement(knopfMitText("Abbrechen"));
    await warte();
    await oeffne();

    expect(queryPortal<HTMLInputElement>("input[aria-label='Menge']").value).toBe("1");
    expect(queryPortal<HTMLInputElement>("input[aria-label='Kommentar']").value).toBe("");
    expect(mocks.aussondern).not.toHaveBeenCalled();
  });
});

describe("Der Dialog ueberschreibt den Verfall nicht selbst", () => {
  /**
   * ⚠️ „ALLES RAUS" IST EINE VERMUTUNG UEBER EINEN VERALTETEN BESTAND. Hat eine
   * Nachfuellung oder ein Check zwischendurch ERHOEHT, ist die hier gesendete
   * Menge gar nicht der ganze Bestand. Schickt der Dialog dann ein leeres
   * Datum, loescht er eine Angabe, waehrend im Fahrzeug noch Packungen liegen.
   *
   * Deshalb sendet er IMMER den Feldwert. Ob die Angabe entfaellt, entscheidet
   * die Transaktion am verbleibenden Bestand — sie ist die einzige Stelle, die
   * ihn kennt.
   */
  it("sendet den Monat auch dann, wenn er den ganzen Bestand auszubuchen glaubt", async () => {
    await zeige(5);
    await oeffne();

    await fuellPortal("input[aria-label='Menge']", "5");
    await fuellPortal("input[aria-label='Kommentar']", "alles raus");
    await act(async () => {
      queryPortal<HTMLFormElement>("[data-rolle='aussondern']")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await warte();

    expect(mocks.aussondern).toHaveBeenCalledTimes(1);
    // Vorbelegt ist "2020-01" — der Dialog reicht ihn durch, statt "" zu senden.
    expect(mocks.aussondern.mock.calls[0][0]).toMatchObject({ verfall: "2020-01" });
  });
});
