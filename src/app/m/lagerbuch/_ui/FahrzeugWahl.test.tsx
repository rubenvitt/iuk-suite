// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { FahrzeugWahl } from "./FahrzeugWahl";

const QUELLE = "src/app/m/lagerbuch/_ui/FahrzeugWahl.tsx";
const STYLESHEET = "src/app/m/lagerbuch/_ui/helfer.module.css";

const FZ = [
  { id: "fz-1", name: "RTW 1", kennung: "HH-DR 1234", einheitenart: "fahrzeug" as const },
  { id: "fz-2", name: "MTW", kennung: null, einheitenart: "fahrzeug" as const },
];

/**
 * DRK-309 — die Liste, um die es geht: ein Fahrzeug MIT Kennung, eine Tasche
 * OHNE, und eine Einheit, deren Art noch nicht zugeordnet ist.
 */
const GEMISCHT = [
  { id: "fz-1", name: "RTW 1", kennung: "HH-DR 1234", einheitenart: "fahrzeug" as const },
  { id: "ta-1", name: "Sanitätstasche 1", kennung: null, einheitenart: "tasche" as const },
  { id: "ohne-1", name: "Rucksack Betreuung", kennung: null, einheitenart: null },
];

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 der Regeldatei
 * fuer Teil 4, Nachtrag N-5). `bauform.test.ts` exportiert sie nicht, und dies ist
 * ein anderer Testkoerper — deshalb die zeichengleiche lokale Kopie statt eines
 * Re-Exports, genau wie `_lib/pwaIcons.test.ts` (T65),
 * `_lib/schreibpfade/tokenEinloesung.test.ts` (T66) und `_ui/rahmen.test.tsx` (T69)
 * es halten.
 *
 * ⚠️ OHNE SIE IST DER SERVER-COMPONENT-SCAN AUF SEINER EIGENEN BEGRUENDUNG ROT.
 * `FahrzeugWahl.tsx` schreibt „KEIN "use client"" und den Grund dafuer
 * (`useState`-Umschalter in der Client-Komponente) woertlich in seinen
 * Kopfkommentar — genau die Begruendung, die der Plan konserviert haben will. Die
 * naheliegende „Reparatur" waere, sie zu loeschen.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/** Jeder Klassenname, den eine Quelldatei als `s.name` aus dem Stylesheet zieht. */
function genutzteKlassen(pfad: string): string[] {
  const treffer = ohneKommentare(readFileSync(pfad, "utf8")).matchAll(/\bs\.([A-Za-z][A-Za-z0-9_]*)/g);
  return [...new Set([...treffer].map((m) => m[1]!))];
}

