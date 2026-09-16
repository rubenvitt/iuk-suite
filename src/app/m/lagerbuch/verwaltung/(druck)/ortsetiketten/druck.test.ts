import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  A7_BREITE_MM, A7_HOEHE_MM, A7_SEITENNAME, ORT_SEITENRAND_MM,
  ORT_KARTE_BREITE_MM, ORT_KARTE_HOEHE_MM, ORT_QR_MM, ORT_FUSS_ZEILEN,
  NAME_STUFEN, mm,
} from "@/app/m/lagerbuch/_lib/ortEtikettMasse";

/**
 * DER SCAN AUF DIE A7-REGELN IN `verwaltung/(druck)/druck.css` — DRK-312.
 *
 * ⚠️ ER HAELT DIE AUSSAGE „die Regel steht da", NIE „sie wirkt". `pnpm build`
 * und Vitest sehen `@page` und `@media print` gar nicht, jsdom rechnet keine
 * Seitenaufteilung, und Playwright rendert per Vorgabe fuer den Bildschirm. Was
 * WIRKT, misst `e2e/lagerbuch-ortsetiketten.spec.ts` — dort kommt die
 * Seitengroesse aus einem echten PDF.
 *
 * ⚠️ DIE MODULWEITEN CSS-ZUSICHERUNGEN (genau eine Datei mit `@media print`,
 * kein `body *`, kein `--ant-`, kein nackter `input`-Selektor, `print-color-
 * adjust: exact`) stehen NICHT hier: `etiketten/druck.test.ts` haelt sie
 * bereits ueber den GANZEN Modulbaum und damit strikt staerker. Eine Kopie
 * koennte nie ausloesen, ohne dass dort schon rot waere, und laese sich
 * trotzdem als eigene Absicherung (dieselbe Regel, nach der dort das
 * `isModuleAdmin`-Negativpaar entfallen ist).
 */

const MODUL = join(__dirname, "..", "..", "..");          // src/app/m/lagerbuch
const DRUCK_CSS = join(__dirname, "..", "druck.css");     // (druck)/druck.css
const css = () => readFileSync(DRUCK_CSS, "utf8");

/** Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (byte-identisch,
 *  ebenso kopiert in `etiketten/druck.test.ts` und `_lib/pwaIcons.test.ts`).
 *  `bauform.test.ts` exportiert die Funktion nicht, und dieser Testkoerper ist
 *  eigenstaendig. */
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

const druckblock = () => /@media\s+print\s*\{([\s\S]*)\n\}/.exec(ohneKommentare(css()))![1];
const bildschirmblock = () => {
  const rein = ohneKommentare(css());
  return rein.slice(0, rein.indexOf("@media"));
};

