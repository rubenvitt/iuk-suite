// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { NachweisBild } from "./NachweisBild";

afterEach(async () => {
  await unmount();
});

/**
 * DER BILDTEIL, EINZELN GETESTET (Aufgabe 19) — dieselbe Komponente laeuft in `_ui/FreigabeZone.tsx`
 * und `a/[id]/page.tsx`; hier wird nur ihre eigene Entscheidung geprueft: `freigegeben` UND `datei`
 * zeigen das Bild, alles andere zeigt eine Begruendung statt eines `<img>`.
 */
describe("NachweisBild — nur sauber zeigt, sonst steht die Begruendung an seiner Stelle", () => {
  it("zeigt ein <img> mit der Auslieferungsroute als src, wenn freigegeben", async () => {
    await mount(
      <NachweisBild
        aufgabeId="a1"
        nachweisId="n1"
        datei={{ dateiname: "beweisfoto.jpg", scanStatus: "sauber" }}
        freigegeben={true}
      />,
    );
    const img = query<HTMLImageElement>("[data-testid='nachweis-bild']");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/a/a1/nachweis/n1");
    expect(img.getAttribute("alt")).toBe("beweisfoto.jpg");
  });

  it("zeigt KEIN <img>, wenn die Datei offen ist — auch wenn `freigegeben` faelschlich true waere", async () => {
    // Gegenprobe fuer die Bedingung `freigegeben && datei !== null`: `freigegeben` allein reicht
    // nicht, `datei` muss ebenfalls vorhanden sein (Datenzeile ohne Datei ist ein Datenfehler-Fall).
    await mount(
      <NachweisBild aufgabeId="a1" nachweisId="n1" datei={null} freigegeben={true} />,
    );
    expect(document.querySelector("img")).toBeNull();
    expect(query("[data-testid='nachweis-bild-grund']").textContent).toContain(
      "Das Bild ist nicht verfügbar.",
    );
  });

  it("`offen`: „wird noch geprüft“ — eine Auskunft, keine Behauptung ueber Abwesenheit", async () => {
    await mount(
      <NachweisBild
        aufgabeId="a1"
        nachweisId="n1"
        datei={{ dateiname: "x.jpg", scanStatus: "offen" }}
        freigegeben={false}
      />,
    );
    expect(document.querySelector("img")).toBeNull();
    expect(query("[data-testid='nachweis-bild-grund']").textContent).toContain(
      "wird noch geprüft",
    );
  });

  it("`befund`: Fund-Meldung, kein Bild", async () => {
    await mount(
      <NachweisBild
        aufgabeId="a1"
        nachweisId="n1"
        datei={{ dateiname: "x.jpg", scanStatus: "befund" }}
        freigegeben={false}
      />,
    );
    expect(document.querySelector("img")).toBeNull();
    expect(query("[data-testid='nachweis-bild-grund']").textContent).toContain("Fund");
  });

  it("`fehler`: eigene Meldung, kein Bild", async () => {
    await mount(
      <NachweisBild
        aufgabeId="a1"
        nachweisId="n1"
        datei={{ dateiname: "x.jpg", scanStatus: "fehler" }}
        freigegeben={false}
      />,
    );
    expect(document.querySelector("img")).toBeNull();
    expect(query("[data-testid='nachweis-bild-grund']").textContent).toContain(
      "fehlgeschlagen",
    );
  });
});
