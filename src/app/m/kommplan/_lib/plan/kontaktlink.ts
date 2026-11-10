import type { KontaktArt } from "./schema";

/**
 * Ein Kontaktwert als antippbarer Verweis (IDA-390, Liste der Token-Ansicht): Telefon und Mobil als `tel:`,
 * E-Mail als `mailto:`; alles andere bleibt Text. Kein "use client" (Falle 6): Liste und Test lesen dasselbe.
 *
 * Eine Nummer wird nur verlinkt, wenn sie eine ist — „EA NuK 1." und der Funkrufname „40-12-1" stehen in echten
 * Plänen im Feld Telefon und bleiben Text. Als Nummer gilt, was mit 0 oder + beginnt, oder eine Kurzwahl aus drei
 * bis sechs Ziffern ohne Trenner (112, 19222). Aus „0581 / 82-266" wird `tel:058182266`; „(0)" nach einer
 * Landesvorwahl fällt weg, weil es gewählt nicht dazugehört. Fax bekommt keinen Verweis.
 */
export function kontaktLink(art: KontaktArt, wert: string): string | null {
  const w = wert.trim();
  // `?`, `&`, `,` u. Ä. hängten sonst Kopfzeilen (cc, body) oder weitere Empfänger an den Verweis.
  if (art === "email") return /^[^\s@?&,;<>"%]+@[^\s@?&,;<>"%]+\.[^\s@?&,;<>"%]+$/.test(w) ? `mailto:${w}` : null;
  if (art !== "telefon" && art !== "mobil") return null;
  return telefonLink(w);
}

export function telefonLink(wert: string): string | null {
  const w = wert.trim();
  if (/^\d{3,6}$/.test(w)) return `tel:${w}`;
  if (!/^(\+|\(?0)[\d\s/().-]+$/.test(w)) return null;
  const plus = w.startsWith("+");
  const ziffern = (plus ? w.replace(/\(0\)/g, "") : w).replace(/\D/g, "");
  if (ziffern.length < 5) return null;
  return `tel:${plus ? "+" : ""}${ziffern}`;
}
