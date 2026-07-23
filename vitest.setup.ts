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
}
