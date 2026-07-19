// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Was die drei Formulare in `data` schreiben, ist der eigentliche Inhalt des
 * gedruckten Aushangs — und typkorrekt vertauschbar: SSID gegen Passwort,
 * Telefon gegen E-Mail, `kind: "tel"` gegen `kind: "text"`. Der Typecheck sieht
 * davon nichts, deshalb pruefen diese Tests den fertigen QR-String, den die
 * Navigation mitnimmt.
 */
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
// next/link greift auf den App-Router-Kontext zu, den es hier nicht gibt.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { useRouter } from "next/navigation";
import WifiPage from "@/app/m/qr/wifi/page";
import TelPage from "@/app/m/qr/tel/page";
import ContactPage from "@/app/m/qr/contact/page";
import { clearHistory, loadHistory } from "@/app/m/qr/_lib/history";
import { click, fill, mount, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

const push = vi.fn();

beforeEach(() => {
  push.mockClear();
  localStorage.clear();
  clearHistory();
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
});

afterEach(async () => {
  await unmount();
});

/** Der QR-Inhalt, den die Ansicht spaeter unveraendert kodiert. */
function pushedParam(name: string): string {
  expect(push).toHaveBeenCalledTimes(1);
  const href = push.mock.calls[0][0] as string;
  return new URL(href, "http://qr.localtest.me").searchParams.get(name) ?? "";
}

describe("WLAN-Formular", () => {
  it("setzt Netzwerkname und Passwort an die richtige Stelle der WIFI-Zeile", async () => {
    await mount(<WifiPage />);
    await fill("#wifi-ssid", "DRK Einsatz");
    await fill("#wifi-pass", "geheim123");
    await submitForm();

    expect(pushedParam("data")).toBe("WIFI:T:WPA;S:DRK Einsatz;P:geheim123;H:false;;");
    expect(pushedParam("label")).toBe("WLAN: DRK Einsatz");
    expect(pushedParam("kind")).toBe("wifi");
  });

  it("uebernimmt die gewaehlte Verschluesselung", async () => {
    await mount(<WifiPage />);
    await fill("#wifi-ssid", "Gast");
    await click('input[name="encryption"][value="nopass"]');
    await submitForm();

    expect(pushedParam("data")).toBe("WIFI:T:nopass;S:Gast;P:;H:false;;");
  });

  it("uebernimmt das Merkmal 'verstecktes Netzwerk'", async () => {
    await mount(<WifiPage />);
    await fill("#wifi-ssid", "Versteckt");
    await click('input[type="checkbox"]');
    await submitForm();

    expect(pushedParam("data")).toBe("WIFI:T:WPA;S:Versteckt;P:;H:true;;");
  });

  it("schreibt den Verlaufseintrag mit demselben Payload", async () => {
    await mount(<WifiPage />);
    await fill("#wifi-ssid", "DRK Einsatz");
    await fill("#wifi-pass", "geheim123");
    await submitForm();

    expect(loadHistory()[0].payload).toEqual({
      kind: "wifi",
      value: { ssid: "DRK Einsatz", password: "geheim123", encryption: "WPA", hidden: false },
    });
  });
});

describe("Telefon-Formular", () => {
  it("erzeugt genau ein tel:-Praefix, damit der Scan waehlt statt nur Text zu zeigen", async () => {
    await mount(<TelPage />);
    await fill("#tel-number", "+49 151 12345678");
    await submitForm();

    expect(pushedParam("data")).toBe("tel:+49 151 12345678");
    expect(pushedParam("kind")).toBe("tel");
  });
});

describe("Kontakt-Formular", () => {
  it("traegt Telefon und E-Mail in ihre jeweils eigene vCard-Zeile", async () => {
    await mount(<ContactPage />);
    await fill("#c-name", "Max Mustermann");
    await fill("#c-tel", "+4930123");
    await fill("#c-email", "max@drk.de");
    await fill("#c-org", "DRK");
    await submitForm();

    expect(pushedParam("data")).toBe(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:Max Mustermann",
        "TEL:+4930123",
        "EMAIL:max@drk.de",
        "ORG:DRK",
        "END:VCARD",
      ].join("\n"),
    );
    expect(pushedParam("kind")).toBe("vcard");
  });

  // Leere Felder muessen zu undefined werden: eine leere `TEL:`-Zeile bringt
  // manche Adressbuecher zum Stolpern.
  it("laesst ungefuellte Felder ganz weg, statt leere Zeilen zu schreiben", async () => {
    await mount(<ContactPage />);
    await fill("#c-name", "Nur Name");
    await submitForm();

    const data = pushedParam("data");
    expect(data).toBe(["BEGIN:VCARD", "VERSION:3.0", "FN:Nur Name", "END:VCARD"].join("\n"));
    expect(data).not.toContain("TEL:");
    expect(data).not.toContain("EMAIL:");
    expect(data).not.toContain("ORG:");
  });
});
