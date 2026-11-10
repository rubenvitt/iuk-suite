/**
 * Bytes als Text mit BINAEREN Praefixen und dem Wort dazu (KiB, MiB, GiB). Die
 * Anzeige des Moduls rechnet durchweg mit 1024 — eine Beschriftung „MB" neben
 * „MiB" waere dieselbe Zahl unter zwei Namen (Faktor 1,048576, im Modul `files`
 * schon einmal teuer geworden).
 *
 * Ohne `"use client"` und ohne Serverpaket: Server Components und Actions lesen
 * es gleichermassen (Falle 6).
 */
const EINHEITEN = ["Byte", "KiB", "MiB", "GiB", "TiB"] as const;

export function byteTextBinaer(bytes: number): string {
  let wert = bytes;
  let stufe = 0;
  while (wert >= 1024 && stufe < EINHEITEN.length - 1) {
    wert /= 1024;
    stufe += 1;
  }
  const zahl = stufe === 0 ? String(Math.round(wert)) : wert.toFixed(1).replace(".", ",");
  return `${zahl} ${EINHEITEN[stufe]}`;
}

/** Ein MiB in Bytes — fuer Eingabefelder, die in MiB fragen. */
export const BYTES_PRO_MIB = 1024 * 1024;
