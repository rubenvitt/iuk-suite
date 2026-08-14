// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mount, unmount, query, queryAll, exists, clickElement,
} from "@/app/m/qr/_lib/test-dom";
import { ChecklistenBogen } from "./ChecklistenBogen";
import type { ChecklisteBlatt } from "../../../_lib/lesepfade/checkliste";

afterEach(() => unmount());

const RTW: ChecklisteBlatt = {
  id: "fz-a",
  name: "RTW 1",
  kennung: "MS-1",
  vorlage: "RTW-Vorlage",
  positionen: 2,
  faecher: [{
    label: "Fach 1",
    positionen: [
      {
        artikelId: "a1", artikelName: "Verband", einheit: "Stk.",
        handlagerFach: "B-04", soll: 4,
        verfallText: "läuft 07/26 ab", verfallAuffaellig: true,
      },
      {
        artikelId: "a2", artikelName: "NaCl", einheit: "Fl.",
        handlagerFach: "C-01", soll: 3,
        verfallText: null, verfallAuffaellig: false,
      },
    ],
  }],
  geraete: [{
    id: "g1", name: "Defibrillator", typ: "medizin",
    fristText: "MTK in 16 T", fristAuffaellig: true,
  }],
  flaschen: [
    { id: "o1", name: "Flasche A", nennfuelldruckBar: 200, letzterDruck: 180 },
    { id: "o2", name: "Flasche B", nennfuelldruckBar: 300, letzterDruck: null },
  ],
};

const NEF: ChecklisteBlatt = {
  id: "fz-b", name: "NEF 1", kennung: null, vorlage: null,
  positionen: 0, faecher: [], geraete: [], flaschen: [],
};

const bogen = (blaetter: ChecklisteBlatt[] = [RTW]) => (
  <ChecklistenBogen blaetter={blaetter} stand="15.06.2026" />
);

/** Sichtbarer Text des Blattes ohne die Bedienleiste — alles, was auf Papier
 *  landet. Die Leiste haengt unter `lb-nichtDrucken` und gehoert nicht dazu. */
function papiertext(): string {
  return queryAll(".lb-cl-blatt").map((b) => b.textContent ?? "").join("\n");
}

describe("das Blatt je Fahrzeug", () => {
  it("rendert ein Blatt je Fahrzeug, mit Name und Kennung", async () => {
    await mount(bogen([RTW, NEF]));
    const blaetter = queryAll(".lb-cl-blatt");
    expect(blaetter).toHaveLength(2);
    expect(blaetter[0]!.textContent).toContain("RTW 1");
    expect(blaetter[0]!.textContent).toContain("MS-1");
    expect(blaetter[1]!.textContent).toContain("NEF 1");
  });

  /**
   * ⚠️ DIE ZUSICHERUNG, DIE DEN SEITENUMBRUCH TRAEGT. Der Umbruch zwischen zwei
   * Fahrzeugen haengt an `.lb-cl-blatt + .lb-cl-blatt` (`druck.css`), und der
   * Geschwisterselektor `+` verlangt UNMITTELBARE Nachbarschaft. Schiebt
   * jemand spaeter eine Trennlinie, eine Zwischenueberschrift oder eine zweite
   * Bedienleiste zwischen die Blaetter, greift die Regel nicht mehr — und die
   * Fahrzeuge laufen auf dem Papier ineinander. `display: none` rettete das
   * NICHT: ausgeblendete Elemente bleiben Geschwister.
   *
   * Das sieht kein Quelltext-Scan und kein `pnpm build`; jsdom rechnet keine
   * Seitenumbrueche, kennt aber die Geschwisterkette.
   */
  it("stellt die Blaetter als unmittelbare Geschwister nebeneinander", async () => {
    await mount(bogen([RTW, NEF]));
    const [erstes, zweites] = queryAll(".lb-cl-blatt");
    expect(erstes!.nextElementSibling).toBe(zweites);
  });

  it("nennt Vorlage, Positionszahl und Stand im Kopf", async () => {
    await mount(bogen());
    const kopf = query(".lb-cl-meta").textContent ?? "";
    expect(kopf).toContain("RTW-Vorlage");
    expect(kopf).toContain("2 Positionen");
    expect(kopf).toContain("15.06.2026");
  });

  it("nennt eine fehlende Vorlage ausdruecklich, statt die Zeile wegzulassen", async () => {
    await mount(bogen([NEF]));
    expect(query(".lb-cl-meta").textContent).toContain("ohne Vorlage");
  });

  it("traegt drei Schreiblinien fuer Name, Datum und Unterschrift", async () => {
    await mount(bogen());
    expect(queryAll(".lb-cl-signatur .lb-cl-linie")).toHaveLength(3);
  });

  it("benennt den leeren Fall, statt ein leeres Blatt zu drucken", async () => {
    await mount(bogen([NEF]));
    expect(query(".lb-cl-leer").textContent).toContain("nichts abzuhaken");
  });
});

