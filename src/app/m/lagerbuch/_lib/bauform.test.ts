import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DIE MODULWEITEN QUELLTEXT-ZUSICHERUNGEN (§3.8.2).
 *
 * Sie belegen NICHT, dass etwas wirkt, sondern dass eine BAUFORM eingehalten
 * ist. Genau dafuer sind sie die richtige Ebene — jede Zeile hier faengt einen
 * Fehler, der typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar waere.
 * Vorbild: `src/core/shell/icons.test.ts` riegelt Falle 7 repo-weit ab.
 *
 * ALLE SCANS SIND IN DER EIGENSCHAFTSFORM (Festlegung G3): sie tolerieren
 * Dateien, die es noch nicht gibt. Das ist noetig, weil `_ui/`, `_actions/` und
 * die drei Weichen-Dateien erst ab Teil 4 entstehen — und ein Scan, der die
 * EXISTENZ behauptet, waere am ersten Tag rot und wuerde abgeschaltet statt
 * repariert.
 *
 * WER SIE VERSCHAERFT:
 *   Teil 4 ergaenzt HIER den `usePathname`-Scan (§7.8.2) und macht aus der
 *   Weichen-Zusicherung eine mit Existenzpflicht. Es entsteht KEINE zweite
 *   Scan-Datei.
 */

const MODUL = join(process.cwd(), "src/app/m/lagerbuch");
const SELBST = join(MODUL, "_lib/bauform.test.ts");

