/**
 * WEB-ADRESSEN OHNE SCHEMA (IDA-390).
 *
 * Wer „drk.de" tippt, meint `https://drk.de`. Bis hierher lehnte das Admin-Formular die Eingabe mit
 * der Blase des Browsers ab (`type="url"` verlangt ein Schema), und ein QR-Code mit bloßem
 * „drk.de" öffnet auf vielen Telefonen keine Seite, sondern zeigt nur Text. Das Schema ergänzen
 * also Generator, Formular und Server-Validierung selbst — alle über diese Datei, damit die drei
 * nicht auseinanderlaufen.
 *
 * Bewusst ohne `"use client"` (Falle 6): der Validator auf dem Server liest dieselben Funktionen.
 */

/** Ein Schema mit `//` (https://, ftp://) oder eines der schrägstrichlosen, die Telefone kennen. */
const MIT_SCHEMA = /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:mailto|tel|sms|geo):)/i;

/**
 * Ergänzt `https://`, wenn kein Schema dasteht. Leerraum am Rand fällt weg; eine leere Eingabe
 * bleibt leer, damit „Pflichtfeld fehlt" und „keine Adresse" getrennte Meldungen bleiben.
 */
export function ergaenzeSchema(eingabe: string): string {
  const roh = eingabe.trim();
  if (roh === "" || MIT_SCHEMA.test(roh)) return roh;
  return `https://${roh.replace(/^\/+/, "")}`;
}

/** Trägt die Eingabe (nach `ergaenzeSchema`) eine Adresse, die ein Browser öffnen kann? */
export function istWebAdresse(adresse: string): boolean {
  if (adresse === "" || /\s/.test(adresse)) return false;
  try {
    new URL(adresse);
    return true;
  } catch {
    return false;
  }
}

/** Die eigene Meldung statt der Browserblase — Du-Form wie die übrige Suite. */
export const KEINE_WEB_ADRESSE = "Das ist keine gültige Web-Adresse.";

/**
 * NUR FÜR DEN GENERATOR, der „Link oder Text" annimmt: ein Satz ist dort ein gültiger Inhalt und
 * darf kein `https://` vorgesetzt bekommen. Ergänzt wird deshalb nur, was wie ein Rechnername
 * aussieht — ohne Leerraum, mit einer Endung aus Buchstaben („drk.de", „www.drk.de/kurse").
 * „Version 1.2" und „Hallo" bleiben Text.
 */
const SIEHT_AUS_WIE_ADRESSE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

export function ergaenzeSchemaWennAdresse(eingabe: string): string {
  const roh = eingabe.trim();
  if (MIT_SCHEMA.test(roh) || !SIEHT_AUS_WIE_ADRESSE.test(roh)) return eingabe;
  return `https://${roh}`;
}
