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
