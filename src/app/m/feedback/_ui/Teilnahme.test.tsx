// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DIE TEILNAHME-ZONE (Entwurf §2.4) — der Daseinsgrund des Werkzeugs.
 *
 * Was hier bewacht wird, sind drei Zusagen, die still brechen und erst AN DER
 * WAND auffallen:
 *
 * 1. Auf der Karte steht eine SCANNBARE ADRESSE, nicht der Rohtoken. Ein
 *    `bereitschaft-abc12` ohne Protokoll und Host ist kein Link, sondern eine
 *    Zeichenfolge, mit der niemand etwas anfangen kann.
 * 2. Der Host kommt aus den HEADERN, mit Vorrang für `x-forwarded-host`
 *    (`core/routing.resolveHost` — dieselbe EINE Vorrangregel, die die
 *    `qr.png`-Route schon nutzt). Hinter einem Reverse-Proxy trägt `host` den
 *    Upstream-Namen; eine falsche Adresse in einem GEDRUCKTEN Code ist der
 *    teuerste Fehler des Moduls.
 * 3. Die Zone hängt an der GRUPPE, nicht an der Umfrage: sie steht auch dann da,
 *    wenn nichts läuft, und sagt wörtlich, dass einmal drucken reicht. Ohne
 *    diesen Satz druckt jemand jede Woche neu.
 */

import { Teilnahme, teilnahmeUrlAus } from "./Teilnahme";

const TOKEN = "bereitschaft-abc12";
const URL_VOLL = `https://feedback.iuk-ue.de/f/${TOKEN}`;

const UI = join(process.cwd(), "src/app/m/feedback/_ui");
const SEITE = join(
  process.cwd(),
  "src/app/m/feedback/(admin)/groups/[groupId]/page.tsx",
);
const ohneKommentare = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function zeichne(element: ReactElement): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

const zone = (over: { erststart?: boolean } = {}) => (
  <Teilnahme
    url={URL_VOLL}
    token={TOKEN}
    groupId={7}
    erststart={over.erststart ?? false}
  />
);

describe("teilnahmeUrlAus — die EINE Herleitung der öffentlichen Adresse", () => {
  it("nimmt bei umgeschriebenem Host den öffentlichen aus x-forwarded-host", () => {
    const h = new Headers({
      host: "10.0.3.14:3000",
      "x-forwarded-host": "feedback.iuk-ue.de",
      "x-forwarded-proto": "https",
    });
    expect(teilnahmeUrlAus(h, TOKEN)).toBe(URL_VOLL);
  });

  it("bei einer Kommaliste gewinnt der erste Wert (der Client-Host)", () => {
    const h = new Headers({
      host: "10.0.3.14:3000",
      "x-forwarded-host": "feedback.iuk-ue.de, proxy.intern",
      "x-forwarded-proto": "https, http",
    });
    expect(teilnahmeUrlAus(h, TOKEN)).toBe(URL_VOLL);
  });

  it("ohne Proxy-Header bleibt es beim Host-Header und http — wie in der qr.png-Route", () => {
    const h = new Headers({ host: "feedback.localtest.me:3000" });
    expect(teilnahmeUrlAus(h, TOKEN)).toBe(`http://feedback.localtest.me:3000/f/${TOKEN}`);
  });

  it("leerer x-forwarded-host fällt auf host zurück, nicht auf die leere Adresse", () => {
    const h = new Headers({ host: "feedback.localtest.me:3000", "x-forwarded-host": "" });
    expect(teilnahmeUrlAus(h, TOKEN)).toBe(`http://feedback.localtest.me:3000/f/${TOKEN}`);
  });
});

