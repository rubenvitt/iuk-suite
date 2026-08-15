// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { AufgabeRow } from "../_db/schema";
import { AufgabenListe } from "./AufgabenListe";

afterEach(async () => {
  await unmount();
});

const AUFGABE: AufgabeRow = {
  id: "x", titel: "Anhänger prüfen", beschreibung: "B", prioritaet: "hoch",
  erstellerId: "malte", zugewiesenAn: "alina", status: "verteilt",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 90,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "malte",
  istSelbst: false, planDatum: null, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  erstelltAm: new Date(0), aktualisiertAm: new Date(0),
};

describe("AufgabenListe", () => {
  it("eine Zeile trägt Titel, Status, Priorität, Frist und Dauer", async () => {
    await mount(<AufgabenListe zeilen={[{ aufgabe: AUFGABE }]} heute="2026-08-01" leerText="leer" />);
    const zeile = query("li");
    expect(zeile.textContent).toContain("Anhänger prüfen");
    expect(zeile.textContent).toContain("Verteilt");
    expect(zeile.textContent).toContain("Hoch");
    expect(zeile.textContent).toContain("14.08");
    expect(zeile.textContent).toContain("1,5 Std.");
  });

  it("der Zeilentitel verlinkt auf die äußere Pfadform /a/<id>, nicht /m/aufgaben/a/<id>", async () => {
    await mount(<AufgabenListe zeilen={[{ aufgabe: AUFGABE }]} heute="2026-08-01" leerText="leer" />);
    expect(query<HTMLAnchorElement>("a").getAttribute("href")).toBe("/a/x");
  });

  /*
   * DER NAHELIEGENDE FEHLER: eine zweite, eigene Bedingung im Markup
   * ("faelligAm < heute") statt der Ableitung aus `_lib/anzeige.ts`. Diese
   * Aufgabe ist in der Vergangenheit faellig UND abgeschlossen —
   * `istUeberfaellig` sagt deshalb false, eine naive Datumsprüfung im Markup
   * saehe es anders.
   */
  it('zeigt „Überfällig“ NICHT bei einer abgeschlossenen Aufgabe mit verstrichener Frist (istUeberfaellig, nicht eine zweite Bedingung im Markup)', async () => {
    await mount(
      <AufgabenListe
        zeilen={[{ aufgabe: { ...AUFGABE, faelligAm: "2026-07-01", status: "abgeschlossen" } }]}
        heute="2026-08-01"
        leerText="leer"
      />,
    );
    expect(query("li").textContent).not.toContain("Überfällig");
  });

  it('zeigt „Überfällig“, wenn istUeberfaellig true ist', async () => {
    await mount(
      <AufgabenListe
        zeilen={[{ aufgabe: { ...AUFGABE, faelligAm: "2026-07-01", status: "verteilt" } }]}
        heute="2026-08-01"
        leerText="leer"
      />,
    );
    expect(query("li").textContent).toContain("Überfällig");
  });

  it('zeigt „Zeitvorschlag offen“ genau dann, wenn vorschlagOffen es sagt', async () => {
    await mount(
      <AufgabenListe
        zeilen={[
          { aufgabe: { ...AUFGABE, status: "verteilt", planDatum: null, vorschlagDatum: "2026-08-05" } },
        ]}
        heute="2026-08-01"
        leerText="leer"
      />,
    );
    expect(query("li").textContent).toContain("Zeitvorschlag offen");
  });

  /*
   * Die Vorschlagsfelder BLEIBEN nach dem Einplanen stehen (der Verlauf soll
   * belegen koennen, ob angenommen oder abgewichen wurde) — „Vorschlag offen"
   * ist deshalb false, sobald `planDatum` gesetzt ist, auch wenn
   * `vorschlagDatum` noch da steht. Eine Markup-Bedingung, die nur auf
   * `vorschlagDatum !== null` prueft, saehe das nicht.
   */
  it('zeigt „Zeitvorschlag offen“ NICHT, sobald die Aufgabe eingeplant ist — obwohl der Vorschlag stehen bleibt', async () => {
    await mount(
      <AufgabenListe
        zeilen={[
          {
            aufgabe: {
              ...AUFGABE,
              status: "verteilt",
              planDatum: "2026-08-06",
              vorschlagDatum: "2026-08-05",
            },
          },
        ]}
        heute="2026-08-01"
        leerText="leer"
      />,
    );
    expect(query("li").textContent).not.toContain("Zeitvorschlag offen");
  });

  it("rendert die uebergebenen Aktionen je Zeile", async () => {
    await mount(
      <AufgabenListe
        zeilen={[{ aufgabe: AUFGABE, aktionen: <button type="button">Annehmen</button> }]}
        heute="2026-08-01"
        leerText="leer"
      />,
    );
    expect(query("button").textContent).toBe("Annehmen");
  });

  it("ohne Aktionen bleibt die Zeile ohne Knopf", async () => {
    await mount(<AufgabenListe zeilen={[{ aufgabe: AUFGABE }]} heute="2026-08-01" leerText="leer" />);
    expect(queryAll("button")).toHaveLength(0);
  });

  /*
   * DIE BEIDEN TESTS OBEN PRUEFEN JE EINE EINZELNE ZEILE MIT/OHNE Aktion —
   * das faengt nicht, wenn `aktionen` versehentlich fuer ALLE Zeilen gelten
   * wuerde (z. B. ein Copy-Paste-Fehler, der die erste Zeile ihre Aktionen an
   * jede weitere weiterreicht). Hier zwei Zeilen, nur eine mit `aktionen`.
   */
  it("bei mehreren Zeilen traegt nur die Zeile mit eigenen Aktionen einen Knopf", async () => {
    await mount(
      <AufgabenListe
        zeilen={[
          { aufgabe: { ...AUFGABE, id: "a" }, aktionen: <button type="button">Annehmen</button> },
          { aufgabe: { ...AUFGABE, id: "b" } },
        ]}
        heute="2026-08-01"
        leerText="leer"
      />,
    );
    const zeilen = queryAll("li");
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]!.querySelectorAll("button")).toHaveLength(1);
    expect(zeilen[1]!.querySelectorAll("button")).toHaveLength(0);
  });

  it("der Leerzustand zeigt den uebergebenen Satz, ohne <ul>", async () => {
    await mount(
      <AufgabenListe zeilen={[]} heute="2026-08-01" leerText="Posteingang leer — alles verteilt" />,
    );
    expect(query("p").textContent).toBe("Posteingang leer — alles verteilt");
    expect(queryAll("ul")).toHaveLength(0);
  });

  it("mehrere Zeilen behalten die uebergebene Reihenfolge", async () => {
    await mount(
      <AufgabenListe
        zeilen={[
          { aufgabe: { ...AUFGABE, id: "a", titel: "Erste" } },
          { aufgabe: { ...AUFGABE, id: "b", titel: "Zweite" } },
        ]}
        heute="2026-08-01"
        leerText="leer"
      />,
    );
    expect(queryAll("li").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Erste"),
      expect.stringContaining("Zweite"),
    ]);
  });
});
