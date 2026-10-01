/** Der QR als Pfad für das Blatt (Entscheidung 11): kein `dangerouslySetInnerHTML`, nur Modulzahl und Pfad. */
export interface QrGrafik { module: number; pfad: string; ziel: string }

/**
 * Aus dem SVG von `core/qr` (Bibliothek `qrcode`): `viewBox="0 0 N N"` und der Pfad der dunklen Module
 * (`stroke="#000000"`, `QR_OPTIONS.color.dark`). Wirft bei anderer Form — lieber kein Druck als ein falscher Code.
 */
export function qrGrafikAus(svg: string, ziel: string): QrGrafik {
  const vb = /viewBox="0 0 (\d+) \1"/.exec(svg);
  const pfad = /<path stroke="#000000" d="([^"]+)"/.exec(svg);
  if (!vb || !pfad) throw new Error("QR-SVG in unerwarteter Form");
  return { module: Number(vb[1]), pfad: pfad[1], ziel };
}
