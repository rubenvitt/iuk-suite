// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { feldWertImDom, listenOptionen, waehleAusListe } from "./testFelder";
import { ArchivFilter } from "./ArchivFilter";

afterEach(async () => {
  await unmount();
});

/*
 * DAS FELD IST SEIT DER FUENFTEN OBERFLAECHEN-RUNDE (2026-08-16) antds `Select`, nicht mehr ein
 * natives `<select>` — die Zusagen dieses Tests sind DIESELBEN GEBLIEBEN, nur ihre Griffe haben
 * gewechselt: der abgesendete Wert steht jetzt im versteckten Feld neben der Auswahl, und die
 * Optionen haengen im Portal statt als `<option>` im Wirt (Begruendung im Kopf von `Felder.tsx`).
 *
 * DIE VIERTE ZUSAGE IST NEU UND GEHOERT ZUR UMSTELLUNG: die Wahl SENDET das Formular ab. Vorher
 * hing das an `e.currentTarget.form?.requestSubmit()` eines Elements, das selbst im Formular
 * stand; jetzt laeuft es ueber das versteckte Feld, und die REIHENFOLGE (erst Wert schreiben, dann
 * absenden) ist der Teil, der still brechen kann — ohne sie filterte die Seite auf die VORHERIGE
 * Wahl. Genau das misst der Test unten, indem er den Wert IM Moment des Absendens liest.
 */
describe("ArchivFilter — natives GET-Formular, keine eigene Filterung im Browser", () => {
  it("traegt ein GET-Formular auf /archiv mit dem Feldnamen `prioritaet`", async () => {
    await mount(<ArchivFilter prioritaet="" />);
    const form = query<HTMLFormElement>("form");
    expect(form.method.toLowerCase()).toBe("get");
    expect(form.getAttribute("action")).toBe("/archiv");
    expect(query<HTMLInputElement>("input[type='hidden'][name='prioritaet']")).toBeTruthy();
  });

  it("zeigt „Alle“ und jede der drei Prioritaeten als Option", async () => {
    await mount(<ArchivFilter prioritaet="" />);
    await waehleAusListe("#archiv-prioritaet", "Alle");
    expect(listenOptionen().map((o) => o.textContent)).toEqual([
      "Alle",
      "Hoch",
      "Mittel",
      "Niedrig",
    ]);
  });

  it("uebernimmt die vorgegebene Prioritaet als Vorbelegung", async () => {
    await mount(<ArchivFilter prioritaet="hoch" />);
    expect(feldWertImDom("prioritaet")).toBe("hoch");
  });

  /*
   * DER WERT WIRD IM MOMENT DES ABSENDENS GELESEN, NICHT DANACH — und das ist die ganze Aussage.
   * Ein `expect` nach dem Klick saehe den richtigen Wert auch dann, wenn `requestSubmit()` vorher
   * mit dem alten losgelaufen waere; React haette bis dahin laengst neu gerendert. `requestSubmit`
   * ist in jsdom nicht implementiert und wird deshalb ersetzt — der Ersatz ist hier nicht Behelf,
   * sondern der Messpunkt.
   */
  it("die Wahl sendet das Formular ab, und zwar mit dem EBEN gewaehlten Wert", async () => {
    await mount(<ArchivFilter prioritaet="" />);
    const form = query<HTMLFormElement>("form");
    const beimAbsenden: string[] = [];
    form.requestSubmit = vi.fn(() => {
      beimAbsenden.push(new FormData(form).get("prioritaet") as string);
    });

    await waehleAusListe("#archiv-prioritaet", "Niedrig");

    expect(beimAbsenden).toEqual(["niedrig"]);
  });
});
