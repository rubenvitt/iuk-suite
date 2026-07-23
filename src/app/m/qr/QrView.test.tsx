import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

/**
 * Sichert den URL-Vertrag `/qr?data&label&kind` ab, den geteilte und
 * gebookmarkte Links aus easy-qr mitbringen: `data` trägt den FERTIG kodierten
 * QR-String (`payloadToQrString` läuft beim Erzeuger, nicht hier), `kind`
 * entscheidet nur, ob der Rohtext zusätzlich lesbar unter dem Code steht.
 * Die Ansicht darf `data` deshalb weder erneut kodieren noch als JSON deuten.
 *
 * Geprüft wird `QrView` samt Parameter-Auslesung, nicht nur die reine
 * Darstellung: dass doppelt gesetzte Parameter beim ERSTEN Wert bleiben, ist
 * eine Zusage des Auslesens. Der Mock liefert deshalb eine echte
 * `URLSearchParams` — eine Attrappe, die schon fertige Einzelwerte
 * zurückgäbe, prüfte genau die Stelle nicht mehr, an der das Problem sitzt.
 */
vi.mock("next/navigation", () => ({ useSearchParams: vi.fn(), useRouter: vi.fn() }));

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "antd";
import { QrView } from "@/app/m/qr/QrView";
import { QrDisplay } from "@/app/m/qr/QrDisplay";

function render(query: string, push: (href: string) => void = vi.fn()): ReactElement {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>,
  );
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  return QrView() as ReactElement;
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

/** `QrView` gibt `<QrViewContent …>` zurueck — erst dessen Aufruf liefert das
 *  Markup, an dem die Zusicherungen haengen. */
function tree(node: ReactElement): ReactElement[] {
  const content = node.type as (props: unknown) => ReactElement;
  return flatten(content(node.props));
}

function testIds(node: ReactElement): string[] {
  return tree(node)
    .map((el) => (el.props as { "data-testid"?: string })["data-testid"])
    .filter((id): id is string => typeof id === "string");
}

// Der Text, den die Anzeige-Komponente tatsaechlich in den QR-Code kodiert.
function qrText(node: ReactElement): string {
  const display = tree(node).find((el) => el.type === QrDisplay);
  if (!display) throw new Error("QrDisplay nicht gerendert");
  return (display.props as { text: string }).text;
}

function qrLabel(node: ReactElement): string {
  const display = tree(node).find((el) => el.type === QrDisplay);
  if (!display) throw new Error("QrDisplay nicht gerendert");
  return (display.props as { label: string }).label;
}

// Die Ueberschrift, die der Nutzer ueber dem Code liest.
function headingText(node: ReactElement): unknown {
  const heading = tree(node).find((el) => el.type === "h1");
  if (!heading) throw new Error("Ueberschrift nicht gerendert");
  return (heading.props as { children?: unknown }).children;
}

