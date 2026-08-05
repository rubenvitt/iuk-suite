import type { ReactNode } from "react";
import type { AmpelTon } from "../_lib/format";
import s from "./helfer.module.css";

/**
 * DER STATUSCHIP DES HELFER-WEGS — §5.17, E4.
 *
 * KEIN "use client": er rendert in Server Components (`a/[artikelId]/page.tsx`)
 * UND in Client-Inseln (`Entnahme`, `CheckFlow`). Er ruft nichts auf
 * Modulebene, also greift auch Falle 7 nicht.
 *
 * DIE NAMENSFALLE, WEGEN DER ES IHN GIBT (§5.17): ein direkt interpoliertes
 * `chip-${ampel}` ergaebe ein undefiniertes `chip-gruen` MIT Padding und
 * Radius, aber OHNE Farbe — still, weil eine nicht existente CSS-Klasse
 * gueltiges Markup ist. In einem CSS-MODUL ist die Falle SCHAERFER:
 * `s[`chip-${ton}`]` liefert `undefined`, und React rendert `class="undefined"`.
 *
 * DESHALB EIN VOLLSTAENDIGES `Record<AmpelTon, string>` und kein Index-Zugriff.
 * Das ist kein Stil: sobald jemand einen fuenften Ton einfuehrt, wird
 * `typecheck` rot — statt dass ein Chip farblos rendert.
 *
 * ⚠️ VITEST SIEHT DIESE FALLE NICHT VON SELBST (gemessen am 05.08.2026): ein
 * CSS-Modul ist dort ein Proxy, der fuer JEDEN Schluessel eine Zeichenkette
 * liefert — `s["chip-rot"]` ergibt `"_chip-rot_ef45c4"` statt `undefined`. Eine
 * Zusicherung auf `not.toContain("undefined")` kann die echte Falle also nie
 * fangen. `HelferChip.test.tsx` prueft deshalb gegen `helfer.module.css` auf
 * der Festplatte, ob es den gerenderten Klassennamen ueberhaupt gibt.
 *
 * ⚠️ `grau` IST KEIN AMPELWERT und steht ausserhalb der Rangfolge (§6.6.2). Er
 * traegt „kein Datum gepflegt" (geraet.ts:35) und „keine Messung"
 * (sauerstoff.ts:51) und darf NIE als gruen dargestellt werden.
 *
 * ⚠️ `_ui/Chip.tsx` (§6.6.3, Teil 5) ist eine ANDERE Datei: sie liest
 * `verwaltung.module.css`. Zwei Chips sind kein Versehen — die beiden
 * Ansichtsklassen haben verschiedene Stylesheets, und ein geteilter Chip zoege
 * `verwaltung.module.css` in den Helfer-Zweig.
 */
const KLASSE: Record<AmpelTon, string> = {
  rot: s.rot,
  gelb: s.gelb,
  ok: s.ok,
  grau: s.grau,
};

export function HelferChip({ ton, children }: { ton: AmpelTon; children: ReactNode }) {
  // `children` ist PFLICHT: es gibt keinen Modus „nur Farbe"
  // (docs/design/README.md, „Bedeutung nie allein ueber Farbe").
  return (
    <span className={`${s.chip} ${KLASSE[ton]}`} data-rolle="helfer-chip">
      {children}
    </span>
  );
}
