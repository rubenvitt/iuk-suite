import { qrSvg, exceedsQrCapacity, QR_MAX_LENGTH } from "@/core/qr";

export { QR_MAX_LENGTH, exceedsQrCapacity };

// Delegiert an den gemeinsamen core-Baustein (src/core/qr) — Verhalten und
// Rückgabewert bleiben unverändert (Level H, Quiet Zone 4, Schwarz auf Weiß).
// Der Name payloadToSvg bleibt hier bestehen, damit die bestehenden Aufrufer
// in diesem Modul unverändert bleiben.
export async function payloadToSvg(text: string): Promise<string> {
  return qrSvg(text);
}
