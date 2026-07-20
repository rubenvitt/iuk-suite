// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

/**
 * Der Vertrag zwischen Formular und Action ist ungeschrieben und leicht zu
 * brechen: `parse` in actions.ts liest genau EIN Feld `value`. Fuer wifi/vcard
 * traegt ein verstecktes Feld das JSON, die Unterfelder bleiben bewusst ohne
 * `name`. Ein zweites Feld namens `value` liesse `formData.get("value")` auf
 * die falsche Eingabe zeigen — ohne Test faellt das niemandem auf.
 *
 * Die Action selbst ist gemockt: sie ist ein Server-Modul und wird hier nicht
 * ausgefuehrt, geprueft wird allein das erzeugte Formular.
 */
vi.mock("@/app/m/qr/actions", () => ({
  createPresetAction: vi.fn(),
  updatePresetAction: vi.fn(),
}));

import { PresetForm } from "@/app/m/qr/admin/preset-form";
import { QR_MAX_LENGTH } from "@/app/m/qr/_lib/qr";
import { exists, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { Preset } from "@/app/m/qr/_lib/types";

afterEach(async () => {
  await unmount();
});

/** Wie `fill`, aber fuer das Auswahlfeld: React verfolgt den value-Setter selbst. */
async function selectKind(kind: string): Promise<void> {
  const select = query<HTMLSelectElement>('select[name="kind"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (!setter) throw new Error("Kein value-Setter am HTMLSelectElement-Prototyp");
  await act(async () => {
    setter.call(select, kind);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Genau das, was `formData.get("value")` in der Action liefern wuerde. */
function valueFields(): HTMLInputElement[] {
  return queryAll<HTMLInputElement>('[name="value"]');
}

describe("PresetForm: Formular-Vertrag", () => {
  it.each(["url", "text", "tel"])("hat bei kind=%s genau ein Feld namens value", async (kind) => {
    await mount(<PresetForm />);
    await selectKind(kind);
    expect(valueFields()).toHaveLength(1);
  });

  it("schickt bei kind=wifi genau ein value-Feld mit dem erwarteten JSON", async () => {
    await mount(<PresetForm />);
    await selectKind("wifi");
    // Die Unterfelder duerfen kein name-Attribut tragen, sonst gewinnt das
    // falsche Feld in der FormData.
    expect(valueFields()).toHaveLength(1);

    // Erstes Feld im fieldset ist die SSID.
    await fill("fieldset input", "DRK Einsatz");

    expect(JSON.parse(valueFields()[0].value)).toEqual({
      ssid: "DRK Einsatz",
      password: "",
      encryption: "WPA",
      hidden: false,
    });
  });

  it("schickt bei kind=vcard genau ein value-Feld und laesst leere Felder weg", async () => {
    await mount(<PresetForm />);
    await selectKind("vcard");
    expect(valueFields()).toHaveLength(1);

    await fill("fieldset input", "Max Mustermann");

    expect(JSON.parse(valueFields()[0].value)).toEqual({ name: "Max Mustermann" });
  });
});

describe("PresetForm: QR-Kapazitaet", () => {
  it("warnt nicht bei normaler Eingabe", async () => {
    await mount(<PresetForm />);
    await fill('input[name="value"]', "https://drk.de");
    expect(exists('[data-testid="preset-too-long"]')).toBe(false);
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false);
  });

  // Ohne diese Schranke speichert der Admin ein Preset, das an der Kachel nur
  // noch als Fehlermeldung erscheint.
  it("warnt und sperrt das Absenden bei zu langem Text", async () => {
    await mount(<PresetForm />);
    await selectKind("text");
    await fill('input[name="value"]', "a".repeat(QR_MAX_LENGTH + 1));

    expect(exists('[data-testid="preset-too-long"]')).toBe(true);
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
  });

  // Regression: gegen text.length gemessen waeren diese Umlaute erlaubt,
  // waehrend die Erzeugung sie laengst ablehnt — die Warnung schwiege genau
  // dann, wenn sie gebraucht wird.
  it("zaehlt Umlaute doppelt", async () => {
    await mount(<PresetForm />);
    await selectKind("text");
    const umlauts = "ä".repeat(QR_MAX_LENGTH / 2 + 1);
    expect(umlauts.length).toBeLessThan(QR_MAX_LENGTH);
    await fill('input[name="value"]', umlauts);

    expect(exists('[data-testid="preset-too-long"]')).toBe(true);
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
  });

  // Gegenprobe: gemessen wird der fertige QR-Text, nicht der Rohwert — der
  // WIFI-Rumpf zaehlt mit.
  it("rechnet bei wifi den Rumpf der WIFI-Zeile mit ein", async () => {
    await mount(<PresetForm />);
    await selectKind("wifi");
    await fill("fieldset input", "s".repeat(QR_MAX_LENGTH - 10));

    expect(exists('[data-testid="preset-too-long"]')).toBe(true);
  });
});

/**
 * Der Bearbeiten-Pfad. Ohne ihn blieb einem Admin nach einer WLAN-Passwort-
 * rotation nur Loeschen und Neuanlegen — mit neuem `sortOrder` (die Kachel
 * rutscht im Schnellzugriff ans Ende) und verlorenen Audit-Feldern.
 */
describe("PresetForm: Bearbeiten", () => {
  const wlan: Preset = {
    id: "wlan-einsatzstelle",
    label: "WLAN Einsatzstelle",
    icon: "📶",
    kind: "wifi",
    value: { ssid: "DRK-Einsatz", password: "altes-geheim", encryption: "WEP", hidden: true },
  };
  const link: Preset = {
    id: "drk",
    label: "DRK",
    kind: "url",
    value: "https://drk.de",
  };

  it("belegt die Felder eines bestehenden Presets vor", async () => {
    await mount(<PresetForm preset={link} />);

    expect(query<HTMLInputElement>('input[name="label"]').value).toBe("DRK");
    expect(query<HTMLInputElement>('input[name="value"]').value).toBe("https://drk.de");
  });

  it("belegt auch die Unterfelder eines wifi-Presets vor", async () => {
    await mount(<PresetForm preset={wlan} />);

    expect(JSON.parse(valueFields()[0].value)).toEqual({
      ssid: "DRK-Einsatz",
      password: "altes-geheim",
      encryption: "WEP",
      hidden: true,
    });
  });

  // Ohne dieses Feld adressierte die Action keine Zeile: `updatePreset` liefe
  // gegen die id "undefined" und aendert schlicht nichts.
  it("schickt die id des bearbeiteten Presets mit", async () => {
    await mount(<PresetForm preset={wlan} />);
    expect(query<HTMLInputElement>('input[type="hidden"][name="id"]').value).toBe(
      "wlan-einsatzstelle",
    );
  });

  /**
   * Die Sperre aus easy-qr: ein Wechsel der Art machte den gespeicherten `value`
   * bedeutungslos (eine SSID ist keine URL). Geprueft wird beides — dass das
   * Auswahlfeld gesperrt ist UND dass die Art trotzdem in der FormData landet.
   * Ein deaktiviertes Feld schickt der Browser naemlich nicht mit; ohne das
   * versteckte Feld schluege `parse` mit "kind ungültig: " fehl.
   */
  it("sperrt die Art, reicht sie aber weiter", async () => {
    await mount(<PresetForm preset={wlan} />);

    expect(query<HTMLSelectElement>("select").disabled).toBe(true);
    const kindFields = queryAll<HTMLInputElement>('[name="kind"]');
    expect(kindFields).toHaveLength(1);
    expect(kindFields[0].value).toBe("wifi");
  });

  it("laesst die Art beim Anlegen frei waehlbar", async () => {
    await mount(<PresetForm />);
    expect(query<HTMLSelectElement>('select[name="kind"]').disabled).toBe(false);
  });
});
