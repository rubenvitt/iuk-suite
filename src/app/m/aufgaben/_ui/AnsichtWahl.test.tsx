// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";
import { ANSICHTEN, ANSICHT_TEXT, AnsichtWahl, alsAnsicht } from "./AnsichtWahl";

afterEach(async () => {
  await unmount();
});

/**
 * DIE WEISSLISTE — ERSCHOEPFEND UEBER `ANSICHTEN`, NICHT UEBER EINE HANDLISTE: eine dritte Sicht
 * (ein Kalender waere der naechste Kandidat) soll hier ohne Zutun mitgeprueft werden, statt still
 * durchzurutschen.
 */
describe("alsAnsicht — die Weissliste fuer `?ansicht=`", () => {
  it("nimmt jeden bekannten Wert unveraendert an", () => {
    for (const wert of ANSICHTEN) {
      expect(alsAnsicht(wert)).toBe(wert);
    }
  });

  /**
   * EIN UNBEKANNTER WERT FAELLT STILL AUF `liste` ZURUECK — kein Wurf. Dieselbe Lehre wie
   * `/archiv`s `alsPrioritaetsFilter` und `_lib/datum.ts`s `montagAusParam`: „ein URL-Parameter ist
   * kein Formularfeld, das eine Ablehnung verdient".
   */
  it.each([undefined, "", "kalender", "BRETT", "liste ", "../etc/passwd"])(
    "faellt bei %o still auf `liste` zurueck",
    (wert) => {
      expect(alsAnsicht(wert)).toBe("liste");
    },
  );

  /**
   * `liste` IST DIE VORGABE, UND DAS IST EINE FACHLICHE SETZUNG (Spec §4.4: der Stapelplatz „muss
   * die leichteste Seite des Moduls bleiben"). `/verteilen` ohne Parameter ist damit woertlich die
   * Seite, die sie vor dieser Runde war — das Brett ist ein Zusatz, den man waehlt. Waere die
   * Vorgabe je `brett`, aendert sich die Bedeutung der Route fuer jeden bestehenden Verweis, und
   * ausser diesem Fall saehe es kein Tor.
   */
  it("hat `liste` als Vorgabe und als ersten Eintrag der Leiste", () => {
    expect(alsAnsicht(undefined)).toBe("liste");
    expect(ANSICHTEN[0]).toBe("liste");
  });

  it("hat fuer jede Sicht eine Beschriftung", () => {
    for (const wert of ANSICHTEN) {
      expect(ANSICHT_TEXT[wert].length).toBeGreaterThan(0);
    }
  });
});

describe("AnsichtWahl — die Leiste", () => {
  const links = (): HTMLAnchorElement[] => [
    ...document.querySelectorAll<HTMLAnchorElement>("[data-rolle='ansichtwahl'] a"),
  ];

  it("rendert je Sicht einen Verweis mit `?ansicht=<wert>` auf der uebergebenen Basis", async () => {
    await mount(<AnsichtWahl ansicht="liste" basis="/verteilen" />);
    expect(links().map((a) => a.getAttribute("href"))).toEqual([
      "/verteilen?ansicht=liste",
      "/verteilen?ansicht=brett",
    ]);
  });

  /**
   * DIE GEWAEHLTE SICHT BLEIBT EIN VERWEIS UND WIRD NICHT GEGEN EIN `<span>` GETAUSCHT: sie zeigt
   * auf die Adresse, auf der man steht, und ist damit die Stelle, an der man die Sicht in ein
   * Lesezeichen legt. Ein ausgetauschtes Element haette ausserdem bei jedem Wechsel eine andere
   * Tabreihenfolge.
   */
  it("zeichnet genau die gewaehlte Sicht mit `aria-current=\"page\"` aus — und bleibt ein Verweis", async () => {
    await mount(<AnsichtWahl ansicht="brett" basis="/verteilen" />);
    const aktuell = links().filter((a) => a.getAttribute("aria-current") === "page");
    expect(aktuell).toHaveLength(1);
    expect(aktuell[0].dataset.ansicht).toBe("brett");
    expect(aktuell[0].tagName).toBe("A");
  });

  /**
   * KEINE REGISTERKARTEN-AUSZEICHNUNG: `role="tablist"`/`role="tab"` verspraechen einer
   * Hilfstechnik Pfeiltasten-Bedienung und ein `tabpanel`, das es hier nicht gibt — es wird
   * NAVIGIERT, der Inhalt wechselt nicht im selben Dokument. Eine Auszeichnung, die mehr behauptet
   * als sie einloest, ist schlechter als gar keine.
   */
  it("ist eine Navigation, keine Registerkarte", async () => {
    await mount(<AnsichtWahl ansicht="liste" basis="/verteilen" />);
    const nav = document.querySelector("[data-rolle='ansichtwahl']")!;
    expect(nav.tagName).toBe("NAV");
    expect(nav.getAttribute("aria-label")).toBe("Ansicht");
    expect(document.querySelector("[role='tablist']")).toBeNull();
    expect(document.querySelector("[role='tab']")).toBeNull();
  });
});

/**
 * DIE DATEI DARF KEIN `"use client"` TRAGEN — FALLE 6, UND VITEST KANN DEN SCHADEN STRUKTURELL
 * NICHT SEHEN (dort ist die Direktive ein wirkungsloser String).
 *
 * `verteilen/page.tsx` ist eine SERVER COMPONENT und importiert aus dieser Datei einen WERT
 * (`alsAnsicht`, `ANSICHTEN`). Traege sie `"use client"`, bekaeme die Seite eine Client-Referenz
 * statt der Funktion — HTTP 500 fuer die ganze Seite, waehrend `typecheck`, `lint`, `build` UND
 * jeder Test dieser Datei gruen blieben. Der Riegel ist deshalb ein QUELLTEXT-Scan, kein
 * Verhaltenstest; nur ein echter Abruf saehe die Wirkung, und der laeuft in `e2e/aufgaben.spec.ts`.
 */
describe("AnsichtWahl.tsx — Falle 6", () => {
  it("traegt kein `use client` — die Seite importiert von hier einen Wert", () => {
    const quelle = readFileSync(join(__dirname, "AnsichtWahl.tsx"), "utf8");
    expect(quelle).not.toMatch(/^\s*["']use client["']/m);
  });
});