describe("die Bestueckung", () => {
  it("zeigt Artikel, Handlager-Fach, Soll und Einheit", async () => {
    await mount(bogen());
    const zeile = queryAll(".lb-cl-tabelle tbody tr")[0]!;
    expect(zeile.textContent).toContain("Verband");
    expect(zeile.textContent).toContain("B-04");
    expect(zeile.textContent).toContain("4 Stk.");
  });

  it("laesst jedes Schreibfeld leer — hier wird geschrieben, nicht bestaetigt", async () => {
    await mount(bogen());
    // BEIDE Schreibklassen: `lb-cl-sIst` (Zahl, 22mm) und `lb-cl-sBemerkung`
    // (Handschrift, 45mm). Sie teilen sich die Toenung und trennen nur die
    // Breite — ein Scan ueber nur eine von beiden liesse die andere frei.
    const felder = queryAll(".lb-cl-sIst, .lb-cl-sBemerkung");
    expect(felder.length, "keine Schreibfelder gefunden").toBeGreaterThan(0);
    for (const zelle of felder) {
      // Die Kopfzeile traegt die Beschriftung; jede Koerperzelle ist leer.
      if (zelle.tagName === "TH") continue;
      expect(zelle.textContent).toBe("");
    }
  });

  it("zeichnet einen auffaelligen Verfall mit Rufzeichen aus, nicht mit Farbe", async () => {
    await mount(bogen());
    const warnung = query(".lb-cl-warnung");
    expect(warnung.textContent).toContain("!");
    expect(warnung.textContent).toContain("läuft 07/26 ab");
    // Papier ist einfarbig (Falle 3): die Auszeichnung darf nirgends an einer
    // Farbe haengen, auch nicht per Inline-Style.
    expect(warnung.getAttribute("style")).toBeNull();
  });

  it("schreibt nichts in die Verfallsspalte, wo nichts gemeldet ist", async () => {
    await mount(bogen());
    const zeilen = queryAll(".lb-cl-tabelle tbody tr");
    const nacl = zeilen.find((z) => z.textContent?.includes("NaCl"))!;
    expect(nacl.querySelector(".lb-cl-sVerfall")!.textContent).toBe("");
  });
});

describe("Blindzaehlung", () => {
  /**
   * ⚠️ DIE ZAHL WIRD NICHT VERDECKT, SIE ENTSTEHT NICHT.
   *
   * Eine CSS-Loesung schied doppelt aus: `visibility: hidden` ist modulweit
   * gesperrt (`etiketten/druck.test.ts`, Falle 43), und eine bloss verdeckte
   * Sollmenge stuende weiterhin im DOM und im PDF-Textlayer — „Blindzaehlung"
   * waere dann eine Behauptung statt einer Eigenschaft. Wer die Umsetzung
   * spaeter auf eine Klasse umstellt, faellt hier durch.
   */
  it("entfernt die Sollmenge aus dem Papier — nicht nur aus dem Blick", async () => {
    await mount(bogen());
    expect(papiertext()).toContain("4 Stk.");

    await clickElement(query("[data-testid='lb-cl-blind'] input"));
    expect(papiertext()).not.toContain("4 Stk.");
    expect(papiertext()).not.toMatch(/\b4\b/);
  });

  it("behaelt die Einheit — gezaehlt wird in Stueck, nicht in Zahlen", async () => {
    await mount(bogen());
    await clickElement(query("[data-testid='lb-cl-blind'] input"));
    expect(papiertext()).toContain("Stk.");
  });

  it("beschriftet die Spalte um, statt eine leere Soll-Spalte zu zeigen", async () => {
    await mount(bogen());
    expect(query(".lb-cl-tabelle thead .lb-cl-sSoll").textContent).toBe("Soll");
    await clickElement(query("[data-testid='lb-cl-blind'] input"));
    expect(query(".lb-cl-tabelle thead .lb-cl-sSoll").textContent).toBe("Einheit");
  });
});

