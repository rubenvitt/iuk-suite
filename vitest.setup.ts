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
