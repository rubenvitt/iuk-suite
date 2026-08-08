import s from "./verwaltung.module.css";

/**
 * Zeigt, wie viele Eintraege ein Filter von der vollstaendigen Liste uebrig
 * laesst. Das ist eine Filteraussage und kein Pager-Text.
 *
 * Bewusst keine Client-Direktive: Auch Server Components kennen beide Zahlen.
 */
export function Trefferanzeige({ gezeigt, gesamt }: { gezeigt: number; gesamt: number }) {
  if (gezeigt === gesamt) return null;

  return (
    <span className={s.filtertreffer} data-testid="trefferanzeige">
      {gezeigt} von {gesamt}
    </span>
  );
}
