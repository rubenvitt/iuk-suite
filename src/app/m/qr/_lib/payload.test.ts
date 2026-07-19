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

  it("wifi: nopass behält das leere P-Segment", () => {
    expect(
      payloadToQrString({
        kind: "wifi",
        value: { ssid: "Open", password: "", encryption: "nopass" },
      }),
    ).toBe("WIFI:T:nopass;S:Open;P:;H:false;;");
  });

  it("wifi: WEP", () => {
    expect(
      payloadToQrString({
        kind: "wifi",
        value: { ssid: "Alt", password: "key", encryption: "WEP" },
      }),
    ).toBe("WIFI:T:WEP;S:Alt;P:key;H:false;;");
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

  it("vcard: nur teilweise befüllt — fehlende Optionalfelder entfallen", () => {
    expect(payloadToQrString({ kind: "vcard", value: { name: "A", email: "a@b" } })).toBe(
      "BEGIN:VCARD\nVERSION:3.0\nFN:A\nEMAIL:a@b\nEND:VCARD",
    );
  });

  // Leere Optionalfelder gehören nicht in die vCard: an einer nackten `TEL:`-Zeile
  // bleiben manche Adressbücher hängen. Die Erzeuger geben leere Eingaben zwar als
  // undefined weiter, aber die Zusicherung gehört hierher — sonst hinge sie allein
  // an der Disziplin jedes einzelnen Formulars.
  it("vcard: leere Optionalfelder erzeugen keine leeren Zeilen", () => {
    expect(
      payloadToQrString({ kind: "vcard", value: { name: "A", tel: "", email: "", org: "" } }),
    ).toBe("BEGIN:VCARD\nVERSION:3.0\nFN:A\nEND:VCARD");
  });

  it("vcard: Semikolon, Komma, Backslash und Zeilenumbrüche werden escaped", () => {
    expect(payloadToQrString({ kind: "vcard", value: { name: "a;b,c\\d\ne" } })).toBe(
      "BEGIN:VCARD\nVERSION:3.0\nFN:a\\;b\\,c\\\\d\\ne\nEND:VCARD",
    );
  });

  // Escaping muss auf jedem Feld einzeln festgenagelt sein, sonst bleibt sein Wegfall
  // auf TEL/EMAIL/ORG unentdeckt: Komma und Semikolon sind in vCard 3.0 Feldtrenner,
  // ein Scanner würde "DRK; Kreisverband XY" sonst in mehrere Komponenten zerlegen.
  it("vcard: Semikolon und Komma werden in TEL und ORG escaped", () => {
    expect(
      payloadToQrString({
        kind: "vcard",
        value: { name: "Mustermann, Max", tel: "+4930123456;ext=7", org: "DRK; Kreisverband XY" },
      }),
    ).toBe(
      "BEGIN:VCARD\nVERSION:3.0\nFN:Mustermann\\, Max\nTEL:+4930123456\\;ext=7\nORG:DRK\\; Kreisverband XY\nEND:VCARD",
    );
  });

  it("vcard: Backslash und Zeilenumbruch werden in EMAIL escaped", () => {
    expect(
      payloadToQrString({
        kind: "vcard",
        value: { name: "A\\B", email: "a\nb@x" },
      }),
    ).toBe("BEGIN:VCARD\nVERSION:3.0\nFN:A\\\\B\nEMAIL:a\\nb@x\nEND:VCARD");
  });
});
