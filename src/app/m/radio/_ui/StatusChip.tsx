import { statusEtikett, statusTon, type GeraeteStatus } from "../_lib/status";
import s from "./ausleihe.module.css";

/**
 * DER EIGENE STATUS-CHIP — Entscheidung E3 (`briefs/KOPF.md:571-580`), Spec 1 §4.6.2.
 *
 * ⛔ SERVER COMPONENT, KEIN "use client": reine Ableitung aus `_lib/status.ts`, keine
 * Interaktion. Sie liest mit `statusEtikett`/`statusTon` WERTE aus einem Modul ohne
 * Client-Direktive — die Richtung, die Falle 6 verlangt (`CLAUDE.md`, Punkt 6).
 *
 * ⛔ KEIN ANTD-`Tag`, KEIN `Alert type="error"`, und der Grund ist gemessen:
 * `colorError === colorPrimary === FARBEN.rot` (`src/core/theme/theme.ts:32-33`). Rot ist
 * in dieser Suite die PRIMAERAKTION; ein rotes Etikett fuer „Defekt" saehe aus wie der
 * Knopf, den man druecken soll (Falle 3, `CLAUDE.md`, Punkt 3).
 *
 * ⛔ DIE FARBE STEHT IM STYLESHEET, NICHT IM MARKUP. Hier steht nur der TON als
 * Datenattribut; die acht Werte (vier Toene x hell/dunkel) liegen als eigene
 * CSS-Variablen in `ausleihe.module.css`, abgelesen aus `STATUS_HEX`
 * (`_lib/status.ts`, ⬜ A-L10). Ein Inline-`style` traege nur EINEN der beiden Werte und
 * liesse den Dunkelzweig still auf dem Hellwert stehen — ⛔ und `--ant-*` waere Falle 2:
 * antd deklariert seine Variablen auf SEINER Scope-Klasse, eigenes Markup sieht sie nicht.
 *
 * ⚠️ FARBE IST NIE DER EINZIGE TRAEGER (Spec:3696-3697). Der Punkt ist 10px gross und
 * `aria-hidden`; getragen wird die Aussage vom ETIKETT daneben. `StatusChip.test.tsx`
 * haelt beides fest — der Fall stand bis dahin in A12s Tabelle und war dort ueber eine
 * Datei, die es noch nicht gab, leer-gruen (`VORABSCAN-A.md:295-304`, Fund F15).
 *
 * ⛔ VIER ZUSTAENDE, KEIN FUENFTER. Was eine leere `devices.status`-Spalte bedeutet, ist
 * entschieden und an genau EINER Stelle gefaltet: `geraeteZustandAus` in `_lib/status.ts`
 * (⬜ A-L13, Betreiberentscheidung vom 2026-08-22, `progress.md:22-32`). Dieser Chip nimmt
 * einen bereits gefalteten `GeraeteStatus` und kann konstruktiv nicht daran vorbeilaufen.
 */
export function StatusChip({ status }: { status: GeraeteStatus }) {
  return (
    <span className={s.chip} data-rolle="radio-statuschip" data-ton={statusTon(status)}>
      <span className={s.chipPunkt} aria-hidden />
      {statusEtikett(status)}
    </span>
  );
}
