// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { RangKnoepfe } from "./RangKnoepfe";

/*
 * WIE `RoutinenTabelle.test.tsx`: `../actions` wird NICHT gemockt, weil kein Test hier tatsaechlich
 * absendet (kein `click`/`submitForm`) — `rangVerschiebenAction` muss deshalb nicht ausfuehrbar sein,
 * nur als Funktionsreferenz an `<form action={...}>` uebergeben werden koennen.
 *
 * DIESER TEST NIMMT ZWEI ZEILEN (Lektion 2 dieser Aufgabenreihe, Vorbild `RoutinenTabelle.test.tsx`,
 * Commit `9d3bb4e`): eine fest verdrahtete `aufgabeId` waere mit einer einzigen Instanz nicht von der
 * richtigen zu unterscheiden.
 */

afterEach(async () => {
  await unmount();
});

describe("RangKnoepfe — Zeile 1", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/RangKnoepfe.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });
});

describe("RangKnoepfe — zwei Instanzen tragen je die EIGENE aufgabeId, nicht die der anderen", () => {
  it("das versteckte aufgabeId-Feld unterscheidet sich je Instanz", async () => {
    await mount(
      <>
        <RangKnoepfe aufgabeId="a-1" titel="Erste" istErste={false} istLetzte={false} />
        <RangKnoepfe aufgabeId="a-2" titel="Zweite" istErste={false} istLetzte={false} />
      </>,
    );
    const ids = queryAll<HTMLInputElement>("input[name='aufgabeId']").map((i) => i.value);
    expect(ids).toEqual(["a-1", "a-1", "a-2", "a-2"]);
  });

  it("das versteckte richtung-Feld traegt hoch im ersten, runter im zweiten Formular JEDER Instanz", async () => {
    await mount(
      <>
        <RangKnoepfe aufgabeId="a-1" titel="Erste" istErste={false} istLetzte={false} />
        <RangKnoepfe aufgabeId="a-2" titel="Zweite" istErste={false} istLetzte={false} />
      </>,
    );
    const richtungen = queryAll<HTMLInputElement>("input[name='richtung']").map((i) => i.value);
    expect(richtungen).toEqual(["hoch", "runter", "hoch", "runter"]);
  });

  it("das aria-label traegt je Instanz den EIGENEN Titel, nicht den der anderen Zeile", async () => {
    await mount(
      <>
        <RangKnoepfe aufgabeId="a-1" titel="Erste Aufgabe" istErste={false} istLetzte={false} />
        <RangKnoepfe aufgabeId="a-2" titel="Zweite Aufgabe" istErste={false} istLetzte={false} />
      </>,
    );
    const labels = queryAll<HTMLButtonElement>("button").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "„Erste Aufgabe“ einen Rang nach oben verschieben",
      "„Erste Aufgabe“ einen Rang nach unten verschieben",
      "„Zweite Aufgabe“ einen Rang nach oben verschieben",
      "„Zweite Aufgabe“ einen Rang nach unten verschieben",
    ]);
  });
});

describe("RangKnoepfe — deaktiviert vorhanden, nicht weg", () => {
  it("die erste Zeile hat kein aktives Auf, das Ab bleibt aktiv", async () => {
    await mount(<RangKnoepfe aufgabeId="a-1" titel="T" istErste={true} istLetzte={false} />);
    const buttons = queryAll<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.disabled).toBe(true);
    expect(buttons[1]!.disabled).toBe(false);
  });

  it("die letzte Zeile hat kein aktives Ab, das Auf bleibt aktiv", async () => {
    await mount(<RangKnoepfe aufgabeId="a-1" titel="T" istErste={false} istLetzte={true} />);
    const buttons = queryAll<HTMLButtonElement>("button");
    expect(buttons[0]!.disabled).toBe(false);
    expect(buttons[1]!.disabled).toBe(true);
  });

  it("eine Zeile, die weder erste noch letzte ist, hat beide Knoepfe aktiv", async () => {
    await mount(<RangKnoepfe aufgabeId="a-1" titel="T" istErste={false} istLetzte={false} />);
    const buttons = queryAll<HTMLButtonElement>("button");
    expect(buttons.every((b) => !b.disabled)).toBe(true);
  });

  /*
   * GEGENPROBE (b), ERSTE HAELFTE (Brief: „Entferne versuchsweise ... die Begrenzung 'erster hat
   * kein Auf', und zeig, dass Tests rot werden"): wird `disabled={istErste}` aus `RangKnoepfe.tsx`
   * entfernt, wird GENAU DIESER Test rot (der Auf-Knopf waere dann `disabled === false`). Ergebnis
   * dieser Gegenprobe steht im Bericht — nicht dauerhaft im Code, nur waehrend der Pruefung
   * durchgefuehrt.
   */
  it("Ikone und sichtbarer Text stehen nebeneinander — die Bedeutung traegt der Text, nicht nur das Zeichen", async () => {
    await mount(<RangKnoepfe aufgabeId="a-1" titel="T" istErste={false} istLetzte={false} />);
    const buttons = queryAll<HTMLButtonElement>("button");
    expect(buttons[0]!.textContent).toContain("Auf");
    expect(buttons[1]!.textContent).toContain("Ab");
    const zeichen = queryAll("[data-zeichen]").map((z) => z.getAttribute("data-zeichen"));
    expect(zeichen).toEqual(["rang-hoch", "rang-runter"]);
    expect(query("[data-zeichen='rang-hoch']").getAttribute("aria-hidden")).toBe("true");
  });
});