// Der Rohtext unter dem Code — die Rueckfallebene zum Abtippen.
function rawText(node: ReactElement): unknown {
  const raw = tree(node).find(
    (el) => (el.props as { "data-testid"?: string })["data-testid"] === "qr-raw",
  );
  if (!raw) throw new Error("Rohtext nicht gerendert");
  return (raw.props as { children?: unknown }).children;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

describe("QR-Ansicht: URL-Vertrag", () => {
  it("reicht einen tel:-Link unveraendert durch", () => {
    // Der Erzeuger hat das Präfix bereits gesetzt. Ein zweites `tel:` wäre eine
    // unbrauchbare Nummer — und fällt niemandem auf, außer beim Anruf.
    expect(qrText(render(q({ data: "tel:+49301234", kind: "tel" })))).toBe("tel:+49301234");
  });

  it("reicht einen WLAN-String durch, statt ihn als JSON zu lesen", () => {
    const wifi = "WIFI:T:WPA;S:Netz;P:pw;H:false;;";
    expect(qrText(render(q({ data: wifi, kind: "wifi" })))).toBe(wifi);
  });

  it("reicht eine vCard mit Zeilenumbruechen durch", () => {
    const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Max\nEND:VCARD";
    expect(qrText(render(q({ data: vcard, kind: "vcard" })))).toBe(vcard);
  });

  it("reicht eine URL durch und zeigt das Label als Ueberschrift", () => {
    const node = render(q({ data: "https://drk.de", label: "Test", kind: "url" }));
    expect(qrText(node)).toBe("https://drk.de");
    expect(headingText(node)).toBe("Test");
  });

  it("reicht das Label bis zu Dateiname und Teilen-Titel durch", () => {
    // Landet als `<label>.png` und als Titel im Teilen-Dialog. Faellt das auf
    // "qr" zurueck, heissen alle Downloads eines Einsatzes qr.png, qr (1).png —
    // der Code stimmt, die Zuordnung ist weg.
    expect(qrLabel(render(q({ data: "https://drk.de", label: "Test", kind: "url" })))).toBe("Test");
  });

  it("kommt ohne kind aus", () => {
    expect(qrText(render(q({ data: "https://drk.de" })))).toBe("https://drk.de");
  });

  it("meldet fehlenden Inhalt, statt einen leeren Code zu erzeugen", () => {
    expect(testIds(render(""))).toContain("qr-missing");
  });

  it("faellt beim Dateinamen auf 'qr' zurueck, wenn kein Label mitkommt", () => {
    expect(qrLabel(render(q({ data: "https://drk.de", kind: "url" })))).toBe("qr");
  });

  it("bietet einen Weg zurueck zum Generator", () => {
    // Diese Seite ist der Landepunkt geteilter Links. Wer so hereinkommt, hat
    // keine Vorgeschichte im Verlauf — ohne diesen Weg bliebe nur die
    // Adresszeile. Der Rueckweg geht ueber `router.push`, nicht `href`: ein
    // echtes `<a>` waere eine volle Dokumentnavigation. Geprueft wird deshalb,
    // dass der Klick tatsaechlich zu "/" navigiert, nicht nur, dass irgendwo
    // ein href="/" im Baum steht.
    const push = vi.fn();
    const back = tree(render(q({ data: "https://drk.de", kind: "url" }), push)).find(
      (el) => el.type === Button && (el.props as { children?: unknown }).children === "← Zurück",
    );
    if (!back) throw new Error("Zurueck-Button nicht gerendert");
    (back.props as { onClick?: () => void }).onClick?.();
    expect(push).toHaveBeenCalledWith("/");
  });
});

describe("QR-Ansicht: Rohtext unter dem Code", () => {
  it("zeigt den Rohtext bei url, tel und text", () => {
    // Der Rohtext ist die manuelle Rueckfallebene: klappt der Scan nicht, tippt
    // jemand ab, was dort steht. Deshalb muss dort die Nutzlast stehen und nicht
    // irgendein Text — ein falscher fuehrt ins Leere, waehrend der Code daneben
    // richtig ist, und der Widerspruch faellt erst beim Anruf auf.
    for (const kind of ["url", "tel", "text"]) {
      const data = `https://drk.de/${kind}`;
      const node = render(q({ data, kind }));
      expect(testIds(node), kind).toContain("qr-raw");
      expect(rawText(node), kind).toBe(data);
    }
  });

  it("verbirgt den Rohtext bei wifi und vcard", () => {
    // Die WLAN-Zeile enthält das Passwort im Klartext, die vCard ist nur
    // Maschinentext — beides gehört nicht groß unter den Code.
    for (const kind of ["wifi", "vcard"]) {
      const node = render(q({ data: "WIFI:T:WPA;S:Netz;P:pw;H:false;;", kind }));
      expect(testIds(node), kind).not.toContain("qr-raw");
    }
  });
});

describe("QR-Ansicht: doppelt gesetzte Query-Parameter", () => {
  it("verbirgt das WLAN-Passwort auch bei doppeltem kind", () => {
    // `?kind=wifi&kind=x`: naehme das Auslesen den letzten oder beide Werte,
    // waere `kind !== "wifi"` wahr und das Klartext-Passwort stuende wieder
    // gross unter dem Code.
    const node = render(
      "data=WIFI%3AT%3AWPA%3BS%3ADRK-Fuehrung%3BP%3Ageheim%3BH%3Afalse%3B%3B&kind=wifi&kind=x",
    );
    expect(testIds(node)).not.toContain("qr-raw");
  });

  it("kodiert bei doppeltem data nur den ersten Wert", () => {
    // Beide Werte zusammengefasst ergaeben "tel:+49301234,x" — ein Code, den
    // niemand anwaehlen kann, ohne jede Fehlermeldung.
    expect(qrText(render("data=tel%3A%2B49301234&data=x&kind=tel"))).toBe("tel:+49301234");
  });

  it("nimmt bei doppeltem label den ersten Wert", () => {
    const node = render("data=https%3A%2F%2Fdrk.de&label=Test&label=x&kind=url");
    expect(headingText(node)).toBe("Test");
    expect(qrLabel(node)).toBe("Test");
  });
});
