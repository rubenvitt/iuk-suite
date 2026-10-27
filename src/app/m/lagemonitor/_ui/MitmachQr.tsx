import QRCode from "qrcode";

/**
 * Der QR-Code als SVG-Pfad, echt scanbar, damit man die Vorschau mit dem Telefon prüfen kann. Ohne
 * gültige Adresse ein Platzhalter. Fehlerkorrektur M wie `core/qr` (`QR_OPTIONS`).
 */
export function MitmachQr({ adresse, className }: { adresse: string; className?: string }) {
  let pfad = "";
  let groesse = 21;
  try {
    const qr = QRCode.create(adresse, { errorCorrectionLevel: "M" });
    groesse = qr.modules.size;
    for (let y = 0; y < groesse; y++) {
      for (let x = 0; x < groesse; x++) if (qr.modules.get(y, x)) pfad += `M${x + 1},${y + 1}h1v1h-1z`;
    }
  } catch {
    pfad = "";
  }
  return (
    <svg className={className} viewBox={`0 0 ${groesse + 2} ${groesse + 2}`} aria-hidden shapeRendering="crispEdges">
      <rect width={groesse + 2} height={groesse + 2} fill="#fff" />
      {pfad ? <path d={pfad} fill="#000" /> : null}
    </svg>
  );
}
