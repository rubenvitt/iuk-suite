import { describe, it, expect } from "vitest";
import { payloadToQrString } from "@/app/m/qr/_lib/payload";

describe("payloadToQrString", () => {
  it("url und text werden wörtlich übernommen", () => {
    expect(payloadToQrString({ kind: "url", value: "https://drk.de" })).toBe("https://drk.de");
    expect(payloadToQrString({ kind: "text", value: "Hallo" })).toBe("Hallo");
  });

  it("tel bekommt das tel:-Präfix", () => {
    expect(payloadToQrString({ kind: "tel", value: "+49301234" })).toBe("tel:+49301234");
  });

  it("wifi: WPA mit Passwort", () => {
    expect(
      payloadToQrString({
        kind: "wifi",
        value: { ssid: "DRK-Test", password: "geheim", encryption: "WPA" },
      }),
    ).toBe("WIFI:T:WPA;S:DRK-Test;P:geheim;H:false;;");
  });

  it("wifi: hidden-Flag", () => {
    expect(
      payloadToQrString({
        kind: "wifi",
        value: { ssid: "S", password: "p", encryption: "WPA", hidden: true },
      }),
    ).toBe("WIFI:T:WPA;S:S;P:p;H:true;;");
  });

  it("wifi: Sonderzeichen in SSID und Passwort werden escaped", () => {
    expect(
      payloadToQrString({
        kind: "wifi",
        value: { ssid: 'a;b,c:d"e\\f', password: "x;y", encryption: "WPA" },
      }),
    ).toBe('WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:x\\;y;H:false;;');
  });

  it("vcard: minimal", () => {
    expect(payloadToQrString({ kind: "vcard", value: { name: "Max Muster" } })).toBe(
      "BEGIN:VCARD\nVERSION:3.0\nFN:Max Muster\nEND:VCARD",
    );
  });

  it("vcard: alle Optionalfelder in fester Reihenfolge", () => {
    expect(
      payloadToQrString({
        kind: "vcard",
        value: { name: "N", tel: "+49", email: "a@b.de", org: "DRK" },
      }),
    ).toBe("BEGIN:VCARD\nVERSION:3.0\nFN:N\nTEL:+49\nEMAIL:a@b.de\nORG:DRK\nEND:VCARD");
  });

  it("vcard: Semikolon, Komma, Backslash und Zeilenumbrüche werden escaped", () => {
    expect(payloadToQrString({ kind: "vcard", value: { name: "a;b,c\\d\ne" } })).toBe(
      "BEGIN:VCARD\nVERSION:3.0\nFN:a\\;b\\,c\\\\d\\ne\nEND:VCARD",
    );
  });
});
