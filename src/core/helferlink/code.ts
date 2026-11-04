/**
 * DIE LANGE FORM EINES ZUGANGSCODES — 28 Zeichen Crockford-Base32 in sieben Vierergruppen (140 bit).
 *
 * Warum in `core`: dieselbe Form tragen die Zugangs-Kärtchen des Lagerbuchs (`lagerbuch/_lib/tokenForm.ts`)
 * und die Helfer-Links des Verpflegungslagers (IDA-316); das Funkmodul hat sie als Vorbild
 * (`radio/_lib/code.ts`). Der Coderaum ist die Abwehr gegen Raten, nicht eine Drosselung.
 *
 * Das Alphabet lässt I, L, O und U weg; beim Eintippen bildet `normalisiereZugangscode` O auf 0 und I/L
 * auf 1 zurück. 32 Zeichen teilen 256, die Ziehung ist ohne Verzerrung. Kein `"use client"` (Falle 6).
 */
import { customAlphabet } from "nanoid";

export const ZUGANG_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ZUGANG_ZEICHEN = 28;
export const ZUGANG_GRUPPE = 4;

/** Setzt eine Zeichenkette ohne Trenner in Gruppen zu `ZUGANG_GRUPPE`, mit Bindestrich dazwischen. */
export function gruppiereZugangscode(zeichen: string): string {
  const gruppen: string[] = [];
  for (let i = 0; i < zeichen.length; i += ZUGANG_GRUPPE) gruppen.push(zeichen.slice(i, i + ZUGANG_GRUPPE));
  return gruppen.join("-");
}

/** Ist der Wert ein Code in der kanonischen langen Form? Prüft Länge, Alphabet und Gruppierung. */
export function istLangerZugangscode(wert: string): boolean {
  const ohneTrenner = wert.split("-").join("");
  if (ohneTrenner.length !== ZUGANG_ZEICHEN) return false;
  for (const z of ohneTrenner) if (!ZUGANG_ALPHABET.includes(z)) return false;
  return wert === gruppiereZugangscode(ohneTrenner);
}

/**
 * Rohe Eingabe (Link, getippt, mit Leerzeichen) → kanonische Form, oder `null`, wenn es keine lange Form
 * ist. Wirft nie: die Eingabe ist fremd.
 */
export function normalisiereZugangscode(roh: string): string | null {
  const nur = roh.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (nur.length !== ZUGANG_ZEICHEN) return null;
  const code = gruppiereZugangscode(nur.replace(/[IL]/g, "1").replace(/O/g, "0"));
  return istLangerZugangscode(code) ? code : null;
}

const ziehe = customAlphabet(ZUGANG_ALPHABET, ZUGANG_ZEICHEN);

/** Ein neuer Code in der gespeicherten Form (mit Bindestrichen). */
export function neuerZugangscode(): string {
  return gruppiereZugangscode(ziehe());
}
