import type { QrPayload } from "./types";
import { payloadToQrString } from "./payload";

/**
 * Baut den Link auf die QR-Ansicht — die EINE Stelle, an der `data` entsteht.
 *
 * Die Ansicht `/qr` reicht `data` unveraendert an den Encoder durch (siehe
 * `qr/page.tsx`). Also muss die Kodierung hier passieren, und zwar ueber
 * `payloadToQrString`: eine Telefonnummer ohne `tel:`-Praefix ergibt einen
 * Code, der beim Scannen nicht waehlt, und ein JSON-kodiertes WLAN-Objekt
 * ergibt einen Code, der sichtbar `{"ssid":…}` enthaelt, statt das Geraet ins
 * Netz zu bringen. Deshalb hat kein Erzeuger eine eigene Kodierung — sie alle
 * rufen diese Funktion auf.
 *
 * URLSearchParams maskiert `&`, `#` und `=` selbst; ein handgebautes
 * Template-Literal zerlegte den WIFI-String am ersten Sonderzeichen.
 */
export function buildQrUrl(label: string, payload: QrPayload): string {
  const params = new URLSearchParams({
    data: payloadToQrString(payload),
    label,
    kind: payload.kind,
  });
  return `/qr?${params.toString()}`;
}
