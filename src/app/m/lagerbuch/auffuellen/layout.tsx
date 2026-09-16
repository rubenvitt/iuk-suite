import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * DER RIEGEL DER AUFFUELLANSICHT — DRK-313, AK2 („auch bei direktem Aufruf
 * geprueft").
 *
 * ⚠️ FALLE 17: Route-Group-Grenzen sind KEINE Sicherheitsgrenzen. Dieses Layout
 * ist eine BEQUEMLICHKEIT, keine Absicherung — die tragende Zusage sind die
 * aufrufbaren Funktionen. Beide Seiten darunter rufen `requireLagerbuchAdmin()`
 * SELBST noch einmal (sie brauchen den Viewer fuer das Kopf-Etikett, und ein
 * Layout reicht einer Seite keine Props), und die Buchung dahinter hat ihren
 * eigenen Riegel als erste Anweisung (`_actions/buchung.ts`). Eine Action-ID
 * ist global; ohne den Riegel DORT waere dieses Layout wirkungslos.
 *
 * ⚠️ `requireLagerbuchAdmin` IST HIER DIE GF-STUFE — die Antwort des Tickets auf
 * „wie wird GF im bestehenden Berechtigungsmodell abgebildet?": GF ist das
 * angemeldete Konto in der Lagerbuch-Gruppe. Die Begruendung, warum keine
 * zweite Gruppe entsteht, steht ausgeschrieben an `bucheAuffuellung`.
 * Ein KAERTCHEN erreicht diese Strecke auf keinem Weg: `requireHelferSitzung`
 * kommt hier nicht vor, und der Riegel antwortet ohne Konto mit `/login`, mit
 * Konto ohne Gruppe mit `notFound()` (§3.3 — was nicht freigegeben ist, sieht
 * aus wie etwas, das es nicht gibt).
 *
 * ⚠️ KEIN `requireLagerbuchHost` — der Riegel ruft ihn INTERN als erste
 * Anweisung (§2.6).
 */
export const dynamic = "force-dynamic";

export default async function AuffuellenLayout({ children }: { children: React.ReactNode }) {
  await requireLagerbuchAdmin();
  return <>{children}</>;
}