describe("Geraete und Sauerstoff", () => {
  it("bietet je Geraet die drei Zustaende zum Ankreuzen", async () => {
    await mount(bogen());
    const zustand = query(".lb-cl-zustand");
    expect(zustand.textContent).toContain("In Ordnung");
    expect(zustand.textContent).toContain("Gebrauchsspuren");
    expect(zustand.textContent).toContain("Defekt");
    expect(zustand.querySelectorAll(".lb-cl-box")).toHaveLength(3);
  });

  it("nennt die MTK-Frist am Geraet", async () => {
    await mount(bogen());
    expect(papiertext()).toContain("MTK in 16 T");
  });

  /**
   * ⚠️ `null` IST „NIE GEMESSEN", NICHT 0 bar (§5.12). Ein gedrucktes „0 bar"
   * behauptete auf einem Nachweis eine leere Flasche, die niemand gemessen
   * hat — genau der Fehlalarm, wegen dem `letzterDruck` ueberhaupt nullbar
   * ist: jemand laeuft los und traegt eine VOLLE Flasche aus dem Fahrzeug.
   */
  it("schreibt `nie gemessen`, wo keine Messung vorliegt — nie `0 bar`", async () => {
    await mount(bogen());
    const zeilen = queryAll(".lb-cl-tabelle tbody tr");
    const gemessen = zeilen.find((z) => z.textContent?.includes("Flasche A"))!;
    const nie = zeilen.find((z) => z.textContent?.includes("Flasche B"))!;

    // Spalte 4 ist „zuletzt". Zellenweise geprueft und NICHT ueber den
    // Blatttext: „0 bar" ist Teilzeichenkette von „200 bar" und „300 bar", ein
    // `not.toContain("0 bar")` auf dem ganzen Text waere immer rot und
    // beweisfrei.
    expect(gemessen.querySelectorAll("td")[3]!.textContent).toBe("180 bar");
    expect(nie.querySelectorAll("td")[3]!.textContent).toBe("nie gemessen");
    // Der Nennfuelldruck steht daneben und bleibt unangetastet.
    expect(nie.querySelectorAll("td")[2]!.textContent).toBe("300 bar");
  });
});

