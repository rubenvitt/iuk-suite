import {
  AppstoreOutlined,
  BorderOutlined,
  CaretUpOutlined,
  CommentOutlined,
  DesktopOutlined,
  FolderOutlined,
  GlobalOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import type { ComponentType } from "react";

/*
 * Icon-Name (aus ModuleDef.icon, Registry) -> @ant-design/icons Komponente.
 * Unbekannte Namen fallen beim Konsumenten auf AppstoreOutlined zurueck, statt
 * den Render zu crashen — eine neue Registry-Zeile soll die Kopfzeile nicht
 * zerlegen.
 *
 * DER RUECKFALL IST DIE FALLE, NICHT DIE RETTUNG: `icon` muss ein Schluessel
 * DIESER Map sein, nicht bloss ein existierender @ant-design/icons-Name. Beim
 * Registry-Eintrag von `files` (2026-07-30) stand hier `FolderOutlined` nicht
 * drin — der Eintrag trug daraufhin still das Portal-Icon. Kein Fehler, kein
 * Log, nur ein falsches Bild in jeder Kopfzeile. Deshalb ist die Map exportiert
 * und `SuiteNav.test.tsx` prueft sie GEGEN DIE REGISTRY: jedes Modul-Icon muss
 * hier stehen. Wer ein Modul ergaenzt, wird vom Test daran erinnert.
 *
 * EIGENE DATEI OHNE `"use client"`, und das ist der ganze Zweck: `ICONS` ist ein
 * WERT (ein Objekt), kein Komponenten-Export. Aus einem `"use client"`-Modul —
 * und `SuiteNav.tsx`, wo die Map bis 2026-07-30 stand, ist eines — bekaeme eine
 * Server Component statt des Objekts eine Client-Referenz und die ganze Seite
 * HTTP 500 (CLAUDE.md, Falle 6). TypeScript ist damit zufrieden, `pnpm build`
 * findet es nicht, und Vitest KANN es strukturell nicht finden, weil
 * `"use client"` dort ein wirkungsloser String ist. Der Export blieb also nur so
 * lange harmlos, wie niemand ihn serverseitig anfasst — hier ist er es dauerhaft.
 * Die Icons selbst tragen kein `"use client"` (@ant-design/icons 6.3.2, reines
 * SVG), eine Server Component erhaelt hier also echte Komponenten.
 */
export const ICONS: Record<string, ComponentType> = {
  AppstoreOutlined,
  QrcodeOutlined,
  BorderOutlined,
  CaretUpOutlined,
  GlobalOutlined,
  DesktopOutlined,
  CommentOutlined,
  FolderOutlined,
};