describe("die A7-Seite (DRK-312)", () => {
  /**
   * ⚠️ DIE ZAHLEN STEHEN DA, NICHT DAS SCHLUESSELWORT — UND DAS IST DER
   * EIGENTLICHE INHALT DIESES TESTS.
   *
   * `@page { size: A7 }` ist in Chromium STILL wirkungslos: die
   * Schluesselwortliste endet bei A5/B5, `A6`/`A7`/`A8` fallen schon beim
   * Parsen heraus, und das CSSOM gibt die Regel danach als `@page { }` zurueck.
   * Gemessen an echtem Chromium ueber `page.pdf({ preferCSSPageSize: true })`:
   * `size: A4` → 209,9 x 297,0 mm, `size: A7` → 215,9 x 279,4 mm (also Letter,
   * die Vorgabe), `size: 74mm 105mm` → 74,1 x 105,2 mm.
   *
   * Kein Tor sieht das sonst: es ist gueltiges CSS nach Spezifikation, `build`
   * serialisiert klaglos, und jsdom hat keine Seitenaufteilung. Wer die Zeile
   * „aufraeumt", druckt ab da im Vorgabeformat des Druckers — und merkt es am
   * Papier.
   */
  it("schreibt die Kantenlaengen aus statt `A7`", () => {
    const rein = ohneKommentare(css());
    const regel = new RegExp(`@page\\s+${A7_SEITENNAME}\\s*\\{([^}]*)\\}`).exec(rein);
    expect(regel, "keine benannte @page-Regel fuer die Ortsetiketten").not.toBeNull();
    expect(regel![1]).toContain(`size: ${mm(A7_BREITE_MM)} ${mm(A7_HOEHE_MM)}`);
    expect(regel![1]).toContain(`margin: ${mm(ORT_SEITENRAND_MM)}`);
    expect(regel![1], "size: A7 ist in Chromium still wirkungslos").not.toMatch(/size:\s*A\d/);
  });

  /**
   * ⚠️ SIE MUSS BENANNT BLEIBEN. `druck.css` bedient DREI Druckflaechen; ein
   * unbenanntes `size` gaelte auch fuer den A4-Etikettenbogen und die
   * Checklisten — beide stuenden ab dann auf 74 x 105 mm, ohne dass ein Tor
   * etwas meldet. Der Gegentest ist, dass die UNBENANNTE Regel weiterhin gar
   * keine Groesse traegt.
   */
  it("laesst die unbenannte @page-Regel ohne Groesse", () => {
    const unbenannt = /@page\s*\{([^}]*)\}/.exec(ohneKommentare(css()));
    expect(unbenannt, "keine unbenannte @page-Regel").not.toBeNull();
    expect(unbenannt![1]).not.toContain("size:");
  });

  /**
   * ⚠️ ALLES GEDRUCKTE DIESER SEITE MUSS AUF DER A7-SEITE LIEGEN. Chromium
   * verwirft die CSS-Groesse VOLLSTAENDIG, sobald ein Dokument gemischte
   * Seitengroessen ergibt — gemessen: eine A7-Karte und ein A4-Bogen im selben
   * Dokument ergaben Letter fuer BEIDE. Traegt der Bogen die Seite nicht,
   * kommen die Karten im Vorgabeformat heraus, und zwar alle.
   */
  it("haengt die Seite an den gemeinsamen Vorfahren", () => {
    const regel = /\.lb-ortbogen\s*\{([^}]*)\}/.exec(bildschirmblock());
    expect(regel, "keine Regel auf .lb-ortbogen").not.toBeNull();
    expect(regel![1]).toMatch(new RegExp(`page:\\s*${A7_SEITENNAME}\\b`));
  });
});