describe("Bildschirm gegen Papier", () => {
  it("haengt die ganze Bedienleiste unter `lb-nichtDrucken`", async () => {
    await mount(bogen());
    expect(query("[data-testid='lb-cl-leiste']").classList)
      .toContain("lb-nichtDrucken");
  });

  /**
   * DAS KAESTCHEN IST GEZEICHNET, KEIN FORMULARELEMENT — dieselbe Entscheidung
   * wie in `EtikettenBogen.tsx`. Ein echtes Kontrollkaestchen druckt je nach
   * Browser als graue Flaeche oder gar nicht, und dieses hier soll mit dem
   * Kugelschreiber ausgefuellt werden.
   */
  it("zeichnet die Abhak-Kaestchen, statt Formularelemente zu drucken", async () => {
    await mount(bogen());
    for (const blatt of queryAll(".lb-cl-blatt")) {
      expect(blatt.querySelectorAll("input")).toHaveLength(0);
    }
    expect(queryAll(".lb-cl-blatt .lb-cl-box").length).toBeGreaterThan(0);
  });

  it("schaltet die Dichte am Umschlag um, nicht am einzelnen Blatt", async () => {
    await mount(bogen());
    const umschlag = query(".lb-cl-bogen");
    expect(umschlag.classList).not.toContain("lb-cl-kompakt");
    await clickElement(query("[data-testid='lb-cl-kompakt'] input"));
    expect(umschlag.classList).toContain("lb-cl-kompakt");
  });

  it("druckt ueber `window.print()`", async () => {
    const drucken = vi.fn();
    vi.stubGlobal("print", drucken);
    await mount(bogen());
    await clickElement(query("[data-testid='lb-cl-drucken']"));
    expect(drucken).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("traegt einen Weg zurueck — `DruckRahmen` hat keine Navigation", async () => {
    await mount(bogen());
    expect(exists("[data-testid='lb-cl-leiste'] a[href='/verwaltung/fahrzeuge']"))
      .toBe(true);
  });
});

/**
 * QUELLTEXT-SCANS. Sie stehen hier aus demselben Grund wie in
 * `EtikettenBogen.test.tsx`: `core/shell/icons.test.ts` ueberspringt jede Datei
 * mit `"use client"` (`if (traegtClientDirektive(quelle)) continue;`), und
 * `_lib/bauform.test.ts` schliesst `verwaltung/` ausdruecklich aus („DAS ist
 * der antd-Zweig"). Fuer diese beiden Dateien sind die Scans unten damit heute
 * der einzige Riegel im Repo.
 *
 * Gelesen wird ueber `ohneKommentare(...)` — beide Dateien schreiben in ihrem
 * eigenen Begruendungskommentar aus, WARUM sie diese Pakete nicht importieren
 * (Falle 1, Falle 7). Ein roher Scan waere an der eigenen Begruendung rot;
 * derselbe Fall wie Ruling A4.
 */
describe("die beiden Dateien bleiben in ihrer Ansichtsklasse", () => {
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

  const quelle = (datei: string) =>
    ohneKommentare(readFileSync(join(__dirname, datei), "utf8"));

  it("die Insel importiert weder `@ant-design/icons` noch `lucide-react`", () => {
    const q = quelle("ChecklistenBogen.tsx");
    expect(q).not.toContain("@ant-design/icons");
    expect(q).not.toContain("lucide-react");
    // Die Zeichenquelle des Moduls ist `_ui/ikonen.tsx`.
    expect(q).toMatch(/from\s+"[^"]*_ui\/ikonen"/);
  });

  /**
   * `page.tsx` IST EINE SERVER COMPONENT. Ein antd-Compound-Zugriff ergaebe
   * HTTP 500 (Falle 1), ein `@ant-design/icons`-Import ebenfalls — und zwar
   * SCHON BEIM IMPORT, nicht beim Rendern, waehrend `typecheck`, `build` und
   * Vitest gruen bleiben (Falle 7). Der einfachste Weg, beide strukturell
   * auszuschliessen, ist: gar kein antd und gar kein Zeichen in dieser Datei.
   */
  it("die Seite bleibt ohne antd und ohne Zeichen", () => {
    const q = quelle("page.tsx");
    expect(q).not.toMatch(/from\s+"antd(\/|")/);
    expect(q).not.toContain("@ant-design/icons");
    expect(q).not.toContain("_ui/ikonen");
  });

  /**
   * ZWEITE LINIE DER RIEGEL (§8.4, 8-H). Das `(druck)`-Layout riegelt bereits;
   * diese Seite tut es noch einmal, weil `requiresAuth: false` gilt und die
   * Middleware hier nicht gatet. Der positive Nachweis haengt am `(`, nicht am
   * Namen — sonst genuegte ein Import oder ein Kommentar, der den Namen nennt
   * (gemessenes Muster aus `_lib/bauform.test.ts:281,311`).
   */
  it("die Seite riegelt Host UND Gruppe selbst", () => {
    const q = quelle("page.tsx");
    expect(q).toMatch(/\brequireLagerbuchHost\s*\(/);
    expect(q).toMatch(/\bawait\s+requireLagerbuchAdmin\s*\(/);
  });
});
