// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  existsPortal,
  queryPortal,
  mount,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import type { SammelZeile } from "../_lib/sammelAenderung";
import { SammelDrawer } from "./SammelDrawer";

const mocks = vi.hoisted(() => ({ sammelAendereArtikel: vi.fn() }));

vi.mock("../_actions/artikel", () => ({
  sammelAendereArtikel: (...args: unknown[]) => mocks.sammelAendereArtikel(...args),
}));

const ZEILEN: SammelZeile[] = [
  { id: "a", name: "Alpha", kategorie: "Hygiene", fach: "A-01", aktiv: true },
  { id: "b", name: "Bravo", kategorie: null, fach: "B-02", aktiv: true },
  { id: "c", name: "Charlie", kategorie: "Hygiene", fach: "C-03", aktiv: false },
];

let onSchliessen: ReturnType<typeof vi.fn<() => void>>;
let onFertig: ReturnType<typeof vi.fn<(betroffen: number) => void>>;

beforeEach(() => {
  mocks.sammelAendereArtikel.mockReset();
  mocks.sammelAendereArtikel.mockResolvedValue({ ok: true, wert: { betroffen: 2 } });
  onSchliessen = vi.fn<() => void>();
  onFertig = vi.fn<(betroffen: number) => void>();
});

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

async function oeffnen(zeilen: SammelZeile[] = ZEILEN): Promise<void> {
  await mount(
    <SammelDrawer
      zeilen={zeilen}
      kategorien={["Hygiene", "Verbandmaterial"]}
      onSchliessen={onSchliessen}
      onFertig={onFertig}
    />,
  );
}

/** Der Haken vor einem Feld — antds `Checkbox` rendert ein `<label>`. */
function haken(beschriftung: string): HTMLElement {
  const label = Array.from(document.body.querySelectorAll("label"))
    .find((knoten) => knoten.textContent?.trim() === beschriftung);
  if (!label) throw new Error(`Kein Haken „${beschriftung}“ gefunden`);
  return label.querySelector<HTMLElement>("input") ?? label;
}

