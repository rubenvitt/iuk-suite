/**
 * DRK-299 — die Texte, mit denen `inventurKorrektur` einen Lauf fachlich
 * abweist. Kein "use server" (dort duerfte nur eine async Funktion stehen) und
 * kein "use client" (die Action liest sie). Das Formular zeigt NUR diese Texte
 * im Wortlaut; jeder andere Fehlertext bleibt hinter `buchungsFehler` verborgen.
 */
export const INVENTUR_TEXTE = {
  buchungsFehler: "Inventur konnte nicht gebucht werden.",
  chargeUnpassend: "Eine Charge passt nicht mehr zum Artikel. Bitte lade die Seite neu.",
  chargeDoppelt: "Eine Charge ist doppelt gezählt. Prüfe die ergänzten Chargen.",
} as const;

export const INVENTUR_ABWEISUNGEN: ReadonlySet<string> = new Set([
  INVENTUR_TEXTE.chargeUnpassend,
  INVENTUR_TEXTE.chargeDoppelt,
]);
