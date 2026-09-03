// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

import { KATALOG_STAND } from "../_lib/katalog";
import { VORBEHALT } from "../_lib/vorbehalt";
import ZeichenStartPage from "./page";

beforeEach(() => {
  sitzung = { user: { groups: [] } };
});

/*
 * `renderToStaticMarkup` UND NICHT `mount` AUS `qr/_lib/test-dom.tsx` — kein zweites Harness,
 * sondern die andere der beiden Hausformen: `mount` ist fuer DOM-VERHALTEN (Eingaben, Klicks),
 * diese Seite hat keines. Vorbild `feedback/(admin)/page.test.tsx:3`. Der Nebeneffekt ist
 * erwuenscht: `next/link` braucht so keinen Router-Kontext, den wir sonst faelschen muessten.
 * Fuer strukturierte Abfragen wandert das Markup in einen losen Knoten.
 */
async function seite() {
  const html = renderToStaticMarkup(await ZeichenStartPage());
  const knoten = document.createElement("div");
  knoten.innerHTML = html;
  return { html, knoten };
}

describe("Startseite zeichen", () => {
  /*
   * FALLE 1: KEIN `Typography.Title`. Der Compound-Zugriff auf antd in einer Server Component
   * ergibt HTTP 500 — die Ueberschrift kommt deshalb aus `core/shell/Seitenkopf`, das ein
   * natives `<h1>` mit `SCHRIFT.titel` rendert.
   */
  it("traegt eine native Ueberschrift", async () => {
    const { knoten } = await seite();
    expect(knoten.querySelector("h1")?.textContent).toBe("Taktische Zeichen");
  });

  /*
   * DER VORBEHALT AUS SPEC §5.6 — der wichtigste Fall dieser Seite.
   * ⛔ `warning`, NIE `error` (Falle 3). Der Griff sitzt IM Titel des Kastens, nicht am Kasten:
   * `Alert` reicht fremde Attribute nicht zuverlaessig an seine Wurzel durch. Ueber
   * `closest(".ant-alert")` kommt man von dort an die Klassen — dieselbe Bauform wie
   * `radio/.../ImportAssistent.test.tsx:164`.
   */
  it("zeigt den fachlichen Vorbehalt als Warnung, nicht als Fehler", async () => {
    const { knoten, html } = await seite();
    const griff = knoten.querySelector('[data-testid="zeichen-vorbehalt"]');
    expect(griff, "kein Vorbehaltskasten auf der Startseite").not.toBeNull();
    expect(griff!.textContent).toBe(VORBEHALT.titel);

    const kasten = griff!.closest(".ant-alert");
    expect(kasten!.className).toContain("ant-alert-warning");
    expect(kasten!.className).not.toContain("ant-alert-error");
    expect(kasten!.textContent).toContain(VORBEHALT.text);

    // Falle 3 gilt fuer die GANZE Seite, nicht nur fuer diesen einen Kasten.
    expect(html).not.toContain("ant-alert-error");
  });

  /*
   * DER KATALOGSTAND. Ohne Erzeugungstag kann niemand beurteilen, ob das, was er sieht, aktuell
   * ist — die Begruendung steht in Spec §7.4 fuer `/offline` und gilt hier genauso, weil beide
   * Flaechen dasselbe eingecheckte Generat zeigen.
   * ⛔ DIE ERWARTUNG LEITET SICH AUS `KATALOG_STAND` AB UND IST KEINE ZWEITSCHRIFT: dass dort
   * 246 und `0.2.0` stehen, ist die Zusage von `_lib/katalog.test.ts`. Dieser Fall prueft, dass
   * die Seite die Werte ZEIGT, nicht welche es sind.
   */
  it("nennt Bestand, Stand und Version der Sammlung", async () => {
    const { knoten } = await seite();
    expect(knoten.querySelector(".ant-statistic-content")?.textContent)
      .toContain(String(KATALOG_STAND.anzahl));
    const zeile = knoten.querySelector('[data-rolle="zeichen-katalogstand"]')?.textContent ?? "";
    expect(zeile).toContain(KATALOG_STAND.erzeugtAm);
    expect(zeile).toContain(KATALOG_STAND.paket);
    expect(zeile).toContain(KATALOG_STAND.daten);
  });

  it("fuehrt in die vier Flaechen des Moduls", async () => {
    const { knoten } = await seite();
    const ziele = [...knoten.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(ziele).toContain("/m/zeichen/katalog");
    expect(ziele).toContain("/m/zeichen/merkliste");
    expect(ziele).toContain("/m/zeichen/baukasten");
    expect(ziele).toContain("/m/zeichen/lernen");
  });

  /*
   * DASSELBE PRAEDIKAT WIE IN DER LEISTE UND AUF DER ROUTE: `canAdminModule("zeichen")`. Ein
   * Einstieg, der fuer alle sichtbar waere, fuehrte fuer die meisten in ein 404.
   */
  it("zeigt den Verwaltungseinstieg nur mit der Modul-Admin-Gruppe", async () => {
    const ohne = await seite();
    expect(ohne.html).not.toContain("/m/zeichen/verwaltung/lernsets");

    sitzung = { user: { groups: ["iuk-zeichen-admin"] } };
    const mit = await seite();
    expect(mit.html).toContain("/m/zeichen/verwaltung/lernsets");
  });
});
