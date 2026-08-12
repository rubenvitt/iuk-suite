// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { EtikettenChrome } from "./EtikettenChrome";

const QUELLE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenChrome.tsx",
  "utf8",
);

describe("Bildschirm-Chrome des Etikettenbogens", () => {
  it("trägt lb-nichtDrucken an jedem äußeren Element", async () => {
    await mount(<EtikettenChrome basis="https://lagerbuch.example" />);
    const wurzel = query("[data-testid='lb-chrome']");
    expect(wurzel.className).toContain("lb-nichtDrucken");
    await unmount();
  });

  it("führt zurück in die Verwaltung", async () => {
    await mount(<EtikettenChrome basis="https://lagerbuch.example" />);
    expect(query("a[href='/verwaltung']")).not.toBeNull();
    await unmount();
  });

  it("nennt die Basis, auf die die QR-Codes zeigen", async () => {
    await mount(<EtikettenChrome basis="https://lagerbuch.example" />);
    expect(query("[data-testid='lb-basis']").textContent)
      .toContain("https://lagerbuch.example");
    await unmount();
  });

  /*
   * DIE REGEL, DIE HIER GEPRUEFT WIRD, IST EINE CSS-REGEL — und deshalb kann
   * dieser Test sie nur halb sehen. `.lb-nichtDrucken{display:none!important}`
   * steht in druck.css innerhalb @media print; jsdom wertet das nicht aus.
   * Was hier haelt: dass die Klasse UEBERHAUPT an jedem aeusseren Element
   * steht. Dass sie im Druck greift, zeigt nur die Druckemulation (Task 9).
   *
   * `!important` in druck.css ist kein Zufall: ein Inline-Style haette
   * hoehere Praezedenz als jede Selektorregel des externen Stylesheets. Wer
   * hier ein `style={{display:...}}` ergaenzt, druckt es mit aufs Etikett.
   */
  it("setzt keinen Inline-display-Style, der die Druckregel schlagen würde", () => {
    expect(QUELLE).not.toMatch(/style=\{\{[^}]*display:/);
  });
});
