"use client";

import { useCallback, useEffect } from "react";
import { App } from "antd";

import { bestaetigeVerlassen, offeneSperre, sperreVerlassen, type VerlassenSperre } from "@/core/shell/verlassen";

/**
 * Hält eine Verlassen-Sperre (`verlassen.ts`), solange `sperre` gesetzt ist. Die Abhängigkeiten
 * sind die Zeichenketten, nicht das Objekt: ein neues Objekt je Render meldete die Sperre sonst
 * jedes Mal neu an und setzte eine eben gegebene Bestätigung zurück.
 */
export function useVerlassenSperre(sperre: VerlassenSperre | null): void {
  const titel = sperre?.titel;
  const text = sperre?.text;
  useEffect(() => {
    if (titel === undefined) return;
    return sperreVerlassen({ titel, text: text ?? "" });
  }, [titel, text]);
}

/**
 * Die Wache an den Wegen aus der Seite. `pruefe(weiter)` fragt bei offener Sperre nach und ruft
 * `weiter` erst nach „Trotzdem verlassen". `beiKlick` gehört als `onClickCapture` an einen Vorfahren
 * von Links: es hält den Klick an, bevor `next/link` oder der Browser navigiert, und klickt nach der
 * Bestätigung denselben Link noch einmal — so bleibt jedes Ziel bei seiner Art (weicher Wechsel,
 * voller Seitenaufruf, Schließen des Blatts).
 *
 * Durch lässt sie, was die Seite nicht verlässt: Mittelklick und Klick mit Taste (neuer Tab),
 * `target="_blank"`, `download` und Links mit `data-verlassen-frei`.
 *
 * Das Modal kommt aus `App.useApp()` (Theme und Locale, `AntdProvider.tsx`). „Bleiben" hat den
 * Fokus: Enter verwirft nichts.
 */
export function useVerlassenWache() {
  const { modal } = App.useApp();

  const pruefe = useCallback(
    (weiter: () => void) => {
      const sperre = offeneSperre();
      if (!sperre) {
        weiter();
        return;
      }
      modal.confirm({
        title: sperre.titel,
        content: sperre.text || undefined,
        okText: "Trotzdem verlassen",
        cancelText: "Bleiben",
        okButtonProps: { danger: true },
        autoFocusButton: "cancel",
        onOk: () => {
          bestaetigeVerlassen();
          weiter();
        },
      });
    },
    [modal],
  );

  const beiKlick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target === "_blank" || link.hasAttribute("download") || link.hasAttribute("data-verlassen-frei")) return;
      if (!offeneSperre()) return;
      e.preventDefault();
      e.stopPropagation();
      pruefe(() => link.click());
    },
    [pruefe],
  );

  return { pruefe, beiKlick };
}
