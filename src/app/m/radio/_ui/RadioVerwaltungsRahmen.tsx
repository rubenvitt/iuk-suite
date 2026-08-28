// src/app/m/radio/_ui/RadioVerwaltungsRahmen.tsx
import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import { Schreibtischdichte } from "@/core/theme/Schreibtischdichte";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE HUELLE DES VERWALTUNGSZWEIGS (Spec:429-437). Form 1:1 aus
 * `lagerbuch/_ui/VerwaltungsRahmen.tsx:13-21` — MINUS dem CSS-Modul-Wrapper: `lagerbuch`
 * vererbt darueber seine `--lb-*`-Variablen, `radio` hat keine.
 *
 * ⚠️ DER SHELL-WERT KOMMT AUS DER REGISTRY, NICHT AUS EINEM LITERAL. `registry.shell`
 * packt VON SICH AUS nichts ein — das Modul-Layout entscheidet (Kapitel-4-Pflicht 23,
 * docs/radio-portierung-analyse.md:1116-1127). Genau deshalb steht die Shell HIER und
 * nicht in `layout.tsx`: `radio` braucht auf demselben Host ZWEI Regime, und ein
 * einzelnes Registry-Feld kann das nicht ausdruecken (Falle 23,
 * docs/radio-portierung-analyse.md:1547-1576).
 *
 * ⚠️ WAS DIESER RAHMEN NICHT UMSCHLIESST: den Ausleih-Zweig. Der rendert KEINE Shell,
 * damit 56/72 erhalten bleibt — mit Shell erbte er `controlHeight: 44`
 * (ARBEITSDICHTE, core/theme/theme.ts:207; Falle 4, `CLAUDE.md`), und `pnpm build` findet
 * das nicht (Spec:442-447, Spec:734-736).
 *
 * ⚠️ UND SEIT DEM 2026-08-28 LAEUFT DER VERWALTUNGSZWEIG AUF 32/40, NICHT AUF 44/48.
 * `{children}` steckt in `<Schreibtischdichte>` — INNERHALB von `Shell`, also innerhalb
 * der ARBEITSDICHTE: antds `ConfigProvider` mischt das innere Theme in das aeussere
 * (`antd/es/config-provider/hooks/useTheme.js:44-53`), der innere Provider gewinnt bei
 * `controlHeight`/`controlHeightLG`, und `Radio: {radioSize:16,dotSize:8}` kommt weiter
 * von aussen. Grund: die Verwaltung ist eine Maus-und-Tastatur-Datenflaeche und lief in
 * der Alt-Anwendung auf antds Vorgabemass (Betreiberentscheidung; die volle Begruendung
 * samt der bewussten Abweichung von der 44px-Regel steht am Wert selbst,
 * `src/core/theme/SCHREIBTISCHDICHTE` in `core/theme/theme.ts`).
 * ⛔ DIE KOPFZEILE UND DIE MODULLEISTE BLEIBEN 44: sie stehen in `Shell`, also AUSSERHALB
 * dieses Providers — die Suite sieht in jedem Modul gleich aus.
 *
 * KEIN "use client" und KEIN `@ant-design/icons`-Import: dies ist eine Server Component
 * (Falle 7). `Shell` selbst ist ein reiner Weichensteller ueber `variant`
 * (core/shell/Shell.tsx:7-33) und ueber die RSC-Grenze erprobt.
 */
export function RadioVerwaltungsRahmen({
  nav,
  children,
}: {
  nav: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const mod = getModule("radio");

  return (
    <Shell variant={mod.shell} moduleKey="radio" nav={nav}>
      <Schreibtischdichte>{children}</Schreibtischdichte>
    </Shell>
  );
}
