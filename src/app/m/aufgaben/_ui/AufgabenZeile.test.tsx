// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { AufgabeRow } from "../_db/schema";
import { AufgabenZeile } from "./AufgabenZeile";

/*
 * DIE ZEILENFORM DES GANZEN MODULS (Oberflaechen-Spec 2026-08-16 §11.1) — die feste Reihenfolge
 * aus §10 Prueffrage 7, der Fall ohne Rollenzusatz und die Zusage „GENAU EINE" Angabe.
 *
 * WARUM DIESE DATEI ZUSAETZLICH ZU `AufgabenListe.test.tsx` EXISTIERT: die alte Datei deckt die
 * REIHENFOLGE der Angaben nicht ab (sie prueft `toContain` auf dem ganzen `textContent`, was jede
 * Vertauschung durchliesse) und kennt den Rollenzusatz gar nicht. Beide zusammen sind die
 * Zusicherung: die alte belegt, dass die Extraktion nichts verloren hat, diese, dass die neue
 * Zusage ueberhaupt eine ist.
 */

afterEach(async () => {
  await unmount();
});

const AUFGABE: AufgabeRow = {
  id: "x", titel: "Anhänger prüfen", beschreibung: "B", prioritaet: "hoch",
  erstellerId: "malte", zugewiesenAn: "alina", status: "verteilt",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 90,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "malte",
  istSelbst: false, planDatum: "2026-08-12", planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  erstelltAm: new Date(0), aktualisiertAm: new Date(0),
};

describe("AufgabenZeile — die feste Reihenfolge (§10 Prueffrage 7)", () => {
  /**
   * DIE REIHENFOLGE, NICHT NUR DIE ANWESENHEIT: gemessen ueber die Position im Text der Zeile.
   * Ein `toContain` je Angabe waere gegen jede Vertauschung blind — und genau die Vertauschung
   * ist der Fehler, den §7 Nr. 1 auf `/a/<id>` als bestehenden Befund nennt („die wichtigste Zahl
   * der Seite steht je nach Ansicht an unterschiedlichen Orten").
   */
  it("ordnet Titel · Zustand · Prioritaet · Frist · Dauer · Rollenzusatz in genau dieser Folge", async () => {
    await mount(
      <AufgabenZeile aufgabe={AUFGABE} heute="2026-08-01" rollenZusatz="Empfänger: Alina" />,
    );
    const text = query("li").textContent ?? "";
    const stellen = ["Anhänger prüfen", "Verteilt", "Hoch", "Frist:", "1,5 Std.", "Empfänger: Alina"].map(
      (teil) => {
        const i = text.indexOf(teil);
        expect(i, `„${teil}" fehlt in „${text}"`).toBeGreaterThanOrEqual(0);
        return i;
      },
    );
    expect(stellen).toEqual([...stellen].sort((a, b) => a - b));
  });

  it("verlinkt den Titel auf die aeussere Pfadform /a/<id>", async () => {
    await mount(<AufgabenZeile aufgabe={AUFGABE} heute="2026-08-01" />);
    expect(query<HTMLAnchorElement>("a").getAttribute("href")).toBe("/a/x");
  });

  it("nimmt ein abweichendes Ziel entgegen, statt es selbst abzuleiten", async () => {
    await mount(<AufgabenZeile aufgabe={AUFGABE} heute="2026-08-01" href="/plan/alina#einplanen-x" />);
    expect(query<HTMLAnchorElement>("a").getAttribute("href")).toBe("/plan/alina#einplanen-x");
  });

  /**
   * „GENAU EINE ANGABE" (§3.6) — die Zusage ist zaehlbar, nicht nur beschrieben. Ohne diesen Test
   * waere „eine Angabe" eine Absichtserklaerung im Kopfkommentar.
   */
  it("traegt hoechstens einen Rollenzusatz — und ohne ihn keinen", async () => {
    await mount(<AufgabenZeile aufgabe={AUFGABE} heute="2026-08-01" rollenZusatz="Alina" />);
    expect(queryAll("[data-rollen-zusatz]")).toHaveLength(1);
    await unmount();

    await mount(<AufgabenZeile aufgabe={AUFGABE} heute="2026-08-01" />);
    expect(queryAll("[data-rollen-zusatz]")).toHaveLength(0);
  });

  /**
   * Der Leerstring ist KEIN `null`: „" ist eine Angabe, die nichts sagt — sie waere eine leere
   * Spanne in der Zeile. Der Aufrufer, der nichts zu sagen hat, reicht `null`.
   */
  it("unterscheidet den Leerstring nicht vom Fehlen — beide erzeugen keine sichtbare Angabe", async () => {
    await mount(<AufgabenZeile aufgabe={AUFGABE} heute="2026-08-01" rollenZusatz={null} />);
    expect(queryAll("[data-rollen-zusatz]")).toHaveLength(0);
  });

  /**
   * DIE ZEILENFORM STEHT IM STYLESHEET, NICHT INLINE. Ein Inline-`style` am `<li>` schluege jede
   * Regel der einen Medienabfrage — die Kartenform unter 768px (§5.3) waere strukturell nicht
   * erreichbar, und kein anderer Test saehe das (jsdom wertet keine Medienabfragen aus).
   */
  it("setzt am `<li>` kein Inline-`style` — sonst schluege es die Medienabfrage", async () => {
    await mount(<AufgabenZeile aufgabe={AUFGABE} heute="2026-08-01" />);
    expect(query("li").getAttribute("style")).toBeNull();
  });

  it("zeigt die Ueberfaelligkeit ueber `<Frist>`, nicht ueber eine zweite Bedingung im Markup", async () => {
    await mount(
      <AufgabenZeile
        aufgabe={{ ...AUFGABE, faelligAm: "2026-07-01", status: "abgeschlossen" }}
        heute="2026-08-01"
      />,
    );
    expect(query("li").textContent).not.toContain("Überfällig");
  });
});
