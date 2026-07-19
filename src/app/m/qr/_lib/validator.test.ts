import { describe, it, expect } from "vitest";
import { validatePresetInput } from "@/app/m/qr/_lib/validator";

const ok = (input: unknown) => {
  const r = validatePresetInput(input);
  expect(r.ok).toBe(true);
  return r;
};
const fails = (input: unknown, part: string) => {
  const r = validatePresetInput(input);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain(part);
};

describe("validatePresetInput", () => {
  it("akzeptiert ein minimales url-Preset", () => {
    ok({ label: "Test", kind: "url", value: "https://drk.de" });
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
  it("url/tel/text brauchen einen nicht-leeren String", () => {
    fails({ label: "L", kind: "url", value: "" }, "value");
    fails({ label: "L", kind: "tel", value: 42 }, "value");
  });
  it("wifi: ssid Pflicht, encryption aus der Liste", () => {
    fails({ label: "L", kind: "wifi", value: { encryption: "WPA" } }, "ssid");
    fails({ label: "L", kind: "wifi", value: { ssid: "S", encryption: "WPA3" } }, "encryption");
    ok({ label: "L", kind: "wifi", value: { ssid: "S", encryption: "nopass" } });
  });
  it("wifi: hidden muss boolean sein", () => {
    fails({ label: "L", kind: "wifi", value: { ssid: "S", encryption: "WPA", hidden: "ja" } }, "hidden");
  });
  it("vcard: name Pflicht, Optionalfelder müssen Strings sein", () => {
    fails({ label: "L", kind: "vcard", value: {} }, "name");
    fails({ label: "L", kind: "vcard", value: { name: "N", tel: 1 } }, "tel");
    ok({ label: "L", kind: "vcard", value: { name: "N" } });
  });
});
