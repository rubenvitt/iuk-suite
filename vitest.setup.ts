import { vi } from "vitest";

/**
 * ZEITBUDGET FUER DOM-TESTS (IDA-244): 30 s statt Vitests 5 s, aber NUR in der
 * jsdom-Umgebung. Die node-Tests behalten die 5 s — dort ist ein langsamer Fall
 * meist ein Befund (Commit-Lawine, fehlender Index), und eine groessere Zahl
 * verdeckte ihn (siehe `portal/admin/audit/object-filter.test.ts`).
 *
 * In jsdom ist Dauer dagegen keine Aussage, sondern Rechenzeit: antd rendert
 * Tabellen, Schubladen und Dialoge vollstaendig, ohne Layout-Engine, und keine
 * Zusicherung hier misst Millisekunden (die Renderkosten-Tests zaehlen
 * Renderdurchlaeufe, siehe `InventurForm.renderkosten.test.tsx`). Gemessen
 * (21.10.2026, Cloud-Sitzung, 4 Kerne, `vitest run src/app/m/lagerbuch` neben
 * 8 Rechenschleifen, Last wie beim parallelen Lauf mehrerer Arbeitskopien in
 * IDA-231): 42 von 4873 Faellen scheiterten, in fuenf jsdom-Dateien (darunter
 * `ArtikelTable` und `TokenTable`, die das Ticket nicht nannte); der langsamste
 * gruene Fall lag bei 8,6 s, in `ArtikelDrawer` mit dessen damaligen 20 s.
 * Mit dem Budget derselbe Lauf noch einmal: 0 Fehlschlaege, aber
 * `InventurForm.renderkosten` brauchte 16,5 s fuer einen Fall, der ohne Last
 * 4,7 s braucht (Faktor 3,5). Daher 30 s und nicht 20: das Budget soll nur
 * einen echten Haenger beenden, nicht den langsamsten gesunden Fall. Ein abgebrochener Fall laesst seine Schublade oder
 * sein Portal stehen und reisst die folgenden Faelle der Datei mit — daher die
 * vielen Folgefehler wie „Element nicht gefunden", die keine eigenen sind.
 *
 * Eine Liste einzelner Dateien mit eigenem Budget liefe dem naechsten Fund
 * hinterher; deshalb hier, einmal fuer alle jsdom-Dateien. Ein `vi.setConfig`
 * oder `{ timeout }` in einer Datei geht weiterhin vor.
 */
const DOM_ZEITBUDGET_MS = 30_000;

/**
 * antd greift auf `matchMedia` (Responsive-Breakpoints in Grid, Table, Drawer)
 * und `ResizeObserver` (Overflow-Erkennung in Menu, Tabs, Select) zu. jsdom
 * kennt beides nicht. Ohne diese Stubs schlagen die Component-Tests reihenweise
 * mit "matchMedia is not a function" fehl — ein Umgebungsproblem, das leicht
 * für einen Migrationsfehler gehalten wird.
 *
 * Die Stubs sind absichtlich dumm: kein Test in diesem Projekt prüft
 * Responsive-Verhalten. Sobald einer das tut, gehört hier eine echte
 * Implementierung hin, kein `matches: false`.
 */
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver;
  }

  bewegungAbschalten();
  vi.setConfig({ testTimeout: DOM_ZEITBUDGET_MS });
}

/**
 * ANIMATIONEN AUS — sonst bleibt jedes antd-Modal nach dem Schliessen im DOM
 * stehen, und zwar STILL: kein Fehler, nur eine Zusicherung auf „ist weg", die
 * ploetzlich „ist noch da" misst (gemessen beim Sprung jsdom 26 → 30: 14
 * Fehlschlaege in sechs Dateien, alle mit `ant-zoom-leave ant-zoom-leave-start`
 * am uebrig gebliebenen Knoten).
 *
 * Die Kette, denn sie ist von keiner Fehlermeldung ablesbar: antd fuehrt
 * Ein-/Ausblenden ueber `@rc-component/motion`. Dessen `CSSMotion` startet eine
 * Motion nur, wenn `supportTransition` gilt — ein Wert, der EINMAL BEIM
 * MODULLADEN aus einer Merkmalspruefung entsteht (`es/util/motion.js`):
 * `'animation' in document.createElement('div').style`, dazu die
 * Herstellerpraefixe. Ist er falsch, entfernt rc-motion den Knoten sofort; ist
 * er wahr, setzt es die `-leave`-Klassen und wartet auf ein `transitionend`
 * bzw. `animationend`. **In jsdom feuert keines von beiden je** — es gibt keine
 * Layout-Engine, die eine Uebergangsdauer abliefe. Der Knoten bleibt fuer immer.
 *
 * jsdom 26 hat die Pruefung von sich aus nicht bestanden (die alte
 * `cssstyle`-Implementierung kannte die Kurzformen `animation`/`transition`
 * nicht). jsdom 30 hat das CSSOM neu gebaut — Properties liegen jetzt auf
 * `CSSStyleProperties`, `animation` und `transition` gibt es —, und damit
 * schaltet sich in der Testumgebung eine Animation ein, die dort nie enden kann.
 *
 * Es genuegt NICHT, `window.AnimationEvent`/`TransitionEvent` zu entfernen: die
 * Pruefung faellt dann auf die praefixierten Namen zurueck (`WebkitAnimation`
 * ist vorhanden) und gilt weiterhin als bestanden. Die Merkmale selbst muessen
 * weg — vor dem ersten Import von antd, also hier und nicht im Harness.
 *
 * Der Eingriff kostet nichts: er nimmt `el.style.animation = …` nur die
 * Setter-Semantik, und ein Stil ohne Layout-Engine hat ohnehin keine Wirkung.
 * `getComputedStyle`, `cssText` und `setProperty` bleiben unberuehrt. Wollte
 * eines Tages ein Test echtes Uebergangsverhalten pruefen, gehoerte er in einen
 * Browser (Playwright), nicht hierher.
 */
function bewegungAbschalten(): void {
  // Genau die Namen, die `getVendorPrefixes` in @rc-component/motion abklopft.
  const merkmale = [
    "animation",
    "WebkitAnimation",
    "MozAnimation",
    "msAnimation",
    "OAnimation",
    "transition",
    "WebkitTransition",
    "MozTransition",
    "msTransition",
    "OTransition",
  ];
  const stil = window.document.createElement("div").style;
  for (const merkmal of merkmale) {
    // Nicht am Objekt selbst, sondern am Prototyp, auf dem jsdom sie deklariert
    // (`CSSStyleProperties` in 30, frueher `CSSStyleDeclaration`) — `in` sucht
    // die ganze Kette ab, ein `delete` auf der Instanz liefe also ins Leere.
    for (let ebene = Object.getPrototypeOf(stil); ebene; ebene = Object.getPrototypeOf(ebene)) {
      if (Object.getOwnPropertyDescriptor(ebene, merkmal)) {
        delete (ebene as Record<string, unknown>)[merkmal];
        break;
      }
    }
  }
}
