/**
 * Rohwert (Kamera, Tippfeld, Routen-Parameter, Cutover-Import) → Wert fuer den
 * Abgleich. §7.6.2, 1:1 aus der Spec mit einer benannten Haerte (siehe unten).
 *
 * KEIN "use client": die Datei liegt unter `_lib/` und wird aus Server Actions,
 * aus einer Server Component (`g/[code]/page.tsx`) UND aus einer Client-Insel
 * (`_ui/BarcodeScanner.tsx`) importiert. Ein WERT aus einem "use client"-Modul
 * kaeme in einer Server Component als Client-Referenz an — HTTP 500, und weder
 * `pnpm build` noch Vitest sehen es (Falle 6).
 *
 *  1. QR mit `/g/<code>`-Deep-Link: nur das Segment zaehlt. Deshalb ueberlebt so
 *     ein Aufkleber einen Domainwechsel — sofern IN der App gescannt (Falle 30).
 *     Mit der SYSTEMKAMERA gescannt oeffnet er die aufgedruckte Domain; das ist
 *     Runbook-Eingabe 4 (§7.13.4) und keine Codefrage.
 *  2. Sonst getrimmt: der Abgleich ist binaer, die Spalten haben kein COLLATE
 *     (`geraete.ts:77`, `bz.ts:120`, Falle 29).
 *
 * WAS SIE BEWUSST NICHT TUT: kein `toUpperCase()`. Anders als `normalisiereCode`
 * (Teil 2, T17), dessen Wertebereich sechs ZIFFERN sind, ist der Wert hier eine
 * fremde Seriennummer. Ein Grossbuchstaben-Zwang machte aus einem gespeicherten
 * "sn-1" einen Nichttreffer — und die Spalte hat kein COLLATE, das ihn rettete.
 *
 * DER CUTOVER-IMPORT MUSS DIESELBE FUNKTION BENUTZEN (§4.8). Sonst findet ein am
 * Gaeraet gescannter Barcode seine importierte Zeile nicht, und das Symptom ist
 * „das Geraet ist nicht im System" — nicht „der Import war falsch".
 */
export function normalisiereBarcode(roh: string): string {
  const treffer = roh.match(/\/g\/([^/?#]+)/);
  if (!treffer) return roh.trim();
  // `decodeURIComponent` wirft URIError bei kaputtem Prozentzeichen ("%", "%ZZ").
  // Ein Wurf waere hier ein Absturz mitten im Scannen, ausgeloest von einem
  // fremd gedruckten Aufkleber, den niemand kontrolliert hat. Der Rueckfall ist
  // das UNDEKODIERTE Segment — schlechter als der richtige Wert, aber besser als
  // eine Fehlerseite, und der Nichttreffer sagt es der Person ausdruecklich.
  try {
    return decodeURIComponent(treffer[1]).trim();
  } catch {
    return treffer[1].trim();
  }
}