describe("die Millimeter stehen zeichengleich in beiden Welten", () => {
  /**
   * DIE KARTE FUELLT DEN BEDRUCKBAREN BEREICH GENAU AUS. Eine kleinere liesse
   * zwei auf ein Blatt rutschen, eine groessere wuerfe hinter jeder Karte eine
   * fast leere zweite Seite aus. Beides sieht man erst am Papier.
   */
  it("Kartenmass — und es rechnet sich aus Blatt minus Rand", () => {
    expect(ORT_KARTE_BREITE_MM).toBe(A7_BREITE_MM - 2 * ORT_SEITENRAND_MM);
    expect(ORT_KARTE_HOEHE_MM).toBe(A7_HOEHE_MM - 2 * ORT_SEITENRAND_MM);
    const regel = /\.lb-ortkarte\s*\{([^}]*)\}/.exec(bildschirmblock());
    expect(regel, "keine Regel auf .lb-ortkarte").not.toBeNull();
    expect(regel![1]).toContain(`width: ${mm(ORT_KARTE_BREITE_MM)}`);
    expect(regel![1]).toContain(`height: ${mm(ORT_KARTE_HOEHE_MM)}`);
  });

  /**
   * ⚠️ DIE RASTERSPUR IST DIE KARTE, NICHT DAS BLATT. Sie steht als eigene
   * Zusicherung da, weil die beiden Zahlen einander aehnlich genug sind, dass
   * ein Griff daneben beim Lesen durchgeht — und dann stuenden neben jeder
   * Karte 10mm leerer Raster, die aussehen wie ein zweiter, groesserer
   * Abstand. Dieselbe Form wie am Etikettenbogen, wo Spur und Etikett beide
   * 48,5mm tragen.
   */
  it("gibt dem Raster die Breite der Karte", () => {
    expect(bildschirmblock()).toMatch(
      new RegExp(`repeat\\(auto-fill, ${mm(ORT_KARTE_BREITE_MM).replace(".", "\\.")}\\)`),
    );
  });

  /**
   * ⚠️ `box-sizing: border-box` IST TRAGEND, NICHT GEWOHNHEIT: Polster und
   * Rahmen kaemen sonst OBEN DRAUF, die Karte waere 68 x 99 mm und passte nicht
   * mehr auf ihr eigenes Blatt. Am Bildschirm faellt das nicht auf — dort steht
   * die Karte einfach etwas groesser da.
   */
  it("haelt die Karte an ihrer Aussenkante", () => {
    const regel = /\.lb-ortkarte\s*\{([^}]*)\}/.exec(bildschirmblock())!;
    expect(regel[1]).toMatch(/box-sizing:\s*border-box/);
  });

  /**
   * DER QR BRINGT NUR EINE viewBox MIT, KEINE BREITE/HOEHE (8-I). Ohne diese
   * Regel faellt er auf die Ersatzgroesse des Browsers zurueck und wird winzig —
   * OHNE dass ein Test anschlaegt. Und der grosse QR ist der ganze Zweck des
   * Formats: das Ticket verlangt einen „gut nutzbaren" Code.
   */
  it("gibt dem eingesetzten SVG eine Kante", () => {
    const regel = /\.lb-ortkarteQr\s*>\s*svg\s*\{([^}]*)\}/.exec(bildschirmblock());
    expect(regel, "keine Groessenregel fuer das eingesetzte SVG").not.toBeNull();
    expect(regel![1]).toContain(`width: ${mm(ORT_QR_MM)}`);
    expect(regel![1]).toContain(`height: ${mm(ORT_QR_MM)}`);
    expect(regel![1]).toMatch(/display:\s*block/);
  });

  /**
   * `flex: none` GEHOERT AN DEN UMSCHLAG, NICHT AN DAS SVG. Flexbox wirkt auf
   * die FLEX-ITEMS — das ist `.lb-ortkarteQr`, nicht sein Kind. Steht es am
   * SVG, draengt ein langer Ortsname den QR unter 46 mm.
   */
  it("haelt den QR-Umschlag am Schrumpfen", () => {
    const umschlag = /\.lb-ortkarteQr\s*\{([^}]*)\}/.exec(bildschirmblock());
    expect(umschlag, "keine Regel auf .lb-ortkarteQr selbst").not.toBeNull();
    expect(umschlag![1]).toMatch(/flex:\s*none/);
  });

  /**
   * ⚠️ JEDE STUFE AUS `NAME_STUFEN` MUSS IM STYLESHEET ANKOMMEN — Grad UND
   * Klammerwert. Eine Stufe, die in der Tabelle steht und im CSS fehlt, setzt
   * der Browser auf den ererbten Grad: die Karte saehe plausibel aus und der
   * Name waere abgeschnitten, ohne dass ein Tor etwas meldet. Die Zahlen selbst
   * sind gemessen; die Messreihe steht im Kopf der Tabelle.
   */
  it.each(NAME_STUFEN.map((s) => [s.klasse, s] as const))(
    "%s traegt seinen Grad und seine Zeilenklammer",
    (klasse, stufe) => {
      const rein = bildschirmblock();
      const grad = new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`).exec(rein);
      expect(grad, `keine Regel auf .${klasse}`).not.toBeNull();
      expect(grad![1]).toContain(`font-size: ${stufe.pt}pt`);

      const klammer = new RegExp(
        `\\.${klasse}\\s+\\.lb-ortkarteNameText\\s*\\{([^}]*)\\}`,
      ).exec(rein);
      expect(klammer, `keine Zeilenklammer fuer .${klasse}`).not.toBeNull();
      expect(klammer![1]).toContain(`-webkit-line-clamp: ${stufe.zeilen}`);
    },
  );

  /**
   * ⚠️ DIE GRUNDREGEL DARF KEINEN GRAD SETZEN. Ein `font-size` an
   * `.lb-ortkarteName` waere ein sechster, UNGEMESSENER Fall — er griffe fuer
   * jede Karte, deren Modifikatorklasse einmal verlorengeht, und die saehe
   * dann richtig aus und waere es nicht.
   */
  it("setzt den Grad ausschliesslich ueber die Stufen", () => {
    const grund = /\.lb-ortkarteName\s*\{([^}]*)\}/.exec(bildschirmblock());
    expect(grund, "keine Regel auf .lb-ortkarteName").not.toBeNull();
    expect(grund![1]).not.toMatch(/font-size|font:/);
  });

  /**
   * ⚠️ DIE KLAMMER BRAUCHT `display: -webkit-box` AM SELBEN ELEMENT WIE DEN
   * TEXT — ohne sie ist `-webkit-line-clamp` wirkungslos, und der Name hoerte
   * wieder still auf statt auf „…" zu enden.
   */
  it("gibt dem Textkasten die Bauform, die die Klammer verlangt", () => {
    const regel = /\.lb-ortkarteNameText\s*\{([^}]*)\}/.exec(bildschirmblock());
    expect(regel, "keine Regel auf .lb-ortkarteNameText").not.toBeNull();
    expect(regel![1]).toMatch(/display:\s*-webkit-box/);
    expect(regel![1]).toMatch(/-webkit-box-orient:\s*vertical/);
    expect(regel![1]).toMatch(/overflow:\s*hidden/);
  });

  /**
   * ⚠️ DIE FUSSZEILE HAT EINE FESTE HOEHE, UND DARAN HAENGT DIE GANZE
   * STUFENTABELLE (Codex P2, zweite Runde). Ohne sie waechst die Adresse mit
   * `SUITE_HOST_LAGERBUCH`, der Namenskasten schrumpft — und die
   * Zeilenklammern des Namens, die fest sind, schneiden dann VOR ihrer letzten
   * Zeile und VOR den Auslassungspunkten. Der stille Schnitt waere zurueck,
   * abhaengig von einer Umgebungsvariablen.
   *
   * ⚠️ `height`, NICHT `min-height`: reserviert wird auch bei kurzem Host.
   * Eine gelegentlich leere Zeile ist der Preis dafuer, dass die Messreihe
   * ueberhaupt gilt.
   */
  it("reserviert der Adresse eine feste Hoehe und klammert sie", () => {
    const regel = /\.lb-ortkarteUrl\s*\{([^}]*)\}/.exec(bildschirmblock());
    expect(regel, "keine Regel auf .lb-ortkarteUrl").not.toBeNull();
    // 3 Zeilen bei `line-height: 1.25` — `em` ist die eigene Schriftgroesse.
    expect(regel![1]).toContain(`height: ${ORT_FUSS_ZEILEN * 1.25}em`);
    expect(regel![1]).not.toMatch(/min-height/);
    expect(regel![1]).toContain(`-webkit-line-clamp: ${ORT_FUSS_ZEILEN}`);
    expect(regel![1]).toMatch(/display:\s*-webkit-box/);
    expect(regel![1]).toMatch(/overflow:\s*hidden/);
  });

  /**
   * ⚠️ NAME UND ADRESSE MUESSEN BRECHEN DUERFEN — und zwar `anywhere`, nicht
   * `break-word`: die Adresse endet auf einer 21-stelligen Id ohne jede
   * Trennstelle. Ohne diese Zeile laeuft sie aus der Karte heraus und wird
   * abgeschnitten; auf einem laminierten Kaertchen ist das dauerhaft.
   */
  it.each(["lb-ortkarteName", "lb-ortkarteUrl"])("laesst %s umbrechen", (klasse) => {
    const regel = new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`).exec(bildschirmblock());
    expect(regel, klasse).not.toBeNull();
    expect(regel![1], klasse).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("auf Papier", () => {
  /**
   * JEDE KARTE BEGINNT AUF EINEM NEUEN BLATT — ueber `break-before` am ZWEITEN
   * und jedem weiteren, nicht ueber `break-after` an allen. Dieselbe Form und
   * dieselbe Begruendung wie bei den Checklisten daneben.
   */
  it("bricht vor jeder weiteren Karte um", () => {
    expect(druckblock()).toMatch(
      /\.lb-ortkarte\s*\+\s*\.lb-ortkarte\s*\{[^}]*break-before:\s*page/,
    );
  });

  /**
   * ⚠️ ABGEWAEHLT HEISST `display: none`, NIE `opacity: 0`. Am Etikettenbogen
   * kostete `opacity` eine verschobene Kachel; hier kostet es ein LEERES BLATT
   * je abgewaehlter Karte — der Kasten bliebe stehen und naehme seine Seite mit.
   */
  it("blendet abgewaehlte Karten aus statt sie blass zu machen", () => {
    expect(bildschirmblock()).toMatch(/\.lb-ortkarteAbgewaehlt\s*\{[^}]*opacity:\s*0\.35/);
    expect(druckblock()).toMatch(/\.lb-ortkarteAbgewaehlt\s*\{[^}]*display:\s*none/);
  });

  /**
   * Das Bildschirmraster faellt im Druck weg: auf Papier ist jede Karte eine
   * Seite, und ein `gap` daneben verschoebe sie im Satzspiegel.
   */
  it("nimmt dem Bogen im Druck sein Raster", () => {
    expect(bildschirmblock()).toMatch(/\.lb-ortbogen\s*\{[^}]*display:\s*grid/);
    expect(druckblock()).toMatch(/\.lb-ortbogen\s*\{[^}]*display:\s*block/);
  });

  /**
   * EIN BLATT PAPIER HAT KEINEN DUNKELMODUS. Die Werte sind LITERALE, kein
   * `--ant-*` und kein `--lb-*`: das `(druck)`-Layout haengt unter `.modul`,
   * dessen `--lb-*`-Satz im Dunkelzweig kippt — ein `var(--lb-tinte)` hier
   * druckte aus einer dunkel eingestellten Sitzung helle Schrift auf weisses
   * Papier, und `print-color-adjust: exact` verbietet dem Browser jede
   * Notrechnung.
   */
  it("nagelt Papier auf #fff und Schrift auf #000", () => {
    const regel = /\.lb-ortkarte\s*\{([^}]*)\}/.exec(bildschirmblock())!;
    expect(regel[1]).toContain("background: #ffffff");
    expect(regel[1]).toContain("color: #000000");
    expect(bildschirmblock()).not.toMatch(/\.lb-ort[\w-]*\s*\{[^}]*var\(--lb-/);
  });
});

describe("die Route belegt keinen Pfad doppelt", () => {
  /**
   * ZWEI ROUTE-GRUPPEN DUERFEN DENSELBEN AUFGELOESTEN PFAD NICHT DOPPELT
   * BELEGEN — dieselbe Einschraenkung, die `etiketten/druck.test.ts` fuer
   * `/verwaltung/etiketten` haelt. `(arbeit)/ortsetiketten/` und
   * `(druck)/ortsetiketten/` loesten beide auf /verwaltung/ortsetiketten auf;
   * Next bricht dann beim Bau ab, aber erst, wenn beide da sind.
   */
  it("hat kein verwaltung/(arbeit)/ortsetiketten/", () => {
    expect(readdirSync(join(MODUL, "verwaltung", "(arbeit)"))).not.toContain("ortsetiketten");
  });
});
