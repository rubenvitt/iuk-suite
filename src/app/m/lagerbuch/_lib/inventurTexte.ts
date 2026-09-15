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
  // DRK-337 — der gewaehlte Ort ist zwischen Seitenaufbau und Absenden aus dem
  // Handlager verschwunden (geloescht oder umgehaengt). Neu laden zeigt die
  // heutige Auswahl; ein stillschweigender Rueckfall auf den ganzen Handlager
  // buchte gegen einen ANDEREN Bestand als den gezaehlten.
  ortUnbekannt: "Dieser Lagerort gehört nicht mehr zum Handlager. Bitte lade die Seite neu.",
} as const;

export const INVENTUR_ABWEISUNGEN: ReadonlySet<string> = new Set([
  INVENTUR_TEXTE.chargeUnpassend,
  INVENTUR_TEXTE.chargeDoppelt,
  INVENTUR_TEXTE.ortUnbekannt,
]);