describe("Teilnahme — Zone a (§2.4)", () => {
  it("zeigt die VOLLSTÄNDIGE Adresse mit Protokoll und Host, nicht den Rohtoken", () => {
    const wirt = zeichne(zone());
    const klartext = wirt.querySelector<HTMLElement>('[data-fb="teilnahme-url"]');
    expect(klartext).not.toBeNull();
    expect(klartext!.textContent).toBe(URL_VOLL);
    // Der Rohtoken steht NIE für sich allein auf der Karte.
    expect(klartext!.textContent).toContain("https://");
  });

  it("zeigt den QR EINGEBETTET, nicht nur als Download-Link", () => {
    const bild = zeichne(zone()).querySelector<HTMLImageElement>("img");
    expect(bild).not.toBeNull();
    expect(bild!.getAttribute("src")).toBe(`/f/${TOKEN}/qr.png`);
    expect(bild!.getAttribute("width")).toBe("200");
    expect(bild!.getAttribute("height")).toBe("200");
  });

  it("hinterlegt den QR HART mit #ffffff — auch im Dunkelmodus (Scanner-Lesbarkeit)", () => {
    const kasten = zeichne(zone()).querySelector<HTMLElement>('[data-fb="qr-kasten"]');
    expect(kasten).not.toBeNull();
    expect(kasten!.getAttribute("style")).toContain("#ffffff");
    // NICHT `--fb-card`: das ist im Dunkelmodus #141414 und damit unscannbar.
    expect(kasten!.getAttribute("style")).not.toContain("--fb-card");
  });

  it("trägt den Kartentitel und die Kernaussage wortgenau", () => {
    const t = zeichne(zone()).textContent ?? "";
    expect(t).toContain("DAUERHAFTER ZUGANG");
    expect(t).toContain(
      "Einmal ausdrucken reicht. Der Code bleibt für alle künftigen Dienstabende gültig — er hängt an der Gruppe, nicht am Abend.",
    );
  });

  it("bietet Kopieren, PNG-Download und Aushang im neuen Tab", () => {
    const wirt = zeichne(zone());
    expect(wirt.textContent).toContain("Kopieren");

    const png = wirt.querySelector<HTMLAnchorElement>(`a[href="/f/${TOKEN}/qr.png"]`);
    expect(png).not.toBeNull();
    expect(png!.hasAttribute("download")).toBe(true);
    expect(png!.textContent).toContain("PNG");

    const aushang = wirt.querySelector<HTMLAnchorElement>('a[href="/m/feedback/aushang/7"]');
    expect(aushang).not.toBeNull();
    expect(aushang!.getAttribute("target")).toBe("_blank");
    expect(aushang!.textContent).toContain("Aushang drucken");
  });

  it("Belegung A: nennt zusätzlich, dass der Aushang schon vor dem ersten Abend druckbar ist", () => {
    expect(zeichne(zone({ erststart: true })).textContent).toContain(
      "Du kannst den Aushang schon vor dem ersten Abend drucken.",
    );
    expect(zeichne(zone({ erststart: false })).textContent).not.toContain(
      "schon vor dem ersten Abend",
    );
  });

  /**
   * Die Zone ist auch dann sichtbar, wenn KEINE Umfrage läuft — und zwar
   * baulich: sie kennt keinen Umfrage-Zustand. Wäre sie an `laufend` gehängt,
   * verschwände genau in Belegung A/B (nichts läuft) die Karte, die erklärt, dass
   * einmal drucken reicht. Dann druckt jemand jede Woche neu.
   */
  it("kennt keinen Umfrage-Zustand — sie hängt an der Gruppe, nicht am Abend", () => {
    const code = ohneKommentare(readFileSync(join(UI, "Teilnahme.tsx"), "utf8"));
    for (const begriff of ["laufend", "survey", "zustand", "belegung", "CockpitZustand"]) {
      expect(code).not.toContain(begriff);
    }
    // Und die Kernaussage steht auch ohne jede Variante da.
    expect(zeichne(zone({ erststart: false })).textContent).toContain("Einmal ausdrucken reicht.");
  });

  /**
   * §2.1 ist mit „Kartenstil (ALLE Zonen)" überschrieben, und Teilnahme ist Zone
   * a (§2.4). Eine feste 20 hier bricht STILL und nur auf 390px: Lagekarte und
   * „Letzter Abend" polstern dann mit 16, die Karte daneben mit 20 — im Test
   * fällt das nirgends auf, auf dem Telefon schon. Deshalb wird der
   * Variablenname im Markup geprüft (`styles.body` ist bei antd ein
   * Inline-Style, gegen den eine Klasse mit Medienabfrage verliert) und die
   * feste 20 ausdrücklich ausgeschlossen, damit die nächste neue Karte nicht
   * wieder mit einer Zahl anfängt.
   */
  it("polstert den Kartenrumpf über --fb-kartenpolster, nicht mit einer festen 20 (§2.1)", () => {
    const rumpf = zeichne(zone()).querySelector<HTMLElement>(".ant-card-body");
    expect(rumpf).not.toBeNull();
    const stil = rumpf!.getAttribute("style");
    expect(stil).toContain("padding:var(--fb-kartenpolster)");
    expect(stil).not.toMatch(/padding:\s*20px/);
  });

  it("trägt kein DRK-Rot und keinen zweiten Primärknopf (Farb-Klausel §4.9, §2.6)", () => {
    const markup = renderToStaticMarkup(zone());
    expect(markup.toLowerCase()).not.toContain("#c8000f");
    expect(markup).not.toContain("ant-btn-primary");
  });
});

