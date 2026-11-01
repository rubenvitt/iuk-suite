"use client";

import { useEffect } from "react";
import s from "./planung.module.css";

/** Hängt die Farb-Tokens an den `body`, solange die Seite steht: Schubladen und Auswahllisten rendern in Portale. */
export function useTokensAmBody(): void {
  useEffect(() => {
    document.body.classList.add(s.tokens);
    return () => document.body.classList.remove(s.tokens);
  }, []);
}

const FELD = 'input, textarea, select, button, [contenteditable="true"], [role="combobox"]';

/**
 * Falle 24: `afterOpenChange` einer Schublade kommt unter Last eine halbe Sekunde nach dem Öffnen. Hat die
 * Leitung bis dahin selbst in ein Feld DIESER Schublade geklickt, bleibt der Fokus dort; sonst geht er ins Ziel.
 * Eigene kleine Kopie der Fassung aus `kommplan/_ui/fokus.ts` (Funktion `fokussiereWennFrei`) — Modul-Interna
 * sind kein API. Kein antd-Klassenname: die Schublade ist `[role="dialog"]`.
 */
export function fokussiereWennFrei(ziel: HTMLElement | null | undefined): void {
  if (!ziel) return;
  const rahmen = ziel.closest('[role="dialog"]');
  const aktiv = document.activeElement;
  if (rahmen && aktiv instanceof HTMLElement && aktiv !== ziel && rahmen.contains(aktiv) && aktiv.matches(FELD)) return;
  ziel.focus();
}
