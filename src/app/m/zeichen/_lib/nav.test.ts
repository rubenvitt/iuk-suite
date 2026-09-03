import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZEICHEN_NAV, zeichenNav } from "./nav";

/*
 * DIE TAFEL IST EINE ZWEITSCHRIFT UND MUSS ES SEIN (Vorbild `radio/_lib/nav.test.ts:175-205`).
 * Ein Fall, der seine Erwartung aus `nav.ts` ableitet, bewacht nichts: `title`, `href` und
 * `ikon` sind Zeichenketten, und eine Vertauschung — `ikon: "merkliste"` am Baukasten, ein
 * `href` mit Tippfehler — laesst typecheck, lint und jeden Mengenfall gruen. Quelle dieser
 * Tafel ist Spec §2 („Navigation"), nicht `nav.ts`.
 *
 * ⚠️ DIE TITEL TRAGEN IHRE UMLAUTE („Üben") — es sind Bildschirmtexte, keine Bezeichner.
 */
const TAFEL: (string | undefined)[][] = [
  ["Katalog",       "/m/zeichen/katalog",             "zeichensuche", undefined],
  ["Merkliste",     "/m/zeichen/merkliste",           "merkliste",    undefined],
  ["Baukasten",     "/m/zeichen/baukasten",           "baukasten",    undefined],
  ["Meine Zeichen", "/m/zeichen/meine",               "baukasten",    undefined],
  ["Üben",          "/m/zeichen/lernen",              "ueben",        undefined],
  ["Lernsets",      "/m/zeichen/verwaltung/lernsets", "lernsets",     "Verwaltung"],
];