describe("Cockpit-Seite — EINE Herleitung, zwei Verbraucher", () => {
  const quelle = ohneKommentare(readFileSync(SEITE, "utf8"));

  it("baut die Adresse aus den Headern (resolveHost), nie aus req.url oder moduleUrl", () => {
    expect(quelle).toContain("teilnahmeUrlAus");
    expect(quelle).toContain("headers()");
    expect(quelle).not.toContain("req.url");
    expect(quelle).not.toContain("moduleUrl");
  });

  it("leitet die Adresse GENAU EINMAL her und gibt sie an Zone a UND die Lagekarte", () => {
    expect(quelle.match(/teilnahmeUrlAus\(/g)?.length).toBe(1);
    expect(quelle).toContain("url={teilnahmeUrl}");
    expect(quelle).toContain("teilnahmeUrl={teilnahmeUrl}");
  });

  it("zeigt die Zone auch in der Betriebsart Einrichtung — sonst ist §2.4/A unerreichbar", () => {
    expect(quelle).toContain("<Teilnahme");
    expect(quelle.match(/<Teilnahme/g)?.length).toBe(1);
    /*
     * Geprüft wird GENAU DIE SPALTE, in der die Zone hängt — nicht die ganze
     * Datei. `!einrichtung &&` ist auf dieser Seite ein legitimes Mittel: §2.1
     * verlangt es für Zone d (VERLAUF entfällt in der Einrichtung, ein leeres
     * Fach ist schlimmer als kein Fach). Verboten ist es NUR vor `<Teilnahme`:
     * §2.4/A ist der einzige Ort, an dem der Satz „Du kannst den Aushang schon
     * vor dem ersten Abend drucken" steht, und mit der Spalte wäre er
     * unerreichbar. Die Spalte darf ihre BREITE von `einrichtung` abhängig
     * machen (`? :`) — nur nicht ihre Existenz (`&&`).
     */
    const beginnZone = quelle.indexOf("<Teilnahme");
    const spalte = quelle.slice(quelle.lastIndexOf("<Col", beginnZone), beginnZone);
    expect(spalte).not.toContain("einrichtung &&");
  });

  it("die Zone lebt in `_ui/Teilnahme.tsx` und ist keine Client-Komponente", () => {
    expect(readFileSync(join(UI, "Teilnahme.tsx"), "utf8")).not.toContain('"use client"');
  });
});
