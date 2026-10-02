/**
 * SCHLÜSSEL EIGENER ZEICHEN: `eigen:<uuid>` im Feld `zeichen` von Stelle, Einheit und Bibliothekseintrag — neben
 * `rezept:…` und `zusatz:…` aus dem Generat. Rein und ohne Paketimport: Editor, Betrachter und Server lesen ihn.
 */
export const EIGEN_PRAEFIX = "eigen:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const eigenerSchluessel = (id: string) => `${EIGEN_PRAEFIX}${id}`;

/** Die ID hinter `eigen:` — nur eine wohlgeformte UUID, sonst `null` (der Schlüssel kommt aus Planinhalt und Client). */
export function eigeneId(schluessel: string): string | null {
  if (!schluessel.startsWith(EIGEN_PRAEFIX)) return null;
  const id = schluessel.slice(EIGEN_PRAEFIX.length);
  return UUID.test(id) ? id : null;
}