/** Jeder Klassenname, den `helfer.module.css` tatsaechlich DEKLARIERT. */
function deklarierteKlassen(): Set<string> {
  let css = ohneKommentare(readFileSync(STYLESHEET, "utf8"));
  // Erst die Regelkoerper leeren, damit `1.5px` oder `.07em` nicht als Selektor
  // gelesen werden. Wiederholt, weil `@media { … { … } }` genestet ist.
  for (let i = 0; i < 5; i++) css = css.replace(/\{[^{}]*\}/g, " ");
  const namen = new Set<string>();
  for (const m of css.matchAll(/(?:^|[\s,>+~(])\.([A-Za-z][A-Za-z0-9_-]*)/gm)) namen.add(m[1]!);
  return namen;
}

afterEach(async () => {
  await unmount();
});

describe("FahrzeugWahl — die Wahl ist eine NAVIGATION (§7.9.1, E5)", () => {
  it("rendert je Fahrzeug einen LINK, keinen Knopf — und haelt die Zeilen IN der Karte", async () => {
    // Heute ein useState-Umschalter in der Client-Komponente
    // (CheckFlow.tsx:75-87) — und genau das erzwingt, dass ALLE Fahrzeuge im
    // RSC-Payload liegen. Als Navigation ist die Wahl adressierbar, teilbar und
    // im Verlauf zuruecknavigierbar.
    await mount(<FahrzeugWahl fahrzeuge={FZ} />);
    const zeilen = queryAll<HTMLAnchorElement>("a");
    expect(zeilen.length).toBe(2);
    expect(queryAll("button").length).toBe(0);
    // ⚠️ Die Zahl allein traegt die Zusage NICHT: zwei `<a>` OHNE die Zeilen-
    // klasse waeren zwei randlose Textstuecke ohne Trennlinie, und zwei Zeilen
    // NEBEN der Karte haetten weder Rahmen noch Hintergrund. Gepruefte Zusage
    // ist die ENTHALTENHEIT, nicht die Nachbarschaft.
    for (const z of zeilen) {
      expect(z.className).toMatch(/zeile/);
      expect(z.parentElement!.className).toMatch(/karte/);
    }
    // Der Schirmkopf sagt, worum es geht, und steht AUSSERHALB der Karte.
    const kopf = query("[class*='schirmKopf']");
    // DRK-309: NEUTRAL, weil die Liste darunter Fahrzeuge UND Taschen führt.
    expect(kopf.textContent).toBe("Einheit wählen");
    expect(kopf.contains(zeilen[0]!)).toBe(false);
  });

  it("die href sind AEUSSERE Pfade mit `?fz=` — in der uebergebenen Reihenfolge", async () => {
    // Derselbe Pfad, den `tokenZielPfad` fuer einen Fahrzeug-Code erzeugt
    // (§7.2.5). Ein innerer (`/m/lagerbuch/helfer/check`) wuerde auf dem
    // Modul-Host doppelt praefixiert (Falle 63).
    await mount(<FahrzeugWahl fahrzeuge={FZ} />);
    expect(queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"))).toEqual([
      "/helfer/check?fz=fz-1",
      "/helfer/check?fz=fz-2",
    ]);
  });

  it("nennt in jeder Zeile die Art — und die Kennung nur, wenn es eine gibt", async () => {
    /**
     * ⚠️ DIE METAZEILE STEHT JETZT IMMER, UND DAS IST DIE AENDERUNG (DRK-309).
     *
     * Vorher trug sie allein die Kennung und entfiel ohne sie — begruendet mit
     * der leeren Zeile samt `margin-top: 5px`, die ein bedingungsloses Feld
     * hinterlassen haette. Der Grund war richtig und ist weg: die Zeile ist nie
     * mehr leer, weil die Art immer darin steht.
     *
     * ⚠️ UND GENAU DIE TASCHE BRAUCHT SIE. Ein Fahrzeug trug seine Art im
     * Namen mit („RTW 1", „MTW"); eine Tasche hat kein Kennzeichen, und
     * „Rucksack Betreuung" sagt von sich aus nichts. Ohne diese Zeile stuende
     * fuer sie in der Wahl nur ein Name.
     */
    await mount(<FahrzeugWahl fahrzeuge={GEMISCHT} />);
    const zeilen = queryAll("a");
    expect(zeilen.length).toBe(3);
    const meta = (i: number) =>
      zeilen[i]!.querySelector("[class*='zeileMeta']")!.textContent;

    expect(meta(0)).toBe("Fahrzeug · HH-DR 1234");
    // Ohne Kennung bleibt die Art allein stehen — kein hängender Trenner.
    expect(meta(1)).toBe("Tasche");
    // Der Zwischenstand aus Migration 0010 sagt, was er ist, statt zu schweigen.
    expect(meta(2)).toBe("nicht zugeordnet");
  });

  it("kodiert eine ID mit Sonderzeichen", async () => {
    // nanoid nutzt `-` und `_`; beides ist URL-sicher. Ein importierter
    // Alt-Bestand kann aber andere IDs tragen, und ein rohes `?fz=a b` erzeugt
    // eine kaputte URL. (Befund 31: T79 baut dieselbe URL und passt sich an.)
    await mount(<FahrzeugWahl
      fahrzeuge={[{ id: "a b&c", name: "X", kennung: null, einheitenart: "fahrzeug" }]} />);
    expect(query<HTMLAnchorElement>("a").getAttribute("href")).toBe("/helfer/check?fz=a%20b%26c");
  });

  it("das Zeichen ist lokal, stumm fuer Hilfsmittel — und steht NEBEN Text", async () => {
    // Querschnittsregel: Zeichen sind lokale Inline-`<svg>` in derselben Datei,
    // mit aria-hidden="true" und focusable="false", IMMER neben Text. Ohne
    // `aria-hidden` liest ein Screenreader den Pfad als Grafik ohne Namen mit;
    // ohne `focusable="false"` faengt das SVG in aelteren Engines einen
    // eigenen Tabstopp INNERHALB des Links.
    await mount(<FahrzeugWahl fahrzeuge={FZ} />);
    const zeichen = queryAll("a svg");
    expect(zeichen.length).toBe(2);
    for (const svg of zeichen) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
      // „neben Text": der Link, in dem das Zeichen sitzt, traegt sichtbaren Text.
      expect(svg.closest("a")!.textContent!.trim().length).toBeGreaterThan(0);
    }
  });

  it("baut bei leerer Liste KEINEN eigenen Leerzustand", async () => {
    // Der Fall „kein Fahrzeug angelegt" gehoert `helfer/check/page.tsx` (T85)
    // und wird dort von `_ui/LeerZustand.tsx` (T69) getragen — mit dem Rueckweg
    // als PFLICHT-Prop. Ein zweiter Leerzustand hier waere ein konkurrierender
    // Ausgang, und sein `<a>` faellt hier auf.
    await mount(<FahrzeugWahl fahrzeuge={[]} />);
    expect(queryAll("a").length).toBe(0);
    expect(queryAll("button").length).toBe(0);
  });

  it("ist eine Server Component ohne antd", () => {
    // Regel 1 / Befund 1: ohne `ohneKommentare()` traefe dieser Scan den
    // Kopfkommentar der geprueften Datei, der „KEIN "use client"" und
    // „useState-Umschalter" woertlich nennt.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/\buseState\b/);
    expect(q).not.toMatch(/from\s+"antd(\/|")|from\s+"@ant-design\/icons|lucide-react/);
    // Die Aktivmarkierung dieses Astes ist ein Server-Prop; Router-Haken kommen
    // hier nicht vor.
    expect(q).not.toMatch(/usePathname|useSearchParams|router\.(push|replace)/);
    // Falle 2: `--ant-*` ist auf antds Scope-Klasse deklariert und im eigenen
    // Markup NICHT aufloesbar — der Rueckfall ist still `transparent`.
    expect(q).not.toMatch(/--ant-/);
  });

  it("nennt nur Klassen, die `helfer.module.css` DEKLARIERT", () => {
    // ⚠️ Vite erzeugt fuer JEDEN Schluessel eines CSS-Moduls einen Namen, auch
    // fuer einen, den es nicht gibt — `s.gibtEsNicht` liefert unter Vitest
    // `"_gibtEsNicht_ef45c4"`, nicht `undefined`. Ein Tippfehler im
    // Klassennamen ist unter Vitest also strukturell unsichtbar, waehrend er im
    // Next-Build `undefined` ergibt und React still `class="undefined"`
    // rendert. Nur der Abgleich gegen das Stylesheet selbst faengt das.
    const deklariert = deklarierteKlassen();
    expect(deklariert.size, "leeres Stylesheet — der Scan waere leer-gruen").toBeGreaterThanOrEqual(50);
    const genutzt = genutzteKlassen(QUELLE);
    expect(genutzt.length, "keine einzige Klasse geprueft").toBeGreaterThanOrEqual(6);
    expect(genutzt.filter((k) => !deklariert.has(k))).toEqual([]);
  });
});