/** Wie `fill`, nur im Portal — antd rendert die Schublade nach `document.body`. */
async function fuellePortal(selector: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter am Prototyp von ${input.tagName}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function speichernKnopf(): HTMLButtonElement {
  return queryPortal<HTMLButtonElement>("[data-testid='sammel-speichern']");
}

function zusammenfassung(): string {
  return queryPortal("[data-testid='sammel-zusammenfassung']").textContent ?? "";
}

describe("SammelDrawer (DRK-293)", () => {
  it("nennt im Titel, wie viele Artikel betroffen sind", async () => {
    await oeffnen();
    expect(document.body.textContent).toContain("3 Artikel bearbeiten");
  });

  it("listet jeden ausgewählten Artikel namentlich, bevor gespeichert wird", async () => {
    // Akzeptanzkriterium: „Vor dem Speichern ist erkennbar, welche Artikel …"
    await oeffnen();
    for (const name of ["Alpha", "Bravo", "Charlie"]) {
      expect(document.body.textContent).toContain(name);
    }
  });

  it("speichert erst, wenn ein Feld angehakt ist", async () => {
    await oeffnen();
    expect(speichernKnopf().disabled).toBe(true);
    expect(zusammenfassung()).toContain("Noch kein Feld ausgewählt");
  });

  it("zählt nur die Artikel, die sich wirklich ändern", async () => {
    // Alpha und Charlie tragen „Hygiene“ bereits — betroffen ist allein Bravo.
    await oeffnen();
    await clickElement(haken("Kategorie"));
    await fuellePortal("[aria-label='Kategorie für alle ausgewählten Artikel']", "Hygiene");

    expect(zusammenfassung()).toContain("1 von 3 Artikeln ändern sich");
    expect(zusammenfassung()).toContain("2 tragen die Werte bereits");
    expect(speichernKnopf().textContent).toContain("1 Artikel ändern");
  });

  it("zeigt je Artikel, welches Feld ihn trifft und welcher unverändert bleibt", async () => {
    await oeffnen();
    await clickElement(haken("Kategorie"));
    await fuellePortal("[aria-label='Kategorie für alle ausgewählten Artikel']", "Hygiene");

    const zeilen = Array.from(document.body.querySelectorAll("tbody tr"))
      .map((tr) => tr.textContent ?? "");
    expect(zeilen.find((text) => text.includes("Alpha"))).toContain("unverändert");
    expect(zeilen.find((text) => text.includes("Bravo"))).toContain("Kategorie → Hygiene");
    expect(zeilen.find((text) => text.includes("Charlie"))).toContain("unverändert");
  });

  it("schickt genau die angehakten Felder und die ausgewählten Kennungen", async () => {
    await oeffnen();
    await clickElement(haken("Fach im Handlager"));

    await fuellePortal("input[aria-label='Fach für alle ausgewählten Artikel']", "z-99");
    await clickElement(speichernKnopf());

    expect(mocks.sammelAendereArtikel).toHaveBeenCalledTimes(1);
    expect(mocks.sammelAendereArtikel).toHaveBeenCalledWith({
      ids: ["a", "b", "c"],
      // Groß geschrieben wie im Stammdatenfeld der Artikelschublade.
      aenderung: { fach: "Z-99" },
    });
    expect(onFertig).toHaveBeenCalledWith(2);
  });

  it("schickt ein nicht angehaktes Feld nicht mit — auch nicht als leeren Wert", async () => {
    // Der Kern der Maske: „nicht gesendet“ und „auf leer gesetzt“ sind zwei
    // verschiedene Dinge. Ohne den Haken hieße ein leeres Kategoriefeld sonst
    // still „ohne Kategorie“ für die ganze Auswahl.
    await oeffnen();
    await clickElement(haken("Status"));
    await clickElement(speichernKnopf());

    expect(mocks.sammelAendereArtikel).toHaveBeenCalledWith({
      ids: ["a", "b", "c"],
      aenderung: { aktiv: true },
    });
  });

  it("macht aus einem angehakten, leeren Kategoriefeld „ohne Kategorie“", async () => {
    await oeffnen();
    await clickElement(haken("Kategorie"));

    expect(zusammenfassung()).toContain("ohne Kategorie");
    await clickElement(speichernKnopf());
    expect(mocks.sammelAendereArtikel).toHaveBeenCalledWith({
      ids: ["a", "b", "c"],
      aenderung: { kategorie: null },
    });
  });

  it("sperrt das Speichern, wenn kein ausgewählter Artikel sich ändern würde", async () => {
    await oeffnen([
      { id: "a", name: "Alpha", kategorie: null, fach: "A-01", aktiv: true },
    ]);
    await clickElement(haken("Kategorie"));

    expect(zusammenfassung()).toContain("Kein ausgewählter Artikel ändert sich");
    expect(speichernKnopf().disabled).toBe(true);
  });

  it("sperrt das Speichern bei angehaktem, leerem Fach", async () => {
    await oeffnen();
    await clickElement(haken("Fach im Handlager"));

    expect(document.body.textContent).toContain("Fach darf nicht leer sein.");
    expect(speichernKnopf().disabled).toBe(true);
    expect(mocks.sammelAendereArtikel).not.toHaveBeenCalled();
  });

  it("zeigt den Fehlersatz der Action und schließt nicht", async () => {
    mocks.sammelAendereArtikel.mockResolvedValue({ ok: false, fehler: "Kein Zugang." });
    await oeffnen();
    await clickElement(haken("Status"));
    await clickElement(speichernKnopf());

    expect(document.body.textContent).toContain("Kein Zugang.");
    expect(onFertig).not.toHaveBeenCalled();
  });

  it("zeigt bei einem geworfenen Fehler den eigenen Satz, nie die Fremdmeldung", async () => {
    // In Produktion wäre `e.message` der englische Framework-Satz (Falle 66).
    mocks.sammelAendereArtikel.mockRejectedValue(new Error("server-side exception"));
    await oeffnen();
    await clickElement(haken("Status"));
    await clickElement(speichernKnopf());

    expect(document.body.textContent).toContain("Die Änderung konnte nicht gespeichert werden");
    expect(document.body.textContent).not.toContain("server-side exception");
    expect(onFertig).not.toHaveBeenCalled();
  });

  it("meldet „Abbrechen“ nach oben, ohne zu speichern", async () => {
    await oeffnen();
    const abbrechen = Array.from(document.body.querySelectorAll("button"))
      .find((knopf) => knopf.textContent?.trim() === "Abbrechen");
    await clickElement(abbrechen!);

    expect(onSchliessen).toHaveBeenCalled();
    expect(mocks.sammelAendereArtikel).not.toHaveBeenCalled();
  });

  it("bietet Einheit, Mindestbestand und Name gar nicht erst an", async () => {
    // Die Entscheidung des Tickets steht in `_lib/sammelAenderung.ts`; hier
    // wird sie an der Oberfläche festgehalten.
    await oeffnen();
    const haken = Array.from(document.body.querySelectorAll("label"))
      .map((knoten) => knoten.textContent?.trim());
    expect(haken).toContain("Kategorie");
    expect(haken).toContain("Fach im Handlager");
    expect(haken).toContain("Status");
    expect(haken).not.toContain("Einheit");
    expect(haken).not.toContain("Mindestbestand");
    expect(haken).not.toContain("Name");
  });

  it("bleibt offen, solange nichts gespeichert wurde", async () => {
    await oeffnen();
    expect(existsPortal(".ant-drawer")).toBe(true);
    expect(onSchliessen).not.toHaveBeenCalled();
  });
});
