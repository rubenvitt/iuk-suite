import QRCode from "qrcode";

export const QR_MAX_LENGTH = 1273;

// Die Optionen sind bewusst fest verdrahtet und nicht konfigurierbar: weniger
// Knöpfe, dafür verlässliche Scans im Einsatz (hohe Fehlerkorrektur, ruhiger
// Rand, reines Schwarz auf Weiß).
export async function payloadToSvg(text: string): Promise<string> {
  if (!text) throw new Error("QR-Text darf nicht leer sein");
  if (text.length > QR_MAX_LENGTH) {
    throw new Error(`QR-Text überschreitet ${QR_MAX_LENGTH} Zeichen`);
  }
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
