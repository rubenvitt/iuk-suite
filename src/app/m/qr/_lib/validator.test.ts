import { describe, it, expect } from "vitest";
import { validatePresetInput } from "@/app/m/qr/_lib/validator";
import { payloadToQrString } from "@/app/m/qr/_lib/payload";
import { QR_MAX_LENGTH } from "@/app/m/qr/_lib/qr";
import type { QrPayload } from "@/app/m/qr/_lib/types";

// Gibt den geprueften Wert zurueck, damit der Erfolgspfad nicht nur auf ok:true endet.
const ok = (input: unknown) => {
  const r = validatePresetInput(input);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`unerwartet abgelehnt: ${r.error}`);
  return r.value;
};
const fails = (input: unknown, part: string) => {
  const r = validatePresetInput(input);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain(part);
};

describe("validatePresetInput", () => {
  it("akzeptiert ein minimales url-Preset", () => {
    expect(ok({ label: "Test", kind: "url", value: "https://drk.de" })).toEqual({
      id: undefined,
      label: "Test",
      icon: undefined,
      kind: "url",
      value: "https://drk.de",
    });
  });
  it("reicht id, label, icon, kind und value unveraendert durch", () => {
    expect(
      ok({ label: "Test", kind: "url", value: "https://drk.de", id: "x1", icon: "link" }),
    ).toEqual({
      id: "x1",
      label: "Test",
      icon: "link",
      kind: "url",
      value: "https://drk.de",
    });
  });
  it("lehnt Nicht-Objekte ab", () => {
    fails("nope", "Objekt");
    fails(null, "Objekt");
  });
  it("verlangt ein nicht-leeres label", () => {
    fails({ kind: "url", value: "x" }, "label");
    fails({ label: "  ", kind: "url", value: "x" }, "label");
  });
  it("begrenzt label auf 80 Zeichen", () => {
    fails({ label: "a".repeat(81), kind: "url", value: "x" }, "80");
  });
  it("lehnt unbekannte kinds ab", () => {
    fails({ label: "L", kind: "sms", value: "x" }, "kind");
  });
  it("prüft das id-Format", () => {
    fails({ label: "L", kind: "url", value: "x", id: "Groß" }, "id");
    fails({ label: "L", kind: "url", value: "x", id: "-start" }, "id");
    ok({ label: "L", kind: "url", value: "x", id: "gueltig-123" });
  });
  // Die 60 sind lasttragend: laengere ids kollidieren mit der Slug-Erzeugung.
  it("begrenzt die id auf 60 Zeichen", () => {
    ok({ label: "L", kind: "url", value: "x", id: "a".repeat(60) });
    fails({ label: "L", kind: "url", value: "x", id: "a".repeat(61) }, "id");
  });
  it("url/tel/text brauchen einen nicht-leeren String", () => {
    fails({ label: "L", kind: "url", value: "" }, "value");
    fails({ label: "L", kind: "tel", value: 42 }, "value");
    fails({ label: "L", kind: "text", value: "" }, "value");
    expect(ok({ label: "L", kind: "text", value: "Freitext" }).value).toBe("Freitext");
    expect(ok({ label: "L", kind: "tel", value: "+49 30 1234" }).value).toBe("+49 30 1234");
  });
  it("wifi: ssid Pflicht, encryption aus der Liste", () => {
    fails({ label: "L", kind: "wifi", value: { encryption: "WPA" } }, "ssid");
    fails({ label: "L", kind: "wifi", value: { ssid: "S", encryption: "WPA3" } }, "encryption");
    ok({ label: "L", kind: "wifi", value: { ssid: "S", encryption: "nopass" } });
  });
  it("wifi: hidden muss boolean sein", () => {
    fails({ label: "L", kind: "wifi", value: { ssid: "S", encryption: "WPA", hidden: "ja" } }, "hidden");
  });
  it("wifi: nicht-Objekt als value wird eindeutig abgelehnt", () => {
    fails({ label: "L", kind: "wifi", value: "S" }, "Objekt");
    fails({ label: "L", kind: "wifi", value: null }, "Objekt");
  });
  // Regression: ein offenes WLAN kommt ohne password an. Reicht die Validierung das so
  // durch, bricht payloadToQrString beim Escapen mit einer TypeError ab.
  it("wifi: ergaenzt fehlendes password durch einen leeren String", () => {
    const v = ok({ label: "L", kind: "wifi", value: { ssid: "Netz", encryption: "nopass" } });
    expect(v.value).toEqual({ ssid: "Netz", password: "", encryption: "nopass" });
    expect(payloadToQrString(v as QrPayload)).toBe("WIFI:T:nopass;S:Netz;P:;H:false;;");
  });
  it("wifi: uebernimmt password und hidden unveraendert", () => {
    const v = ok({
      label: "L",
      kind: "wifi",
      value: { ssid: "Netz", password: "geheim", encryption: "WPA", hidden: true },
    });
    expect(v.value).toEqual({
      ssid: "Netz",
      password: "geheim",
      encryption: "WPA",
      hidden: true,
    });
  });
  it("vcard: name Pflicht, Optionalfelder müssen Strings sein", () => {
    fails({ label: "L", kind: "vcard", value: {} }, "name");
    fails({ label: "L", kind: "vcard", value: { name: "N", tel: 1 } }, "tel");
    expect(ok({ label: "L", kind: "vcard", value: { name: "N" } }).value).toEqual({ name: "N" });
  });
  it("vcard: nicht-Objekt als value wird eindeutig abgelehnt", () => {
    fails({ label: "L", kind: "vcard", value: null }, "Objekt");
    fails({ label: "L", kind: "vcard", value: "N" }, "Objekt");
  });

  // Ohne diese Schranke speichert der Admin-Pfad ein Preset dauerhaft, das
  // payloadToSvg spaeter nie rendern kann: Erfolg beim Anlegen, Fehlermeldung
  // an jeder Kachel.
  describe("QR-Kapazitaet", () => {
    it("laesst einen Text genau am Limit durch", () => {
      expect(ok({ label: "L", kind: "text", value: "a".repeat(QR_MAX_LENGTH) }).value).toHaveLength(
        QR_MAX_LENGTH,
      );
    });
    it("lehnt ein Byte darueber ab", () => {
      fails({ label: "L", kind: "text", value: "a".repeat(QR_MAX_LENGTH + 1) }, "überschreitet");
    });
    // Byte-Laenge, nicht text.length: nach Zeichen gezaehlt waeren diese
    // Umlaute laengst erlaubt, waehrend die Erzeugung sie bereits ablehnt.
    it("zaehlt Umlaute doppelt", () => {
      const umlauts = "ä".repeat(QR_MAX_LENGTH / 2 + 1);
      expect(umlauts.length).toBeLessThan(QR_MAX_LENGTH);
      fails({ label: "L", kind: "text", value: umlauts }, "überschreitet");
    });
    // Gemessen wird die fertige Nutzlast: das tel:-Praefix zaehlt mit, sonst
    // rutschte eine Nummer durch, die als QR-Text vier Bytes zu lang ist.
    it("rechnet das tel:-Praefix mit ein", () => {
      fails({ label: "L", kind: "tel", value: "1".repeat(QR_MAX_LENGTH - 3) }, "überschreitet");
      ok({ label: "L", kind: "tel", value: "1".repeat(QR_MAX_LENGTH - 4) });
    });
    // Gegenprobe fuer die Grenze: dieselbe SSID ist als Rohwert kurz genug,
    // erst die WIFI-Zeile drumherum sprengt die Kapazitaet.
    it("rechnet den WIFI-Rumpf mit ein", () => {
      const ssid = "s".repeat(QR_MAX_LENGTH - 10);
      expect(ssid.length).toBeLessThan(QR_MAX_LENGTH);
      fails({ label: "L", kind: "wifi", value: { ssid, encryption: "nopass" } }, "überschreitet");
    });
  });
});