/**
 * WARUM HIER ETWAS ZU WAEHLEN IST — DRK-417.
 *
 * ⚠️ DER SATZ STEHT NUR AUF DEM ABLEGEWEG. Seit die Entnahmebox eine eigene
 * Karte hat, ist dieser Schirm das Erste nach dem Scan an der Kiste — und
 * „Einheit wählen" allein beantwortet dort nicht, warum ueberhaupt gefragt
 * wird, wenn man doch vor der Box steht.
 */
describe("FahrzeugWahl — der Zwecksatz haengt am Weg (DRK-417)", () => {
  const FZ = [{ id: "rtw-1", name: "RTW 1", kennung: "HN-1", einheitenart: "fahrzeug" as const }];

  it("nennt auf dem Ablegeweg den Ueberschuss", async () => {
    await mount(<FahrzeugWahl pfad="/helfer/box" fahrzeuge={FZ} />);
    expect(query("[data-rolle='wahl-zweck']").textContent).toContain("Überschuss");
  });

  /**
   * ⚠️ DIE GEGENPROBE IST NICHT ENTBEHRLICH: ein bedingungsloser Satz waere auf
   * dem Checkweg die Erklaerung einer Selbstverstaendlichkeit — man checkt eine
   * Einheit, also waehlt man sie. Wer Selbstverstaendliches erklaert, wird beim
   * zweiten Mal ueberlesen, und beim dritten auch der Satz daneben, der etwas
   * sagt.
   */
  it("sagt auf dem Checkweg nichts dergleichen", async () => {
    await mount(<FahrzeugWahl pfad="/helfer/check" fahrzeuge={FZ} />);
    expect(exists("[data-rolle='wahl-zweck']")).toBe(false);
  });

  /** Und die Vorgabe ist der Checkweg — ein vergessenes `pfad` erklaert nichts. */
  it("sagt ohne `pfad` nichts dergleichen", async () => {
    await mount(<FahrzeugWahl fahrzeuge={FZ} />);
    expect(exists("[data-rolle='wahl-zweck']")).toBe(false);
  });
});
