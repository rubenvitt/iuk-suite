// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * „QR-CODE GROSS ZEIGEN" (Entwurf §2.3-Tabelle, §2.4 J-B-2, §4.13).
 *
 * Der zeitkritische Handgriff im Gruppenraum: am Ende des Abends muss der Code
 * in zwei Metern Entfernung lesbar an der Wand oder auf dem Beamer stehen. Die
 * 200px-Vorschau der Teilnahme-Zone leistet das nicht.
 *
 * `darstellung` deckt die ZWEI Rollen aus §2.3 ab, damit die Lagekarte keinen
 * zweiten Knopf-Typ erfindet: `primaer` in den Belegungen C/D (dort ist der
 * Knopf die laute Aktion der Karte), `sekundaer` in A/B (dort ist „Feedback
 * starten" der EINE Primärknopf der Seite, §2.6).
 */

import { QrGross } from "./QrGross";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

const URL_VOLL = "https://feedback.iuk-ue.de/f/bereitschaft-abc12";

const knopf = (darstellung: "primaer" | "sekundaer") => (
  <QrGross url={URL_VOLL} gruppenname="Bereitschaft Übach-Palenberg" darstellung={darstellung} />
);

function zeichne(element: ReactElement): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

afterEach(async () => {
  await unmount();
  document.querySelectorAll(".ant-modal-root").forEach((el) => el.remove());
});

describe("QrGross", () => {
  it("heißt „QR-Code groß zeigen“ und ist in der Darstellung primaer der Primärknopf", () => {
    const b = zeichne(knopf("primaer")).querySelector<HTMLElement>("button");
    expect(b).not.toBeNull();
    expect(b!.textContent).toContain("QR-Code groß zeigen");
    expect(b!.className).toContain("ant-btn-primary");
  });

  it("ist in der Darstellung sekundaer NICHT der Primärknopf (§2.6: genau einer pro Seite)", () => {
    const b = zeichne(knopf("sekundaer")).querySelector<HTMLElement>("button");
    expect(b!.textContent).toContain("QR-Code groß zeigen");
    expect(b!.className).not.toContain("ant-btn-primary");
  });

  it("zeigt vor dem Tippen kein Modal — das Vollbild ist eine Handlung, keine Fläche", () => {
    expect(zeichne(knopf("primaer")).querySelector(".ant-modal")).toBeNull();
  });

  it("öffnet auf Tipp den großen Code samt Gruppenname und Adresse", async () => {
    await mount(knopf("primaer"));

    await clickElement(query("button"));

    // Das Modal portalt an `document.body`, nicht in den Mount-Wirt.
    const modal = document.querySelector<HTMLElement>(".ant-modal");
    expect(modal).not.toBeNull();
    expect(modal!.textContent).toContain("Bereitschaft Übach-Palenberg");
    expect(modal!.textContent).toContain(URL_VOLL);

    const bild = modal!.querySelector<HTMLImageElement>("img");
    expect(bild).not.toBeNull();
    // `?w=1024`: der Endpunkt liefert sonst 512px, und auf einem Beamer sieht man das.
    expect(bild!.getAttribute("src")).toBe(`${URL_VOLL}/qr.png?w=1024`);

    const kasten = modal!.querySelector<HTMLElement>('[data-fb="qr-kasten"]');
    expect(kasten).not.toBeNull();
    // Weiss HART, auch im Dunkelmodus — sonst lesen viele Scanner den Code nicht.
    // jsdom normalisiert die von React gesetzte Eigenschaft zu `rgb(...)`.
    expect(kasten!.style.background).toBe("rgb(255, 255, 255)");
  });
});
