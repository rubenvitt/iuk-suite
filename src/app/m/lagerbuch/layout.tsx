import type { Metadata } from "next";

/**
 * DIE EINE AUSNAHME ZU §2.8s REGEL „kein Modul-Layout".
 *
 * Diese Datei traegt AUSSCHLIESSLICH den Manifest-Verweis und rendert {children}.
 *
 * KEINE Shell, KEIN Rahmen, KEIN Riegel, KEIN viewport-Export.
 *  - Ein Riegel waere hier falsch: er umschloesse weder /t/<code> (Route Handler
 *    haben kein Layout ueber sich, Falle 55) noch koennte er zwischen Helfer- und
 *    Verwaltungsklasse unterscheiden.
 *  - Eine Shell waere hier falsch: ein Layout ohne Gruppenklammer ist Vorfahr
 *    ALLER Kinder — auch des bewusst antd-freien Helfer-Zweigs und der Gruppe
 *    (druck). Der Fehler ist ein 96px-Ueberlauf, und `pnpm build` findet ihn nicht.
 *
 * Der Manifest-Verweis MUSS dagegen hier stehen und nicht im Root-Layout: dort
 * bewuerbe JEDER Suite-Host eine Lagerbuch-PWA (Falle 56).
 *
 * Die fuenf Handler dahinter (manifest.webmanifest, pwa-icon.svg, icon-192.png,
 * icon-512.png, icon-maskable-512.png) entstehen in §7.10.2. Bis dahin antwortet
 * der Pfad 404 — die Reihenfolge ist Absicht, nicht Versehen.
 */
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default function LagerbuchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
