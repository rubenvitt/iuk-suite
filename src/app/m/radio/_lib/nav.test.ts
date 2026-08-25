import { describe, expect, it } from "vitest";
import { radioNav } from "./nav";
import { VERWALTUNGS_PFADE } from "./routen";

/**
 * DIE MODULNAVIGATION DER VERWALTUNG — sieben Eintraege, drei davon nur fuer die
 * Admin-Stufe (Spec:4199-4210).
 *
 * ⛔ JEDE ZAHL STEHT IN EINEM EIGENEN FALL, AUSSERHALB JEDER SCHLEIFE, UND DAS IST
 * GEMESSEN NOETIG. `_lib/routen.test.ts:48-65` schreibt die Messung aus: eine geleerte
 * Liste liess dort `Tests 14 passed (14)` gruen, „weil `it.each([])` in vitest 4.1.10
 * still NULL Faelle erzeugt". Dieselbe Klasse trifft jeden Scan ueber `radioNav(...)`:
 * ueber einer leeren Liste ist `filter(...) -> []` immer wahr. Deshalb steht in jedem
 * Scanfall zusaetzlich eine Untergrenze auf der Listenlaenge, und die exakten Zahlen
 * stehen als eigene Faelle daneben. Der bisherige Kommentar in `_lib/nav.ts` hat genau
 * diesen Test als Schuld von Planteil 4 benannt.
 *
 * ⛔ KEIN `it.each` IN DIESER DATEI. Die zu pruefende Liste ist der Prueffall selbst;
 * `it.each` ueber ihr erzeugte bei einer geschrumpften Liste stillschweigend weniger
 * Faelle statt eines roten.
 */

/**
 * Die Seiten, die die ADMIN-Stufe verlangen — der Gegenspieler zur Erreichbarkeitszusage
 * aus Spec:4208-4210.
 *
 * ⛔ `/admin/import` STEHT HIER, UND DAS IST DIE BETREIBERENTSCHEIDUNG ZU V-L5 vom
 * 2026-08-24 (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L5"): „Nur Admin,
 * nicht Updater. Damit ist `/admin/import` die dritte Seite auf der Admin-Stufe, neben
 * `/admin/versionen` (V19) und `/admin/zugaenge` (V20)." ⚠️ Sie ueberholt `Spec:4375`
 * (dort noch `requireRadioVerwaltung()`) und die Entscheidung E-V4 des Plans; der
 * Widerspruch ist damit entschieden, nicht mehr offen.
 *
 * `/admin/zugaenge/blatt` ist das Druckblatt (`Spec:4378`, `admin/(druck)/layout.tsx`) —
 * es traegt keinen Menuepunkt (`_lib/nav.ts`, Begruendung an der Ausschlussliste) und
 * steht hier nur der Vollstaendigkeit halber: die Zusage lautet „kein sichtbarer Eintrag
 * fuehrt auf eine Seite der hoeheren Stufe", nicht „kein Eintrag ist das Blatt".
 *
 * ⚠️ DIESE LISTE IST EINE ZWEITSCHRIFT DER RECHTESTUFEN-TAFEL, und sie ist es bewusst:
 * die zehn `page.tsx` entstehen erst in V12–V21, es gibt heute keine Datei, gegen die
 * man scannen koennte. Der Waechter ueber der Tafel selbst ist die namentliche
 * Zusicherung in `riegel.test.ts` (Klausel (a), „die zwei Huellen tragen JE IHRE Stufe")
 * und, ab V18/V19/V20, je Seite eine weitere.
 */
const NUR_ADMIN_SEITEN = [
  "/admin/import",
  "/admin/versionen",
  "/admin/zugaenge",
  "/admin/zugaenge/blatt",
];