/** Jede .ts/.tsx-Datei unter dem Modulbaum, rekursiv — diese Datei ausgenommen. */
function quellDateien(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      // `migrations/` ist erzeugter SQL-/JSON-Bestand und enthaelt keinen TS-Code.
      if (eintrag === "migrations") continue;
      treffer.push(...quellDateien(pfad));
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (pfad === SELBST) continue;
    /**
     * ⚠️ TESTDATEIEN SIND AUSGENOMMEN, und das ist keine Bequemlichkeit.
     *
     * `absender.test.ts` MUSS `kopf({ "x-forwarded-for": … })` schreiben — das
     * ist der Fall, der belegt, dass der Header in keiner Richtung gelesen wird.
     * `zugang.test.ts` MUSS „auf `isModuleAdmin` umstellen" als Mutation
     * benennen. Ein Scan, der Testdateien mitliest, macht damit genau die Tests
     * rot, die die Zusicherung tragen — und wird dann abgeschaltet statt
     * repariert.
     *
     * Der Verlust ist klein und benannt: eine Verletzung, die AUSSCHLIESSLICH in
     * einer Testdatei steht, bleibt unentdeckt. Testdateien werden nicht
     * ausgeliefert; die Bauform-Aussage gilt dem Produktionsbaum.
     *
     * `*.spec.ts(x)` zaehlt mit: heute traegt keine Datei im Modul diese Endung,
     * aber die `e2e/`-Konvention der Suite kennt sie, und ein Scan, der sie
     * uebersieht, macht genau die Datei rot, die eine Zusicherung TRAEGT.
     */
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise:
 * die Zeilenzahl bleibt gleich, damit die `datei:zeile`-Meldung weiter stimmt.
 *
 * ⚠️ OHNE DAS IST JEDER DIESER SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT.
 * `_lib/zugang.ts` schreibt in seinem Kopfkommentar „`session.user.isAdmin`
 * kommt in diesem Modul NIRGENDS vor" und „BEWUSST NICHT `isModuleAdmin`";
 * `_lib/absender.ts` schreibt „WARUM `x-forwarded-for` HIER GAR NICHT
 * VORKOMMT". Das sind genau die Saetze, die den Scan erklaeren — und sie
 * duerfen ihn nicht ausloesen.
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt
 * mit `//` BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt
 * stehen. Grund: ein naiver `//`-Stripper wuerde bei
 * `const u = "https://example.org"` den Rest der Zeile leeren und koennte damit
 * eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie
 * falsch-negativ und still.
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

/**
 * Wie `ohneKommentare`, zusaetzlich werden Zeichenkettenliterale (Inhalt UND
 * Anfuehrungszeichen) geleert. Zeilenumbrueche innerhalb eines Template-Literals
 * bleiben erhalten, damit die Zeilenzahl stabil bleibt.
 *
 * Nur fuer den POSITIVEN Host-Riegel-Nachweis noetig: `toMatch` behauptet, dass
 * ein Muster VORKOMMT, und ein String wie `"requireLagerbuchHost("` als reiner
 * Text erfuellte diese Behauptung sonst, OHNE dass der Riegel je liefe — das
 * waere ein Scan, der still nichts faengt, die gefaehrliche Richtung. Die
 * uebrigen Scans hier sind alle NEGATIV (`toEqual([])`); dort macht ein Treffer
 * in einem Zeichenkettenliteral den Test hoechstens fälschlich ROT, nie still
 * gruen, und bleibt deshalb bewusst ungefiltert (siehe `trefferAuf`).
 */
function ohneKommentareUndZeichenketten(quelle: string): string {
  const bereinigt = ohneKommentare(quelle);
  let ergebnis = "";
  let i = 0;
  while (i < bereinigt.length) {
    const z = bereinigt[i]!;
    if (z === '"' || z === "'" || z === "`") {
      ergebnis += " ";
      i++;
      while (i < bereinigt.length && bereinigt[i] !== z) {
        if (bereinigt[i] === "\\") i++;
        else if (bereinigt[i] === "\n") ergebnis += "\n";
        i++;
      }
      if (i < bereinigt.length) { ergebnis += " "; i++; }
      continue;
    }
    ergebnis += z;
    i++;
  }
  return ergebnis;
}

function trefferAuf(muster: RegExp, dateien = quellDateien()): string[] {
  const funde: string[] = [];
  for (const pfad of dateien) {
    const zeilen = ohneKommentare(readFileSync(pfad, "utf8")).split("\n");
    zeilen.forEach((zeile, i) => {
      if (muster.test(zeile)) funde.push(`${relative(process.cwd(), pfad)}:${i + 1}: ${zeile.trim()}`);
    });
  }
  return funde;
}

describe("kein session.user.isAdmin im Modul", () => {
  it("findet keinen Treffer auf isAdmin", () => {
    /**
     * Ein 1:1-Port von `lagerbuch/src/lib/auth/cordon.ts:14-20` ist TYPKORREKT
     * (beide Felder sind `boolean`), laeuft durch `pnpm build` — und BEIDE
     * Dev-Logins der Suite setzen `isAdmin = true`. Die E2E blieben also gruen,
     * waehrend die gesamte Lagerbuch-Verwaltung fuer jeden Suite-Betreiber offen
     * stuende (Falle 13).
     *
     * `isAdmin` heisst in der Suite „ist BETREIBER" (`core/auth/config.ts:170`),
     * nicht „darf lagerbuch verwalten". Betrieb und Einsicht sind zwei Rollen:
     * hinter /verwaltung liegen das Journal mit KLARNAMEN und der Etikettenbogen
     * mit den Token-Codes IM KLARTEXT — dem Secret selbst.
     */
    expect(trefferAuf(/\bisAdmin\b/), "session.user.isAdmin ist fuer dieses Modul verboten (Betreiber-Entscheidung 3)")
      .toEqual([]);
  });
});

describe("keine Suite-Admin-Abkuerzung im Modul", () => {
  it("findet keinen der vier core-Riegel", () => {
    /**
     * `isModuleAdmin`, `requireModuleAdmin`, `moduleAdminPageOrNotFound` und
     * `canAdminModule` sind fertig, gut und die FALSCHEN fuer dieses Modul
     * (§3.6.3): alle vier tragen die Suite-Admin-Abkuerzung
     * (`core/groups.ts:103-105` steigt fuer den Suite-Admin unbedingt mit `true`
     * aus). Ein Import sieht wie Wiederverwendung aus.
     *
     * `canAdminModule` ist dabei der teuerste: es ist die hausuebliche
     * SICHTBARKEITSfrage und zeigte dem Suite-Admin einen Verwaltungs-Eintrag,
     * dessen Ziel `requireLagerbuchAdmin` mit 404 beantwortet — genau der
     * Zustand, den `docs/design/README.md` ausschliesst („fuehrt KEIN Weg
     * dorthin, wo die aufrufende Person nicht hindarf?").
     */
    expect(trefferAuf(/\b(?:isModuleAdmin|requireModuleAdmin|moduleAdminPageOrNotFound|canAdminModule)\b/),
      "Navigation UND Riegel lesen istLagerbuchAdmin auf demselben Viewer (§3.6.3)")
      .toEqual([]);
  });
});

describe("kein x-forwarded-for im Modul", () => {
  it("findet keinen Treffer, in keiner Schreibweise", () => {
    /**
     * §3.5.2. Die Zeile wieder einzubauen sieht wie eine VERBESSERUNG aus („wir
     * lesen doch auch die Proxy-Kette") und ist der ganze Fehler: der
     * Suite-Container ist direkt erreichbar, und dann setzt der Anfragende den
     * Header vollstaendig selbst — erster wie letzter Eintrag ergeben einen
     * frischen Eimer je Versuch.
     */
    expect(trefferAuf(/x-forwarded-for/i), "Der Absenderschluessel liest ausschliesslich cf-connecting-ip (§3.5.2)")
      .toEqual([]);
  });
});

describe("die drei Weichen-Dateien tragen ein PRAEDIKAT, keinen Riegel", () => {
  /**
   * §3.2.1, Regel „Riegel in Layouts und Actions, Praedikat in Weichen".
   *
   * Diese drei Dateien haben je DREI gueltige Faelle, und der dritte ist immer
   * „keine Sitzung" — bei /a und /g das Gate mit returnTo, auf dem Gate die
   * Anzeige des Gates selbst. EIN RIEGEL HIER SCHICKT JEDEN ANONYMEN SCAN EINES
   * REGALETIKETTS NACH /login (§11.5, Zustand 18) — genau der Ausfall, gegen den
   * `requiresAuth: false` gebaut ist.
   *
   * Der Fehler ist typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar; ein
   * E2E faende ihn nur mit einem Abruf OHNE Cookie, und genau der fehlt heute.
   *
   * ⚠️ EIGENSCHAFTSFORM: die drei Dateien entstehen erst in TEIL 4. Bis dahin ist
   * dieser Block gruen, ohne etwas zu behaupten. TEIL 4 ERSETZT die
   * `existsSync`-Bedingung durch eine Existenzpflicht — dann behauptet der Scan
   * zusaetzlich, dass es die drei Dateien ueberhaupt gibt.
   */
  const WEICHEN = [
    "page.tsx",                  // das Gate (§7.2.4)
    "a/[artikelId]/page.tsx",    // Regaletikett-Weiche (§7.4.3)
    "g/[code]/page.tsx",         // Barcode-Weiche (§7.4.3)
  ];

  it("enthaelt weder requireLagerbuchAdmin noch requireHelferSitzung", () => {
    const vorhanden = WEICHEN.map((p) => join(MODUL, p)).filter((p) => existsSync(p));
    expect(trefferAuf(/\b(?:requireLagerbuchAdmin|requireHelferSitzung)\b/, vorhanden),
      "Weichen tragen viewerOderNull + istLagerbuchAdmin bzw. helferZugangOderNull (§3.2.1)")
      .toEqual([]);
  });

  it("traegt in jeder vorhandenen Weiche requireLagerbuchHost", () => {
    // Der Host-Riegel ist die EINE Ausnahme: er steht in allen dreien, und zwar
    // als ERSTE Anweisung (§2.6). Er hat nichts mit der Rollenfrage zu tun — er
    // verhindert eine zweite funktionierende Herkunft des Moduls.
    for (const p of WEICHEN.map((x) => join(MODUL, x)).filter((x) => existsSync(x))) {
      // Ohne Kommentare UND ohne Zeichenketten: ein `// hier stand mal
      // requireLagerbuchHost` oder ein Text-Literal `"requireLagerbuchHost("`
      // erfuellte die Zusage sonst, ohne dass der Riegel je liefe — das ist der
      // POSITIVE Nachweis, den ein blosser Kommentar-Stripper still bestehen
      // liesse.
      expect(ohneKommentareUndZeichenketten(readFileSync(p, "utf8")),
             `${relative(process.cwd(), p)} ohne Host-Riegel`)
        .toMatch(/requireLagerbuchHost\s*\(/);
    }
  });
});

describe("die Rueckkante konto.ts → zugang.ts traegt AUSSCHLIESSLICH Typen", () => {
  it("findet in konto.ts keinen WERT-Import aus zugang.ts", () => {
    /**
     * DIE INVARIANTE LAUTET GENAU EINEN SATZ: `konto.ts` importiert aus
     * `zugang.ts` ausschliesslich Typen (`import type { Viewer }`, Festlegung
     * G4). Mehr ist nicht einzuhalten, und weniger genuegt nicht.
     *
     * WAS EIN VERSTOSS KOSTET. `zugang.ts` importiert `merkeNutzer` als WERT von
     * `konto.ts`. Kaeme aus der Gegenrichtung ein Wert-Import hinzu, entstuende
     * ein echter Modulzyklus: TypeScript erlaubt ihn, ESM loest ihn zur Laufzeit
     * mit `undefined` auf, und der Fehler ist ein `merkeNutzer is not a
     * function` auf GENAU EINEM Codepfad — dem ersten Verwaltungsaufruf. Kein
     * Typcheck, kein Lint und kein `pnpm build` sieht das.
     *
     * ⚠️ NICHT DIE BEGRUENDUNG ABSCHREIBEN, DIE BISHER IM UMLAUF WAR. Es hiess,
     * die Zyklus-Immunitaet haenge daran, dass `merkeNutzer` und
     * `istLagerbuchAdmin` `function`-DEKLARATIONEN bleiben. Das stimmt nicht:
     * `konto.ts:1-3` hat heute KEINEN einzigen Laufzeit-Import aus `zugang.ts`
     * (`DB` und `Viewer` sind beide `import type`), es gibt also GAR KEINEN
     * Zyklus; `konto.ts` ist vollstaendig ausgewertet, bevor `zugang.ts` je
     * `merkeNutzer` ruft, und ob das Symbol eine Deklaration oder ein `const`
     * ist, ist belanglos. Die Hoisting-Frage wuerde erst relevant, WENN die
     * Rueckkante ein Wert-Import waere — also genau in dem Zustand, den dieser
     * Scan verhindert. Wer die falsche Begruendung erbt und sie widerlegt,
     * entfernt danach den Scan.
     *
     * ⚠️ FALSCH-POSITIV auf die legitime Inline-Form
     * `import { type Viewer } from "./zugang"`: das Muster sieht nur, dass nach
     * `import` eine geschweifte Klammer kommt. Das ist die LAUTE Richtung und
     * damit hinnehmbar — wer darueber stolpert, schreibt `import type { … }`.
     */
    expect(
      trefferAuf(/^import\s+\{[^}]*\bViewer\b/, [join(MODUL, "_lib/konto.ts")].filter((p) => existsSync(p))),
      "konto.ts importiert aus zugang.ts ausschliesslich Typen (Festlegung G4) — sonst ein echter Modulzyklus",
    ).toEqual([]);
  });
});

describe('kein "use client" unter _lib/ und _db/', () => {
  it("findet keine Direktive", () => {
    /**
     * Falle 6, `CLAUDE.md:24-27`. Ein WERT aus einem "use client"-Modul kommt in
     * einer Server Component NICHT an — sie bekommt eine Client-Referenz statt
     * des Wertes, HTTP 500 fuer die ganze Seite. TypeScript ist zufrieden,
     * `pnpm build` findet nichts, und VITEST KANN ES STRUKTURELL NICHT FINDEN:
     * dort ist "use client" ein wirkungsloser String.
     *
     * Nur dieser Scan sieht es. Er ergaenzt den aus T4 (Teil 1) um die Dateien,
     * die seither dazugekommen sind.
     */
    const unterLibUndDb = quellDateien().filter((p) => /\/_(?:lib|db)\//.test(p));
    expect(trefferAuf(/^\s*["']use client["']/, unterLibUndDb),
      'Werte fuer Server Components gehoeren in ein Modul OHNE "use client" (Falle 6)')
      .toEqual([]);
  });
});

// ————————————————————————————————————————————————————————————————————————
// TEIL 4, T64 — das Stylesheet des Helfer-Wegs und seine Riegel.
//
// ⚠️ ZWEI KLASSEN VON ZUSICHERUNGEN LIEGEN HIER UNTEREINANDER, und sie sind
// bewusst NICHT gleich gebaut:
//
//   1. Der Block „T64 — das Stylesheet …" steht NICHT in Eigenschaftsform.
//      `_ui/helfer.module.css` entsteht in DIESEM Task; er ist der Rotlauf von
//      T64 selbst.
//   2. Alles darunter steht in EIGENSCHAFTSFORM („falls die Datei existiert").
//      Ihre Subjekte entstehen erst in den Wellen 3 bis 7. Ein Scan, der am
//      ersten Tag rot ist, wird abgeschaltet statt repariert — genau der
//      Fehler, gegen den Teil 2 diese Datei ueberhaupt so gebaut hat.
//
// ⚠️ JEDER Quelltext-Scan hier liest `ohneKommentare(...)`, nie den Rohtext —
// auch die CSS-Scans, denn `ohneKommentare` leert `/* … */` genauso. Ohne das
// traefe der `outline: none`-Scan die Zeile, die ihn BEGRUENDET, und die
// naheliegende „Reparatur" waere das Loeschen genau dieser Begruendung.
// ————————————————————————————————————————————————————————————————————————

const HELFER_CSS = join(MODUL, "_ui/helfer.module.css");

/**
 * Jede `.css` unter dem Modulbaum, rekursiv.
 *
 * ⚠️ EIN EIGENER SAMMLER, und das ist kein Versehen: `quellDateien()` liefert
 * ausschliesslich `.ts`/`.tsx` und gaebe hier IMMER `[]` zurueck — ein
 * leer-gruener Scan, der aussieht, als pruefte er etwas. Er laeuft ueber ALLE
 * `.css` unter `m/lagerbuch/**`, nicht nur `_ui/*.module.css`, sonst fiele
 * `(druck)/druck.css` (§6.10.2) heraus.
 */
function cssDateien(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "migrations") continue;
      treffer.push(...cssDateien(pfad));
      continue;
    }
    if (eintrag.endsWith(".css")) treffer.push(pfad);
  }
  return treffer;
}

/** Der Koerper der ERSTEN Regel, deren Selektor `muster` trifft — `{` bis `}`. */
function regelKoerper(css: string, muster: RegExp): string {
  const t = muster.exec(css);
  if (!t) return "";
  const auf = css.indexOf("{", t.index);
  const zu = css.indexOf("}", auf);
  return auf === -1 || zu === -1 ? "" : css.slice(auf + 1, zu);
}

/** Kommentare weg, At-Regel-Klammern aufloesen — dann Selektor/Koerper je Regel. */
function cssRegeln(quelle: string): { selektor: string; koerper: string }[] {
  const css = ohneKommentare(quelle).replace(/@[a-z-]+[^{;]*\{/gi, "");
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((t) => ({
    selektor: t[1]!.trim(),
    koerper: t[2]!,
  }));
}

describe("Teil 4, T64 — das Stylesheet des Helfer-Wegs existiert und traegt seinen Variablensatz", () => {
  /**
   * DIESE Zusicherungen sind NICHT in Eigenschaftsform: sie sind der Rotlauf
   * von T64 selbst. `helfer.module.css` entsteht in DIESEM Task, nicht spaeter.
   *
   * Die fuenfzehn Neutralen stehen hier und nicht nur die acht Ampelwerte (E8),
   * weil `_ui/BarcodeScanner.tsx` AUCH unter `.modul` rendert (Teil 5, T138):
   * beide Traeger muessen denselben Satz fuehren, sonst ist der Scanner auf
   * einem der beiden Aeste still ungestylt — eine nicht aufloesbare
   * CSS-Variable ist gueltiges CSS und faellt auf `transparent` zurueck.
   */
  const NEUTRALE = [
    "--lb-rot", "--lb-rot-dk", "--lb-rot-bg", "--lb-tinte", "--lb-stahl", "--lb-linie",
    "--lb-papier", "--lb-karte", "--lb-gelb", "--lb-gelb-bg", "--lb-ok", "--lb-ok-bg",
    "--lb-display", "--lb-body", "--lb-mono",
  ];
  /** §6.6.2 — die fachsemantische Palette. `grau` steht AUSSERHALB der Rangfolge. */
  const AMPEL = [
    "--lb-ampel-ok-text", "--lb-ampel-ok-flaeche",
    "--lb-ampel-gelb-text", "--lb-ampel-gelb-flaeche",
    "--lb-ampel-rot-text", "--lb-ampel-rot-flaeche",
    "--lb-ampel-grau-text", "--lb-ampel-grau-flaeche",
  ];
  /** Die Fassung ohne Kommentare — sonst sind mehrere dieser Scans auf ihrer
   *  eigenen Begruendung rot (siehe Kopf dieses Abschnitts). */
  const lies = () => ohneKommentare(readFileSync(HELFER_CSS, "utf8"));

  it("die Datei existiert", () => {
    expect(existsSync(HELFER_CSS)).toBe(true);
  });

  it("`.rahmen` traegt alle fuenfzehn Neutralen UND die acht Ampelwerte", () => {
    // Nicht „irgendwo in der Hell-Haelfte", sondern IM KOERPER von `.rahmen`:
    // eine Variable, die nach `:root` wandert, waere sonst gruen — und genau
    // dann faende `_ui/BarcodeScanner.tsx` sie unter `.modul` nicht.
    const koerper = regelKoerper(lies(), /(?:^|\})\s*\.rahmen\s*\{/m);
    expect(koerper, "`.rahmen`-Regel fehlt").not.toBe("");
    for (const name of [...NEUTRALE, ...AMPEL]) {
      expect(koerper, `${name} fehlt unter .rahmen`).toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("der Dunkelzweig setzt DIESELBEN zwanzig Farbnamen neu", () => {
    // Eine Farbe, die im Dunkelzweig fehlt, bleibt auf ihrem Hellwert stehen —
    // still, und nur auf dunklen Geraeten sichtbar. Die drei Schriftstapel
    // gehoeren NICHT dazu: sie sind moduskonstant.
    const koerper = regelKoerper(lies(), /:root\[data-theme="dark"\]\s+\.rahmen\s*\{/);
    expect(koerper, "Dunkelzweig fehlt").not.toBe("");
    for (const name of [...NEUTRALE.filter((n) => !/display|body|mono/.test(n)), ...AMPEL]) {
      expect(koerper, `${name} fehlt im Dunkelzweig`).toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("schaltet ueber `data-theme`, nicht ueber `prefers-color-scheme`", () => {
    // `prefers-color-scheme` braeche den Fall „System dunkel, Umschalter hell"
    // — die Suite fuehrt den Modus im Cookie `iuk-theme` und stempelt ihn
    // serverseitig auf <html data-theme> (src/app/layout.tsx).
    const css = lies();
    expect(css).toMatch(/:root\[data-theme="dark"\]\s+\.rahmen/);
    expect(css).not.toMatch(/prefers-color-scheme/);
  });

  it("greift ausschliesslich auf `--lb-*` zurueck (und auf die drei `--font-*`)", () => {
    // Der Traeger-Vertrag in seiner scharfen Form: `_ui/BarcodeScanner.tsx`
    // rendert AUCH unter `.modul` aus `verwaltung.module.css`. Jede Variable,
    // die nur EINER der beiden Traeger kennt, ist auf dem anderen Ast still
    // `transparent`. `--font-display|body|mono` sind die Ausnahme — sie kommen
    // vom Wurzel-Layout und liegen auf `:root`, also unter beiden Traegern.
    const fremde = [...lies().matchAll(/var\(\s*(--[\w-]+)/g)]
      .map((t) => t[1]!)
      .filter((n) => !n.startsWith("--lb-") && !/^--font-(display|body|mono)$/.test(n));
    expect([...new Set(fremde)], "nur --lb-* und die drei --font-* sind erlaubt").toEqual([]);
  });

  it("setzt `100dvh` und `max-width: 560px` — kein Breakpoint, eine Obergrenze", () => {
    const css = lies();
    expect(css).toMatch(/height:\s*100dvh/);
    expect(css).toMatch(/max-width:\s*560px/);
  });

  it("erhoeht die Suite-Untergrenze im Verfallsfeld auf 18px und senkt sie NIE", () => {
    // §7.7.2 Punkt 2: die Einzeiligkeit wird aufgegeben, nicht die
    // Schriftgroesze. `.verfallZeile input` (0,1,1) ueberstimmt
    // `input {font-size:16px}` (0,0,1) regulaer — nach OBEN.
    const css = lies();
    expect(css).toMatch(/\.verfallZeile\s+input\s*\{[^}]*font-size:\s*18px/);
    expect(css).toMatch(/\.verfallZeile\s+input\s*\{[^}]*min-height:\s*56px/);
  });

  it("gibt jeder Stepper-Flaeche 56px — das Suite-Tap-Mass", () => {
    // core/theme/tokens.ts:33 setzt TAP = 56 mit der Begruendung „Bedienung mit
    // Handschuhen … eine Einsatzanforderung, keine Stilfrage". lagerbuch liegt
    // heute bei 42x42 (globals.css:73) bzw. 30x30 in der sm-Variante (:75).
    const css = lies();
    expect(css).toMatch(/\.stepTaste\s*\{[^}]*width:\s*56px/);
    expect(css).toMatch(/\.stepTaste\s*\{[^}]*height:\s*56px/);
    expect(css).not.toMatch(/\.stepper\.sm|\.stepperSm/);
  });

  it("setzt `tabular-nums` an den drei Ziffernstellen", () => {
    // Im ganzen lagerbuch-Repo kommt die Eigenschaft NULL Mal vor; die
    // Ausrichtung haengt heute allein an IBM Plex Mono. Auf dem Helfer-Weg
    // werden Ziffern VERGLICHEN — Soll gegen Ist, Bestand, Druck in bar.
    const css = lies();
    for (const klasse of ["stepWert", "bestandsZahl", "mengenChip"]) {
      expect(css, `${klasse} ohne tabular-nums`).toMatch(
        new RegExp(`\\.${klasse}\\s*\\{[^}]*font-variant-numeric:\\s*tabular-nums`),
      );
    }
  });

  it("behaelt den `prefers-reduced-motion`-Zweig des Scanstrichs", () => {
    // Die einzige Animation des Wegs, und sie hat den Zweig heute schon
    // (globals.css:158-160). Ihn beim Portieren zu verlieren ist eine
    // Verschlechterung, die niemand meldet.
    //
    // ⚠️ Das ist die EINE Media Query dieser Datei und die ausdrueckliche
    // Ausnahme zu „NULL Media Queries" (§2 Punkt 16): der Constraint zielt auf
    // BREITEN-Abfragen, und `prefers-reduced-motion` ist keine. Wer §2
    // woertlich nimmt und die Zeile streicht, verliert einen Zweig, den der
    // Alt-Bestand heute schon hat.
    expect(lies()).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("setzt Fokus mit `outline-offset` und nirgends `outline: none` ohne Ersatz", () => {
    const css = lies();
    expect(css).toMatch(/:focus-visible[^{]*\{[^}]*outline-offset/);
    expect(css).not.toMatch(/outline:\s*none/);
  });
});

// ————————————————————————————————————————————————————————————————————————
// TEIL 4 (§7.12.2, §7.8.2) — SIEBEN Scans, alle in EIGENSCHAFTSFORM.
//
// Eigenschaftsform heisst: eine fehlende Datei ist KEIN Fehlschlag. Ein Scan,
// der am ersten Tag rot ist, wird abgeschaltet statt repariert. Die
// VERSCHAERFUNG auf „diese Dateien existieren" ist namentlich T87 (Abnahme) —
// dasselbe Muster, das der Weichen-Block weiter oben schon benutzt.
//
// Fuenf davon stehen im Plan (§7.12.2, §7.8.2). ZWEI sind Betreiberentscheidung
// vom 05.08.2026 und stehen dort NICHT:
//   B1 — der `falte()`-Scan auf `_lib/artikelFilter.ts` (Uebergabe Teil 3,
//        Punkt 9): kein Netz sichert die Bindung, ein Rueckfall auf
//        `.toLowerCase()` bliebe empirisch belegt gruen.
//   B2 — der Reihenfolge-Scan der drei Gate-Flaechen (Befund 15): die Zusage
//        steht in Teil 4 DREIMAL woertlich in drei Dateien und hatte kein
//        mechanisches Netz.
// ————————————————————————————————————————————————————————————————————————

describe("§7.7.1 — der eine Breakpoint, und dieses Modul erfindet keinen zweiten", () => {
  it("`_ui/helfer.module.css` enthaelt KEINE `@media (max-width`", () => {
    // jsdom wertet Media Queries nicht aus; nur ein Quelltext-Scan besitzt die
    // Aussage. Eine Ansicht, die es nur in EINER Fassung gibt, kann keinen
    // zweiten Breakpoint einfuehren.
    if (!existsSync(HELFER_CSS)) return;
    expect(ohneKommentare(readFileSync(HELFER_CSS, "utf8"))).not.toMatch(/@media[^{]*max-width/i);
  });

  it("jede `max-width`-Abfrage im ganzen Modulbaum schreibt 767.98", () => {
    // 767.98 und nicht 768: bei exakt 768px gelten sonst BEIDE Seiten, und die
    // Reihenfolge im Stylesheet entscheidet. Der Scan laeuft ueber ALLE .css
    // unter m/lagerbuch/** — nicht nur `_ui/*.module.css`, sonst fiele
    // `(druck)/druck.css` heraus (§6.10.2). lagerbuch schaltet heute bei 760px
    // (globals.css:250); derselbe Fall, an beiden Enden unsichtbar.
    //
    // GELESEN WIRD NUR DIE PRAELUDE einer `@media`-Regel: `max-width` als
    // LAYOUT-Eigenschaft (`.rahmen{max-width:560px}`) ist kein Breakpoint.
    const dateien = cssDateien();
    expect(dateien.length, "kein einziges Stylesheet im Modul — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(1);
    const verstoesse: string[] = [];
    for (const pfad of dateien) {
      const css = ohneKommentare(readFileSync(pfad, "utf8"));
      for (const regel of css.matchAll(/@media([^{]*)\{/g)) {
        for (const t of regel[1]!.matchAll(/max-width:\s*([\d.]+)px/gi)) {
          if (t[1] !== "767.98") {
            verstoesse.push(`${relative(process.cwd(), pfad)}: max-width: ${t[1]}px`);
          }
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("§7.7.4 / Falle 2 — kein `--ant-` ausserhalb eines antd-Baums", () => {
  it("keine `_ui/*.css` nennt `--ant-`", () => {
    // antd deklariert seine Variablen auf SEINER Scope-Klasse, nicht auf :root.
    // Eigenes Markup sieht sie nie — und eine nicht aufloesbare CSS-Variable ist
    // GUELTIGES CSS und faellt still auf `transparent` zurueck.
    const dateien = cssDateien(join(MODUL, "_ui"));
    expect(dateien.length, "kein Stylesheet unter _ui/ — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(1);
    const verstoesse = dateien
      .filter((p) => ohneKommentare(readFileSync(p, "utf8")).includes("--ant-"))
      .map((p) => relative(process.cwd(), p));
    expect(verstoesse).toEqual([]);
  });

  it("keine `_ui/*.tsx` nennt `--ant-` in einem Inline-Style", () => {
    // Der Taschenlampenschalter faerbt sich per Inline-Style (§7.6.4). Wer beim
    // Portieren `var(--rot)` reflexartig durch `var(--ant-color-primary)`
    // ersetzt, bekommt einen Knopf OHNE Hintergrundfarbe — still.
    //
    // ⚠️ EIGENSCHAFTSFORM: `_ui/` traegt heute nur das Stylesheet, die Menge ist
    // also LEER und der Scan behauptet nichts. Zaehne bekommt er ab Welle 3.
    const verstoesse = quellDateien(join(MODUL, "_ui"))
      .filter((p) => p.endsWith(".tsx"))
      .filter((p) => ohneKommentare(readFileSync(p, "utf8")).includes("--ant-"))
      .map((p) => relative(process.cwd(), p));
    expect(verstoesse).toEqual([]);
  });
});

describe("§7.7.2 — die Luecke in `core/theme/feldschrift.test.ts`, modul-lokal geschlossen", () => {
  /**
   * Das Suite-Gate liest NUR die Langform `font-size:` und filtert auf
   * Selektoren, die `input|textarea|select` nennen. Drei zu kleine Felder des
   * Bestands kommen dadurch DURCH: `.input` mit `font:500 14px …`
   * (globals.css:80), `.combo-input` (:83) und `.stepper.sm .stepval` mit 15px
   * (:76) — obwohl `.stepval` (Stepper.tsx:52) ein echtes `<input>` IST.
   *
   * Wer den gruenen Suite-Test als bestandene Pruefung liest, portiert drei zu
   * kleine Felder in eine Anwendung OHNE Zoom (`maximumScale: 1`,
   * `userScalable: false`). Die 16px-Untergrenze und der gesperrte Zoom sind
   * ausdruecklich EINE Regel.
   *
   * Deshalb zwei Erweiterungen gegenueber dem Suite-Gate:
   *   1. auch die `font:`-KURZSCHREIBWEISE wird gelesen;
   *   2. die FELDKLASSEN dieses Moduls zaehlen als Feld, obwohl ihr Selektor
   *      das Wort „input" nicht enthaelt.
   */
  const FELDKLASSEN = /\b(input|textarea|select)\b|\.(codefeld|stepWert|suchfeld|feld|verfallZeile)\b/;

  it("keine Feldregel unter 16px — Langform UND Kurzschreibweise", () => {
    const verstoesse: string[] = [];
    let geprueft = 0;
    for (const pfad of cssDateien(join(MODUL, "_ui"))) {
      for (const { selektor, koerper } of cssRegeln(readFileSync(pfad, "utf8"))) {
        if (!FELDKLASSEN.test(selektor)) continue;
        geprueft++;
        const lang = /font-size:\s*([\d.]+)px/.exec(koerper);
        // Kurzschreibweise: `font: 700 20px/1 var(--lb-display)` — die Groesse
        // ist der erste px-Wert nach optionalen Stil-/Gewichtsangaben.
        const kurz = /font:\s*[^;]*?([\d.]+)px/.exec(koerper);
        for (const treffer of [lang, kurz]) {
          if (treffer && Number(treffer[1]) < 16) {
            verstoesse.push(`${relative(process.cwd(), pfad)}: ${selektor} -> ${treffer[1]}px`);
          }
        }
      }
    }
    // Ohne diese Zeile waere der Scan bei leerer Regelmenge vakuum-gruen und
    // saehe wie eine bestandene Pruefung aus.
    expect(geprueft, "keine einzige Feldregel geprueft").toBeGreaterThanOrEqual(5);
    expect(verstoesse).toEqual([]);
  });
});

describe("§7.1 — die Ansichtsklasse wird nicht still unterlaufen", () => {
  it("keine Datei auf `_ui/`, `helfer/`, `a/`, `t/` oder `page.tsx` importiert `antd` oder `@ant-design/icons`, ausser den Verwaltungsbausteinen", () => {
    // `core/shell/icons.test.ts:147-171` faengt repo-weit NUR die Icons. Ein
    // `import { Card } from "antd"` in `_ui/Entnahme.tsx` waere typkorrekt,
    // lint-sauber, gebaut — und heraus kaeme eine Verwaltungsanmutung auf einem
    // Telefon, plus 96px Ueberlauf gegen 100dvh (Falle 41).
    //
    // ⚠️ DER SCAN LAEUFT UEBER DEN GANZEN OEFFENTLICHEN AST, nicht nur `_ui/`.
    // Der Global Constraint sagt woertlich „in KEINER Datei dieses Plans, auch
    // nicht in einer Client-Insel". An der Ordnergrenze `_ui/` zu enden hiesse:
    // ein `import { Card } from "antd"` in `helfer/entnahme/page.tsx`,
    // `a/[artikelId]/page.tsx`, `t/[code]/route.ts` oder `page.tsx` liefe durch
    // — `core/shell/icons.test.ts` faengt repo-weit nur die ICONS, nicht `antd`
    // selbst, und `typecheck`, `lint` und `build` sehen nichts. Dieselbe
    // Ast-Liste benutzt der `useSearchParams`-Scan unten.
    //
    // `verwaltung/` bleibt bewusst aussen vor: DAS ist der antd-Zweig.
    //
    // AUSNAHMELISTE: die Verwaltungsbausteine aus Teil 5 leben im selben Ordner
    // und DUERFEN antd. Die Liste ist namentlich, nicht gemustert — ein
    // Praefix-Muster liesse die naechste Datei durch, die zufaellig so heisst.
    //
    // ⚠️ EIGENSCHAFTSFORM: die Menge ist heute 0 Dateien — `_ui/` traegt nur das
    // Stylesheet, und `helfer/`, `a/`, `t/` und `page.tsx` entstehen erst ab
    // Welle 3. Zaehne ab dann.
    const VERWALTUNG = new Set([
      "Chip.tsx", "Plakette.tsx", "SeitenKopf.tsx", "Brotkrume.tsx", "Kachel.tsx",
      "Suchfeld.tsx", "Trefferanzeige.tsx", "LoeschDialog.tsx", "LoeschButton.tsx",
      "VerwaltungsRahmen.tsx", "ArtikelDrawer.tsx", "DruckRahmen.tsx",
    ]);
    const WURZEL = join(MODUL, "page.tsx");
    const dateien = [
      ...["_ui", "helfer", "a", "t"].flatMap((d) => quellDateien(join(MODUL, d))),
      ...(existsSync(WURZEL) ? [WURZEL] : []),
    ];
    const verstoesse: string[] = [];
    for (const pfad of dateien) {
      if (VERWALTUNG.has(pfad.split("/").pop()!)) continue;
      const q = ohneKommentare(readFileSync(pfad, "utf8"));
      if (/from\s+"antd(\/|")|from\s+"@ant-design\/icons/.test(q)) {
        verstoesse.push(relative(process.cwd(), pfad));
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("KEINE Datei im Modul importiert `lucide-react`", () => {
    // Der Alt-Bestand importiert es in JEDER Datei dieses Zweigs; die Suite hat
    // es gar nicht im Baum. Ein Import scheiterte an der Aufloesung — aber erst
    // im Build, nicht im Review, und die naheliegende „Reparatur" ist dann,
    // lucide zu INSTALLIEREN statt die Zeile zu streichen.
    //
    // ⚠️ `quellDateien()` und NICHT ein eigener Sammler ohne Testdatei-Filter:
    // die Testdateien der Wellen 3 bis 7 tragen `lucide-react` in ihrem EIGENEN
    // Verbots-Regex. Ein Scan, der sie mitliest, macht genau die Tests rot, die
    // die Zusicherung tragen (siehe die Begruendung an `quellDateien`).
    const dateien = quellDateien();
    expect(dateien.length, "leere Dateimenge — der Scan waere leer-gruen").toBeGreaterThanOrEqual(50);
    expect(trefferAuf(/lucide-react/, dateien), "lucide-react ist in dieser Suite nicht installiert")
      .toEqual([]);
  });
});

describe("§7.8.2 / Falle 63 — `usePathname` kommt im Modul GAR NICHT vor", () => {
  it("kein `usePathname` unter `src/app/m/lagerbuch/`", () => {
    // `core/routing.ts:54-67` behandelt bereits praefixierte Pfade eigens und
    // schliesst `/m/*` bewusst NICHT aus dem Matcher aus. Auf diesem zweiten Weg
    // beginnt `/m/lagerbuch/helfer/check` nicht mit `/helfer/check`, und die
    // Tab-Leiste markierte dauerhaft „Entnahme" — auch im Fahrzeug-Check.
    //
    // Der Server kennt das Segment ohnehin. `HelferRahmen` bekommt es als Prop.
    // Dieser Scan ist der einzige, der das VOR dem E2E sieht.
    const dateien = quellDateien();
    expect(dateien.length, "leere Dateimenge — der Scan waere leer-gruen").toBeGreaterThanOrEqual(50);
    expect(trefferAuf(/\busePathname\b/, dateien),
      "das aktive Segment kommt als Prop vom Server, nicht aus usePathname (Falle 63)")
      .toEqual([]);
  });

  it("kein `useSearchParams`, kein `router.push`/`router.replace` auf dem Helfer-Ast", () => {
    // §7.8.2 Punkt 6: `useSearchParams` hat in lagerbuch NULL Konsumenten; der
    // Filterzustand wird serverseitig als `searchParams`-Prop gelesen. Die
    // Fahrzeugwahl wird ein <Link> (§7.9.1), kein Client-Schreiber. Damit
    // entsteht die Suspense-Falle rund um `useSearchParams` auf diesem Ast gar
    // nicht — solange es so bleibt.
    //
    // ⚠️ EIGENSCHAFTSFORM: von den vier Aesten existiert heute nur `_ui/`, und
    // dort liegt keine `.tsx`. Zaehne ab Welle 3.
    const AST = ["_ui", "helfer", "a", "t"].map((d) => join(MODUL, d));
    const verstoesse: string[] = [];
    for (const wurzel of AST) {
      for (const pfad of quellDateien(wurzel)) {
        // Die Verwaltungsbausteine im selben `_ui/`-Ordner duerfen beides.
        if (/\/(Suchfeld|Trefferanzeige|useUrlFilter|LoeschDialog|ArtikelDrawer)\./.test(pfad)) continue;
        if (/useSearchParams|router\.(push|replace)/.test(ohneKommentare(readFileSync(pfad, "utf8")))) {
          verstoesse.push(relative(process.cwd(), pfad));
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("B1 / §5.13.2 — `_lib/artikelFilter.ts` faltet ueber `falte()`, nicht selbst", () => {
  /**
   * BETREIBERENTSCHEIDUNG vom 05.08.2026 (Uebergabe Teil 3, Punkt 9). Der Plan
   * kennt diesen Scan nicht; sein einziger `falte`-Scan (T71) liest
   * `_ui/ArtikelSuche.tsx` und beruehrt `artikelFilter.ts` nirgends.
   *
   * WARUM ES EIN NETZ BRAUCHT: die Datei faltet an ZWEI Stellen. Ein Rueckfall
   * auf `.toLowerCase()` traefe bei den heutigen Zeichen zufaellig dieselbe
   * Entscheidung und bliebe damit gruen — empirisch belegt. Er liefe aber der
   * SQL-Haelfte (`lb_falte`, registriert in `_db/client.ts`) auseinander,
   * sobald sich die Faltung je aendert. Die Praemisse von §5.13.2 heisst „EINE
   * Faltung, EIN Ort"; sie ist genau dann eingehalten, wenn hier kein zweiter
   * Ort entsteht.
   */
  const FILTER = join(MODUL, "_lib/artikelFilter.ts");

  it("importiert `falte` aus `./suche`, ruft es zweimal und faltet nirgends selbst", () => {
    if (!existsSync(FILTER)) return;
    const q = ohneKommentare(readFileSync(FILTER, "utf8"));
    expect(q, "die eine Faltung des Moduls kommt aus _lib/suche.ts (§5.13.2)")
      .toMatch(/import\s*\{[^}]*\bfalte\b[^}]*\}\s*from\s*["']\.\/suche["']/);
    expect([...q.matchAll(/\bfalte\s*\(/g)].length, "beide Faltstellen laufen ueber falte()")
      .toBeGreaterThanOrEqual(2);
    expect(q, "ein eigenes toLowerCase() waere der zweite Ort — genau der, den §5.13.2 ausschliesst")
      .not.toMatch(/\.toLoc(?:ale)?LowerCase\s*\(|\.toLowerCase\s*\(/);
  });
});

describe("B2 / Befund 15 — die Riegelreihenfolge der drei Gate-Flaechen", () => {
  /**
   * BETREIBERENTSCHEIDUNG vom 05.08.2026 (Befund 15, die von §0 verlangte
   * Entscheidung). Die Zusage
   *
   *   Host → Sperre (OHNE Datenbankzugriff) → normalisieren → `redeemToken`
   *        → Erfolg: Cookie, KEIN Budgetverbrauch
   *
   * steht in Teil 4 DREIMAL woertlich in drei verschiedenen Dateien und hatte
   * bis hierher kein mechanisches Netz — nur drei voneinander unabhaengige,
   * mock-basierte Unit-Testsaetze. Genau die Konstellation, in der die dritte
   * Kopie die Reihenfolge verliert und kein Gate es sieht.
   * `_lib/gateSchranke.ts:119-124` benennt diesen Fehler als in DIESER Suite
   * bereits produktiv eingetreten (feedback, 15 Ehrenamtliche aus einem
   * Vereins-WLAN).
   *
   * ⚠️ EIGENSCHAFTSFORM, wie jeder Scan dieser Datei: die drei Dateien
   * entstehen erst in Welle 4 (`_actions/*`) und Welle 7 (`t/[code]/route.ts`).
   * AUFLAGE AN T87 (Abnahme): dort wird die `existsSync`-Bedingung durch eine
   * EXISTENZPFLICHT ersetzt — dasselbe Muster, das der Weichen-Block oben
   * bereits vorschreibt. Bis dahin behauptet dieser Block nichts.
   *
   * ⚠️ GELESEN WIRD `ohneKommentareUndZeichenketten`: Test 1 ist ein POSITIVER
   * Nachweis, und ein Textliteral `"redeemToken("` erfuellte ihn sonst, ohne
   * dass der Riegel je liefe — ein Scan, der still nichts faengt.
   *
   * ⚠️ WAS DIESES NETZ NICHT DECKT — und woran es stattdessen haengt.
   * Ein Quelltext-Scan sieht POSITION, nicht BEDINGTHEIT. Zwei der sechs
   * Glieder der Zusage oben liegen deshalb ausserhalb dessen, was hier
   * behauptet werden kann:
   *   - „KEIN Budgetverbrauch im Erfolgsfall": ein UNBEDINGTES
   *     `gateFehlversuchBuchen()` NACH `redeemToken()` — also eines, das auch
   *     bei Erfolg bucht — ist hier gruen. Test 3 unten sichert genau eine
   *     Aussage zu, und nur sie: es wird nicht VOR der Einloesung gebucht.
   *   - „Erfolg: Cookie": dass im Erfolgsfall eine Sitzung gesetzt wird, prueft
   *     hier kein `it()`.
   * AUFLAGE: beides gehoert in die mock-basierten Unit-Tests der Flaechen —
   * T73 (`_actions/gate.ts`), T74 (`_actions/sitzung.ts`) und T82
   * (`t/[code]/route.ts`), dazu T81 (`page.tsx`, das Gate selbst). Wer dort
   * einen dieser beiden Faelle nicht abdeckt, hat ihn NIRGENDS abgedeckt — die
   * Existenz dieses Blocks ersetzt ihn nicht.
   */
  const GATE_FLAECHEN = ["_actions/gate.ts", "_actions/sitzung.ts", "t/[code]/route.ts"];
  /**
   * ⚠️ DER HOST-RIEGEL HAT ZWEI FORMEN, und beide zaehlen hier. `_lib/host.ts`
   * fuehrt eine WERFENDE (`requireLagerbuchHost`, fuer Layouts, Seiten und
   * Server Actions) und eine NICHT-werfende (`lagerbuchHostOderNull`, fuer
   * Route Handler) — und `_lib/host.ts:52-67` schreibt beide Zuordnungen
   * verbindlich fest: `t/[code]/route.ts` steht dort ausdruecklich in der
   * zweiten Spalte, weil ein `notFound()` keine brauchbare Antwort auf einen
   * GESCANNTEN QR-Code ist.
   *
   * Ein Muster auf nur die werfende Form meldete deshalb ab T82 „Riegel „Host"
   * fehlt ganz" fuer eine Datei, die den Riegel korrekt und als ERSTE Anweisung
   * traegt — gemessen, nicht vermutet. Dieser Block behauptet REIHENFOLGE, nicht
   * FORM.
   *
   * ⚠️ WER DIE FORM HAELT, DATEI FUER DATEI — ausgeschrieben, weil eine
   * Halbwahrheit hier teurer waere als die Luecke:
   *   - `t/[code]/route.ts`      T87 (Quelltext-Scan: traegt `lagerbuchHostOderNull`
   *                              und NICHT die werfende Form)
   *   - `_actions/gate.ts`       `_actions/gate.test.ts:134-153` — der Verhaltenstest
   *                              „auf fremdem Host: notFound(), und NICHTS davor ist
   *                              gelaufen" (`rejects.toThrow("NEXT_NOT_FOUND")`)
   *   - `_actions/sitzung.ts`    `_actions/sitzung.test.ts` — derselbe Test, gleiche Form
   * T87 sagt ueber die beiden Action-Dateien NICHTS. Nach dieser Weitung haelt sie
   * allein ihr eigener Verhaltenstest; wer den entfernt, macht die werfende Form
   * dort unbewacht.
   */
  const RIEGEL: { name: string; muster: RegExp }[] = [
    { name: "Host",          muster: /\b(?:requireLagerbuchHost|lagerbuchHostOderNull)\s*\(/ },
    { name: "Sperre",        muster: /\bgateGesperrt\s*\(/ },
    { name: "normalisieren", muster: /\bnormalisiereCode\s*\(/ },
    { name: "Einloesung",    muster: /\bredeemToken\s*\(/ },
  ];

  /**
   * Der Ausschnitt EINER Flaeche, der die einloesende Funktion traegt — vom
   * letzten `export` VOR dem `redeemToken(`-Treffer bis zum naechsten `export`
   * danach. `null`, wenn die Datei gar nicht einloest.
   *
   * ⚠️ WARUM NICHT DER GANZE DATEITEXT: `muster.exec(q)` liefert das ERSTE
   * Vorkommen in der ganzen Datei. Traegt eine Flaeche mehr als eine
   * exportierte Funktion — fuer `_actions/gate.ts` und `_actions/sitzung.ts`
   * der Normalfall —, koennen die vier Erst-Vorkommen aus VERSCHIEDENEN
   * Funktionen stammen. Die Reihenfolgeaussage waere dann bedeutungslos, ohne
   * rot zu werden: eine zweite Action, die `requireLagerbuchHost()` frueh im
   * Text ruft, „erfuellte" den Host-Riegel fuer die Einloese-Action mit.
   *
   * ⚠️ DAS `/g` STEHT HIER DRIN UND NICHT AN EINEM MODULEBENEN-`const`: ein
   * gehisstes `/g`-Muster traegt `lastIndex` zwischen den Flaechen weiter. An
   * `RIEGEL` oben haengt aus demselben Grund korrekt KEIN `g`.
   *
   * ⚠️ DER SCHNITT IST EINE OBERGRENZE, keine exakte Funktionsgrenze: liegt die
   * einloesende Funktion als LOKALE Funktion hinter einem exportierten Wrapper,
   * beginnt der Ausschnitt beim Wrapper und ist damit eine Obermenge. Das ist
   * schwaecher als eine echte Funktionsgrenze, aber nie schwaecher als der
   * ganze Dateitext von vorher.
   */
  const einloeseAbschnitt = (q: string): string | null => {
    const einloesung = /\bredeemToken\s*\(/.exec(q);
    if (!einloesung) return null;
    const exporte = [...q.matchAll(/\bexport\b/g)].map((m) => m.index);
    const start = exporte.filter((i) => i <= einloesung.index).pop() ?? 0;
    const ende = exporte.find((i) => i > einloesung.index) ?? q.length;
    return q.slice(start, ende);
  };

  /**
   * Die vorhandenen Gate-Flaechen, jede schon ohne Kommentare und Literale und
   * auf ihren Einloese-Abschnitt verengt.
   *
   * Ausloeser ist die EINLOESUNG: eine Datei ohne `redeemToken(` ist keine
   * Gate-Flaeche, und KEINER der drei Tests behauptet ueber sie etwas — so, wie
   * der Kopf dieses Blocks es festlegt.
   */
  const flaechen = (): { pfad: string; abschnitt: string }[] =>
    GATE_FLAECHEN.map((p) => join(MODUL, p))
      .filter((p) => existsSync(p))
      .map((p) => ({
        pfad: relative(process.cwd(), p),
        abschnitt: einloeseAbschnitt(ohneKommentareUndZeichenketten(readFileSync(p, "utf8"))),
      }))
      .filter((f): f is { pfad: string; abschnitt: string } => f.abschnitt !== null);

  it("jede Flaeche, die einloest, traegt alle vier Riegel — in dieser Reihenfolge", () => {
    const verstoesse: string[] = [];
    for (const { pfad, abschnitt } of flaechen()) {
      let vorher = -1;
      let vorherName = "(Abschnittsanfang)";
      for (const { name, muster } of RIEGEL) {
        const t = muster.exec(abschnitt);
        if (!t) { verstoesse.push(`${pfad}: Riegel „${name}" fehlt ganz`); break; }
        if (t.index < vorher) { verstoesse.push(`${pfad}: „${name}" steht VOR „${vorherName}"`); break; }
        vorher = t.index;
        vorherName = name;
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("kein Datenbankzugriff VOR der Sperre", () => {
    // Die Sperre ist genau deshalb ohne Datenbankzugriff gebaut
    // (`gateSchranke.ts:83-104`, „LIEST NUR"): sie SCHUETZT den Zugriff. Faellt
    // ein `getDb()` davor, ist der Deckel wirkungslos — und still.
    //
    // Fehlt `gateGesperrt(` im Abschnitt ganz, meldet das Test 1 als „Riegel
    // fehlt ganz" — hier still weiterzugehen laesst also nichts durch.
    const verstoesse: string[] = [];
    for (const { pfad, abschnitt } of flaechen()) {
      const sperre = /\bgateGesperrt\s*\(/.exec(abschnitt);
      if (!sperre) continue;
      const db = /\bgetDb\s*\(/.exec(abschnitt);
      if (db && db.index < sperre.index) {
        verstoesse.push(`${pfad}: getDb() steht vor gateGesperrt()`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("kein Buchen VOR der Einloesung — die Bedingtheit haelt dieses Netz NICHT", () => {
    // §3.9 / `gateSchranke.ts:113-126`: gebucht wird ein FEHLVERSUCH, nie ein
    // Erfolg. Liegt `gateFehlversuchBuchen()` vor `redeemToken()`, verbraucht
    // eine Bereitschaft hinter einem gemeinsamen Uplink ihre fuenf Versuche mit
    // ERFOLGREICHEN Scans — der Fehler, den der Alt-Bestand heute hat
    // (`lagerbuch/src/app/(gate)/actions.ts:19`, `t/[code]/route.ts:25`).
    //
    // ⚠️ DER NAME SAGT GENAU DAS, WAS DER RUMPF HAELT, und nicht mehr: geprueft
    // wird POSITION. Ein UNBEDINGTES `gateFehlversuchBuchen()` NACH
    // `redeemToken()` — eines, das auch im Erfolgsfall bucht — bleibt hier
    // gruen. Diesen Fall halten die Unit-Tests von T73/T74/T82; siehe die
    // Auflage im Kopf dieses Blocks. Eine schaerfere Regex waere hier keine
    // Behebung, sondern eine Verdeckung.
    const verstoesse: string[] = [];
    for (const { pfad, abschnitt } of flaechen()) {
      const einloesung = /\bredeemToken\s*\(/.exec(abschnitt);
      const buchung = /\bgateFehlversuchBuchen\s*\(/.exec(abschnitt);
      if (einloesung && buchung && buchung.index < einloesung.index) {
        verstoesse.push(`${pfad}: gateFehlversuchBuchen() steht vor redeemToken()`);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});
