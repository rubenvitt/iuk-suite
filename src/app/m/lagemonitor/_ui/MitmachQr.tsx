import QRCode from "qrcode";

/**
 * Der QR-Code als SVG-Pfad, echt scanbar, damit man die Vorschau mit dem Telefon prüfen kann. Ohne
 * gültige Adresse ein Platzhalter. Fehlerkorrektur M wie `core/qr` (`QR_OPTIONS`).
 */
/** Ruhezone in Modulen, wie die Norm sie verlangt; die Vorschau ist dunkel, also gehört sie ins Bild. */
const RAND = 4;

export function MitmachQr({ adresse, className }: { adresse: string; className?: string }) {
  let pfad = "";
  let groesse = 21;
  try {
    const qr = QRCode.create(adresse, { errorCorrectionLevel: "M" });
    groesse = qr.modules.size;
    for (let y = 0; y < groesse; y++) {
      for (let x = 0; x < groesse; x++) if (qr.modules.get(y, x)) pfad += `M${x + RAND},${y + RAND}h1v1h-1z`;
    }
  } catch {
    pfad = "";
  }
  return (
    <svg className={className} viewBox={`0 0 ${groesse + 2 * RAND} ${groesse + 2 * RAND}`} aria-hidden shapeRendering="crispEdges">
      <rect width={groesse + 2 * RAND} height={groesse + 2 * RAND} fill="#fff" />
      {pfad ? <path d={pfad} fill="#000" /> : null}
    </svg>
  );
}