describe("radioNav — die Verwaltungsnavigation traegt ihre Rechtestufe", () => {
  it("radioNav(admin) liefert genau sieben Eintraege", () => {
    /*
     * Sieben, `Spec:4199-4202`: Uebersicht · Geraete · Ausleihen · Update-Modus · Import ·
     * Softwareversionen · Zugaenge.
     *
     * ⛔ `toBe` UND NICHT `toBeGreaterThanOrEqual`: die Liste ist vollstaendig und stabil.
     * Eine Untergrenze waere die NT11-Form — ein Waechter, der gruen bleibt und nichts
     * bewacht (`riegel.test.ts:65-77`).
     */
    expect(radioNav("admin").length, "geschrumpfte Liste — jeder Scan darunter waere leer-gruen").toBe(7);
  });

  it("radioNav(updater) liefert genau vier Eintraege", () => {
    /*
     * Vier: die sieben minus Import, Softwareversionen und Zugaenge (`Spec:4202-4203`).
     * ⛔ Die Zahl steht AUSSERHALB jeder Schleife — sie ist die Zusicherung, dass ueberhaupt
     * gefiltert wird. Waere `radioNav` fuer beide Stufen gleich, faellt genau dieser Fall.
     */
    expect(radioNav("updater").length, "die Stufe filtert nicht — Updater saehen drei Menuepunkte ins 404").toBe(4);
  });

  it("die drei nur fuer Admin sichtbaren sind Import, Softwareversionen und Zugaenge", () => {
    /*
     * ⛔ NAMENTLICH, NICHT ALS ZAHL (`Spec:4202-4203`). Eine Differenz von drei sagt nicht,
     * WELCHE drei — und die falsche Auswahl faellt weder typecheck noch lint auf.
     *
     * ⚠️ Der Titel „Zugaenge" traegt auf dem Bildschirm seinen Umlaut; er ist Bildschirmtext
     * und steht deshalb in der zweiten Zusicherung mit ihm.
     */
    const updaterSchluessel = new Set(radioNav("updater").map((eintrag) => eintrag.key));
    const nurAdmin = radioNav("admin").filter((eintrag) => !updaterSchluessel.has(eintrag.key));

    expect(nurAdmin.map((eintrag) => eintrag.key)).toEqual(["import", "versionen", "zugaenge"]);
    expect(nurAdmin.map((eintrag) => eintrag.title)).toEqual(["Import", "Softwareversionen", "Zugänge"]);
  });

  it("jeder href der Admin-Navigation zeigt auf eine Route der Routenkarte", () => {
    /*
     * ⛔ DER FALL, DEN NS-Z9 VERLANGT — und der Grund, warum die Routenkarte seit dieser
     * Aufgabe in `_lib/routen.ts` liegt statt in `_lib/routen.test.ts`: dort war sie
     * modul-privat (`grep -c "^export"` auf jene Datei liefert 0), und ein Import aus einer
     * `.test.ts` registrierte deren Suiten ein zweites Mal. Eine zweite Abschrift der Karte
     * hier waere genau der Zustand, gegen den dieser Fall antritt.
     *
     * WAS ER FAENGT: einen Menuepunkt auf einen Pfad, den die Middleware nicht ins Modul
     * umschreibt — er ergaebe eine 404, und kein Tor saehe sie
     * (`qr/layout.tsx:16-18`: „Ein Eintrag, der auf 404 fuehrt, ist schlimmer als kein
     * Eintrag").
     */
    const eintraege = radioNav("admin");
    expect(eintraege.length, "leere Liste — der Fall waere leer-gruen").toBeGreaterThan(0);

    const unbekannt = eintraege
      .map((eintrag) => eintrag.href)
      .filter((href) => !VERWALTUNGS_PFADE.includes(href));
    expect(unbekannt, "href ohne Route in _lib/routen.ts — der Menuepunkt fuehrt auf 404").toEqual([]);
  });

  it("jeder fuer eine Stufe sichtbare Eintrag ist von dieser Stufe erreichbar", () => {
    /*
     * Die Zusage aus `Spec:4208-4210`: „Ohne diesen Parameter sieht eine Person der
     * Updater-Stufe drei Menuepunkte, die sie in ein `notFound()` fuehren — die Seiten
     * dahinter rufen `requireRadioAdmin()`, das Layout nur `requireRadioVerwaltung()`."
     *
     * ⛔ GEPRUEFT WIRD DIE UPDATER-HAELFTE, und nur sie traegt eine Aussage: fuer die
     * Admin-Stufe ist jede der zehn Seiten erreichbar, eine Zusicherung darueber koennte
     * nie rot werden.
     *
     * ⚠️ `/admin/import` faellt seit der Betreiberentscheidung zu V-L5 ebenfalls hierunter
     * (siehe `NUR_ADMIN_SEITEN` oben) — und es ist zugleich der Eintrag, den die Navigation
     * ohnehin ausblendet. Beide Haelften sagen dasselbe, aber aus verschiedenen Gruenden:
     * die Ausblendung folgt `Spec:4202-4203`, die Unerreichbarkeit der Rechtestufe.
     */
    const eintraege = radioNav("updater");
    expect(eintraege.length, "leere Liste — der Fall waere leer-gruen").toBeGreaterThan(0);

    const unerreichbar = eintraege
      .map((eintrag) => eintrag.href)
      .filter((href) => NUR_ADMIN_SEITEN.includes(href));
    expect(unerreichbar, "ein Menuepunkt der Updater-Stufe zeigt auf eine Seite der Admin-Stufe").toEqual([]);
  });

  it("kein href traegt die innere Form /m/radio", () => {
    /*
     * `Spec:4212-4216`: „Zwei Formen desselben Pfades, und sie werden nie vermischt." Der
     * `href` traegt die AEUSSERE Form, weil `aktiverEintrag` sie per Suffix aufloest
     * (`lagerbuch/_lib/nav.ts:6-7`); die INNERE Form `/m/radio/...` gehoert allein
     * `revalidatePath`, das den Router-Cache adressiert und nicht die Adresszeile.
     *
     * Ein `href="/m/radio/admin/geraete"` in der Navigation fuehrte auf dem Verwaltungshost
     * auf `/m/radio/m/radio/admin/geraete` — 404, und typecheck wie lint bleiben gruen.
     */
    const eintraege = radioNav("admin");
    expect(eintraege.length, "leere Liste — der Fall waere leer-gruen").toBeGreaterThan(0);

    const innere = eintraege
      .map((eintrag) => eintrag.href)
      .filter((href) => href.includes("/m/radio"));
    expect(innere, "innere Pfadform im href — sie gehoert allein revalidatePath").toEqual([]);
  });

  it("jeder Eintrag traegt ein ikon aus NavIkonName", () => {
    /*
     * ⚠️ DIESER FALL IST NICHT TYPSEITIG GEDECKT, und genau deshalb steht er hier:
     * `SuiteNavItem.ikon` ist OPTIONAL (`src/core/shell/types.ts`, Feld `ikon?`) — ein
     * Eintrag ohne Zeichen erzeugt keine Typwarnung und rendert still nichts
     * (`navIkonen.tsx`, `NavIkone` liefert `null` fuer einen fehlenden Namen).
     *
     * ⛔ DASS DER NAME AUFLOEST, PRUEFT DIESER FALL NICHT — das ist die Zusage von
     * `src/core/shell/navIkonen.test.tsx` („kennt zu jedem gesetzten Schluessel eine
     * Komponente"), und der Typ `Record<NavIkonName, IconType>` erzwingt die
     * Vollstaendigkeit der Map ohnehin.
     */
    const eintraege = radioNav("admin");
    expect(eintraege.length, "leere Liste — der Fall waere leer-gruen").toBeGreaterThan(0);

    const ohneZeichen = eintraege.filter((eintrag) => eintrag.ikon === undefined).map((e) => e.key);
    expect(ohneZeichen, "Eintrag ohne ikon — er rendert still ohne Zeichen").toEqual([]);
  });

  /*
   * ⛔ DIE TAFEL SELBST, ALS EINE ZUSICHERUNG — Fix-Runde 1 zu V4, Funde F1, F2 und F4.
   * Bis hierher band KEIN Fall dieser Datei einen einzelnen Eintrag an sein Ziel, seinen
   * Bildschirmtitel oder sein Zeichen. Die Faelle darueber pruefen Mengen, Zahlen und
   * Eigenschaften der ganzen Liste; die vier Eintraege, die BEIDE Stufen sehen
   * (`uebersicht`, `geraete`, `ausleihen`, `software`), trugen ueberhaupt keine namentliche
   * Zusicherung. Drei Mutationen liefen deshalb gemessen durch — jede mit gruenem typecheck,
   * gruenem lint und gruener Suite:
   *
   *   1. `_lib/nav.ts:62` `href: "/admin/geraete"` → `"/admin/geraete/g-1"` — 0 rot. Der Pfad
   *      steht in `_lib/routen.ts:58`, ist also der Routenkarte bekannt, ist kein Duplikat und
   *      traegt die aeussere Form: alle drei Scanfaelle bleiben gruen. Der Menuepunkt „Geräte"
   *      fuehrte damit auf das Detail EINES Geraets.
   *   2. `_lib/nav.ts:61` `title: "Übersicht"` → `"Startseite"` — 0 rot. Die Titel der drei
   *      Admin-Eintraege deckt `:86`; die vier gemeinsamen deckte niemand.
   *   3. `_lib/nav.ts:62` `ikon: "geraete"` → `"tokens"` — 0 rot. `:154` prueft nur, DASS ein
   *      Zeichen da ist, und `Record<NavIkonName, IconType>` (`core/shell/navIkonen.tsx:22`)
   *      deckt typseitig nur die Gegenrichtung: dass jeder Name eine Komponente hat.
   *
   * ⛔ EIN `toEqual` UEBER DER GANZEN TAFEL UND KEIN `it.each`: die Sperre im Kopf dieser
   * Datei (`:18-20`) gilt hier besonders, denn `it.each` ueber einer geschrumpften Tafel
   * erzeugte still weniger Faelle. `toEqual` ueber der Liste ist zugleich der Waechter ueber
   * die REIHENFOLGE aus `Spec:4199-4202` — es vergleicht stellungsgenau.
   *
   * ⛔ DIE TAFEL IST EINE ZWEITSCHRIFT, UND SIE MUSS ES SEIN. Ein Fall, der seine Erwartung aus
   * `_lib/nav.ts` ableitete, bewachte nichts. Quelle fuer Titel, Ziel, Zeichen und Reihenfolge:
   * `.superpowers/sdd/planteil4/briefs/V4.md:19-27` und `Spec:4199-4202`. ⚠️ AUSGENOMMEN `key`:
   * keine der beiden fuehrt Schluessel — die erste Spalte ist Abschrift aus `_lib/nav.ts:60-82`.
   *
   * ⚠️ DIE TITEL TRAGEN IHRE UMLAUTE: es sind Bildschirmtexte, keine Bezeichner — die
   * ausdrueckliche Ausnahme der Hausregel (`.superpowers/sdd/planteil4/briefs/KOPF.md:259-261`),
   * mit Vorbild in derselben Datei auf `:86` („Zugänge").
   *
   * ⬜ DIE STAERKERE FORM IST HEUTE NICHT BAUBAR, EIGENTUEMER V20. Das Vorbild des Hauses
   * schluesselt die Navigation gegen den ECHTEN Seiten-Export und begruendet es woertlich
   * (`src/app/m/aufgaben/_lib/nav.test.ts:81-86`: ein Schluesseln nach `key` faengt „KEIN
   * vertauschtes ZIEL"). Dafuer muessten die zehn `page.tsx` existieren; sie entstehen in
   * V12–V21. Ab V20 sind alle da — wer dort baut, legt diese Tafel daneben. Dieselbe Naht wie
   * bei `NUR_ADMIN_SEITEN` oben.
   */
  it("die sieben Eintraege der Admin-Stufe stehen als Tafel aus Schluessel, Titel, Ziel und Zeichen", () => {
    expect(
      radioNav("admin").map((eintrag) => [eintrag.key, eintrag.title, eintrag.href, eintrag.ikon]),
      "die Tafel ist verschoben — ein Menuepunkt traegt einen fremden Titel oder fuehrt auf ein fremdes Ziel",
    ).toEqual([
      ["uebersicht", "Übersicht", "/admin", "uebersicht"],
      ["geraete", "Geräte", "/admin/geraete", "geraete"],
      ["ausleihen", "Ausleihen", "/admin/ausleihen", "ausleihen"],
      ["software", "Update-Modus", "/admin/software", "update"],
      ["import", "Import", "/admin/import", "import"],
      ["versionen", "Softwareversionen", "/admin/versionen", "versionen"],
      ["zugaenge", "Zugänge", "/admin/zugaenge", "tokens"],
    ]);
  });

  it("die vier Eintraege der Updater-Stufe stehen als eigene Tafel", () => {
    /*
     * ⛔ DIE ZWEITE HAELFTE, UND SIE IST NICHT ABLEITBAR. Heute filtert `radioNav` EINE Liste
     * (`_lib/nav.ts:94`), also erben die vier Titel und Ziele von der Tafel darueber. Das ist
     * eine Eigenschaft der heutigen Bauform, keine Zusage: wer `radioNav` spaeter auf zwei
     * Literale umstellt, bricht genau diese Erbschaft, und der Fall darueber saehe es nicht.
     *
     * ⚠️ ER ERSETZT DIE FAELLE `:65` UND `:74` NICHT. `:65` haelt die ZAHL vier ausserhalb
     * jeder Schleife, `:74` die ABGELEITETE Menge `admin \ updater` namentlich — zwei
     * Aussagen ueber die Filterung selbst. Dieser Fall haelt die LITERALE Liste. Der Brief
     * verlangt die beiden Zahlfaelle eigenstaendig (`V4.md`, Testnamentafel).
     */
    expect(
      radioNav("updater").map((eintrag) => [eintrag.key, eintrag.title, eintrag.href, eintrag.ikon]),
      "die Updater-Tafel ist verschoben — vier Eintraege, dieselben wie in der Admin-Tafel ohne die drei gesperrten",
    ).toEqual([
      ["uebersicht", "Übersicht", "/admin", "uebersicht"],
      ["geraete", "Geräte", "/admin/geraete", "geraete"],
      ["ausleihen", "Ausleihen", "/admin/ausleihen", "ausleihen"],
      ["software", "Update-Modus", "/admin/software", "update"],
    ]);
  });

  it("radioNav(admin) gibt bei jedem Aufruf eine eigene Liste zurueck", () => {
    /*
     * ⛔ DER WAECHTER ZUR ZUSAGE IN `_lib/nav.ts:87-90` („GIBT EINE FLACHE KOPIE ZURUECK,
     * NICHT `EINTRAEGE` SELBST"). Fix-Runde 1 zu V4, Fund F3: die Zusage stand als
     * ⛔-Absatz im Quelltext und hatte keinen — `return [...EINTRAEGE];` → `return EINTRAEGE;`
     * lief gemessen mit 0 rot durch. Dieselbe Klasse, die Commit `98d7505` in diesem Planteil
     * schon einmal eingesammelt hat.
     *
     * ⛔ NUR DIE ADMIN-HAELFTE. Der Updater-Zweig ist ein `filter(...)` (`_lib/nav.ts:94`) und
     * liefert von sich aus immer ein frisches Feld; dieselbe Zusicherung dort koennte nie rot
     * werden und waere die NT11-Form, gegen die `riegel.test.ts:65-77` argumentiert.
     *
     * ⚠️ WAS DER FALL NICHT ZUSAGT: die EINTRAEGE-Objekte selbst sind in beiden Zweigen
     * geteilte Referenzen. Der Kommentar an `radioNav` sagt „flache Kopie" und beschoenigt es
     * nicht.
     */
    expect(
      radioNav("admin"),
      "radioNav reicht den Modulzustand nach draussen — eine Aenderung am Prop schriebe zurueck",
    ).not.toBe(radioNav("admin"));
  });
});
