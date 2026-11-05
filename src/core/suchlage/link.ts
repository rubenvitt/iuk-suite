// Der Großbild-Link aus Suchlage, mit dem sich Suite-Module bei Suchlage anmelden: der Lagemonitor
// (über dessen Server) und das Einsatztagebuch (IDA-359). Suchlage prüft das Token bei jeder
// Anfrage neu, ein widerrufener Link wirkt also sofort.

/**
 * Der Großbild-Link aus Suchlage (Verwaltung → Großbild): `https://suchlage.example/kiosk#<64 hex>`.
 * Daraus werden Adresse (alles vor `/kiosk`) und Token. `null`, wenn der Text kein solcher Link ist.
 */
export function suchlageLinkAus(text: string): { adresse: string; token: string } | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const token = url.hash.slice(1);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const pfad = url.pathname.replace(/\/+$/, "");
  if (!pfad.endsWith("/kiosk")) return null;
  return { adresse: url.origin + pfad.slice(0, -"/kiosk".length), token };
}
