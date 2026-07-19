import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import QrViewPage from "@/app/m/qr/qr/page";
import { QrDisplay } from "@/app/m/qr/QrDisplay";

/**
 * Sichert den URL-Vertrag `/qr?data&label&kind` ab, den geteilte und
 * gebookmarkte Links aus easy-qr mitbringen: `data` trägt den FERTIG kodierten
 * QR-String (`payloadToQrString` läuft beim Erzeuger, nicht hier), `kind`
 * entscheidet nur, ob der Rohtext zusätzlich lesbar unter dem Code steht.
 * Die Seite darf `data` deshalb weder erneut kodieren noch als JSON deuten.
 */

async function render(params: { data?: string; label?: string; kind?: string }) {
  return (await QrViewPage({ searchParams: Promise.resolve(params) })) as ReactElement;
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

function testIds(tree: ReactElement): string[] {
  return flatten(tree)
    .map((el) => (el.props as { "data-testid"?: string })["data-testid"])
    .filter((id): id is string => typeof id === "string");
}

// Der Text, den die Anzeige-Komponente tatsaechlich in den QR-Code kodiert.
function qrText(tree: ReactElement): string {
  const display = flatten(tree).find((el) => el.type === QrDisplay);
  if (!display) throw new Error("QrDisplay nicht gerendert");
  return (display.props as { text: string }).text;
}

function qrLabel(tree: ReactElement): string {
  const display = flatten(tree).find((el) => el.type === QrDisplay);
  if (!display) throw new Error("QrDisplay nicht gerendert");
  return (display.props as { label: string }).label;
}

describe("QR-Ansicht: URL-Vertrag", () => {
  it("reicht einen tel:-Link unveraendert durch", async () => {
    // Der Erzeuger hat das Präfix bereits gesetzt. Ein zweites `tel:` wäre eine
    // unbrauchbare Nummer — und fällt niemandem auf, außer beim Anruf.
    const tree = await render({ data: "tel:+49301234", kind: "tel" });
    expect(qrText(tree)).toBe("tel:+49301234");
  });

  it("reicht einen WLAN-String durch, statt ihn als JSON zu lesen", async () => {
    const wifi = "WIFI:T:WPA;S:Netz;P:pw;H:false;;";
    const tree = await render({ data: wifi, kind: "wifi" });
    expect(qrText(tree)).toBe(wifi);
  });

  it("reicht eine vCard mit Zeilenumbruechen durch", async () => {
    const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Max\nEND:VCARD";
    const tree = await render({ data: vcard, kind: "vcard" });
    expect(qrText(tree)).toBe(vcard);
  });

  it("reicht eine URL durch und zeigt das Label als Ueberschrift", async () => {
    const tree = await render({ data: "https://drk.de", label: "Test", kind: "url" });
    expect(qrText(tree)).toBe("https://drk.de");
    expect(flatten(tree).some((el) => el.type === "h1")).toBe(true);
  });

  it("kommt ohne kind aus", async () => {
    const tree = await render({ data: "https://drk.de" });
    expect(qrText(tree)).toBe("https://drk.de");
  });

  it("meldet fehlenden Inhalt, statt einen leeren Code zu erzeugen", async () => {
    expect(testIds(await render({}))).toContain("qr-missing");
  });

  it("faellt beim Dateinamen auf 'qr' zurueck, wenn kein Label mitkommt", async () => {
    expect(qrLabel(await render({ data: "https://drk.de", kind: "url" }))).toBe("qr");
  });

  it("bietet einen Weg zurueck zum Generator", async () => {
    // Diese Seite ist der Landepunkt geteilter Links. Wer so hereinkommt, hat
    // keine Vorgeschichte im Verlauf — ohne Link bliebe nur die Adresszeile.
    const tree = await render({ data: "https://drk.de", kind: "url" });
    const hrefs = flatten(tree).map((el) => (el.props as { href?: string }).href);
    expect(hrefs).toContain("/");
  });
});

describe("QR-Ansicht: Rohtext unter dem Code", () => {
  it("zeigt den Rohtext bei url, tel und text", async () => {
    for (const kind of ["url", "tel", "text"]) {
      const tree = await render({ data: "https://drk.de", kind });
      expect(testIds(tree), kind).toContain("qr-raw");
    }
  });

  it("verbirgt den Rohtext bei wifi und vcard", async () => {
    // Die WLAN-Zeile enthält das Passwort im Klartext, die vCard ist nur
    // Maschinentext — beides gehört nicht groß unter den Code.
    for (const kind of ["wifi", "vcard"]) {
      const tree = await render({ data: "WIFI:T:WPA;S:Netz;P:pw;H:false;;", kind });
      expect(testIds(tree), kind).not.toContain("qr-raw");
    }
  });
});
