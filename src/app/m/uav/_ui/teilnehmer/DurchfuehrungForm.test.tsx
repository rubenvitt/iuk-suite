// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DurchfuehrungForm } from "./DurchfuehrungForm";
import { fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * Port aus uav-praxis/src/components/DurchfuehrungForm.test.tsx — über das
 * repo-eigene `test-dom`-Harness statt `@testing-library/react` (keine
 * Abhängigkeit dieses Projekts).
 */

beforeEach(() => localStorage.clear());
afterEach(async () => {
  await unmount();
});

describe("DurchfuehrungForm", () => {
  it("ruft onAdd mit den Feldwerten auf", async () => {
    const onAdd = vi.fn();
    await mount(<DurchfuehrungForm onAdd={onAdd} heute="2026-06-02" />);

    await fill("#df-drohnensteuerer", "Max");
    await fill("#df-luftraumbeobachter", "Erika");
    await submitForm();

    expect(onAdd).toHaveBeenCalledWith({
      datum: "2026-06-02",
      drohnensteuerer: "Max",
      luftraumbeobachter: "Erika",
    });
  });

  it("belegt das Datum mit heute vor", async () => {
    await mount(<DurchfuehrungForm onAdd={vi.fn()} heute="2026-06-02" />);
    expect(query<HTMLInputElement>("#df-datum").value).toBe("2026-06-02");
  });

  /*
   * DIE DEUTSCHE LESART NEBEN DEM FELD. Die Anzeigeform des nativen
   * `<input type="date">` bestimmt die Sprache des BROWSERS, nicht das Dokument
   * — mit `lang="de"` am `<html>` und einem Browser auf `de-DE` zeigte Chromium
   * gemessen weiterhin `08/29/2026`. Diese Zeile ist die Antwort darauf; sie
   * prueft den formatierten Text, nicht das Feld selbst.
   */
  it("stellt das gewählte Datum in deutscher Form neben die Beschriftung", async () => {
    await mount(<DurchfuehrungForm onAdd={vi.fn()} heute="2026-06-02" />);
    expect(query("label[for='df-datum']").textContent).toContain("02.06.2026");
  });

  it("füllt die Namensfelder aus der letzten Eingabe vor", async () => {
    await mount(<DurchfuehrungForm onAdd={vi.fn()} heute="2026-06-02" />);
    await fill("#df-drohnensteuerer", "Max");
    await fill("#df-luftraumbeobachter", "Erika");
    await submitForm();
    await unmount();

    // Neues Formular (z. B. andere Aufgabe oder Neustart) übernimmt die Namen.
    await mount(<DurchfuehrungForm onAdd={vi.fn()} heute="2026-06-03" />);
    expect(query<HTMLInputElement>("#df-drohnensteuerer").value).toBe("Max");
    expect(query<HTMLInputElement>("#df-luftraumbeobachter").value).toBe("Erika");
  });
});
