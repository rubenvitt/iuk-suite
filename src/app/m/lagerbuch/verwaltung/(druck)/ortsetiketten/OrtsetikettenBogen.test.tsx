// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mount, unmount, query, queryAll, exists, clickElement } from "@/app/m/qr/_lib/test-dom";
import { nameStufe } from "@/app/m/lagerbuch/_lib/ortEtikettMasse";
import { OrtsetikettenBogen } from "./OrtsetikettenBogen";

/**
 * DIE AUSWAHL-INSEL DER A7-ORTSETIKETTEN — DRK-312.
 *
 * ⚠️ WAS DIESE DATEI HAELT UND DER E2E DANEBEN NICHT: die Markup-Vertraege, an
 * denen die Druckregeln haengen (nacktes Kontrollkaestchen, `lb-nichtDrucken`
 * am Kaestchen statt am Label, QR↔Datensatz-Bindung). Der E2E misst dafuer die
 * Wirkung auf Papier, die jsdom strukturell nicht sehen kann — jsdom rechnet
 * keine Seitenaufteilung.
 *
 * ⚠️ DIE QUELLTEXT-SCANS UNTEN LESEN UEBER `ohneKommentare(...)`, NICHT UEBER
 * DEN ROHTEXT. Sowohl `OrtsetikettenBogen.tsx` als auch `page.tsx` erklaeren in
 * ihrem eigenen Begruendungskommentar wortwoertlich, WARUM `lucide-react` und
 * `@ant-design/icons` nicht importiert werden — ein roher Scan waere an der
 * eigenen Begruendung ROT, und die naheliegende „Reparatur" waere das Loeschen
 * genau dieser Begruendung (A4-Prinzip, dieselbe Lage wie bei
 * `EtikettenBogen.test.tsx`).
 *
 * ⚠️ UND SIE SIND NICHT VERZICHTBAR: `src/core/shell/icons.test.ts` ueberspringt
 * jede Datei mit `"use client"` — ein Icon-Import in DIESER Insel liefe dort
 * gruen durch. `_lib/bauform.test.ts` schliesst `verwaltung/` ausdruecklich aus
 * („DAS ist der antd-Zweig") und deckt das antd-Verbot in dieser `page.tsx`
 * ebenfalls nicht.
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
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

const BASIS = "https://lagerbuch.example.org";
const ORTE = [
  { id: "handlager", name: "Handlager", meta: "Lager",
    url: `${BASIS}/o/handlager`,
    qr: '<svg viewBox="0 0 45 45"><path d="M0 0h1v1H0z"/></svg>' },
  { id: "rtw-1", name: "RTW 1", meta: "Fahrzeug · HN-DRK-1101",
    url: `${BASIS}/o/rtw-1`,
    qr: '<svg viewBox="0 0 45 45"><path d="M1 1h1v1H1z"/></svg>' },
  { id: "tasche-san", name: "Sanitätstasche 1", meta: "Tasche",
    url: `${BASIS}/o/tasche-san`,
    qr: '<svg viewBox="0 0 45 45"><path d="M2 2h1v1H2z"/></svg>' },
];

afterEach(() => unmount());

describe("OrtsetikettenBogen", () => {
  it("rendert je Ort genau eine Karte mit genau einem QR", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    expect(queryAll(".lb-ortkarte")).toHaveLength(3);
    expect(queryAll(".lb-ortkarteQr > svg")).toHaveLength(3);
    expect(exists(".lb-ortkarte img")).toBe(false);
  });

  /**
   * ⚠️ DIE QR↔ORT-BINDUNG, NICHT NUR DIE KNOTENZAHL. Ohne diese Zeile bliebe
   * ein Fehlgriff, der ALLEN Karten denselben Code gibt, unbemerkt gruen — die
   * Zahl stimmt, aber jedes Etikett zeigte auf dasselbe Ziel. Auf einem
   * laminierten Kaertchen am Fahrzeug ist genau das der teure Fall: es faellt
   * erst auf, wenn jemand scannt und im falschen Fahrzeug landet.
   *
   * Ueber das `d`-Attribut des `<path>`, NICHT ueber `innerHTML`: jsdom
   * re-serialisiert `<path …/>` zu `<path …></path>`, ein Textvergleich schiede
   * falsch-rot.
   */
  it("gibt jeder Karte IHREN Code", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    expect(queryAll(".lb-ortkarteQr svg path").map((p) => p.getAttribute("d")))
      .toEqual(["M0 0h1v1H0z", "M1 1h1v1H1z", "M2 2h1v1H2z"]);
  });

  it("setzt das SVG unveraendert ein", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    expect(query(".lb-ortkarteQr").innerHTML).toContain('viewBox="0 0 45 45"');
  });

  /**
   * ⚠️ DREI ANGABEN JE KARTE, UND KEINE IST ZIERRAT. Der NAME sagt „welches";
   * die BEIZEILE sagt „was" und haelt zwei gleichnamige Taschen auseinander
   * (`lagerorte.name` traegt fuer Einheiten keinen Eindeutigkeitsschluessel);
   * die ADRESSE ist die einzige Angabe, die IMMER eindeutig ist — und der Weg
   * fuer ein Telefon, dessen Kamera streikt.
   */
  it("traegt Beizeile, Namen und die volle Adresse", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    expect(queryAll(".lb-ortkarteMeta").map((e) => e.textContent))
      .toEqual(["Lager", "Fahrzeug · HN-DRK-1101", "Tasche"]);
    expect(queryAll(".lb-ortkarteNameText").map((e) => e.textContent))
      .toEqual(["Handlager", "RTW 1", "Sanitätstasche 1"]);
    expect(queryAll(".lb-ortkarteUrl").map((e) => e.textContent))
      .toEqual([`${BASIS}/o/handlager`, `${BASIS}/o/rtw-1`, `${BASIS}/o/tasche-san`]);
  });

  /**
   * ⚠️ DIE SCHRIFTSTUFE KOMMT AUS `nameStufe`, NICHT AUS EINER ZWEITEN REGEL IN
   * DER INSEL. Die Karte schnitt Namen ab 24 Zeichen still ab (Codex-Befund P2
   * zu PR #177); die Tabelle dahinter ist gemessen. Eine zweite Herleitung hier
   * liefe ihr davon, und zwar lautlos: das Etikett saehe plausibel aus und
   * waere zu klein oder zu gross.
   */
  it("haengt jeder Karte ihre gemessene Schriftstufe an", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    expect(queryAll(".lb-ortkarteName").map((e) => e.className))
      .toEqual(ORTE.map((o) => `lb-ortkarteName ${nameStufe(o.name)}`));
  });

  /**
   * ⚠️ ZWEI VERSCHACHTELTE KAESTEN, UND DIE INNERE TRAEGT DEN TEXT. Die Klammer
   * (`-webkit-line-clamp`) braucht `display: -webkit-box` an DEMSELBEN Element
   * wie den Text; die aeussere Huelle zentriert senkrecht und vertruege das
   * nicht. Steht der Name direkt in der Huelle, ist die Klammer wirkungslos —
   * und ein zu langer Name hoert wieder still auf, statt auf „…" zu enden.
   */
  it("legt den Namen in einen eigenen Textkasten", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    for (const huelle of queryAll(".lb-ortkarteName")) {
      const text = huelle.querySelector(".lb-ortkarteNameText");
      expect(text, huelle.textContent ?? "").not.toBeNull();
      expect(text!.parentElement).toBe(huelle);
    }
  });

  it("waehlt zu Beginn alles aus", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    expect(queryAll(".lb-ortkarteAbgewaehlt")).toHaveLength(0);
    expect(query("[data-testid='lb-ort-drucken']").textContent).toContain("(3)");
  });

  it("waehlt eine Karte ab und wieder an", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    await clickElement(queryAll(".lb-ortkarteWahl")[0]);
    expect(queryAll(".lb-ortkarteAbgewaehlt")).toHaveLength(1);
    expect(query("[data-testid='lb-ort-drucken']").textContent).toContain("(2)");
    await clickElement(queryAll(".lb-ortkarteWahl")[0]);
    expect(queryAll(".lb-ortkarteAbgewaehlt")).toHaveLength(0);
  });

  it("schaltet ueber Alle und Keine", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    await clickElement(query("[data-testid='lb-ort-keine']"));
    expect(queryAll(".lb-ortkarteAbgewaehlt")).toHaveLength(3);
    expect(query("[data-testid='lb-ort-drucken']").textContent).toContain("(0)");
    await clickElement(query("[data-testid='lb-ort-alle']"));
    expect(queryAll(".lb-ortkarteAbgewaehlt")).toHaveLength(0);
  });

  it("ruft window.print", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    await clickElement(query("[data-testid='lb-ort-drucken']"));
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("nennt den leeren Zustand beim Namen", async () => {
    await mount(<OrtsetikettenBogen orte={[]} />);
    expect(query(".lb-nichtDrucken").textContent).toBe("Kein Handlager und keine aktive Einheit.");
    expect(exists(".lb-ortbogen")).toBe(false);
  });

  /**
   * FALLE 5, DIE KONKRETE BRUCHSTELLE: ein antd-Checkbox rendert hier KEIN
   * nacktes <input> auf der erwarteten Ebene, sondern eine
   * `.ant-checkbox-wrapper`-Struktur. Die Druckregel liefe ins Leere und die
   * Auswahlkaestchen stuenden MIT auf dem Papier — still, weil es erst am
   * Ausdruck auffaellt.
   */
  it("benutzt ein nacktes Kontrollkaestchen, keinen antd-Baustein", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    const kasten = queryAll(".lb-ortkarteWahl");
    expect(kasten).toHaveLength(3);
    for (const k of kasten) {
      expect(k.tagName).toBe("INPUT");
      expect(k.getAttribute("type")).toBe("checkbox");
      expect(k.className).toContain("lb-nichtDrucken");
      expect(k.closest(".ant-checkbox-wrapper")).toBeNull();
    }
  });

  /**
   * ⚠️ DIE KLASSE SITZT AUF DEM KAESTCHEN, NIE AUF DER KARTE. Auf der Karte
   * saesse die Druckregel auf dem GANZEN Etikett — und aus jedem Blatt wuerde
   * ein leeres. Hier waere der Schaden groesser als am A4-Bogen: dort fehlten
   * Kacheln, hier kaeme eine leere A7-Seite je Ort aus dem Drucker.
   */
  it("haengt lb-nichtDrucken NICHT an die Karte selbst", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    for (const karte of queryAll(".lb-ortkarte")) {
      expect(karte.className).not.toContain("lb-nichtDrucken");
    }
  });

  /**
   * ⚠️ JEDE KARTE BRAUCHT EINEN NAMEN FUER DIE VORLESEANWENDUNG. Das Kaestchen
   * traegt keinen sichtbaren Text — ohne `aria-label` haette eine Liste aus
   * sieben Karten sieben namenlose Kontrollkaestchen, und welches man gerade
   * abwaehlt, saehe man nur mit den Augen.
   */
  it("benennt jedes Kaestchen nach seinem Ort", async () => {
    await mount(<OrtsetikettenBogen orte={ORTE} />);
    expect(queryAll(".lb-ortkarteWahl").map((k) => k.getAttribute("aria-label")))
      .toEqual(["Handlager drucken", "RTW 1 drucken", "Sanitätstasche 1 drucken"]);
  });

  const lies = (datei: string) =>
    ohneKommentare(readFileSync(join(__dirname, datei), "utf8"));

  it("die Insel importiert weder lucide-react noch @ant-design/icons", () => {
    const quelle = lies("OrtsetikettenBogen.tsx");
    expect(quelle).not.toContain("lucide-react");
    expect(quelle).not.toContain("@ant-design/icons");
  });

  /**
   * ⚠️ `page.tsx` IST EINE SERVER COMPONENT. Ein antd-Compound-Zugriff ergaebe
   * dort HTTP 500 (Falle 1), ein `@ant-design/icons`-Import ebenfalls — und
   * zwar SCHON BEIM IMPORT, nicht beim Rendern (Falle 7). Der einfachste Weg,
   * beide strukturell auszuschliessen, ist: gar kein antd in der Datei.
   */
  it("laesst page.tsx ohne antd und ohne Icon-Import", () => {
    const quelle = lies("page.tsx");
    expect(quelle).not.toMatch(/from\s+"antd/);
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).not.toContain("lucide-react");
  });
});
