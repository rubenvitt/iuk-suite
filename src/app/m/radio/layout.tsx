// src/app/m/radio/layout.tsx

/**
 * DAS MODUL-LAYOUT RENDERT `children` UND SONST NICHTS (Spec §1.3, Zeilen 407-425).
 *
 * DIE DATEI EXISTIERT, DAMIT DIE NAECHSTE PERSON KEINE HUELLE HINEINSCHREIBT. Der
 * tragende Beleg ist Spec §1.3 selbst; `lagerbuch/layout.tsx:8-14` ist das Vorbild
 * dafuer, WAS NICHT HINEINGEHOERT (keine Shell, kein Riegel — beide Begruendungen
 * uebernimmt diese Datei unten). ⛔ NICHT als Beleg fuer den EXISTENZGRUND lesen: dort
 * existiert die Datei wegen des Manifest-Verweises (`lagerbuch/layout.tsx:6`, `:16-17`),
 * und `radio` hat nach Entscheidung 5 kein Manifest — der Grund ist ein anderer, und die
 * urspruengliche Fassung dieses Kommentars behauptete das Gegenteil (Vorabscan-Fund F12).
 *
 * KEINE SHELL. Ein Layout ohne Group-Klammer ist Vorfahr ALLER Kinder, also auch des
 * Ausleih-Zweigs. Der erbte damit `controlHeight: 44` statt 56/72 (Falle 4), und
 * `pnpm build` findet das nicht.
 *
 * KEIN RIEGEL. Er umschloesse weder `t/[code]/route.ts` noch `abmelden/route.ts` —
 * ROUTE HANDLER HABEN KEIN LAYOUT UEBER SICH —, und er koennte zwischen Ausleih- und
 * Verwaltungsklasse nicht unterscheiden. Der Riegel liegt deshalb dreifach: in den
 * Group-Layouts, in jeder Server Action und in jedem Route Handler (Pflicht 23).
 *
 * KEIN `viewport`-EXPORT.
 *
 * UND, ANDERS ALS BEI `lagerbuch`: KEIN `metadata.manifest` UND KEINE ICON-HANDLER
 * (Spec:420-425). `lagerbuch` traegt hier den Manifest-Verweis, weil sein Helferzweig
 * eine PWA ist. `radio` hat nach Entscheidung 5 KEIN Geraet und KEIN Tablet; es gibt
 * nichts zu installieren. Die fuenf Handler von `lagerbuch` (`manifest.webmanifest`,
 * `pwa-icon.svg`, drei Icon-Routen) wandern NICHT mit. Wer sie aus Analogie mitnimmt,
 * bewirbt eine PWA, die niemand braucht — und ein Manifest im Root-Layout bewuerbe sie
 * auf JEDEM Suite-Host (Falle 56 der lagerbuch-Zaehlung).
 *
 * ⚠️ DER ALT-KIOSK HAT EINEN SERVICE WORKER, UND DER UEBERLEBT DEN UMSCHWENK. Er ist
 * unter `scope: '/'` registriert (radio-inventar/apps/frontend/src/hooks/usePWA.ts:73)
 * und liegt auf DEMSELBEN Origin. Das ist KEIN Manifest-Thema und gehoert nicht in diese
 * Datei: der Abraeum-Worker unter `/sw.js` ist Kapitel 7 und PLANTEIL 5, und er gehoert
 * zum ERSTEN Deploy, nicht zum Cutover (Leitplan:107-109). Die Wegentscheidung dafuer
 * steht bereits in `_lib/routen.test.ts` (Z2).
 */
export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
