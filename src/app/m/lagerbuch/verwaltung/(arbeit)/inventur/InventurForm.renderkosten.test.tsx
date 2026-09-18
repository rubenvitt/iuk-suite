// @vitest-environment jsdom

/**
 * DRK-421 — DER RIEGEL GEGEN DIE RENDERLAWINE.
 *
 * ⚠️ WAS DIESER TEST BESITZT UND WARUM ER NICHT „SCHNELL" MISST. Eine
 * Zusicherung auf Millisekunden waere auf einer geteilten CI-Maschine ein
 * Muenzwurf. Gemessen wird deshalb die URSACHE, und die ist abzaehlbar: WIE
 * VIELE ZEILEN werden neu gerendert, wenn etwas passiert, das die Zeilen nichts
 * angeht. Vorher waren es alle, heute keine.
 *
 * ⚠️ DER ZAEHLER HAENGT AN `Ikone`, UND ZWAR ABSICHTLICH. Jede Zeile rendert
 * genau drei Zeichen (Minus, Plus, Aufklappknopf); ein Zeichen zu rendern ist
 * damit der billigste Beweis dafuer, dass eine Zeile ueberhaupt durch React
 * gelaufen ist. Am DOM laesst sich das NICHT ablesen: React versoehnt zum
 * gleichen Ergebnis, ein neu gerendertes und ein uebersprungenes Feld sehen im
 * Baum identisch aus — genau deshalb konnte die Lawine jahrelang unbemerkt
 * laufen.
 *
 * Die Zahlen, die dahinterstehen (jsdom, deshalb nur untereinander
 * vergleichbar), stehen im Kopf von `zaehlspeicher.ts`.
 */

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { zaehlOrtWert, type ZaehlOrt } from "../../../_lib/inventurOrt";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { InventurForm } from "./InventurForm";

const gerendert = vi.hoisted(() => ({ zeichen: 0 }));

vi.mock("../../../_ui/ikonen", async (original) => {
  const echt = await original<typeof import("../../../_ui/ikonen")>();
  return {
    ...echt,
    Ikone: (props: Parameters<typeof echt.Ikone>[0]) => {
      gerendert.zeichen += 1;
      return echt.Ikone(props);
    },
  };
});

vi.mock("../../../_actions/inventur", () => ({ inventurKorrektur: vi.fn() }));
vi.mock("../../../_ui/useUrlFilter", () => ({ useUrlFilter: () => vi.fn() }));

const ORTE: ZaehlOrt[] = [
  { id: null, label: "Ganzer Handlager" },
  { id: HANDLAGER_ID, label: "Nicht zugeordnet" },
].map((o) => ({ ...o, schluessel: zaehlOrtWert(o.id) }));

/** Genug Zeilen, dass eine Lawine sich von einem Rauschen unterscheidet. */
const ZEILEN_ANZAHL = 120;

function zeilen(anzahl: number): InventurZeile[] {
  return Array.from({ length: anzahl }, (_, i) => ({
    id: `a${i}`,
    name: `Artikel ${i}`,
    einheit: "Stk",
    fach: `Fach ${i % 8}`,
    kategorie: ["Verband", "Hygiene", "Infusion"][i % 3],
    mindestbestand: 5,
    bestand: 10,
    chargen: [],
  }));
}

/** Ein Zeichen ins Kommentarfeld, ueber den echten Ereignisweg von React. */
async function tippe(feld: HTMLInputElement, text: string): Promise<void> {
  const setzer = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setzer?.call(feld, text);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(async () => {
  await unmount();
  gerendert.zeichen = 0;
});

describe("InventurForm — Renderkosten (DRK-421)", () => {
  it("rendert beim Tippen im Kommentarfeld KEINE einzige Zeile neu", async () => {
    await mount(<InventurForm zeilen={zeilen(ZEILEN_ANZAHL)} ortId={null} orte={ORTE} />);
    // Der Aufbau hat gerendert, was er rendern musste — gezaehlt wird ab hier.
    gerendert.zeichen = 0;

    await tippe(query<HTMLInputElement>("input[aria-label='Kommentar']"), "Quartalsinventur");

    /*
     * ⚠️ DIE NULL IST DIE AUSSAGE, NICHT „WENIGE". Das Kommentarfeld liegt in
     * einer eigenen Leiste und beruehrt weder die Spaltendefinition noch den
     * Zaehlstand; keine Zeile hat einen Grund, davon zu erfahren. Vorher lag der
     * Zaehlstand samt Kommentar als `useState` im Formular, und derselbe
     * Tastendruck rannte durch alle 120 Zeilen.
     */
    expect(gerendert.zeichen).toBe(0);
  });

  it("rendert beim Zählen nur die angefasste Zeile neu", async () => {
    await mount(<InventurForm zeilen={zeilen(ZEILEN_ANZAHL)} ortId={null} orte={ORTE} />);
    gerendert.zeichen = 0;

    await clickElement(query("button[aria-label='Ist-Bestand Artikel 0 erhöhen']"));

    /*
     * Eine Zeile traegt drei Zeichen (Minus, Plus, Aufklappknopf); die
     * „Ist"-Zelle rendert davon zwei neu. Die Grenze steht bewusst bei der
     * ZEILENZAHL und nicht bei einer exakten Zahl: sie soll die Lawine fangen,
     * nicht bei jedem zusaetzlichen Zeichen in einer Zelle umkippen. Ein
     * Rueckfall in den alten Zustand ergaebe hier mehr als 240.
     *
     * ⚠️ DIESER FALL HAT ZAEHNE, UND ZWAR NACHGEMESSEN: laesst man das Formular
     * probeweise wieder auf den Gesamtstand horchen und haengt die
     * Spaltendefinition daran, meldet er `expected 122 to be less than 120`.
     * Ein Test, der auf beiden Fassungen gruen ist, bewacht nichts.
     */
    expect(gerendert.zeichen).toBeLessThan(ZEILEN_ANZAHL);
  });

  it("weckt beim Zählen keine andere Zeile — der Wert von Zeile 1 bleibt stehen", async () => {
    await mount(<InventurForm zeilen={zeilen(ZEILEN_ANZAHL)} ortId={null} orte={ORTE} />);

    await clickElement(query("button[aria-label='Ist-Bestand Artikel 0 erhöhen']"));

    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Artikel 0']").value).toBe("11");
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Artikel 1']").value).toBe("10");
  });
});
