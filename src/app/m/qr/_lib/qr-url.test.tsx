import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import { payloadToQrString } from "@/app/m/qr/_lib/payload";
import type { QrPayload } from "@/app/m/qr/_lib/types";
import QrViewPage from "@/app/m/qr/qr/page";
import { QrDisplay } from "@/app/m/qr/QrDisplay";

/**
 * Die Gegenprobe zu `qr/page.test.tsx`: dort steht, dass die Ansicht `data`
 * unveraendert an die Anzeige durchreicht. Daraus folgt zwingend, dass JEDER
 * Erzeuger `payloadToQrString` selbst aufruft. Genau diese Haelfte des Vertrags
 * sichert diese Suite ab — sie faellt, sobald jemand wieder den Rohwert oder
 * (schlimmer) JSON in `data` schreibt.
 */

function params(href: string): URLSearchParams {
  return new URL(href, "http://qr.localtest.me").searchParams;
}

function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (isValidElement(node)) {
    out.push(node);
    flatten((node.props as { children?: unknown }).children, out);
  }
  return out;
}

/** Was am Ende der Kette tatsaechlich im QR-Code landet. */
async function qrTextFor(href: string): Promise<string> {
  const search = params(href);
  const tree = (await QrViewPage({
    searchParams: Promise.resolve(Object.fromEntries(search.entries())),
  })) as ReactElement;
  const display = flatten(tree).find((el) => el.type === QrDisplay);
  if (!display) throw new Error("QrDisplay nicht gerendert");
  return (display.props as { text: string }).text;
}

const wifi: QrPayload = {
  kind: "wifi",
  value: { ssid: "DRK Einsatz", password: "geheim;1", encryption: "WPA", hidden: false },
};
const vcard: QrPayload = {
  kind: "vcard",
  value: { name: "Max Mustermann", tel: "+4930123", org: "DRK" },
};

describe("buildQrUrl", () => {
  it("uebergibt label und kind unveraendert", () => {
    const p = params(buildQrUrl("Mein Link", { kind: "url", value: "https://drk.de" }));
    expect(p.get("label")).toBe("Mein Link");
    expect(p.get("kind")).toBe("url");
    expect(p.get("data")).toBe("https://drk.de");
  });

  it("setzt bei tel das tel:-Praefix — der Leser ergaenzt es nicht", () => {
    const p = params(buildQrUrl("Tel", { kind: "tel", value: "+49301234567" }));
    expect(p.get("data")).toBe("tel:+49301234567");
  });

  it("kodiert WLAN als WIFI:-Zeile, nicht als JSON", () => {
    const data = params(buildQrUrl("WLAN", wifi)).get("data");
    expect(data).toBe(payloadToQrString(wifi));
    expect(data).toMatch(/^WIFI:/);
    expect(() => JSON.parse(data ?? "")).toThrow();
  });

  it("kodiert Kontakte als vCard, nicht als JSON", () => {
    const data = params(buildQrUrl("Kontakt", vcard)).get("data");
    expect(data).toBe(payloadToQrString(vcard));
    expect(data).toMatch(/^BEGIN:VCARD/);
  });

  it("maskiert Sonderzeichen, die sonst die Query zerlegen wuerden", () => {
    const href = buildQrUrl("A&B", { kind: "text", value: "x=1&y=2 #ende" });
    expect(params(href).get("data")).toBe("x=1&y=2 #ende");
    expect(params(href).get("label")).toBe("A&B");
  });

  it.each([
    ["url", { kind: "url", value: "https://drk.de/a?b=1" }] as const,
    ["text", { kind: "text", value: "Freitext mit Umlaut: Grösse" }] as const,
    ["tel", { kind: "tel", value: "+49 151 12345678" }] as const,
    ["wifi", wifi] as const,
    ["vcard", vcard] as const,
  ])("Rundlauf %s: was der Leser anzeigt, ist payloadToQrString", async (_name, payload) => {
    expect(await qrTextFor(buildQrUrl("L", payload))).toBe(payloadToQrString(payload));
  });
});