describe("ZEICHEN_NAV", () => {
  it("fuehrt die sechs Eintraege aus Spec §2 — Titel, Ziel, Zeichen, Abschnitt, Reihenfolge", () => {
    expect(ZEICHEN_NAV.map((e) => [e.title, e.href, e.ikon, e.abschnitt])).toEqual(TAFEL);
  });

  /*
   * ⛔ KEIN EINTRAG AUF DIE MODULWURZEL. `aktiverEintrag` (`core/shell/SuiteNav.tsx:99-107`)
   * behandelt einen Eintrag mit `href: "/"` als WURZEL-RUECKFALL: auf jeder Seite, auf die kein
   * anderer Eintrag passt, wird dieser hervorgehoben — mit `aria-current="true"`. `uav/_lib/nav.ts`
   * traegt genau diesen Fall samt Browser-Messung aus, `lagerbuch/_lib/nav.ts` weicht ihm durch
   * einen fehlenden Wurzel-Eintrag aus. Hier geht der lagerbuch-Weg: die Startseite `/m/zeichen`
   * markiert nichts in der Leiste, und das ist richtig — sie ist die Uebersicht ueber die
   * Eintraege, nicht einer von ihnen.
   */
  it("fuehrt keinen Eintrag auf die Modulwurzel", () => {
    expect(ZEICHEN_NAV.length, "leere Liste — jeder Fall waere leer-gruen").toBe(6);
    expect(ZEICHEN_NAV.filter((e) => e.href === "/" || e.href === "/m/zeichen")).toEqual([]);
  });

  /*
   * DIE INNERE PFADFORM, UND DAS IST EINE ABWEICHUNG VON `lagerbuch`/`radio`/`uav` MIT GRUND.
   * Jene drei tragen die AEUSSERE Form (`/verwaltung`, `/admin`), weil sie ausschliesslich unter
   * ihrem eigenen Host bedient werden. `zeichen` muss BEIDE Hosts koennen: bis zum Cutover haengt
   * es unter `iuk-ue.de/m/zeichen/...`, danach zusaetzlich unter `SUITE_HOST_ZEICHEN` an der
   * Wurzel. Ein `href="/katalog"` fuehrte auf dem Suite-Host in `decideRoute` auf das PORTAL
   * (`core/routing.ts`, letzte Zeile: `rewrite` nach `/m/portal/katalog`) → 404. Die innere Form
   * traegt beide: `decideRoute` erkennt `/m/<key>/...` in seinem `internal`-Zweig und gatet dort
   * nach dem Segment, nicht nach dem Host.
   *
   * ⚠️ DER PREIS, AUSGESCHRIEBEN STATT VERSCHWIEGEN: `aktiverEintrag` vergleicht per Suffix
   * (`pfad === e.href || pfad.endsWith(e.href)`). Wer auf dem Modul-Host `/katalog` direkt
   * aufruft, bekommt intern `/m/zeichen/katalog` gerendert, in der Adresszeile steht aber
   * `/katalog` — und `"/katalog".endsWith("/m/zeichen/katalog")` ist falsch. Die Markierung in
   * der Leiste fehlt dann bis zum ersten Klick auf einen Nav-Link. Das ist ein Schoenheitsfehler
   * gegen einen 404 abgewogen, keine Unachtsamkeit.
   */
  it("traegt die innere Pfadform, weil das Modul unter beiden Hosts erreichbar sein muss", () => {
    const fremd = ZEICHEN_NAV.filter((e) => !e.href.startsWith("/m/zeichen/")).map((e) => e.key);
    expect(fremd).toEqual([]);
  });

  /*
   * ⚠️ NICHT TYPSEITIG GEDECKT: `SuiteNavItem.ikon` ist OPTIONAL (`core/shell/types.ts`), und
   * `NavIkone` liefert fuer einen fehlenden Namen still `null`. Ein Eintrag ohne Zeichen steht
   * dann als nackter Text zwischen fuenf Zeichen — kein Typ- und kein Lint-Fehler.
   * ⛔ DASS DER NAME AUFLOEST, PRUEFT DIESER FALL NICHT: das ist die Zusage von
   * `core/shell/navIkonen.test.tsx`, und dort steht diese Liste seit Schritt 3 drin.
   */
  it("setzt fuer jeden Eintrag ein Zeichen", () => {
    expect(ZEICHEN_NAV.filter((e) => e.ikon === undefined).map((e) => e.key)).toEqual([]);
  });

  /*
   * DER VERWALTUNGSEINTRAG HAENGT AM SELBEN PRAEDIKAT WIE DIE ROUTE (Spec §2): sichtbar bei
   * `canAdminModule("zeichen")`, gegated durch `moduleAdminPageOrNotFound("zeichen")`. Die
   * Pruefrage aus `docs/design/README.md` lautet „fuehrt KEIN Weg dorthin, wo die aufrufende
   * Person nicht hindarf?" — ein Eintrag, der in ein 404 fuehrt, beantwortet sie mit nein.
   *
   * GEFILTERT WIRD UEBER `abschnitt`, NICHT UEBER DEN SCHLUESSEL `lernsets`: kommt eine zweite
   * Verwaltungsflaeche dazu, ist sie damit von selbst mitgegatet. Ein Filter auf den Schluessel
   * haette sie still durchgelassen.
   */
  it("blendet die Verwaltung aus, wer das Modul nicht verwalten darf", () => {
    expect(zeichenNav(false).map((e) => e.key)).toEqual([
      "katalog", "merkliste", "baukasten", "meine", "lernen",
    ]);
    expect(zeichenNav(false).filter((e) => e.abschnitt !== undefined)).toEqual([]);
    expect(zeichenNav(true)).toEqual(ZEICHEN_NAV);
  });

  /*
   * FALLE 6, UND SIE IST HIER SCHARF: `(shell)/layout.tsx` ist eine Server Component und liest
   * diesen WERT. Traegt `nav.ts` je ein `"use client"`, kommt dort eine Client-Referenz statt
   * des Arrays an — HTTP 500 fuer jede Seite des Moduls, und weder `typecheck` noch `build`
   * noch dieser Test-Runner sieht es (in Vitest ist `"use client"` ein wirkungsloser String).
   * Was der Runner sehen kann, ist der Quelltext.
   *
   * ⚠️ GEPRUEFT WIRD NUR DER DATEIANFANG (Vorbild `lagerbuch/_lib/nav.test.ts:71`,
   * `uav/_lib/nav.test.ts:79-81`), NICHT DIE GANZE DATEI: der Kopfkommentar dieser Datei
   * erklaert Falle 6 in Prosa und zitiert die Direktive dabei selbst in Anfuehrungszeichen —
   * ein Volltextmatch schluege auf der eigenen Begruendung fehl, nicht auf einer echten
   * Direktive. Die Direktive selbst kann laut Spezifikation ohnehin nur als allererste
   * Anweisung der Datei stehen.
   */
  it("ist kein Client-Modul", () => {
    const quelle = readFileSync("src/app/m/zeichen/_lib/nav.ts", "utf8").trimStart();
    expect(quelle.startsWith('"use client"')).toBe(false);
    expect(quelle.startsWith("'use client'")).toBe(false);
  });
});
