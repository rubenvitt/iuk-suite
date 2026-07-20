import QRCode from "qrcode";

export const QR_MAX_LENGTH = 1273;

/**
 * 1273 ist die Byte-Kapazität von QR-Version 40 bei Level H. Deshalb wird gegen
 * die UTF-8-Länge geprüft und nicht gegen text.length: Umlaute zählen doppelt,
 * Emoji vierfach — sonst rutschen sie am Guard vorbei und der Nutzer sieht
 * statt einer deutschen Meldung den englischen Fehler der Bibliothek.
 *
 * Bewusst exportiert: die Eingabe warnt mit derselben Funktion, mit der die
 * Erzeugung ablehnt. Zwei getrennte Grenzen driften auseinander, und die
 * Warnung schwiege dann genau dort, wo sie gebraucht wird.
 */
export function exceedsQrCapacity(text: string): boolean {
  return new TextEncoder().encode(text).length > QR_MAX_LENGTH;
}

// Die Optionen sind bewusst fest verdrahtet und nicht konfigurierbar: weniger
// Knöpfe, dafür verlässliche Scans im Einsatz (hohe Fehlerkorrektur, ruhiger
// Rand, reines Schwarz auf Weiß).
export async function payloadToSvg(text: string): Promise<string> {
  if (!text) throw new Error("QR-Text darf nicht leer sein");
  if (exceedsQrCapacity(text)) {
    throw new Error(`QR-Text überschreitet ${QR_MAX_LENGTH} Bytes`);
  }
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
