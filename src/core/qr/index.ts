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

// Die *eine* gemeinsame Konfiguration für alle QR-Codes im Projekt (Fehlerkorrektur,
// Rand, Farben). Vorher gab es drei divergierende Stellen (payloadToSvg mit H/margin 4,
// die qr.png-Route mit M/margin 2, dieses Modul) — das führt zu Codes, die je nach
// Erzeugungsstelle unterschiedlich robust gegen Verschmutzung/Verzerrung scannen.
// Jetzt gilt überall dieselbe Konfiguration.
export const QR_OPTIONS = {
  errorCorrectionLevel: "H" as const,
  margin: 4,
  color: { dark: "#000000", light: "#ffffff" },
};

function assertQrCapacity(text: string): void {
  if (!text) throw new Error("QR-Text darf nicht leer sein");
  if (exceedsQrCapacity(text)) {
    throw new Error(`QR-Text überschreitet ${QR_MAX_LENGTH} Bytes`);
  }
}

export async function qrSvg(text: string): Promise<string> {
  assertQrCapacity(text);
  return QRCode.toString(text, { type: "svg", ...QR_OPTIONS });
}

export async function qrPng(text: string, opts?: { width?: number }): Promise<Uint8Array> {
  assertQrCapacity(text);
  const buffer = await QRCode.toBuffer(text, { ...QR_OPTIONS, width: opts?.width ?? 512 });
  return new Uint8Array(buffer);
}
